import { randomInt } from "node:crypto";
import { normalizeRecipientEmail } from "@/lib/leadgen/company-identity";
import { generateFirstEmailV3 } from "@/lib/leadgen/first-email-generator";
import {
  calculateBatchCapacity,
  getNextScheduledAt,
} from "@/lib/leadgen/outreach-policy";
import { getEmailDelayBounds, leadgenProductionConfig } from "@/lib/leadgen/production-config";
import {
  buildOutreachQueueEntry,
  getOutreachIdempotencyKey,
  isEmailReadyContact,
} from "@/lib/leadgen/outreach-queue";
import {
  countOutreachStatuses,
  getBulkApprovalBaseReason,
  getConfirmedOfficialWebsite,
  getOutreachSkipReason,
  isTechnicalEmailArtifact,
  isCanonicalOutreachWorkItem,
  type BulkApprovalSkipReason,
  type OutreachSkippedCompany,
} from "@/lib/leadgen/outreach-working-set";
import { createSupabaseServerClient } from "@/lib/supabase/client";
import { getBusinessDayRange } from "@/lib/leadgen/business-day";
import { COMPANY_FIELDS, CONTACT_FIELDS, LEAD_FIELDS, QUEUE_FIELDS, SIGNAL_FIELDS } from "@/lib/leadgen/storage-projections";
export { getBusinessDayRange } from "@/lib/leadgen/business-day";
import type {
  LeadgenCompany,
  LeadgenContact,
  LeadgenLead,
  LeadgenSignal,
  OutreachEmailStatus,
  OutreachOperationalState,
  OutreachQueueEntry,
  OutreachReadiness,
} from "@/lib/leadgen/types";

export type QueueRow = {
  id: string;
  contact_id: string;
  lead_id: string;
  campaign_id: string;
  company_id: string | null;
  company_name: string;
  recipient_email: string;
  normalized_recipient_email: string;
  recipient_name: string | null;
  recipient_role: string | null;
  subject: string;
  body: string;
  message_mode: OutreachQueueEntry["message_mode"];
  message_version: number;
  status: OutreachEmailStatus;
  approved_at: string | null;
  queued_at: string | null;
  scheduled_at: string | null;
  next_attempt_at: string | null;
  sending_started_at: string | null;
  sent_at: string | null;
  failed_at: string | null;
  attempt_count: number;
  last_error: string | null;
  smtp_message_id: string | null;
  provider: string | null;
  idempotency_key: string;
  approval_invalidated_reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  message_kind?: "initial" | "follow_up";
  parent_outreach_id?: string | null;
  followup_number?: number | null;
  parent_smtp_message_id?: string | null;
  reply_check_status?: "pending" | "verified" | "unavailable";
  reply_checked_at?: string | null;
  reply_detected_at?: string | null;
  reply_message_id?: string | null;
  reply_from?: string | null;
  reply_subject?: string | null;
  reply_detection_method?: OutreachQueueEntry["reply_detection_method"];
  generation_reason?: string | null;
  skip_reason?: string | null;
  copy_review_status?: string | null;
};

export function rowToEntry(row: QueueRow, queuePosition: number | null = null): OutreachQueueEntry {
  const metadata = row.metadata ?? {};
  const storedSignal =
    metadata.signal && typeof metadata.signal === "object"
      ? (metadata.signal as Partial<OutreachQueueEntry["signal"]>)
      : {};
  const signal: OutreachQueueEntry["signal"] = {
    type: storedSignal.type ?? null,
    title: storedSignal.title ?? null,
    detail: storedSignal.detail ?? null,
    source_url: storedSignal.source_url ?? null,
    confidence_score: storedSignal.confidence_score ?? null,
  };
  return {
    id: row.id,
    contact_id: row.contact_id,
    lead_id: row.lead_id,
    campaign_id: row.campaign_id,
    company_id: row.company_id,
    company_name: row.company_name,
    company_website: (metadata.company_website as string | null) ?? null,
    recipient_name: row.recipient_name,
    recipient_role: row.recipient_role,
    email: row.recipient_email,
    normalized_recipient_email: row.normalized_recipient_email,
    email_type: (metadata.email_type as OutreachQueueEntry["email_type"]) ?? "generic_email",
    email_source_url: (metadata.email_source_url as string | null) ?? null,
    email_source_label: (metadata.email_source_label as string | null) ?? null,
    readiness: (metadata.readiness as string) ?? "email_ready",
    signal,
    subject: row.subject,
    body: row.body,
    message_mode: row.message_mode,
    message_version: row.message_version,
    status: row.status,
    idempotency_key: row.idempotency_key,
    send_attempts: row.attempt_count,
    last_error: row.last_error,
    provider: row.provider,
    provider_message_id: row.smtp_message_id,
    smtp_response: (metadata.smtp_response as string | null) ?? null,
    sent_copy_saved_at:
      (metadata.sent_copy_saved_at as string | null) ?? null,
    sent_copy_error: (metadata.sent_copy_error as string | null) ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    approved_at: row.approved_at,
    queued_at: row.queued_at,
    scheduled_at: row.scheduled_at,
    next_attempt_at: row.next_attempt_at,
    sending_started_at: row.sending_started_at,
    sent_at: row.sent_at,
    failed_at: row.failed_at,
    approval_invalidated_reason: row.approval_invalidated_reason,
    copy_quality:
      (metadata.copy_quality as Record<string, number> | null | undefined) ?? null,
    quality_gate_passed: metadata.quality_gate_passed === true,
    copy_review_status:
      metadata.copy_review_status === "ready"
        ? "ready"
        : "needs_manual_copy_review",
    generation_attempts:
      typeof metadata.generation_attempts === "number"
        ? metadata.generation_attempts
        : 0,
    micro_value:
      (metadata.micro_value as OutreachQueueEntry["micro_value"]) ?? null,
    queue_position: queuePosition,
    follow_up_due_at: null,
    follow_up_status: null,
    history: [],
    message_kind: row.message_kind ?? "initial",
    parent_outreach_id: row.parent_outreach_id ?? null,
    followup_number: row.followup_number ?? null,
    parent_smtp_message_id: row.parent_smtp_message_id ?? null,
    reply_check_status: row.reply_check_status ?? "pending",
    reply_checked_at: row.reply_checked_at ?? null,
    reply_detected_at: row.reply_detected_at ?? null,
    reply_message_id: row.reply_message_id ?? null,
    reply_from: row.reply_from ?? null,
    reply_subject: row.reply_subject ?? null,
    reply_detection_method: row.reply_detection_method ?? null,
    reply_intent: (metadata.reply_intent as OutreachQueueEntry["reply_intent"]) ?? null,
    reply_contact: (metadata.reply_contact as OutreachQueueEntry["reply_contact"]) ?? null,
    generation_reason: row.generation_reason ?? null,
    skip_reason: row.skip_reason ?? null,
  };
}

export async function getKnownRecipientEmails(): Promise<string[]> {
  const supabase = createSupabaseServerClient();
  const [contactsResult, queueResult] = await Promise.all([
    supabase
      .from("leadgen_contacts")
      .select("email")
      .not("email", "is", null),
    supabase
      .from("leadgen_outreach_queue")
      .select("normalized_recipient_email"),
  ]);
  if (contactsResult.error) throw contactsResult.error;
  if (queueResult.error) throw queueResult.error;

  return [
    ...new Set(
      [
        ...(contactsResult.data ?? []).map((row) => row.email),
        ...(queueResult.data ?? []).map(
          (row) => row.normalized_recipient_email,
        ),
      ]
        .filter((email): email is string => Boolean(email))
        .map(normalizeRecipientEmail)
        .filter(Boolean),
    ),
  ];
}

async function readCampaignSources(campaignId: string) {
  const supabase = createSupabaseServerClient();
  const [contactsResult, leadsResult, companiesResult, signalsResult] =
    await Promise.all([
      supabase.from("leadgen_contacts").select(CONTACT_FIELDS).eq("campaign_id", campaignId),
      supabase.from("leadgen_leads").select(LEAD_FIELDS).eq("campaign_id", campaignId),
      supabase.from("leadgen_companies").select(COMPANY_FIELDS).eq("campaign_id", campaignId),
      supabase.from("leadgen_signals").select(SIGNAL_FIELDS).eq("campaign_id", campaignId),
    ]);
  for (const result of [contactsResult, leadsResult, companiesResult, signalsResult]) {
    if (result.error) throw result.error;
  }
  return {
    contacts: (contactsResult.data ?? []) as LeadgenContact[],
    leads: (leadsResult.data ?? []) as LeadgenLead[],
    companies: (companiesResult.data ?? []) as LeadgenCompany[],
    signals: (signalsResult.data ?? []) as LeadgenSignal[],
  };
}

async function quarantineTechnicalOutreachArtifacts(campaignId?: string | null) {
  const supabase = createSupabaseServerClient();
  let query = supabase
    .from("leadgen_outreach_queue")
    .select("id,recipient_email")
    .eq("message_kind", "initial")
    .in("status", ["draft", "needs_review", "approved", "failed"]);
  if (campaignId) query = query.eq("campaign_id", campaignId);
  const result = await query;
  if (result.error) throw result.error;

  const invalidIds = (result.data ?? [])
    .filter((row) => isTechnicalEmailArtifact(row.recipient_email))
    .map((row) => row.id);
  if (invalidIds.length === 0) return 0;

  const update = await supabase
    .from("leadgen_outreach_queue")
    .update({
      status: "rejected",
      approved_at: null,
      queued_at: null,
      scheduled_at: null,
      next_attempt_at: null,
      last_error: "Технический адрес из кода страницы, не email компании.",
      updated_at: new Date().toISOString(),
    })
    .in("id", invalidIds)
    .in("status", ["draft", "needs_review", "approved", "failed"]);
  if (update.error) throw update.error;
  return invalidIds.length;
}

export async function syncOutreachQueue(campaignId: string) {
  const supabase = createSupabaseServerClient();
  await quarantineTechnicalOutreachArtifacts(campaignId);
  const { contacts, leads, companies, signals } =
    await readCampaignSources(campaignId);
  const leadsById = new Map(leads.map((item) => [item.id, item]));
  const companiesById = new Map(companies.map((item) => [item.id, item]));
  const signalsByLeadId = new Map(signals.map((item) => [item.lead_id, item]));
  const seenEmails = new Set<string>();

  for (const contact of contacts.filter(
    (item) =>
      isEmailReadyContact(item) &&
      !isTechnicalEmailArtifact(item.email ?? ""),
  )) {
    if (
      seenEmails.size >= leadgenProductionConfig.dailyLeadLimit
    ) {
      break;
    }
    const company = companiesById.get(contact.company_id) ?? null;
    const officialWebsite = company
      ? getConfirmedOfficialWebsite(company)
      : null;
    if (!officialWebsite) continue;
    const entry = buildOutreachQueueEntry({
      contact,
      lead: leadsById.get(contact.lead_id) ?? null,
      company,
      signal: signalsByLeadId.get(contact.lead_id) ?? null,
    });
    if (!entry) continue;
    const normalizedEmail = normalizeRecipientEmail(entry.email);
    if (seenEmails.has(normalizedEmail)) continue;
    seenEmails.add(normalizedEmail);

    const { data: existing, error: existingError } = await supabase
      .from("leadgen_outreach_queue")
      .select("id")
      .eq("id", entry.id)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) continue;

    const now = new Date().toISOString();
    const { error } = await supabase.from("leadgen_outreach_queue").insert({
      id: entry.id,
      contact_id: entry.contact_id,
      lead_id: entry.lead_id,
      campaign_id: entry.campaign_id,
      company_id: entry.company_id,
      company_name: entry.company_name,
      recipient_email: entry.email,
      normalized_recipient_email: normalizedEmail,
      recipient_name: entry.recipient_name,
      recipient_role: entry.recipient_role,
      subject: entry.subject,
      body: entry.body,
      message_mode: entry.message_mode,
      message_kind: "initial",
      message_version: 1,
      attempt_count: 0,
      status: "needs_review",
      idempotency_key: getOutreachIdempotencyKey({
        campaignId,
        email: normalizedEmail,
        messageVersion: 1,
      }),
      metadata: {
        company_website: officialWebsite,
        email_type: entry.email_type,
        email_source_url: entry.email_source_url,
        email_source_label: entry.email_source_label,
        readiness: entry.readiness,
        signal: entry.signal,
        copy_quality: entry.copy_quality,
        quality_gate_passed: entry.quality_gate_passed,
        copy_review_status: entry.copy_review_status,
        generation_attempts: entry.generation_attempts,
        micro_value: entry.micro_value,
        vertical_id: company?.metadata.vertical_id ?? null,
      },
      created_at: now,
      updated_at: now,
    });
    if (error && error.code !== "23505") throw error;
  }
  return getOutreachQueue({ campaignId });
}

export async function getOutreachQueue({
  campaignId,
}: { campaignId?: string | null } = {}) {
  const supabase = createSupabaseServerClient();
  let query = supabase.from("leadgen_outreach_queue").select(QUEUE_FIELDS);
  query = query.eq("message_kind", "initial");
  if (campaignId) query = query.eq("campaign_id", campaignId);
  const { data, error } = await query.order("created_at", { ascending: true });
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      throw new Error("Persistent outreach queue migration is not installed.");
    }
    throw error;
  }
  let position = 0;
  return ((data ?? []) as QueueRow[])
    .map((row) => rowToEntry(row))
    .filter(isCanonicalOutreachWorkItem)
    .map((entry) => ({
      ...entry,
      queue_position: entry.status === "queued" ? ++position : null,
    }));
}

export async function getOutreachQueueEntry(id: string) {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("leadgen_outreach_queue")
    .select(QUEUE_FIELDS)
    .eq("id", id)
    .maybeSingle<QueueRow>();
  if (error) throw error;
  return data ? rowToEntry(data) : null;
}

async function getBulkApprovalPlan(entries: OutreachQueueEntry[]) {
  const supabase = createSupabaseServerClient();
  const [sentResult, stopListResult] = await Promise.all([
    supabase
      .from("leadgen_outreach_queue")
      .select("normalized_recipient_email, company_id")
      .eq("status", "sent")
      .eq("message_kind", "initial"),
    supabase
      .from("leadgen_email_stop_list")
      .select("normalized_email")
      .eq("is_active", true),
  ]);
  if (sentResult.error) throw sentResult.error;
  if (stopListResult.error) throw stopListResult.error;

  const sentEmails = new Set(
    (sentResult.data ?? []).map((row) => row.normalized_recipient_email),
  );
  const sentCompanyIds = new Set(
    (sentResult.data ?? [])
      .map((row) => row.company_id)
      .filter((companyId): companyId is string => Boolean(companyId)),
  );
  const stoppedEmails = new Set(
    (stopListResult.data ?? []).map((row) => row.normalized_email),
  );
  const reasons = new Map<string, BulkApprovalSkipReason | null>();
  for (const entry of entries) {
    const normalizedEmail = normalizeRecipientEmail(entry.email);
    reasons.set(
      entry.id,
      sentEmails.has(normalizedEmail) ||
        (entry.company_id ? sentCompanyIds.has(entry.company_id) : false)
        ? "already_contacted"
        : stoppedEmails.has(normalizedEmail)
          ? "stop_list"
          : getBulkApprovalBaseReason(entry),
    );
  }
  return {
    eligible: entries.filter((entry) => reasons.get(entry.id) === null),
    reasons,
  };
}

export async function getOutreachWorkingSet(campaignId: string) {
  const [{ contacts, companies }, entries] = await Promise.all([
    readCampaignSources(campaignId),
    getOutreachQueue({ campaignId }),
  ]);
  const bulkApprovalPlan = await getBulkApprovalPlan(entries);
  const companyIdsWithEmail = new Set(
    contacts
      .filter(
        (contact) =>
          isEmailReadyContact(contact) &&
          !isTechnicalEmailArtifact(contact.email ?? ""),
      )
      .map((contact) => contact.company_id),
  );
  const companyIdsWithOutreach = new Set(
    entries
      .map((entry) => entry.company_id)
      .filter((companyId): companyId is string => Boolean(companyId)),
  );
  const skippedCompanies: OutreachSkippedCompany[] = companies.flatMap(
    (company) => {
      const reason = getOutreachSkipReason(
        company,
        companyIdsWithEmail.has(company.id),
        companyIdsWithOutreach.has(company.id),
      );
      return reason
        ? [{
            company_id: company.id,
            company_name: company.company_name,
            reason,
            official_website_url: getConfirmedOfficialWebsite(company),
          }]
        : [];
    },
  );

  return {
    entries,
    skipped_companies: skippedCompanies,
    counters: countOutreachStatuses(entries),
    eligible_for_bulk_approval_count: bulkApprovalPlan.eligible.length,
  };
}

export async function updateOutreachQueueEntry({
  id,
  subject,
  body,
  email,
  status,
  note,
}: {
  id: string;
  subject?: string;
  body?: string;
  email?: string;
  status?: OutreachEmailStatus;
  note?: string;
}) {
  void note;
  const supabase = createSupabaseServerClient();
  const { data: current, error: readError } = await supabase
    .from("leadgen_outreach_queue")
    .select(QUEUE_FIELDS)
    .eq("id", id)
    .single<QueueRow>();
  if (readError) return null;
  if (["sent", "sending", "queued"].includes(current.status) &&
      (subject !== undefined || body !== undefined || email !== undefined)) {
    throw new Error("Нельзя редактировать отправляемое или отправленное письмо.");
  }
  if (
    status &&
    ["sent", "sending", "queued", "completed"].includes(current.status)
  ) {
    throw new Error("Текущий статус нельзя изменить вручную.");
  }
  const edited = subject !== undefined || body !== undefined || email !== undefined;
  const messageVersion = edited ? current.message_version + 1 : current.message_version;
  const normalizedEmail = email
    ? normalizeRecipientEmail(email)
    : current.normalized_recipient_email;
  const nextStatus = edited ? "needs_review" : status ?? current.status;
  const now = new Date().toISOString();
  const patch = {
    ...(subject !== undefined ? { subject: subject.trim() } : {}),
    ...(body !== undefined ? { body: body.trim() } : {}),
    ...(email !== undefined
      ? { recipient_email: email.trim(), normalized_recipient_email: normalizedEmail }
      : {}),
    status: nextStatus,
    message_version: messageVersion,
    idempotency_key: getOutreachIdempotencyKey({
      campaignId: current.campaign_id,
      email: normalizedEmail,
      messageVersion,
    }),
    approval_invalidated_reason: edited
      ? "approval_invalidated_by_edit"
      : current.approval_invalidated_reason,
    ...(edited
      ? {
          metadata: {
            ...(current.metadata ?? {}),
            quality_gate_passed: false,
            copy_review_status: "needs_manual_copy_review",
          },
        }
      : {}),
    approved_at: nextStatus === "approved" ? now : edited ? null : current.approved_at,
    updated_at: now,
    last_error: nextStatus === "approved" ? null : current.last_error,
  };
  const { data, error } = await supabase
    .from("leadgen_outreach_queue")
    .update(patch)
    .eq("id", id)
    .select(QUEUE_FIELDS)
    .single<QueueRow>();
  if (error) throw error;
  return rowToEntry(data);
}

export async function approveOutreachEntry(id: string) {
  const supabase = createSupabaseServerClient();
  const currentResult = await supabase
    .from("leadgen_outreach_queue")
    .select("normalized_recipient_email,company_id")
    .eq("id", id)
    .single();
  if (currentResult.error) return null;
  const duplicateEmailResult = await supabase
    .from("leadgen_outreach_queue")
    .select("id")
    .eq("status", "sent")
    .eq("message_kind", "initial")
    .eq(
      "normalized_recipient_email",
      currentResult.data.normalized_recipient_email,
    )
    .neq("id", id)
    .limit(1);
  if (duplicateEmailResult.error) throw duplicateEmailResult.error;
  let hasDuplicate = (duplicateEmailResult.data ?? []).length > 0;
  if (currentResult.data.company_id) {
    const duplicateCompanyResult = await supabase
      .from("leadgen_outreach_queue")
      .select("id")
      .eq("status", "sent")
      .eq("message_kind", "initial")
      .eq("company_id", currentResult.data.company_id)
      .neq("id", id)
      .limit(1);
    if (duplicateCompanyResult.error) throw duplicateCompanyResult.error;
    hasDuplicate ||= (duplicateCompanyResult.data ?? []).length > 0;
  }
  if (hasDuplicate) {
    throw new Error("Этому адресу или компании уже отправлялось письмо.");
  }
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("leadgen_outreach_queue")
    .update({
      status: "approved",
      approved_at: now,
      approval_invalidated_reason: null,
      last_error: null,
      updated_at: now,
    })
    .eq("id", id)
    .in("status", ["draft", "needs_review", "paused", "failed"])
    .neq("subject", "")
    .neq("body", "")
    .select(QUEUE_FIELDS)
    .maybeSingle<QueueRow>();
  if (error) throw error;
  return data ? rowToEntry(data) : null;
}

export async function bulkApproveOutreach(campaignId: string, execute: boolean) {
  await syncOutreachQueue(campaignId);
  const entries = await getOutreachQueue({ campaignId });
  const { eligible, reasons } = await getBulkApprovalPlan(entries);
  const skipped = [...reasons.values()].reduce<Record<string, number>>(
    (result, reason) => {
      if (reason) result[reason] = (result[reason] ?? 0) + 1;
      return result;
    },
    {},
  );
  let approved = 0;
  if (execute) {
    for (const entry of eligible) {
      if (await approveOutreachEntry(entry.id)) {
        approved += 1;
      }
    }
  }
  return {
    checked: entries.length,
    eligible_count: eligible.length,
    skipped_count: entries.length - eligible.length,
    skipped,
    approved,
  };
}

export async function regenerateLatestUnsentOutreach(execute: boolean) {
  const supabase = createSupabaseServerClient();
  const latestResult = await supabase
    .from("leadgen_outreach_queue")
    .select("campaign_id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ campaign_id: string }>();
  if (latestResult.error) throw latestResult.error;
  if (!latestResult.data) {
    return { campaign_id: null, eligible_count: 0, regenerated: 0, manual_review: 0 };
  }

  const campaignId = latestResult.data.campaign_id;
  const queueResult = await supabase
    .from("leadgen_outreach_queue")
    .select(QUEUE_FIELDS)
    .eq("campaign_id", campaignId)
    .in("status", ["draft", "needs_review", "approved", "failed", "paused"])
    .is("sent_at", null)
    .order("created_at", { ascending: true });
  if (queueResult.error) throw queueResult.error;

  const entries = (queueResult.data ?? []) as QueueRow[];
  let regenerated = 0;
  let manualReview = 0;
  const batchBodies: string[] = [];

  for (const row of entries) {
    const metadata = row.metadata ?? {};
    const signal = (metadata.signal as OutreachQueueEntry["signal"] | undefined) ?? null;
    const copy = generateFirstEmailV3({
      companyName: row.company_name,
      website: (metadata.company_website as string | null | undefined) ?? null,
      decisionMakerName: row.recipient_name,
      decisionMakerRole: row.recipient_role,
      contactEmail: row.recipient_email,
      messageMode: row.message_mode,
      growthSignal: [signal?.title, signal?.detail].filter(Boolean).join(" "),
      signalType: signal?.type,
      signalEvidence: signal?.detail ?? signal?.title,
      signalSourceUrl: signal?.source_url,
      verticalId: metadata.vertical_id as import("@/lib/leadgen/verticals").LeadgenVerticalId | undefined,
      uniquenessKey: `${row.id}:${row.message_version + 1}`,
      batchBodies,
    });
    batchBodies.push(copy.body);
    if (!copy.qualityGatePassed) manualReview += 1;
    if (!execute) continue;

    const messageVersion = row.message_version + 1;
    const updateResult = await supabase
      .from("leadgen_outreach_queue")
      .update({
        subject: copy.subject,
        body: copy.body,
        status: "needs_review",
        approved_at: null,
        message_version: messageVersion,
        idempotency_key: getOutreachIdempotencyKey({
          campaignId,
          email: row.normalized_recipient_email,
          messageVersion,
        }),
        approval_invalidated_reason: "content_regenerated",
        last_error: null,
        metadata: {
          ...metadata,
          copy_quality: copy.quality,
          quality_gate_passed: copy.qualityGatePassed,
          copy_review_status: copy.reviewStatus,
          generation_attempts: copy.generationAttempts,
          micro_value: copy.microValue,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("message_version", row.message_version)
      .is("sent_at", null);
    if (updateResult.error) throw updateResult.error;
    regenerated += 1;
  }

  return {
    campaign_id: campaignId,
    eligible_count: entries.length,
    regenerated: execute ? regenerated : 0,
    manual_review: manualReview,
  };
}

export async function getDailySendStats(now = new Date()) {
  const supabase = createSupabaseServerClient();
  const { start, end } = getBusinessDayRange(now);
  const { count, error } = await supabase
    .from("leadgen_outreach_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "sent")
    .eq("message_kind", "initial")
    .gte("sent_at", start.toISOString())
    .lt("sent_at", end.toISOString());
  if (error) throw error;
  const sentToday = count ?? 0;
  const activeResult = await supabase
    .from("leadgen_outreach_queue")
    .select("id", { count: "exact", head: true })
    .in("status", ["queued", "sending"])
    .eq("message_kind", "initial")
    .lt("next_attempt_at", end.toISOString());
  if (activeResult.error) throw activeResult.error;
  const queuedForToday = activeResult.count ?? 0;
  const successfulRemaining = Math.max(
    0,
    leadgenProductionConfig.emailDailySendLimit - sentToday,
  );
  return {
    sentToday,
    queuedForToday,
    dailyLimit: leadgenProductionConfig.emailDailySendLimit,
    remaining: successfulRemaining,
    availableToQueue: Math.max(0, successfulRemaining - queuedForToday),
  };
}

export async function scheduleApprovedBatch({
  campaignId,
  requestedCount,
  randomDelay = (min: number, max: number) => randomInt(min, max + 1),
}: {
  campaignId?: string | null;
  requestedCount: number;
  randomDelay?: (min: number, max: number) => number;
}) {
  const supabase = createSupabaseServerClient();
  await quarantineTechnicalOutreachArtifacts(campaignId);
  const stats = await getDailySendStats();
  let approvedCountQuery = supabase
    .from("leadgen_outreach_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "approved")
    .eq("message_kind", "initial");
  if (campaignId) {
    approvedCountQuery = approvedCountQuery.eq("campaign_id", campaignId);
  }
  const approvedCountResult = await approvedCountQuery;
  if (approvedCountResult.error) throw approvedCountResult.error;
  const approvedCount = approvedCountResult.count ?? 0;
  const reasons: Record<string, number> = {};
  const addReason = (reason: string) => {
    reasons[reason] = (reasons[reason] ?? 0) + 1;
  };
  const safeCount = calculateBatchCapacity({
    requested: Math.max(0, requestedCount),
    approved: approvedCount,
    sentToday: stats.sentToday,
    queuedForToday: stats.queuedForToday,
    dailyLimit: stats.dailyLimit,
    batchLimit: leadgenProductionConfig.emailBatchSendLimit,
  });
  if (safeCount < 1) {
    addReason(approvedCount < 1 ? "no_approved_items" : "daily_limit_reached");
    return {
      queued: [],
      queued_count: 0,
      skipped_count: 0,
      reasons,
      stats,
      remaining_approved: approvedCount,
    };
  }
  let approvedEntriesQuery = supabase
    .from("leadgen_outreach_queue")
    .select(QUEUE_FIELDS)
    .eq("status", "approved")
    .eq("message_kind", "initial")
    .order("approved_at", { ascending: true })
    .limit(safeCount);
  if (campaignId) {
    approvedEntriesQuery = approvedEntriesQuery.eq(
      "campaign_id",
      campaignId,
    );
  }
  const { data, error } = await approvedEntriesQuery;
  if (error) throw error;
  const rows = (data ?? []) as QueueRow[];
  const [blockedResult, stopListResult] = await Promise.all([
    supabase
      .from("leadgen_outreach_queue")
      .select("normalized_recipient_email,company_id")
      .eq("message_kind", "initial")
      .in("status", ["sent", "queued", "sending"]),
    supabase
      .from("leadgen_email_stop_list")
      .select("normalized_email")
      .eq("is_active", true),
  ]);
  if (blockedResult.error) throw blockedResult.error;
  if (stopListResult.error) throw stopListResult.error;

  const blockedEmails = new Set(
    (blockedResult.data ?? []).map((item) => item.normalized_recipient_email),
  );
  const blockedCompanies = new Set(
    (blockedResult.data ?? [])
      .map((item) => item.company_id)
      .filter((value): value is string => Boolean(value)),
  );
  const stoppedEmails = new Set(
    (stopListResult.data ?? []).map((item) => item.normalized_email),
  );
  const selectedEmails = new Set<string>();
  const selectedCompanies = new Set<string>();
  const eligibleRows = rows.filter((row) => {
    if (!row.recipient_email.trim()) {
      addReason("missing_email");
      return false;
    }
    if (!row.subject.trim()) {
      addReason("missing_subject");
      return false;
    }
    if (!row.body.trim()) {
      addReason("missing_body");
      return false;
    }
    if (stoppedEmails.has(row.normalized_recipient_email)) {
      addReason("stop_list");
      return false;
    }
    if (
      blockedEmails.has(row.normalized_recipient_email) ||
      selectedEmails.has(row.normalized_recipient_email)
    ) {
      addReason("duplicate_email");
      return false;
    }
    if (
      row.company_id &&
      (blockedCompanies.has(row.company_id) ||
        selectedCompanies.has(row.company_id))
    ) {
      addReason("already_contacted");
      return false;
    }
    selectedEmails.add(row.normalized_recipient_email);
    if (row.company_id) selectedCompanies.add(row.company_id);
    return true;
  });

  const { minimum, maximum } = getEmailDelayBounds();
  let scheduledAt = Date.now();
  const scheduledRows = eligibleRows.map((row) => {
    const timestamp = new Date(scheduledAt).toISOString();
    scheduledAt = getNextScheduledAt({
      currentTimestamp: scheduledAt,
      minimumDelaySeconds: minimum,
      maximumDelaySeconds: maximum,
      randomDelay,
    });
    return { row, timestamp };
  });
  const updateResults = await Promise.all(
    scheduledRows.map(({ row, timestamp }) =>
      supabase
      .from("leadgen_outreach_queue")
      .update({
        status: "queued",
        queued_at: new Date().toISOString(),
        scheduled_at: timestamp,
        next_attempt_at: timestamp,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("status", "approved")
      .select(QUEUE_FIELDS)
      .maybeSingle<QueueRow>(),
    ),
  );
  const queued: OutreachQueueEntry[] = [];
  for (const update of updateResults) {
    if (update.error) {
      if (update.error.code === "23505") {
        addReason("queue_already_created");
        continue;
      }
      throw update.error;
    }
    if (update.data) {
      queued.push(rowToEntry(update.data, queued.length + 1));
    } else addReason("state_changed");
  }
  return {
    queued,
    queued_count: queued.length,
    skipped_count: rows.length - queued.length,
    reasons,
    stats,
    remaining_approved: Math.max(
      0,
      approvedCount - queued.length,
    ),
  };
}

export async function getQueuePaused() {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("leadgen_outreach_settings")
    .select("is_paused")
    .eq("id", "global")
    .single();
  if (error) throw error;
  return Boolean(data.is_paused);
}

export async function setQueuePaused(isPaused: boolean) {
  const supabase = createSupabaseServerClient();
  const now = new Date().toISOString();
  const { error } = await supabase.from("leadgen_outreach_settings").upsert({
    id: "global",
    is_paused: isPaused,
    paused_at: isPaused ? now : null,
    updated_at: now,
  });
  if (error) throw error;
}

export async function cancelQueued(campaignId?: string) {
  const supabase = createSupabaseServerClient();
  let query = supabase
    .from("leadgen_outreach_queue")
    .update({
      status: "approved",
      queued_at: null,
      scheduled_at: null,
      next_attempt_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("status", "queued")
    .eq("message_kind", "initial");
  if (campaignId) query = query.eq("campaign_id", campaignId);
  const { error } = await query;
  if (error) throw error;
}

export async function cancelQueuedItem(id: string) {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("leadgen_outreach_queue")
    .update({
      status: "approved",
      queued_at: null,
      scheduled_at: null,
      next_attempt_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("message_kind", "initial")
    .eq("status", "queued")
    .select(QUEUE_FIELDS)
    .maybeSingle<QueueRow>();
  if (error) throw error;
  return data ? rowToEntry(data) : null;
}

export async function retryFailed(campaignId?: string) {
  const supabase = createSupabaseServerClient();
  let query = supabase
    .from("leadgen_outreach_queue")
    .update({
      status: "approved",
      last_error: null,
      failed_at: null,
      smtp_message_id: null,
      provider: null,
      updated_at: new Date().toISOString(),
    })
    .eq("status", "failed")
    .eq("message_kind", "initial");
  if (campaignId) query = query.eq("campaign_id", campaignId);
  const { error } = await query;
  if (error) throw error;
}

export async function retryFailedItem(id: string) {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("leadgen_outreach_queue")
    .update({
      status: "approved",
      last_error: null,
      failed_at: null,
      smtp_message_id: null,
      provider: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("message_kind", "initial")
    .eq("status", "failed")
    .select(QUEUE_FIELDS)
    .maybeSingle<QueueRow>();
  if (error) throw error;
  return data ? rowToEntry(data) : null;
}

export async function claimDueOutreachItem(
  workerId: string,
  messageKind?: "initial" | "follow_up",
) {
  const supabase = createSupabaseServerClient();
  if (messageKind) {
    const now = new Date().toISOString();
    const stale = await supabase
      .from("leadgen_outreach_queue")
      .update({
        status: "failed",
        failed_at: now,
        last_error: "Processor interrupted while sending; manual retry required.",
        updated_at: now,
      })
      .eq("message_kind", messageKind)
      .eq("status", "sending")
      .lt(
        "sending_started_at",
        new Date(Date.now() - 30 * 60_000).toISOString(),
      );
    if (stale.error) throw stale.error;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const candidate = await supabase
        .from("leadgen_outreach_queue")
        .select("id,attempt_count")
        .eq("message_kind", messageKind)
        .eq("status", "queued")
        .lte("next_attempt_at", now)
        .order("next_attempt_at", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle<{ id: string; attempt_count: number }>();
      if (candidate.error) throw candidate.error;
      if (!candidate.data) return null;
      const claimed = await supabase
        .from("leadgen_outreach_queue")
        .update({
          status: "sending",
          sending_started_at: now,
          attempt_count: candidate.data.attempt_count + 1,
          last_error: null,
          updated_at: now,
          provider: workerId,
        })
        .eq("id", candidate.data.id)
        .eq("message_kind", messageKind)
        .eq("status", "queued")
        .select(QUEUE_FIELDS)
        .maybeSingle<QueueRow>();
      if (claimed.error) throw claimed.error;
      if (claimed.data) return rowToEntry(claimed.data);
    }
    return null;
  }
  const { data, error } = await supabase.rpc("claim_due_outreach_item", {
    worker_id: workerId,
  });
  if (error) throw error;
  const row = ((data ?? []) as QueueRow[])[0];
  return row ? rowToEntry(row) : null;
}

/** Returns the kind of the next due item without claiming it. */
export async function getNextDueOutreachMessageKind() {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("leadgen_outreach_queue")
    .select("message_kind")
    .eq("status", "queued")
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ message_kind: "initial" | "follow_up" }>();
  if (error) throw error;
  return data?.message_kind ?? null;
}

export async function rejectPreviouslyContactedQueuedItems() {
  const supabase = createSupabaseServerClient();
  const [{ data: sent, error: sentError }, { data: queued, error: queuedError }] =
    await Promise.all([
      supabase
        .from("leadgen_outreach_queue")
        .select("normalized_recipient_email,company_id")
        .eq("status", "sent")
        .eq("message_kind", "initial"),
      supabase
        .from("leadgen_outreach_queue")
        .select("id,normalized_recipient_email,company_id")
        .eq("status", "queued")
        .eq("message_kind", "initial"),
    ]);
  if (sentError) throw sentError;
  if (queuedError) throw queuedError;

  const sentEmails = new Set(
    (sent ?? []).map((item) => item.normalized_recipient_email),
  );
  const sentCompanies = new Set(
    (sent ?? [])
      .map((item) => item.company_id)
      .filter((value): value is string => Boolean(value)),
  );
  const duplicateIds = (queued ?? [])
    .filter(
      (item) =>
        sentEmails.has(item.normalized_recipient_email) ||
        (item.company_id ? sentCompanies.has(item.company_id) : false),
    )
    .map((item) => item.id);

  if (duplicateIds.length === 0) return 0;
  const { error } = await supabase
    .from("leadgen_outreach_queue")
    .update({
      status: "rejected",
      last_error: "Уже отправляли этому email или компании.",
      scheduled_at: null,
      next_attempt_at: null,
      updated_at: new Date().toISOString(),
    })
    .in("id", duplicateIds)
    .eq("status", "queued");
  if (error) throw error;
  return duplicateIds.length;
}

export async function deferRemainingQueuedItems(
  attemptedAt = new Date(),
) {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("leadgen_outreach_queue")
    .select("id,next_attempt_at,scheduled_at,created_at")
    .eq("status", "queued")
    .order("next_attempt_at", { ascending: true });
  if (error) throw error;

  const { minimum, maximum } = getEmailDelayBounds();
  let cursor = attemptedAt.getTime();

  for (const row of data ?? []) {
    const minimumNext = getNextScheduledAt({
      currentTimestamp: cursor,
      minimumDelaySeconds: minimum,
      maximumDelaySeconds: maximum,
      randomDelay: (min, max) => randomInt(min, max + 1),
    });
    const existing = Date.parse(
      row.next_attempt_at ?? row.scheduled_at ?? row.created_at,
    );
    const next = Math.max(
      Number.isFinite(existing) ? existing : 0,
      minimumNext,
    );
    if (next !== existing) {
      const timestamp = new Date(next).toISOString();
      const update = await supabase
        .from("leadgen_outreach_queue")
        .update({
          scheduled_at: timestamp,
          next_attempt_at: timestamp,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .eq("status", "queued");
      if (update.error) throw update.error;
    }
    cursor = next;
  }
}

export async function markPersistentOutreachEntry(
  id: string,
  status: "sent" | "failed" | "approved",
  patch: {
    provider?: string | null;
    smtp_message_id?: string | null;
    subject?: string;
    last_error?: string | null;
    metadata?: Record<string, unknown>;
  } = {},
) {
  const supabase = createSupabaseServerClient();
  const now = new Date().toISOString();
  const current = patch.metadata
    ? await supabase
        .from("leadgen_outreach_queue")
        .select("metadata")
        .eq("id", id)
        .single<{ metadata: Record<string, unknown> }>()
    : null;
  if (current?.error) throw current.error;
  const { data, error } = await supabase
    .from("leadgen_outreach_queue")
    .update({
      status,
      provider: patch.provider,
      smtp_message_id: patch.smtp_message_id,
      ...(patch.subject ? { subject: patch.subject } : {}),
      last_error: patch.last_error,
      ...(patch.metadata
        ? { metadata: { ...(current?.data.metadata ?? {}), ...patch.metadata } }
        : {}),
      sent_at: status === "sent" ? now : null,
      failed_at: status === "failed" ? now : null,
      updated_at: now,
    })
    .eq("id", id)
    .select(QUEUE_FIELDS)
    .single<QueueRow>();
  if (error) throw error;
  return rowToEntry(data);
}

export async function buildOutreachReadiness(health: {
  smtpConnected: boolean;
  imapConfigured: boolean;
  imapConnected: boolean;
  imapMessage: string;
  consistencyIssueCount: number;
}): Promise<OutreachReadiness> {
  const [entries, daily, paused] = await Promise.all([
    getOutreachQueue(),
    getDailySendStats(),
    getQueuePaused(),
  ]);
  const approved = entries.filter((item) => item.status === "approved").length;
  const queued = entries.filter((item) => item.status === "queued").length;
  const sending = entries.filter((item) => item.status === "sending").length;
  const blockers = [
    ...(!health.smtpConnected ? ["SMTP не подключён"] : []),
    ...(approved === 0 ? ["Нет одобренных писем"] : []),
    ...(daily.availableToQueue === 0 ? ["Дневной лимит или доступный batch исчерпан"] : []),
    ...(paused ? ["Очередь на паузе"] : []),
    ...(sending > 0 ? ["Очередь уже выполняется"] : []),
    ...(health.consistencyIssueCount > 0
      ? [`Обнаружены неконсистентные записи: ${health.consistencyIssueCount}`]
      : []),
  ];
  const { minimum, maximum } = getEmailDelayBounds();
  const testMode = process.env.EMAIL_TEST_MODE?.toLowerCase() !== "false";
  return {
    smtp_connected: health.smtpConnected,
    email_test_mode: testMode,
    mode_label: testMode ? "Тестовая отправка" : "Реальная отправка",
    queue_paused: paused,
    approved,
    queued,
    sending,
    sent_today: daily.sentToday,
    daily_limit: daily.dailyLimit,
    daily_remaining: daily.availableToQueue,
    queued_for_today: daily.queuedForToday,
    batch_limit: leadgenProductionConfig.emailBatchSendLimit,
    min_delay_seconds: minimum,
    max_delay_seconds: maximum,
    can_launch: blockers.length === 0,
    blockers,
    imap_configured: health.imapConfigured,
    imap_connected: health.imapConnected,
    imap_message: health.imapMessage,
    followup_send_blocked: !health.imapConnected,
    consistency_issue_count: health.consistencyIssueCount,
    consistency_healthy: health.consistencyIssueCount === 0,
  };
}

export async function getOutreachOperationalState(
  entries?: OutreachQueueEntry[],
): Promise<OutreachOperationalState> {
  const [queue, paused] = await Promise.all([
    entries ? Promise.resolve(entries) : getOutreachQueue(),
    getQueuePaused(),
  ]);
  const now = Date.now();
  const overdueThreshold = now - 2 * 60 * 1000;
  const queued = queue.filter((item) => item.status === "queued");
  const sending = queue.filter((item) => item.status === "sending");
  const staleSending = sending.filter((item) =>
    !item.sending_started_at || Date.parse(item.sending_started_at) <= now - 30 * 60 * 1000,
  );
  const approved = queue.filter((item) => item.status === "approved");
  const scheduled = queued
    .map((item) => item.next_attempt_at ?? item.scheduled_at)
    .filter((value): value is string =>
      typeof value === "string" && Number.isFinite(Date.parse(value)),
    )
    .sort((left, right) => Date.parse(left) - Date.parse(right));
  const due = scheduled.filter((value) => Date.parse(value) <= now);
  const overdue = scheduled.filter(
    (value) => Date.parse(value) <= overdueThreshold,
  );

  let state: OutreachOperationalState["state"] = "empty";
  if (paused && (queued.length > 0 || sending.length > 0)) state = "paused";
  else if (staleSending.length > 0) state = "stalled";
  else if (sending.length > 0) state = "sending";
  else if (overdue.length > 0) state = "stalled";
  else if (queued.length > 0) state = "waiting";
  else if (approved.length > 0) state = "ready";

  return {
    state,
    due_count: due.length,
    overdue_count: overdue.length + staleSending.length,
    next_scheduled_at: scheduled[0] ?? null,
    oldest_overdue_at: overdue[0] ?? null,
    checked_at: new Date(now).toISOString(),
  };
}
