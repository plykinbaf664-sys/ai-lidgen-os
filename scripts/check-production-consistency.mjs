import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { formatUnknownError } from "../lib/leadgen/error-format.ts";
import { classifyConsistencyRows } from "../lib/leadgen/production-consistency-rules.ts";
import { normalizeLeadgenStrings } from "../lib/leadgen/text-normalization.ts";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const [storage, consistency, history, readiness, imap, auditRoute, migration] = await Promise.all([
  read("lib/leadgen/storage.ts"),
  read("lib/leadgen/production-consistency.ts"),
  read("components/leadgen/campaign-history.tsx"),
  read("app/api/leadgen/outreach/readiness/route.ts"),
  read("lib/leadgen/imap-reply-detector.ts"),
  read("app/api/leadgen/system-audit/route.ts"),
  read("supabase/production_consistency_v1.sql"),
]);
const dashboard = await read("components/leadgen/leadgen-dashboard.tsx");

assert.equal(formatUnknownError({ message: "Database failed", code: "PGRST100" }), "Database failed · PGRST100");
assert.notEqual(formatUnknownError({ reason: { message: "Nested failure" } }), "[object Object]");
assert.doesNotMatch(formatUnknownError({ message: "password=super-secret" }), /super-secret/);
const technicalId = "campaign-РўРµСЃС‚-%D0%A2";
assert.equal(normalizeLeadgenStrings({ id: technicalId, campaign_id: technicalId }).id, technicalId);
assert.equal(normalizeLeadgenStrings({ id: technicalId, campaign_id: technicalId }).campaign_id, technicalId);

const base = {
  message_kind: "initial", parent_outreach_id: null, smtp_message_id: null,
  reply_check_status: "pending", reply_detected_at: null, scheduled_at: null,
  next_attempt_at: null, sending_started_at: null, sent_at: null, last_error: null,
};
const now = Date.parse("2026-07-22T12:00:00Z");
const issues = classifyConsistencyRows([
  { ...base, id: "stale", status: "sending", sending_started_at: "2026-07-22T11:00:00Z" },
  { ...base, id: "unscheduled", status: "queued" },
  { ...base, id: "bad-error", status: "failed", scheduled_at: "2026-07-22T13:00:00Z", last_error: "[object Object]" },
  { ...base, id: "sent-bad", status: "sent" },
  { ...base, id: "parent", status: "sent", smtp_message_id: "<parent@test>", sent_at: "2026-07-21T12:00:00Z", reply_check_status: "unavailable" },
  { ...base, id: "follow", status: "queued", message_kind: "follow_up", parent_outreach_id: "parent", scheduled_at: "2026-07-22T13:00:00Z" },
], now);
assert.equal(issues.stale_sending, 1);
assert.equal(issues.queued_without_schedule, 1);
assert.equal(issues.failed_with_schedule, 1);
assert.equal(issues.sent_missing_timestamp, 1);
assert.equal(issues.sent_missing_message_id, 1);
assert.equal(issues.followup_reply_unsafe, 1);
assert.equal(issues.stored_object_object, 1);

assert.match(storage, /deriveCampaignOperationalStatus/);
assert.match(storage, /message_kind/);
assert.match(history, /campaign\.operational_status/);
assert.doesNotMatch(history, /outreach-status-sent">Завершена/);
assert.match(dashboard, /campaigns\/details\?pipelineRunId=\$\{encodeURIComponent\(summary\.pipeline_run_id\)\}/);
assert.match(readiness, /verifyImapReplyConnection/);
assert.match(readiness, /auditProductionConsistency/);
assert.match(imap, /getImapReplyConfig\(\);\s*return true/);
assert.match(imap, /CONNECTION_TIMEOUT_MS = 30_000/);
assert.match(imap, /"dns_error"/);
assert.match(imap, /"auth_error"/);
assert.match(imap, /"mailbox_error"/);
assert.match(imap, /SELECT \"INBOX\"/);
assert.match(consistency, /stale_sending/);
assert.match(consistency, /queued_without_schedule/);
assert.match(consistency, /followup_reply_unsafe/);
assert.match(consistency, /stored_object_object/);
assert.doesNotMatch(consistency, /sendSmtpEmail|processNextOutreachItem/);
assert.match(auditRoute, /OUTREACH_PROCESSOR_SECRET/);
assert.match(migration, /recover_leadgen_outreach_consistency/);

console.log("PRODUCTION_CONSISTENCY_CHECK_OK");
console.log("No SMTP send or queue processor was called.");
