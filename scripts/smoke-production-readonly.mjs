import assert from "node:assert/strict";

const baseUrl = process.env.LEADGEN_SMOKE_BASE_URL ?? "http://localhost:3000";

async function read(path, init) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const contentType = response.headers.get("content-type") ?? "";
  assert.match(contentType, /application\/json/, `${path} must return JSON`);
  const body = await response.json();
  assert.equal(response.ok, true, `${path}: ${JSON.stringify(body.error ?? body)}`);
  return body;
}

const campaigns = await read("/api/leadgen/campaigns");
const latest = campaigns.campaigns[0];
assert.ok(latest, "At least one campaign is required for the smoke test");

const [details, audit, readiness, outreach, followups, page] = await Promise.all([
  read(`/api/leadgen/campaigns/details?pipelineRunId=${encodeURIComponent(latest.pipeline_run_id)}`),
  read("/api/leadgen/system-audit"),
  read("/api/leadgen/outreach/readiness"),
  read("/api/leadgen/outreach"),
  read("/api/leadgen/followups"),
  fetch(`${baseUrl}/leadgen`),
]);
const imapCheck = await read("/api/leadgen/imap/check", { method: "POST" });

assert.equal(details.details.campaign.pipeline_run_id, latest.pipeline_run_id);
assert.equal(audit.audit.healthy, true, "Persistent state contains consistency defects");
assert.equal(imapCheck.diagnostic.status, "connected");
assert.equal(imapCheck.diagnostic.dns_resolved, true);
assert.equal(imapCheck.diagnostic.socket_connected, true);
assert.equal(imapCheck.diagnostic.tls_connected, true);
assert.equal(imapCheck.diagnostic.authenticated, true);
assert.equal(imapCheck.diagnostic.mailbox_opened, true);
assert.equal(page.ok, true, "/leadgen must render successfully");
const pageHtml = await page.text();
assert.equal(pageHtml.includes("[object Object]"), false);

console.log(JSON.stringify({
  mode: "read_only_no_send",
  page_status: page.status,
  page_has_object_object: false,
  campaigns: campaigns.campaigns.length,
  latest_operational_status: latest.operational_status,
  details_ok: details.success,
  consistency_healthy: audit.audit.healthy,
  consistency_issues: audit.audit.issue_count,
  smtp_connected: readiness.readiness.smtp_connected,
  imap_configured: readiness.readiness.imap_configured,
  imap_connected: readiness.readiness.imap_connected,
  imap_diagnostic: imapCheck.diagnostic.status,
  imap_dns_resolved: imapCheck.diagnostic.dns_resolved,
  imap_socket_connected: imapCheck.diagnostic.socket_connected,
  imap_tls_connected: imapCheck.diagnostic.tls_connected,
  imap_authenticated: imapCheck.diagnostic.authenticated,
  imap_mailbox_opened: imapCheck.diagnostic.mailbox_opened,
  followup_send_blocked: readiness.readiness.followup_send_blocked,
  sent_today: readiness.readiness.sent_today,
  queued: readiness.readiness.queued,
  sending: readiness.readiness.sending,
  available_to_queue: readiness.readiness.daily_remaining,
  outreach_items: outreach.entries.length,
  followups: followups.entries.length,
}));
