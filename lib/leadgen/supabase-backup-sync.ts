import "server-only";

import { readLocalTable, mutateLocalTable, type LocalRow } from "@/lib/leadgen/local-database";
import { createRemoteSupabaseSyncClient } from "@/lib/supabase/remote-sync-client";
import { formatUnknownError } from "@/lib/leadgen/error-format";

type SyncConfig = { table: string; conflict: string; fields: string[] };

const SYNC_CONFIG: SyncConfig[] = [
  { table: "leadgen_campaigns", conflict: "id", fields: ["id", "pipeline_run_id", "name", "status", "created_at", "vertical_id"] },
  { table: "leadgen_companies", conflict: "id", fields: ["id", "pipeline_run_id", "campaign_id", "company_name", "company_domain", "company_website", "source_url", "status", "created_at", "updated_at"] },
  { table: "leadgen_contacts", conflict: "id", fields: ["id", "pipeline_run_id", "campaign_id", "company_id", "lead_id", "full_name", "role_title", "email", "phone", "source_url", "is_primary", "created_at", "updated_at"] },
  { table: "leadgen_signals", conflict: "id", fields: ["id", "pipeline_run_id", "campaign_id", "company_id", "signal_type", "title", "detail", "source_url", "confidence_score", "created_at"] },
  { table: "leadgen_leads", conflict: "id", fields: ["id", "pipeline_run_id", "campaign_id", "company_id", "contact_id", "company_name", "contact_name", "contact_role", "contact_value", "contact_type", "status", "created_at", "updated_at"] },
  { table: "leadgen_discovered_companies", conflict: "identity_key", fields: ["id", "identity_key", "canonical_company_id", "normalized_domain", "normalized_website", "normalized_name", "legal_name", "region", "legal_id", "first_seen_at", "last_seen_at", "first_campaign_id", "last_campaign_id", "times_seen", "contact_status", "outreach_status", "created_at", "updated_at"] },
  { table: "leadgen_outreach_queue", conflict: "id", fields: ["id", "lead_id", "company_id", "campaign_id", "message_kind", "parent_outreach_id", "followup_number", "recipient_email", "normalized_recipient_email", "company_name", "company_website", "subject", "status", "message_version", "idempotency_key", "approved_at", "queued_at", "scheduled_at", "sending_started_at", "sent_at", "failed_at", "attempt_count", "smtp_message_id", "parent_smtp_message_id", "reply_check_status", "reply_checked_at", "reply_detected_at", "reply_message_id", "created_at", "updated_at"] },
  { table: "leadgen_email_stop_list", conflict: "normalized_email", fields: ["id", "normalized_email", "reason", "is_active", "created_at", "updated_at"] },
];

function compact(row: LocalRow, fields: string[]) {
  return Object.fromEntries(fields.filter((field) => row[field] !== undefined).map((field) => [field, row[field]]));
}

async function readSyncCursor() {
  const rows = await readLocalTable("leadgen_sync_state");
  return typeof rows[0]?.last_success_at === "string" ? rows[0].last_success_at : null;
}

async function saveSyncState(patch: LocalRow) {
  await mutateLocalTable("leadgen_sync_state", (rows) => {
    rows.splice(0, rows.length, { id: "supabase-backup", ...rows[0], ...patch });
  });
}

export async function runSupabaseBackupSync() {
  const startedAt = new Date().toISOString();
  const cursor = await readSyncCursor();
  const result = { started_at: startedAt, completed_at: null as string | null, cursor, tables: {} as Record<string, number>, synced: 0, success: false, error: null as string | null };
  try {
    const remote = createRemoteSupabaseSyncClient();
    for (const config of SYNC_CONFIG) {
      const rows = (await readLocalTable(config.table))
        .filter((row) => {
          if (!cursor) return true;
          const changedAt = typeof row.updated_at === "string" ? row.updated_at : row.created_at;
          return typeof changedAt === "string" && changedAt > cursor;
        })
        .map((row) => compact(row, config.fields));
      let synced = 0;
      for (let index = 0; index < rows.length; index += 100) {
        const batch = rows.slice(index, index + 100);
        const { error } = await remote.from(config.table).upsert(batch, { onConflict: config.conflict });
        if (error) throw new Error(`${config.table}: ${error.message}`);
        synced += batch.length;
      }
      result.tables[config.table] = synced;
      result.synced += synced;
    }
    result.completed_at = new Date().toISOString();
    result.success = true;
    await saveSyncState({ last_attempt_at: startedAt, last_success_at: result.completed_at, last_error: null, last_synced_rows: result.synced });
  } catch (error) {
    result.completed_at = new Date().toISOString();
    result.error = formatUnknownError(error, "Supabase backup sync failed");
    await saveSyncState({ last_attempt_at: startedAt, last_error: result.error });
  }
  return result;
}
