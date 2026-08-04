#!/usr/bin/env node

/**
 * Read-only Supabase contract audit.
 * It deliberately uses PostgREST selects only: no writes, no migrations, no mail.
 */
import fs from "node:fs";

function loadEnv() {
  const result = {};
  for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) result[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return result;
}

const env = loadEnv();
const baseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const apiKey = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!baseUrl || !apiKey) {
  console.error("SUPABASE_CONFIG_MISSING");
  process.exit(1);
}

const headers = { apikey: apiKey, Authorization: `Bearer ${apiKey}` };
const contracts = {
  leadgen_campaigns: ["id", "pipeline_run_id", "status", "production_discovery_stats"],
  leadgen_companies: ["id", "campaign_id", "pipeline_run_id", "company_name", "metadata"],
  leadgen_leads: ["id", "campaign_id", "company_id", "pipeline_run_id", "status"],
  leadgen_contacts: ["id", "campaign_id", "company_id", "lead_id", "email"],
  leadgen_outreach_queue: [
    "id", "campaign_id", "lead_id", "contact_id", "company_id", "message_kind",
    "status", "recipient_email", "normalized_recipient_email", "subject", "body",
    "sent_at", "smtp_message_id", "idempotency_key", "parent_outreach_id",
    "followup_number", "parent_smtp_message_id", "reply_check_status",
  ],
  leadgen_outreach_settings: ["id", "is_paused", "followup_paused"],
  leadgen_discovered_companies: ["id", "identity_key", "normalized_domain", "times_seen"],
  leadgen_email_stop_list: ["normalized_email", "is_active"],
  leadgen_followup_scan_lock: ["id", "locked_until", "locked_by"],
};

async function select(table, columns, pageSize = 1000) {
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const query = new URLSearchParams({
      select: columns.join(","),
      limit: String(pageSize),
      offset: String(offset),
    });
    const response = await fetch(`${baseUrl}/rest/v1/${table}?${query}`, { headers });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = null; }
    if (!response.ok || !Array.isArray(data)) {
      throw new Error(`${table}: HTTP ${response.status} ${data?.message ?? text.slice(0, 180)}`);
    }
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
}

const failures = [];
const rows = {};
for (const [table, columns] of Object.entries(contracts)) {
  try {
    rows[table] = await select(table, columns);
    const returned = new Set(Object.keys(rows[table][0] ?? {}));
    const missing = columns.filter((column) => rows[table].length > 0 && !returned.has(column));
    if (missing.length) failures.push(`${table}: missing columns ${missing.join(",")}`);
    console.log(`OK ${table} rows=${rows[table].length}`);
  } catch (error) {
    failures.push(error.message);
    console.log(`FAIL ${error.message}`);
  }
}

const allowedKinds = new Set(["initial", "follow_up"]);
const allowedStatuses = new Set([
  "draft", "needs_review", "approved", "queued", "sending", "sent", "failed",
  "paused", "rejected", "replied", "follow_up_due", "completed", "eligible",
  "generating", "skipped", "cancelled",
]);
for (const row of rows.leadgen_outreach_queue ?? []) {
  if (!allowedKinds.has(row.message_kind)) failures.push(`outreach ${row.id}: invalid message_kind`);
  if (!allowedStatuses.has(row.status)) failures.push(`outreach ${row.id}: invalid status ${row.status}`);
  if (row.message_kind === "follow_up" && (!row.parent_outreach_id || !row.followup_number)) {
    failures.push(`outreach ${row.id}: follow-up parent/number missing`);
  }
  if (row.status === "sent" && (!row.sent_at || !row.smtp_message_id)) {
    failures.push(`outreach ${row.id}: sent row missing sent_at or smtp_message_id`);
  }
}

function checkRefs(table, column, parentTable) {
  const parents = new Set((rows[parentTable] ?? []).map((row) => row.id));
  for (const row of rows[table] ?? []) {
    if (row[column] != null && !parents.has(row[column])) {
      failures.push(`${table} ${row.id}: ${column} references missing ${parentTable} ${row[column]}`);
    }
  }
}
checkRefs("leadgen_companies", "campaign_id", "leadgen_campaigns");
checkRefs("leadgen_leads", "campaign_id", "leadgen_campaigns");
checkRefs("leadgen_leads", "company_id", "leadgen_companies");
checkRefs("leadgen_contacts", "campaign_id", "leadgen_campaigns");
checkRefs("leadgen_contacts", "company_id", "leadgen_companies");
checkRefs("leadgen_contacts", "lead_id", "leadgen_leads");
checkRefs("leadgen_outreach_queue", "campaign_id", "leadgen_campaigns");
checkRefs("leadgen_outreach_queue", "company_id", "leadgen_companies");
checkRefs("leadgen_outreach_queue", "lead_id", "leadgen_leads");
checkRefs("leadgen_outreach_queue", "contact_id", "leadgen_contacts");

if (failures.length) {
  console.error(`SCHEMA_AUDIT_FAILED ${failures.length}`);
  for (const failure of failures.slice(0, 30)) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("SCHEMA_AUDIT_OK");
