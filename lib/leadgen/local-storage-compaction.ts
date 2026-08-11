export type CompactableRow = Record<string, unknown>;

const OMIT_KEYS = new Set([
  "body_html",
  "channels_rejected",
  "contact_pages",
  "diagnostic",
  "diagnostics",
  "email_pages_audit",
  "emails_rejected",
  "full_text",
  "html",
  "page_content",
  "page_html",
  "pages",
  "provider_errors",
  "provider_payload",
  "provider_response",
  "provider_responses",
  "queries_executed",
  "ranked_email_candidates",
  "raw_html",
  "raw_provider_response",
  "raw_response",
  "raw_results",
  "raw_search_results",
  "rendered_html",
  "search_response",
  "search_results",
  "smtp_response",
  "stack",
  "stack_trace",
  "strategies_attempted",
  "telegram_payload",
  "telegram_preview",
  "text_samples",
  "urls_inspected",
  "warnings",
]);

const MAX_GENERIC_STRING = 20_000;
const MAX_ERROR_STRING = 1_000;
const MAX_TECHNICAL_ARRAY = 20;

function compactValue(value: unknown, key = "", parentKey = ""): unknown {
  const normalizedKey = key.toLowerCase();
  if (
    OMIT_KEYS.has(normalizedKey) &&
    !(parentKey === "contact_intelligence" && normalizedKey === "strategies_attempted")
  ) return undefined;
  if (typeof value === "string") {
    const maximum = normalizedKey.includes("error") ? MAX_ERROR_STRING : MAX_GENERIC_STRING;
    return value.length > maximum ? value.slice(0, maximum) : value;
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_TECHNICAL_ARRAY)
      .map((item) => compactValue(item, "", normalizedKey))
      .filter((item) => item !== undefined);
  }
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([childKey, childValue]) => [childKey, compactValue(childValue, childKey, normalizedKey)] as const)
      .filter((entry) => entry[1] !== undefined),
  );
}

function newestFirst(left: CompactableRow, right: CompactableRow) {
  const leftDate = String(left.updated_at ?? left.created_at ?? "");
  const rightDate = String(right.updated_at ?? right.created_at ?? "");
  return rightDate.localeCompare(leftDate);
}

function applyRetention(table: string, rows: CompactableRow[]) {
  if (table === "leadgen_events") return [];
  if (table === "leadgen_followup_scan_lock" || table === "leadgen_outreach_settings") {
    return [...rows].sort(newestFirst).slice(0, 1);
  }
  if (table === "leadgen_sync_state") return [...rows].sort(newestFirst).slice(0, 32);
  if (table === "leadgen_telegram_notifications") {
    const pending = rows.filter((row) => row.status !== "sent");
    const sent = rows.filter((row) => row.status === "sent").sort(newestFirst).slice(0, 50);
    return [...pending, ...sent];
  }
  return rows;
}

function applyLocalDefaults(table: string, row: CompactableRow): CompactableRow {
  if (table !== "leadgen_outreach_queue") return row;
  const followupNumber = Number(row.followup_number ?? 0);
  const normalized: CompactableRow = {
    ...row,
    recipient_email:
      typeof row.recipient_email === "string"
        ? row.recipient_email.trim()
        : typeof row.email === "string"
          ? row.email.trim()
          : "",
    normalized_recipient_email:
      typeof row.normalized_recipient_email === "string"
        ? row.normalized_recipient_email.trim().toLowerCase()
        : typeof row.email === "string"
          ? row.email.trim().toLowerCase()
          : "",
    attempt_count:
      typeof row.attempt_count === "number"
        ? row.attempt_count
        : typeof row.send_attempts === "number"
          ? row.send_attempts
          : 0,
    smtp_message_id:
      typeof row.smtp_message_id === "string" || row.smtp_message_id === null
        ? row.smtp_message_id
        : typeof row.provider_message_id === "string"
          ? row.provider_message_id
          : null,
    metadata: {
      ...(row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as CompactableRow)
        : {}),
      company_website: row.company_website ??
        ((row.metadata as CompactableRow | undefined)?.company_website ?? null),
      email_type: row.email_type ?? (row.metadata as CompactableRow | undefined)?.email_type,
      email_source_url:
        row.email_source_url ?? (row.metadata as CompactableRow | undefined)?.email_source_url ?? null,
      email_source_label:
        row.email_source_label ?? (row.metadata as CompactableRow | undefined)?.email_source_label ?? null,
      readiness: row.readiness ?? (row.metadata as CompactableRow | undefined)?.readiness,
      signal: row.signal ?? (row.metadata as CompactableRow | undefined)?.signal ?? null,
      copy_quality: row.copy_quality ?? (row.metadata as CompactableRow | undefined)?.copy_quality ?? null,
      quality_gate_passed:
        row.quality_gate_passed ?? (row.metadata as CompactableRow | undefined)?.quality_gate_passed ?? false,
      copy_review_status:
        row.copy_review_status ?? (row.metadata as CompactableRow | undefined)?.copy_review_status ?? null,
      generation_attempts:
        row.generation_attempts ?? (row.metadata as CompactableRow | undefined)?.generation_attempts ?? 0,
      micro_value: row.micro_value ?? (row.metadata as CompactableRow | undefined)?.micro_value ?? null,
      sent_copy_saved_at:
        row.sent_copy_saved_at ?? (row.metadata as CompactableRow | undefined)?.sent_copy_saved_at ?? null,
      sent_copy_error:
        row.sent_copy_error ?? (row.metadata as CompactableRow | undefined)?.sent_copy_error ?? null,
      reply_intent: row.reply_intent ?? (row.metadata as CompactableRow | undefined)?.reply_intent ?? null,
      reply_contact: row.reply_contact ?? (row.metadata as CompactableRow | undefined)?.reply_contact ?? null,
    },
    message_kind:
      row.message_kind === "follow_up" || row.message_kind === "initial"
        ? row.message_kind
        : row.parent_outreach_id || followupNumber > 0
          ? "follow_up"
          : "initial",
    message_version:
      typeof row.message_version === "number" ? row.message_version : 1,
  };

  for (const key of [
    "email",
    "company_website",
    "email_type",
    "email_source_url",
    "email_source_label",
    "readiness",
    "signal",
    "copy_quality",
    "quality_gate_passed",
    "generation_attempts",
    "micro_value",
    "send_attempts",
    "provider_message_id",
    "history",
    "queue_position",
    "follow_up_due_at",
    "follow_up_status",
    "sent_copy_saved_at",
    "sent_copy_error",
    "reply_intent",
    "reply_contact",
  ]) {
    delete normalized[key];
  }
  return normalized;
}

export function compactLocalTableRows(table: string, rows: CompactableRow[]) {
  return applyRetention(table, rows)
    .map((row) => compactValue(applyLocalDefaults(table, row)))
    .filter((row): row is CompactableRow => Boolean(row && typeof row === "object"));
}

export const LOCAL_STORAGE_OMITTED_KEYS = [...OMIT_KEYS];
