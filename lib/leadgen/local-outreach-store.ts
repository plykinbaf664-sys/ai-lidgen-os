import { randomInt } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizeRecipientEmail } from "@/lib/leadgen/company-identity";
import { getBusinessDayRange } from "@/lib/leadgen/business-day";
import { calculateBatchCapacity, getNextScheduledAt } from "@/lib/leadgen/outreach-policy";
import { getEmailDelayBounds, leadgenProductionConfig } from "@/lib/leadgen/production-config";
import type { OutreachQueueEntry } from "@/lib/leadgen/types";
import { mutateLocalTable, readLocalTable } from "@/lib/leadgen/local-database";
import { rowToEntry, type QueueRow } from "@/lib/leadgen/outreach-storage";

type LocalOutreachState = {
  version: 1;
  queue_paused: boolean;
  sent_baseline_by_day: Record<
    string,
    { remote_sent: number; local_sent_at_capture: number }
  >;
};

const DEFAULT_STATE: LocalOutreachState = {
  version: 1,
  queue_paused: false,
  sent_baseline_by_day: {},
};

let writeChain = Promise.resolve();

function dataRoot() {
  const configured = process.env.LEADGEN_LOCAL_DATA_DIR?.trim();
  return configured ? path.resolve(configured) : path.join(process.cwd(), ".leadgen-data");
}

function entriesRoot() {
  return path.join(dataRoot(), "outreach");
}

function statePath() {
  return path.join(dataRoot(), "outreach-state.json");
}

async function ensureStorage() {
  await mkdir(entriesRoot(), { recursive: true });
}

async function atomicWrite(target: string, value: unknown) {
  await ensureStorage();
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, JSON.stringify(value), "utf8");
  await rm(target, { force: true });
  await rename(temporary, target);
}

function withWriteLock<T>(operation: () => Promise<T>): Promise<T> {
  const result = writeChain.then(operation, operation);
  writeChain = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function readState(): Promise<LocalOutreachState> {
  try {
    const parsed = JSON.parse(await readFile(statePath(), "utf8")) as Partial<LocalOutreachState>;
    return {
      version: 1,
      queue_paused: parsed.queue_paused === true,
      sent_baseline_by_day: Object.fromEntries(
        Object.entries(parsed.sent_baseline_by_day ?? {}).map(([key, value]) => [
          key,
          typeof value === "number"
            ? { remote_sent: value, local_sent_at_capture: 0 }
            : value,
        ]),
      ),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        ...DEFAULT_STATE,
        sent_baseline_by_day: {},
      };
    }
    throw error;
  }
}

async function writeState(state: LocalOutreachState) {
  await atomicWrite(statePath(), state);
}

function compactEntry(entry: OutreachQueueEntry): OutreachQueueEntry {
  return {
    ...entry,
    email: entry.email.trim(),
    normalized_recipient_email: normalizeRecipientEmail(entry.email),
    subject: entry.subject.trim(),
    body: entry.body.trim(),
    history: (entry.history ?? []).slice(-8),
    copy_quality: null,
    smtp_response: null,
    signal: {
      type: entry.signal?.type ?? null,
      title: entry.signal?.title ?? null,
      detail: entry.signal?.detail ?? null,
      source_url: entry.signal?.source_url ?? null,
      confidence_score: entry.signal?.confidence_score ?? null,
    },
  };
}

function isQueueRow(row: Record<string, unknown>): row is QueueRow & Record<string, unknown> {
  return typeof row.recipient_email === "string";
}

function entryToQueueRow(entry: OutreachQueueEntry): QueueRow {
  const value = compactEntry(entry);
  return {
    id: value.id,
    contact_id: value.contact_id,
    lead_id: value.lead_id,
    campaign_id: value.campaign_id,
    company_id: value.company_id,
    company_name: value.company_name,
    recipient_email: value.email,
    normalized_recipient_email: value.normalized_recipient_email ?? normalizeRecipientEmail(value.email),
    recipient_name: value.recipient_name,
    recipient_role: value.recipient_role,
    subject: value.subject,
    body: value.body,
    message_mode: value.message_mode,
    message_version: value.message_version ?? 1,
    status: value.status,
    approved_at: value.approved_at,
    queued_at: value.queued_at,
    scheduled_at: value.scheduled_at ?? null,
    next_attempt_at: value.next_attempt_at ?? null,
    sending_started_at: value.sending_started_at ?? null,
    sent_at: value.sent_at,
    failed_at: value.failed_at ?? null,
    attempt_count: value.send_attempts,
    last_error: value.last_error,
    smtp_message_id: value.provider_message_id,
    provider: value.provider,
    idempotency_key: value.idempotency_key,
    approval_invalidated_reason: value.approval_invalidated_reason ?? null,
    metadata: {
      company_website: value.company_website,
      email_type: value.email_type,
      email_source_url: value.email_source_url,
      email_source_label: value.email_source_label,
      readiness: value.readiness,
      signal: value.signal,
      copy_quality: value.copy_quality,
      quality_gate_passed: value.quality_gate_passed,
      copy_review_status: value.copy_review_status,
      generation_attempts: value.generation_attempts,
      micro_value: value.micro_value,
      sent_copy_saved_at: value.sent_copy_saved_at,
      sent_copy_error: value.sent_copy_error,
      reply_intent: value.reply_intent,
      reply_contact: value.reply_contact,
    },
    created_at: value.created_at,
    updated_at: value.updated_at ?? value.created_at,
    message_kind: value.message_kind ?? "initial",
    parent_outreach_id: value.parent_outreach_id,
    followup_number: value.followup_number,
    parent_smtp_message_id: value.parent_smtp_message_id,
    reply_check_status: value.reply_check_status,
    reply_checked_at: value.reply_checked_at,
    reply_detected_at: value.reply_detected_at,
    reply_message_id: value.reply_message_id,
    reply_from: value.reply_from,
    reply_subject: value.reply_subject,
    reply_detection_method: value.reply_detection_method,
    generation_reason: value.generation_reason,
    skip_reason: value.skip_reason,
    copy_review_status: value.copy_review_status,
  };
}

function storedRowToEntry(row: Record<string, unknown>): OutreachQueueEntry {
  return isQueueRow(row)
    ? rowToEntry(row)
    : compactEntry(row as unknown as OutreachQueueEntry);
}

async function migrateLegacyEntries() {
  const existing = await readLocalTable("leadgen_outreach_queue");
  if (existing.length > 0) {
    if (existing.some((row) => !isQueueRow(row))) {
      await mutateLocalTable("leadgen_outreach_queue", (rows) => {
        rows.splice(
          0,
          rows.length,
          ...rows.map((row) => entryToQueueRow(storedRowToEntry(row)) as unknown as Record<string, unknown>),
        );
      });
    }
    return;
  }
  await ensureStorage();
  const files = (await readdir(entriesRoot())).filter((file) => file.endsWith(".json"));
  const legacy = (
    await Promise.all(
      files.map(async (file) => {
        try {
          return JSON.parse(await readFile(path.join(entriesRoot(), file), "utf8")) as OutreachQueueEntry;
        } catch {
          return null;
        }
      }),
    )
  ).filter((entry): entry is OutreachQueueEntry => Boolean(entry));
  if (legacy.length === 0) return;
  await mutateLocalTable("leadgen_outreach_queue", (rows) => {
    rows.push(...legacy.map((entry) => entryToQueueRow(entry) as unknown as Record<string, unknown>));
  });
}

async function writeEntry(entry: OutreachQueueEntry) {
  const value = entryToQueueRow(entry);
  await mutateLocalTable("leadgen_outreach_queue", (rows) => {
    const index = rows.findIndex((row) => row.id === value.id);
    if (index >= 0) rows[index] = value as unknown as Record<string, unknown>;
    else rows.push(value as unknown as Record<string, unknown>);
  });
}

export function getOutreachDeliveryStorageMode(): "local" | "supabase" {
  return "local";
}

export async function listLocalOutreachEntries(campaignId?: string | null) {
  await migrateLegacyEntries();
  const rows = await readLocalTable<Record<string, unknown>>(
    "leadgen_outreach_queue",
  );
  return rows
    .map(storedRowToEntry)
    .filter((entry) => !campaignId || entry.campaign_id === campaignId)
    .sort((left, right) => Date.parse(left.created_at) - Date.parse(right.created_at));
}

export async function getLocalOutreachOperationalState(
  campaignId?: string | null,
) {
  const entries = await listLocalOutreachEntries(campaignId);
  const now = new Date();
  const active = entries.filter((entry) =>
    ["queued", "sending"].includes(entry.status),
  );
  const queued = active.filter((entry) => entry.status === "queued");
  const due = queued.filter(
    (entry) =>
      Date.parse(entry.next_attempt_at ?? entry.scheduled_at ?? entry.created_at) <=
      now.getTime(),
  );
  const overdue = queued.filter(
    (entry) =>
      Date.parse(entry.next_attempt_at ?? entry.scheduled_at ?? entry.created_at) <=
      now.getTime() - 2 * 60_000,
  );
  const nextScheduledAt = queued
    .map((entry) => entry.next_attempt_at ?? entry.scheduled_at)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => Date.parse(left) - Date.parse(right))[0] ?? null;
  const oldestOverdueAt = overdue
    .map((entry) => entry.next_attempt_at ?? entry.scheduled_at)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => Date.parse(left) - Date.parse(right))[0] ?? null;
  const paused = await getLocalQueuePaused();
  return {
    state: paused
      ? ("paused" as const)
      : active.some((entry) => entry.status === "sending")
        ? ("sending" as const)
        : overdue.length > 0
          ? ("stalled" as const)
          : queued.length > 0
            ? ("waiting" as const)
            : entries.some((entry) => entry.status === "approved")
              ? ("ready" as const)
              : ("empty" as const),
    due_count: due.length,
    overdue_count: overdue.length,
    next_scheduled_at: nextScheduledAt,
    oldest_overdue_at: oldestOverdueAt,
    checked_at: now.toISOString(),
  };
}

function dayKey(now = new Date()) {
  return getBusinessDayRange(now).start.toISOString();
}

export async function getLocalDailySendStats(now = new Date()) {
  const entries = await listLocalOutreachEntries();
  const { start, end } = getBusinessDayRange(now);
  const state = await readState();
  const localSent = entries.filter(
    (entry) =>
      entry.message_kind !== "follow_up" &&
      entry.status === "sent" &&
      entry.sent_at &&
      Date.parse(entry.sent_at) >= start.getTime() &&
      Date.parse(entry.sent_at) < end.getTime(),
  ).length;
  const baseline = state.sent_baseline_by_day[dayKey(now)] ?? {
    remote_sent: 0,
    local_sent_at_capture: 0,
  };
  const sentToday =
    baseline.remote_sent +
    Math.max(0, localSent - baseline.local_sent_at_capture);
  const queuedForToday = entries.filter(
    (entry) =>
      entry.message_kind !== "follow_up" &&
      ["queued", "sending"].includes(entry.status) &&
      Date.parse(entry.next_attempt_at ?? entry.scheduled_at ?? entry.created_at) <
        end.getTime(),
  ).length;
  const remaining = Math.max(
    0,
    leadgenProductionConfig.emailDailySendLimit - sentToday,
  );
  return {
    sentToday,
    queuedForToday,
    dailyLimit: leadgenProductionConfig.emailDailySendLimit,
    remaining,
    availableToQueue: Math.max(0, remaining - queuedForToday),
  };
}

export async function rememberLocalSentBaseline(value: number) {
  if (!Number.isFinite(value) || value < 0) return;
  await withWriteLock(async () => {
    const state = await readState();
    const key = dayKey();
    const current = state.sent_baseline_by_day[key];
    const remoteSent = Math.floor(value);
    if (!current || remoteSent > current.remote_sent) {
      const { start, end } = getBusinessDayRange();
      const localSent = (await listLocalOutreachEntries()).filter(
        (entry) =>
          entry.message_kind !== "follow_up" &&
          entry.status === "sent" &&
          entry.sent_at &&
          Date.parse(entry.sent_at) >= start.getTime() &&
          Date.parse(entry.sent_at) < end.getTime(),
      ).length;
      state.sent_baseline_by_day[key] = {
        remote_sent: remoteSent,
        local_sent_at_capture: localSent,
      };
    }
    await writeState(state);
  });
}

export async function scheduleLocalApprovedBatch({
  entries,
  campaignId,
  requestedCount,
  messageKind = "initial",
  sentTodayBaseline = 0,
  randomDelay = (minimum: number, maximum: number) =>
    randomInt(minimum, maximum + 1),
}: {
  entries: OutreachQueueEntry[];
  campaignId?: string | null;
  requestedCount: number;
  messageKind?: "initial" | "follow_up";
  sentTodayBaseline?: number;
  randomDelay?: (minimum: number, maximum: number) => number;
}) {
  await rememberLocalSentBaseline(sentTodayBaseline);
  return withWriteLock(async () => {
    const stored = await listLocalOutreachEntries();
    const daily = await getLocalDailySendStats();
    const candidates = entries.filter(
      (entry) =>
        (entry.message_kind ?? "initial") === messageKind &&
        entry.status === "approved" &&
        (!campaignId || entry.campaign_id === campaignId),
    );
    const safeCount =
      messageKind === "follow_up"
        ? Math.max(
            0,
            Math.min(
              requestedCount,
              candidates.length,
              leadgenProductionConfig.emailBatchSendLimit,
            ),
          )
        : calculateBatchCapacity({
            requested: requestedCount,
            approved: candidates.length,
            sentToday: daily.sentToday,
            queuedForToday: daily.queuedForToday,
            dailyLimit: daily.dailyLimit,
            batchLimit: leadgenProductionConfig.emailBatchSendLimit,
          });
    const reasons: Record<string, number> = {};
    const skip = (reason: string) => {
      reasons[reason] = (reasons[reason] ?? 0) + 1;
    };
    if (safeCount < 1) {
      skip(
        candidates.length < 1
          ? "no_approved_items"
          : messageKind === "initial"
            ? "daily_limit_reached"
            : "batch_limit_reached",
      );
      return {
        queued: [] as OutreachQueueEntry[],
        queued_count: 0,
        skipped_count: 0,
        reasons,
        stats: daily,
        remaining_approved: candidates.length,
      };
    }

    const blockedEmails = new Set(
      [...entries, ...stored]
        .filter(
          (entry) =>
            (entry.message_kind ?? "initial") === "initial" &&
            ["queued", "sending", "sent"].includes(entry.status),
        )
        .map((entry) => normalizeRecipientEmail(entry.email)),
    );
    const blockedCompanies = new Set(
      [...entries, ...stored]
        .filter(
          (entry) =>
            (entry.message_kind ?? "initial") === "initial" &&
            ["queued", "sending", "sent"].includes(entry.status),
        )
        .map((entry) => entry.company_id)
        .filter((value): value is string => Boolean(value)),
    );
    const selectedEmails = new Set<string>();
    const selectedCompanies = new Set<string>();
    const blockedFollowups = new Set(
      stored
        .filter(
          (entry) =>
            entry.message_kind === "follow_up" &&
            ["queued", "sending", "sent"].includes(entry.status),
        )
        .map((entry) => entry.idempotency_key),
    );
    const selected: OutreachQueueEntry[] = [];

    for (const entry of candidates) {
      if (selected.length >= safeCount) break;
      const normalizedEmail = normalizeRecipientEmail(entry.email);
      if (!entry.email.trim()) {
        skip("missing_email");
        continue;
      }
      if (!entry.subject.trim()) {
        skip("missing_subject");
        continue;
      }
      if (!entry.body.trim()) {
        skip("missing_body");
        continue;
      }
      if (!entry.company_website) {
        skip("missing_official_site");
        continue;
      }
      if (entry.quality_gate_passed !== true) {
        skip("quality_gate_failed");
        continue;
      }
      if (messageKind === "follow_up") {
        if (!entry.parent_smtp_message_id) {
          skip("missing_parent_message_id");
          continue;
        }
        if (entry.reply_check_status !== "verified") {
          skip("reply_check_unavailable");
          continue;
        }
        if (entry.reply_detected_at) {
          skip("reply_detected");
          continue;
        }
        if (blockedFollowups.has(entry.idempotency_key)) {
          skip("queue_already_created");
          continue;
        }
        blockedFollowups.add(entry.idempotency_key);
        selected.push(entry);
        continue;
      }
      if (
        blockedEmails.has(normalizedEmail) ||
        selectedEmails.has(normalizedEmail)
      ) {
        skip("duplicate_email");
        continue;
      }
      if (
        entry.company_id &&
        (blockedCompanies.has(entry.company_id) ||
          selectedCompanies.has(entry.company_id))
      ) {
        skip("already_contacted");
        continue;
      }
      selectedEmails.add(normalizedEmail);
      if (entry.company_id) selectedCompanies.add(entry.company_id);
      selected.push(entry);
    }

    const { minimum, maximum } = getEmailDelayBounds();
    let cursor = Date.now();
    const now = new Date().toISOString();
    const queued: OutreachQueueEntry[] = [];
    for (const entry of selected) {
      const scheduledAt = new Date(cursor).toISOString();
      const queuedEntry = compactEntry({
        ...entry,
        status: "queued",
        queued_at: now,
        scheduled_at: scheduledAt,
        next_attempt_at: scheduledAt,
        updated_at: now,
        queue_position: queued.length + 1,
      });
      await writeEntry(queuedEntry);
      queued.push(queuedEntry);
      cursor = getNextScheduledAt({
        currentTimestamp: cursor,
        minimumDelaySeconds: minimum,
        maximumDelaySeconds: maximum,
        randomDelay,
      });
    }
    return {
      queued,
      queued_count: queued.length,
      skipped_count: Object.values(reasons).reduce(
        (total, count) => total + count,
        0,
      ),
      reasons,
      stats: daily,
      remaining_approved: Math.max(0, candidates.length - queued.length),
    };
  });
}

export async function getLocalQueuePaused() {
  return (await readState()).queue_paused;
}

export async function setLocalQueuePaused(value: boolean) {
  await withWriteLock(async () => {
    const state = await readState();
    state.queue_paused = value;
    await writeState(state);
  });
}

export async function cancelLocalQueued(campaignId?: string | null) {
  return withWriteLock(async () => {
    const entries = await listLocalOutreachEntries(campaignId);
    let changed = 0;
    for (const entry of entries) {
      if (entry.message_kind === "follow_up" || entry.status !== "queued") continue;
      await writeEntry({
        ...entry,
        status: "approved",
        queued_at: null,
        scheduled_at: null,
        next_attempt_at: null,
        updated_at: new Date().toISOString(),
      });
      changed += 1;
    }
    return changed;
  });
}

export async function retryLocalFailed(campaignId?: string | null) {
  return withWriteLock(async () => {
    const entries = await listLocalOutreachEntries(campaignId);
    let changed = 0;
    for (const entry of entries) {
      if (entry.message_kind === "follow_up" || entry.status !== "failed") continue;
      await writeEntry({
        ...entry,
        status: "approved",
        last_error: null,
        failed_at: null,
        provider_message_id: null,
        provider: null,
        updated_at: new Date().toISOString(),
      });
      changed += 1;
    }
    return changed;
  });
}

export async function claimDueLocalOutreachItem(
  messageKind?: "initial" | "follow_up",
) {
  return withWriteLock(async () => {
    if (await getLocalQueuePaused()) return null;
    const entries = await listLocalOutreachEntries();
    const now = new Date();
    const due = entries
      .filter(
        (entry) =>
          entry.status === "queued" &&
          (!messageKind ||
            (entry.message_kind ?? "initial") === messageKind) &&
          Date.parse(entry.next_attempt_at ?? entry.scheduled_at ?? entry.created_at) <=
            now.getTime(),
      )
      .sort(
        (left, right) =>
          Date.parse(left.next_attempt_at ?? left.created_at) -
          Date.parse(right.next_attempt_at ?? right.created_at),
      )[0];
    if (!due) return null;
    const claimed = compactEntry({
      ...due,
      status: "sending",
      sending_started_at: now.toISOString(),
      send_attempts: due.send_attempts + 1,
      last_error: null,
      updated_at: now.toISOString(),
    });
    await writeEntry(claimed);
    return claimed;
  });
}

export async function recoverStaleLocalSending() {
  return withWriteLock(async () => {
    const entries = await listLocalOutreachEntries();
    const staleBefore = Date.now() - 30 * 60_000;
    let recovered = 0;
    for (const entry of entries) {
      if (
        entry.status !== "sending" ||
        !entry.sending_started_at ||
        Date.parse(entry.sending_started_at) >= staleBefore
      ) {
        continue;
      }
      await writeEntry({
        ...entry,
        status: "failed",
        failed_at: new Date().toISOString(),
        sending_started_at: null,
        last_error:
          "Processor был прерван во время отправки; требуется ручной retry.",
        updated_at: new Date().toISOString(),
      });
      recovered += 1;
    }
    return recovered;
  });
}

export async function markLocalOutreachEntry(
  id: string,
  status: "sent" | "failed",
  patch: Partial<OutreachQueueEntry> = {},
) {
  return withWriteLock(async () => {
    const current = (await listLocalOutreachEntries()).find(
      (entry) => entry.id === id,
    );
    if (!current) throw new Error("Локальная запись очереди не найдена.");
    const now = new Date().toISOString();
    const updated = compactEntry({
      ...current,
      ...patch,
      status,
      sent_at: status === "sent" ? now : current.sent_at,
      failed_at: status === "failed" ? now : null,
      sending_started_at: null,
      updated_at: now,
    });
    await writeEntry(updated);
    return updated;
  });
}

export async function deferLocalQueuedItems(attemptedAt = new Date()) {
  return withWriteLock(async () => {
    const entries = await listLocalOutreachEntries();
    const { minimum, maximum } = getEmailDelayBounds();
    let cursor = attemptedAt.getTime();
    for (const entry of entries.filter((item) => item.status === "queued")) {
      const minimumNext = getNextScheduledAt({
        currentTimestamp: cursor,
        minimumDelaySeconds: minimum,
        maximumDelaySeconds: maximum,
        randomDelay: (min, max) => randomInt(min, max + 1),
      });
      const current = Date.parse(
        entry.next_attempt_at ?? entry.scheduled_at ?? entry.created_at,
      );
      const next = Math.max(Number.isFinite(current) ? current : 0, minimumNext);
      if (next !== current) {
        const timestamp = new Date(next).toISOString();
        await writeEntry({
          ...entry,
          scheduled_at: timestamp,
          next_attempt_at: timestamp,
          updated_at: new Date().toISOString(),
        });
      }
      cursor = next;
    }
  });
}
