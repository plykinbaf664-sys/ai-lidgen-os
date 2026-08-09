import { randomInt, randomUUID } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase/client";
import { QUEUE_FIELDS } from "@/lib/leadgen/storage-projections";
import { formatUnknownError } from "@/lib/leadgen/error-format";
import { fetchInboxMessageBody, fetchRecentInboxHeaders } from "./imap-reply-detector";
import { generateFollowup } from "./followup-generator";
import { analyzeReplyText, getFollowupIdempotencyKey, matchReply, type ReplyCandidate } from "./followup-rules";
import {
  getBusinessDayRange,
  getDailySendStats,
  rowToEntry,
  type QueueRow,
} from "./outreach-storage";
import { getNextScheduledAt } from "./outreach-policy";
import { getEmailDelayBounds, leadgenProductionConfig } from "./production-config";
import type { OutreachQueueEntry } from "./types";

export type FollowupSummary = {
  pending_reply_check: number;
  reply_found: number;
  eligible: number;
  needs_review: number;
  approved: number;
  queued: number;
  sending: number;
  sent: number;
  sent_today: number;
  queued_now: number;
  skipped: number;
  failed: number;
  reply_checks_verified: number;
  queue_paused: boolean;
  eligibility_reasons: Record<FollowupEligibilityReason, number>;
  next_eligible_at: string | null;
  eligibility_diagnostics: FollowupEligibilityDiagnostic[];
  min_interval_hours: number;
  automation_enabled: boolean;
  automation_mode: "automatic" | "manual";
  eligible_for_bulk_approval: number;
};

export type FollowupEligibilityReason =
  | "interval_not_reached"
  | "reply_detected"
  | "missing_parent_message_id"
  | "already_followed_up"
  | "stop_list"
  | "failed_parent"
  | "rejected"
  | "duplicate"
  | "missing_recipient"
  | "reply_check_unavailable";

export type FollowupEligibilityDiagnostic = {
  parent_outreach_id: string;
  lead_id: string;
  campaign_id: string;
  company_name: string;
  eligible: boolean;
  reason: FollowupEligibilityReason | null;
  sent_at: string | null;
  smtp_message_id_present: boolean;
  reply_check_status: string;
  eligible_at: string | null;
  remaining_seconds: number;
};

export function isFollowupBulkApprovable(
  entry: OutreachQueueEntry,
): boolean {
  return Boolean(
    entry.status === "needs_review" &&
      entry.subject.trim() &&
      entry.body.trim() &&
      entry.reply_check_status === "verified" &&
      !entry.reply_detected_at &&
      entry.parent_smtp_message_id &&
      entry.quality_gate_passed === true &&
      entry.copy_review_status !== "needs_manual_copy_review",
  );
}

function intervalReached(row: QueueRow, now = Date.now()) {
  return Boolean(row.sent_at && now - Date.parse(row.sent_at) >=
    leadgenProductionConfig.followupMinIntervalHours * 3_600_000);
}

function evaluateFollowupEligibility(
  row: QueueRow,
  context: { stopList: Set<string>; existingParentIds: Set<string>; now: number },
): FollowupEligibilityDiagnostic {
  const sentAt = row.sent_at ? Date.parse(row.sent_at) : Number.NaN;
  const eligibleAtMs = Number.isFinite(sentAt)
    ? sentAt + leadgenProductionConfig.followupMinIntervalHours * 3_600_000
    : Number.NaN;
  let reason: FollowupEligibilityReason | null = null;

  if (row.status === "failed") reason = "failed_parent";
  else if (row.status === "rejected") reason = "rejected";
  else if (!row.recipient_email?.trim()) reason = "missing_recipient";
  else if (!row.smtp_message_id) reason = "missing_parent_message_id";
  else if (row.reply_check_status !== "verified") reason = "reply_check_unavailable";
  else if (row.reply_detected_at) reason = "reply_detected";
  else if (context.stopList.has(row.normalized_recipient_email)) reason = "stop_list";
  else if (context.existingParentIds.has(row.id)) reason = "already_followed_up";
  else if (!intervalReached(row, context.now)) reason = "interval_not_reached";

  return {
    parent_outreach_id: row.id,
    lead_id: row.lead_id,
    campaign_id: row.campaign_id,
    company_name: row.company_name,
    eligible: reason === null,
    reason,
    sent_at: row.sent_at,
    smtp_message_id_present: Boolean(row.smtp_message_id),
    reply_check_status: row.reply_check_status ?? "pending",
    eligible_at: Number.isFinite(eligibleAtMs) ? new Date(eligibleAtMs).toISOString() : null,
    remaining_seconds: Number.isFinite(eligibleAtMs)
      ? Math.max(0, Math.ceil((eligibleAtMs - context.now) / 1_000))
      : 0,
  };
}

async function readInitialCandidates(campaignId?: string | null) {
  const supabase = createSupabaseServerClient();
  let query = supabase
    .from("leadgen_outreach_queue")
    .select(QUEUE_FIELDS)
    .eq("message_kind", "initial")
    .eq("status", "sent")
    .not("sent_at", "is", null);
  if (campaignId) query = query.eq("campaign_id", campaignId);
  const { data, error } = await query
    .order("sent_at", { ascending: true })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as QueueRow[];
}

async function scanFollowupRepliesUnsafe() {
  let supabase;
  try {
    supabase = createSupabaseServerClient();
  } catch (error) {
    throw new Error(
      `reply_scan_client_failed: ${formatUnknownError(error)}`,
      { cause: error },
    );
  }
  const workerId = `reply-scan-${randomUUID()}`;
  let lock;
  try {
    lock = await supabase.rpc("claim_followup_reply_scan", {
      worker_id: workerId,
      lock_seconds: 180,
    });
  } catch (error) {
    throw new Error(
      `reply_scan_lock_transport: ${formatUnknownError(error)}`,
      { cause: error },
    );
  }
  if (lock.error) {
    throw new Error(
      `reply_scan_lock_failed: ${formatUnknownError(lock.error)}`,
      { cause: lock.error },
    );
  }
  if (!lock.data) throw new Error("Проверка входящих уже выполняется.");
  let parents: QueueRow[] = [];
  let candidates: ReplyCandidate[] = [];
  const checkedAt = new Date().toISOString();
  let headersScanned = 0;
  try {
    parents = await readInitialCandidates();
    candidates = parents
      .filter((row) => row.smtp_message_id && row.sent_at)
      .map((row) => ({
        id: row.id,
        smtpMessageId: row.smtp_message_id!,
        recipientEmail: row.recipient_email,
        subject: row.subject,
        sentAt: row.sent_at!,
      }));
    if (!leadgenProductionConfig.followupEnabled) {
      throw new Error("Follow-up Engine отключён конфигурацией.");
    }
    const earliest = candidates.reduce(
      (value, item) => Math.min(value, Date.parse(item.sentAt)),
      Date.now() - 30 * 86_400_000,
    );
    const since = new Date(Math.max(earliest, Date.now() - 30 * 86_400_000));
    const inbox = await fetchRecentInboxHeaders(since);
    headersScanned = inbox.scanned;
    const matches = new Map<string, { header: typeof inbox.headers[number]; method: string; analysis: ReturnType<typeof analyzeReplyText> }>();
    for (const header of inbox.headers) {
      const match = matchReply(header, candidates);
      if (match && !matches.has(match.candidate.id)) {
        const body = header.uid ? await fetchInboxMessageBody(header.uid) : null;
        matches.set(match.candidate.id, {
          header,
          method: match.method,
          analysis: analyzeReplyText(body),
        });
      }
    }
    for (const parent of parents) {
      const match = matches.get(parent.id);
      const update = await supabase.from("leadgen_outreach_queue").update({
        reply_check_status: "verified",
        reply_checked_at: checkedAt,
        reply_detected_at: match ? checkedAt : null,
        reply_message_id: match?.header.messageId ?? null,
        reply_from: match?.header.from ?? null,
        reply_subject: match?.header.subject ?? null,
        reply_detection_method: match?.method ?? null,
        metadata: match ? {
          ...(parent.metadata ?? {}),
          reply_intent: match.analysis.intent,
          reply_contact: {
            full_name: match.analysis.fullName,
            role_title: match.analysis.roleTitle,
            phone: match.analysis.phone,
            phone_extension: match.analysis.phoneExtension,
            confidence: match.analysis.confidence,
          },
          reply_contact_extracted_at: checkedAt,
        } : parent.metadata,
        updated_at: checkedAt,
      }).eq("id", parent.id).eq("message_kind", "initial");
      if (update.error) throw update.error;
      if (match) {
        const leadStatus = match.analysis.intent === "interested" ? "interested" : "replied";
        const leadUpdate = await supabase.from("leadgen_leads").update({ status: leadStatus, updated_at: checkedAt })
          .eq("id", parent.lead_id).in("status", ["new", "approved", "paused", "replied", "interested"]);
        if (leadUpdate.error?.code === "23514") {
          // Older installations may not yet allow replied/interested in the
          // lead status constraint. Reply state is still persisted on the
          // initial outreach and contact instead of failing the whole scan.
          console.warn(
            "[followup-reply-scan] lead reply status migration is pending",
          );
        } else if (leadUpdate.error) {
          throw leadUpdate.error;
        }
        const contact = await supabase.from("leadgen_contacts").select("id,full_name,role_title,metadata")
          .eq("lead_id", parent.lead_id).order("is_primary", { ascending: false }).limit(1).maybeSingle();
        if (contact.error) throw contact.error;
        if (contact.data) {
          const extracted = match.analysis;
          const contactUpdate = await supabase.from("leadgen_contacts").update({
            full_name: extracted.fullName || contact.data.full_name,
            role_title: extracted.roleTitle || contact.data.role_title,
            metadata: {
              ...(contact.data.metadata ?? {}),
              reply_phone: extracted.phone,
              reply_phone_extension: extracted.phoneExtension,
              reply_intent: extracted.intent,
              reply_confidence: extracted.confidence,
              reply_extracted_at: checkedAt,
            },
          }).eq("id", contact.data.id);
          if (contactUpdate.error) throw contactUpdate.error;
        }
      }
    }
    return {
      checked_outbound: parents.length,
      reply_found: matches.size,
      no_reply: Math.max(0, parents.length - matches.size),
      unavailable: 0,
      headers_scanned: headersScanned,
    };
  } catch (error) {
    if (parents.length) {
      const parentIds = parents.map((row) => row.id);
      for (let index = 0; index < parentIds.length; index += 20) {
        const update = await supabase
          .from("leadgen_outreach_queue")
          .update({
            reply_check_status: "unavailable",
            reply_checked_at: checkedAt,
            updated_at: checkedAt,
          })
          .in("id", parentIds.slice(index, index + 20))
          .is("reply_detected_at", null);
        if (update.error) {
          console.error(
            "[followup-reply-scan] unable to persist unavailable state:",
            formatUnknownError(update.error),
          );
          break;
        }
      }
    }
    const message = formatUnknownError(error, "IMAP недоступен.");
    return {
      checked_outbound: parents.length,
      reply_found: 0,
      no_reply: 0,
      unavailable: parents.length,
      headers_scanned: headersScanned,
      error: message,
    };
  } finally {
    try {
      const release = await supabase.rpc("release_followup_reply_scan", {
        worker_id: workerId,
      });
      if (release.error) {
        console.error(
          "[followup-reply-scan] lock release failed:",
          formatUnknownError(release.error),
        );
      }
    } catch (error) {
      // A lock expires automatically; a release transport failure must not
      // discard the completed IMAP scan result.
      console.error(
        "[followup-reply-scan] lock release transport failed:",
        formatUnknownError(error),
      );
    }
  }
}

export async function scanFollowupReplies() {
  try {
    return await scanFollowupRepliesUnsafe();
  } catch (error) {
    throw new Error(
      `reply_scan_unhandled: ${formatUnknownError(error)}`,
      { cause: error },
    );
  }
}

export async function getFollowups(campaignId?: string | null) {
  const supabase = createSupabaseServerClient();
  let query = supabase.from("leadgen_outreach_queue").select(QUEUE_FIELDS)
    .eq("message_kind", "follow_up").order("created_at", { ascending: true });
  if (campaignId) query = query.eq("campaign_id", campaignId);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as QueueRow[]).map((row) => rowToEntry(row));
}

export async function getFollowupEligibilityDiagnostics(campaignId?: string | null) {
  const supabase = createSupabaseServerClient();
  const [parents, followups, stopped] = await Promise.all([
    readInitialCandidates(campaignId),
    getFollowups(campaignId),
    supabase.from("leadgen_email_stop_list").select("normalized_email").eq("is_active", true),
  ]);
  if (stopped.error) throw stopped.error;
  const stopList = new Set((stopped.data ?? []).map((row) => row.normalized_email));
  const existingParentIds = new Set(
    followups.map((row) => row.parent_outreach_id).filter((id): id is string => Boolean(id)),
  );
  const now = Date.now();
  return parents
    .filter((row) => !campaignId || row.campaign_id === campaignId)
    .map((row) => evaluateFollowupEligibility(row, { stopList, existingParentIds, now }));
}

export async function getFollowupSummary(campaignId?: string | null): Promise<FollowupSummary> {
  const supabase = createSupabaseServerClient();
  const [diagnostics, followups, settings] = await Promise.all([
    getFollowupEligibilityDiagnostics(campaignId), getFollowups(campaignId),
    supabase.from("leadgen_outreach_settings").select("followup_paused").eq("id", "global").single(),
  ]);
  if (settings.error) throw settings.error;
  const reasons = Object.fromEntries([
    "interval_not_reached", "reply_detected", "missing_parent_message_id",
    "already_followed_up", "stop_list", "failed_parent", "rejected", "duplicate",
    "missing_recipient", "reply_check_unavailable",
  ].map((reason) => [reason, diagnostics.filter((item) => item.reason === reason).length])) as Record<FollowupEligibilityReason, number>;
  const nextEligibleAt = diagnostics
    .filter((item) => item.reason === "interval_not_reached" && item.eligible_at)
    .map((item) => item.eligible_at!)
    .sort()[0] ?? null;
  const { start, end } = getBusinessDayRange();
  const sentToday = followups.filter((row) => {
    if (row.status !== "sent" || !row.sent_at) return false;
    const sentAt = Date.parse(row.sent_at);
    return sentAt >= start.getTime() && sentAt < end.getTime();
  }).length;
  return {
    pending_reply_check: diagnostics.filter((item) => item.reason === "reply_check_unavailable").length,
    reply_found: diagnostics.filter((item) => item.reason === "reply_detected").length,
    eligible: diagnostics.filter((item) => item.eligible).length,
    needs_review: followups.filter((row) => row.status === "needs_review").length,
    approved: followups.filter((row) => row.status === "approved").length,
    queued: followups.filter((row) => row.status === "queued").length,
    sending: followups.filter((row) => row.status === "sending").length,
    sent: followups.filter((row) => row.status === "sent").length,
    sent_today: sentToday,
    queued_now: followups.filter((row) =>
      ["queued", "sending"].includes(row.status),
    ).length,
    skipped: followups.filter((row) => row.status === "skipped").length,
    failed: followups.filter((row) => row.status === "failed").length,
    reply_checks_verified: diagnostics.filter((item) => item.reply_check_status === "verified").length,
    queue_paused: Boolean(settings.data.followup_paused),
    eligibility_reasons: reasons,
    next_eligible_at: nextEligibleAt,
    eligibility_diagnostics: diagnostics,
    min_interval_hours: leadgenProductionConfig.followupMinIntervalHours,
    automation_enabled: leadgenProductionConfig.followupAutomationEnabled,
    automation_mode:
      leadgenProductionConfig.followupAutomationEnabled && !settings.data.followup_paused
        ? "automatic"
        : "manual",
    eligible_for_bulk_approval: followups.filter(
      isFollowupBulkApprovable,
    ).length,
  };
}

export async function generateEligibleFollowups(campaignId?: string | null) {
  const supabase = createSupabaseServerClient();
  const parents = await readInitialCandidates();
  const existing = await getFollowups();
  const existingParentIds = new Set(
    existing
      .filter((row) => row.followup_number === 1)
      .map((row) => row.parent_outreach_id)
      .filter((id): id is string => Boolean(id)),
  );
  const stopped = await supabase.from("leadgen_email_stop_list").select("normalized_email").eq("is_active", true);
  if (stopped.error) throw stopped.error;
  const stopList = new Set((stopped.data ?? []).map((row) => row.normalized_email));
  const now = Date.now();
  let generated = 0;
  const skipped: Record<string, number> = {};
  for (const parent of parents) {
    if (campaignId && parent.campaign_id !== campaignId) continue;
    const reason = evaluateFollowupEligibility(parent, { stopList, existingParentIds, now }).reason;
    if (reason) { skipped[reason] = (skipped[reason] ?? 0) + 1; continue; }

    const entry = rowToEntry(parent);
    const copy = generateFollowup(entry);
    const id = `followup-${parent.id}-1`;
    const insert = await supabase.from("leadgen_outreach_queue").insert({
      id,
      contact_id: parent.contact_id,
      lead_id: parent.lead_id,
      campaign_id: parent.campaign_id,
      company_id: parent.company_id,
      company_name: parent.company_name,
      recipient_email: parent.recipient_email,
      normalized_recipient_email: parent.normalized_recipient_email,
      recipient_name: parent.recipient_name,
      recipient_role: parent.recipient_role,
      subject: copy.subject,
      body: copy.body,
      message_mode: parent.message_mode,
      message_version: 1,
      status: "needs_review",
      idempotency_key: getFollowupIdempotencyKey({
        email: parent.recipient_email, parentOutreachId: parent.id,
        followupNumber: 1, messageVersion: 1,
      }),
      message_kind: "follow_up",
      parent_outreach_id: parent.id,
      followup_number: 1,
      parent_smtp_message_id: parent.smtp_message_id,
      reply_check_status: "verified",
      reply_checked_at: parent.reply_checked_at,
      generation_reason: "interval_elapsed_no_reply",
      copy_review_status: copy.reviewStatus,
      metadata: {
        ...(parent.metadata ?? {}),
        company_website: parent.metadata?.company_website ?? null,
        signal: parent.metadata?.signal ?? null,
        copy_quality: copy.quality,
        quality_gate_passed: copy.qualityGatePassed,
        copy_review_status: copy.reviewStatus,
        generation_attempts: copy.generationAttempts,
        micro_value: copy.microValue,
      },
    });
    if (insert.error && insert.error.code !== "23505") throw insert.error;
    if (!insert.error) generated += 1;
  }
  return { generated, skipped };
}

export async function updateFollowup(id: string, patch: { subject?: string; body?: string; email?: string }) {
  const supabase = createSupabaseServerClient();
  const current = await supabase.from("leadgen_outreach_queue").select(QUEUE_FIELDS).eq("id", id)
    .eq("message_kind", "follow_up").single<QueueRow>();
  if (current.error) throw current.error;
  if (["queued", "sending", "sent"].includes(current.data.status)) throw new Error("Это письмо уже нельзя редактировать.");
  const version = current.data.message_version + 1;
  const email = patch.email?.trim() || current.data.recipient_email;
  const result = await supabase.from("leadgen_outreach_queue").update({
    ...(patch.subject !== undefined ? { subject: patch.subject.trim() } : {}),
    ...(patch.body !== undefined ? { body: patch.body.trim() } : {}),
    ...(patch.email !== undefined ? { recipient_email: email, normalized_recipient_email: email.toLowerCase() } : {}),
    status: "needs_review",
    approved_at: null,
    message_version: version,
    approval_invalidated_reason: "approval_invalidated_by_edit",
    idempotency_key: getFollowupIdempotencyKey({ email, parentOutreachId: current.data.parent_outreach_id!,
      followupNumber: current.data.followup_number!, messageVersion: version }),
    copy_review_status: "needs_manual_copy_review",
    metadata: { ...current.data.metadata, quality_gate_passed: false, copy_review_status: "needs_manual_copy_review" },
    updated_at: new Date().toISOString(),
  }).eq("id", id).select(QUEUE_FIELDS).single<QueueRow>();
  if (result.error) throw result.error;
  return rowToEntry(result.data);
}

function canApprove(row: QueueRow, manual = false) {
  return row.status === "needs_review" && row.subject.trim() && row.body.trim() &&
    row.reply_check_status === "verified" && !row.reply_detected_at &&
    row.parent_smtp_message_id && (manual || (row.metadata?.quality_gate_passed === true &&
    row.copy_review_status !== "needs_manual_copy_review"));
}

export async function approveFollowups(
  ids?: string[],
  campaignId?: string | null,
  manual = false,
) {
  const supabase = createSupabaseServerClient();
  let query = supabase.from("leadgen_outreach_queue").select(QUEUE_FIELDS).eq("message_kind", "follow_up");
  if (ids?.length) query = query.in("id", ids);
  if (campaignId) query = query.eq("campaign_id", campaignId);
  const rows = await query;
  if (rows.error) throw rows.error;
  const eligible = ((rows.data ?? []) as QueueRow[]).filter((row) =>
    canApprove(row, manual || Boolean(ids?.length)),
  );
  let approved = 0;
  if (eligible.length) {
    const now = new Date().toISOString();
    const update = await supabase.from("leadgen_outreach_queue").update({
      status: "approved", approved_at: now, approval_invalidated_reason: null, updated_at: now,
    }).in("id", eligible.map((row) => row.id)).eq("status", "needs_review")
      .select("id");
    if (update.error) throw update.error;
    approved = update.data?.length ?? 0;
  }
  return {
    approved,
    skipped: (rows.data?.length ?? 0) - approved,
  };
}

export async function scheduleFollowupBatch(
  requestedCount: number,
  campaignId?: string | null,
) {
  const supabase = createSupabaseServerClient();
  const resume = await supabase.from("leadgen_outreach_settings").update({
    followup_paused: false,
    updated_at: new Date().toISOString(),
  }).eq("id", "global");
  if (resume.error) throw resume.error;
  let approvedQuery = supabase
    .from("leadgen_outreach_queue")
    .select(QUEUE_FIELDS)
    .eq("message_kind", "follow_up")
    .eq("status", "approved")
    .order("approved_at", { ascending: true });
  if (campaignId) approvedQuery = approvedQuery.eq("campaign_id", campaignId);
  const [daily, approved] = await Promise.all([
    getDailySendStats(),
    approvedQuery,
  ]);
  if (approved.error) throw approved.error;
  const rows = (approved.data ?? []) as QueueRow[];
  // Follow-ups have their own queue and do not consume the initial-outreach
  // daily capacity. Keep only the explicit batch safety bound here.
  const count = Math.min(
    Math.max(0, Math.floor(requestedCount)),
    rows.length,
    leadgenProductionConfig.emailBatchSendLimit,
  );
  const { minimum, maximum } = getEmailDelayBounds();
  let cursor = Date.now();
  const queued: OutreachQueueEntry[] = [];
  for (const row of rows.slice(0, count)) {
    const parent = await supabase.from("leadgen_outreach_queue").select("reply_check_status,reply_detected_at,smtp_message_id,status")
      .eq("id", row.parent_outreach_id!).single();
    if (parent.error || parent.data.reply_check_status !== "verified" || parent.data.reply_detected_at ||
      parent.data.status !== "sent" || !parent.data.smtp_message_id) continue;
    const timestamp = new Date(cursor).toISOString();
    const update = await supabase.from("leadgen_outreach_queue").update({ status: "queued", queued_at: new Date().toISOString(),
      scheduled_at: timestamp, next_attempt_at: timestamp, updated_at: new Date().toISOString() })
      .eq("id", row.id).eq("status", "approved").select(QUEUE_FIELDS).maybeSingle<QueueRow>();
    if (update.error) throw update.error;
    if (update.data) queued.push(rowToEntry(update.data));
    cursor = getNextScheduledAt({ currentTimestamp: cursor, minimumDelaySeconds: minimum,
      maximumDelaySeconds: maximum, randomDelay: (min, max) => randomInt(min, max + 1) });
  }
  return { queued, daily, remaining_approved: rows.length - queued.length };
}

export async function runAutomaticFollowupCycle() {
  if (!leadgenProductionConfig.followupAutomationEnabled) {
    return { status: "disabled" as const, scanned: false, generated: 0, approved: 0, queued: 0 };
  }

  const supabase = createSupabaseServerClient();
  const [settings, scanState] = await Promise.all([
    supabase.from("leadgen_outreach_settings").select("followup_paused")
      .eq("id", "global").single(),
    supabase.from("leadgen_followup_scan_lock").select("updated_at")
      .eq("id", "global").single(),
  ]);
  if (settings.error) throw settings.error;
  if (scanState.error) throw scanState.error;
  if (settings.data.followup_paused) {
    return { status: "manual" as const, scanned: false, generated: 0, approved: 0, queued: 0 };
  }

  const scanIntervalMs = leadgenProductionConfig.followupAutomationScanMinutes * 60_000;
  const lastScanAt = Date.parse(scanState.data.updated_at ?? "");
  const scanDue = !Number.isFinite(lastScanAt) || Date.now() - lastScanAt >= scanIntervalMs;
  let scan: Awaited<ReturnType<typeof scanFollowupReplies>> | null = null;
  if (scanDue) {
    scan = await scanFollowupReplies();
    if (scan.error) {
      return {
        status: "reply_check_unavailable" as const,
        scanned: true,
        generated: 0,
        approved: 0,
        queued: 0,
        error: scan.error,
      };
    }
  }

  const generation = await generateEligibleFollowups();
  const approval = await approveFollowups();
  const batch = await scheduleFollowupBatch(leadgenProductionConfig.emailBatchSendLimit);
  return {
    status: "ready" as const,
    scanned: scanDue,
    reply_found: scan?.reply_found ?? 0,
    generated: generation.generated,
    approved: approval.approved,
    queued: batch.queued.length,
  };
}

export async function getFollowupQueuePaused() {
  const supabase = createSupabaseServerClient();
  const settings = await supabase
    .from("leadgen_outreach_settings")
    .select("followup_paused")
    .eq("id", "global")
    .single();
  if (settings.error) throw settings.error;
  return Boolean(settings.data.followup_paused);
}

export async function assertFollowupSendable(entry: OutreachQueueEntry) {
  if (entry.message_kind !== "follow_up") return;
  const supabase = createSupabaseServerClient();
  const parent = await supabase.from("leadgen_outreach_queue")
    .select("status,smtp_message_id,reply_check_status,reply_detected_at,normalized_recipient_email")
    .eq("id", entry.parent_outreach_id!).single();
  if (parent.error || parent.data.status !== "sent" || !parent.data.smtp_message_id) {
    throw new Error("Исходное письмо недоступно для follow-up.");
  }
  if (parent.data.reply_check_status !== "verified") {
    throw new Error("Ответы не проверены: реальная отправка follow-up заблокирована.");
  }
  if (parent.data.reply_detected_at) throw new Error("Ответ уже получен: follow-up заблокирован.");
  const stopped = await supabase.from("leadgen_email_stop_list").select("normalized_email")
    .eq("normalized_email", parent.data.normalized_recipient_email).eq("is_active", true).maybeSingle();
  if (stopped.error) throw stopped.error;
  if (stopped.data) throw new Error("Получатель находится в stop-list.");
}

export async function controlFollowups(
  action: "pause" | "resume" | "cancel" | "retry" | "unapprove" | "skip",
  id?: string,
) {
  const supabase = createSupabaseServerClient();
  if (action === "pause" || action === "resume") {
    const result = await supabase.from("leadgen_outreach_settings").update({
      followup_paused: action === "pause", updated_at: new Date().toISOString(),
    }).eq("id", "global");
    if (result.error) throw result.error;
    return;
  }
  const status = action === "cancel" ? "queued" : action === "retry" ? "failed" :
    action === "unapprove" ? "approved" : "needs_review";
  const nextStatus = action === "skip" ? "skipped" : action === "unapprove" ? "needs_review" : "approved";
  let query = supabase.from("leadgen_outreach_queue").update({
    status: nextStatus, scheduled_at: null, next_attempt_at: null,
    queued_at: action === "cancel" ? null : undefined,
    last_error: null, failed_at: null,
    ...(action === "retry" ? { smtp_message_id: null, provider: null } : {}),
    updated_at: new Date().toISOString(),
    ...(action === "skip" ? { skip_reason: "manual_skip" } : {}),
  }).eq("message_kind", "follow_up").eq("status", status);
  if (id) query = query.eq("id", id);
  const result = await query;
  if (result.error) throw result.error;
}
