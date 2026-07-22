export type ConsistencyRow = {
  id: string;
  status: string;
  message_kind?: "initial" | "follow_up";
  parent_outreach_id?: string | null;
  smtp_message_id: string | null;
  reply_check_status?: "pending" | "verified" | "unavailable";
  reply_detected_at?: string | null;
  scheduled_at: string | null;
  next_attempt_at: string | null;
  sending_started_at: string | null;
  sent_at: string | null;
  last_error: string | null;
};

function invalidDate(value: string | null) {
  return Boolean(value && !Number.isFinite(Date.parse(value)));
}

export function classifyConsistencyRows(rows: ConsistencyRow[], now = Date.now()) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const staleBefore = now - 30 * 60_000;
  return {
    stale_sending: rows.filter((row) => row.status === "sending" &&
      (!row.sending_started_at || Date.parse(row.sending_started_at) < staleBefore)).length,
    queued_without_schedule: rows.filter((row) => row.status === "queued" &&
      !row.next_attempt_at && !row.scheduled_at).length,
    queued_invalid_schedule: rows.filter((row) => row.status === "queued" &&
      (invalidDate(row.next_attempt_at) || invalidDate(row.scheduled_at))).length,
    failed_with_schedule: rows.filter((row) => row.status === "failed" &&
      Boolean(row.next_attempt_at || row.scheduled_at)).length,
    approved_with_schedule: rows.filter((row) => row.status === "approved" &&
      Boolean(row.next_attempt_at || row.scheduled_at)).length,
    sent_missing_timestamp: rows.filter((row) => row.status === "sent" && !row.sent_at).length,
    sent_missing_message_id: rows.filter((row) => row.status === "sent" && !row.smtp_message_id).length,
    followup_missing_parent: rows.filter((row) => row.message_kind === "follow_up" &&
      (!row.parent_outreach_id || !byId.has(row.parent_outreach_id))).length,
    followup_reply_unsafe: rows.filter((row) => {
      if (row.message_kind !== "follow_up" || !["queued", "sending"].includes(row.status)) return false;
      const parent = row.parent_outreach_id ? byId.get(row.parent_outreach_id) : null;
      return !parent || parent.reply_check_status !== "verified" || Boolean(parent.reply_detected_at);
    }).length,
    stored_object_object: rows.filter((row) => row.last_error?.includes("[object Object]")).length,
  };
}
