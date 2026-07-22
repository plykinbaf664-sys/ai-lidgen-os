import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/client";
import { classifyConsistencyRows, type ConsistencyRow } from "@/lib/leadgen/production-consistency-rules";

export type ProductionConsistencyAudit = {
  checked_at: string;
  total_records: number;
  issue_count: number;
  healthy: boolean;
  issues: {
    stale_sending: number;
    queued_without_schedule: number;
    queued_invalid_schedule: number;
    failed_with_schedule: number;
    approved_with_schedule: number;
    sent_missing_timestamp: number;
    sent_missing_message_id: number;
    followup_missing_parent: number;
    followup_reply_unsafe: number;
    stored_object_object: number;
  };
};

export async function auditProductionConsistency(): Promise<ProductionConsistencyAudit> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("leadgen_outreach_queue")
    .select("id,status,message_kind,parent_outreach_id,smtp_message_id,reply_check_status,reply_detected_at,scheduled_at,next_attempt_at,sending_started_at,sent_at,last_error")
    .order("created_at", { ascending: false }).limit(2_000);
  if (error) throw error;
  const rows = (data ?? []) as ConsistencyRow[];
  const issues = classifyConsistencyRows(rows);
  const issueCount = Object.values(issues).reduce((sum, count) => sum + count, 0);
  return {
    checked_at: new Date().toISOString(),
    total_records: rows.length,
    issue_count: issueCount,
    healthy: issueCount === 0,
    issues,
  };
}

async function directSafeRepair() {
  const supabase = createSupabaseServerClient();
  const now = new Date().toISOString();
  const staleBefore = new Date(Date.now() - 30 * 60_000).toISOString();
  const results = await Promise.all([
    supabase.from("leadgen_outreach_queue").update({
      status: "failed", failed_at: now, scheduled_at: null, next_attempt_at: null,
      last_error: "Recovery: отправка зависла более чем на 30 минут; требуется ручная проверка перед retry.", updated_at: now,
    }).eq("status", "sending").or(`sending_started_at.is.null,sending_started_at.lt.${staleBefore}`),
    supabase.from("leadgen_outreach_queue").update({
      status: "approved", queued_at: null, scheduled_at: null, next_attempt_at: null,
      last_error: "Recovery: запись очереди не имела корректного расписания и возвращена в одобренные.", updated_at: now,
    }).eq("status", "queued").is("scheduled_at", null).is("next_attempt_at", null),
    supabase.from("leadgen_outreach_queue").update({ scheduled_at: null, next_attempt_at: null, updated_at: now })
      .eq("status", "failed").or("scheduled_at.not.is.null,next_attempt_at.not.is.null"),
    supabase.from("leadgen_outreach_queue").update({ scheduled_at: null, next_attempt_at: null, queued_at: null, updated_at: now })
      .eq("status", "approved").or("scheduled_at.not.is.null,next_attempt_at.not.is.null"),
    supabase.from("leadgen_outreach_queue").update({
      last_error: "Неизвестная структурированная ошибка. Повторите операцию для получения актуальной диагностики.", updated_at: now,
    }).like("last_error", "%[object Object]%"),
  ]);
  const failure = results.find((result) => result.error)?.error;
  if (failure) throw failure;

  const followups = await supabase.from("leadgen_outreach_queue")
    .select("id,status,parent_outreach_id").eq("message_kind", "follow_up").in("status", ["queued", "sending"]);
  if (followups.error) throw followups.error;
  for (const row of followups.data ?? []) {
    const parent = row.parent_outreach_id
      ? await supabase.from("leadgen_outreach_queue").select("id,status,reply_check_status,reply_detected_at,smtp_message_id")
        .eq("id", row.parent_outreach_id).maybeSingle()
      : { data: null, error: null };
    if (parent.error) throw parent.error;
    if (!parent.data || parent.data.status !== "sent" || !parent.data.smtp_message_id) {
      const result = await supabase.from("leadgen_outreach_queue").update({
        status: "failed", failed_at: now, scheduled_at: null, next_attempt_at: null,
        last_error: "Recovery: исходное письмо follow-up отсутствует или неконсистентно.", updated_at: now,
      }).eq("id", row.id).in("status", ["queued", "sending"]);
      if (result.error) throw result.error;
    } else if (parent.data.reply_detected_at) {
      const result = await supabase.from("leadgen_outreach_queue").update({
        status: "skipped", skip_reason: "reply_detected", scheduled_at: null, next_attempt_at: null, updated_at: now,
      }).eq("id", row.id).in("status", ["queued", "sending"]);
      if (result.error) throw result.error;
    } else if (parent.data.reply_check_status !== "verified") {
      const result = await supabase.from("leadgen_outreach_queue").update({
        status: "approved", queued_at: null, scheduled_at: null, next_attempt_at: null,
        last_error: "Recovery: IMAP-проверка ответа недействительна; повторная отправка заблокирована.", updated_at: now,
      }).eq("id", row.id).in("status", ["queued", "sending"]);
      if (result.error) throw result.error;
    }
  }
}

export async function repairProductionConsistency() {
  const before = await auditProductionConsistency();
  await directSafeRepair();
  const after = await auditProductionConsistency();
  return { before, after, repaired: Math.max(0, before.issue_count - after.issue_count) };
}
