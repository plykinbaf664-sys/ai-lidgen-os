import assert from "node:assert/strict";

const baseUrl = process.env.LEADGEN_SMOKE_BASE_URL ?? "http://localhost:3000";
const campaignsResponse = await fetch(`${baseUrl}/api/leadgen/campaigns`);
assert.equal(campaignsResponse.ok, true);
const campaigns = await campaignsResponse.json();
const latest = campaigns.campaigns[0];
assert.ok(latest);

async function getSummary(path) {
  const response = await fetch(`${baseUrl}${path}`);
  assert.equal(response.ok, true);
  return (await response.json()).summary;
}

const globalSummary = await getSummary("/api/leadgen/followups");
const uiSummary = await getSummary(`/api/leadgen/followups?campaignId=${encodeURIComponent(latest.id)}`);
assert.equal(uiSummary.eligible, globalSummary.eligible, "UI summary must use global follow-up eligibility");

const compact = (summary, campaignId = null) => {
  const diagnostics = campaignId
    ? summary.eligibility_diagnostics.filter((item) => item.campaign_id === campaignId)
    : summary.eligibility_diagnostics;
  const reasons = Object.fromEntries(Object.keys(summary.eligibility_reasons).map((reason) => [
    reason, diagnostics.filter((item) => item.reason === reason).length,
  ]));
  return ({
  min_interval_hours: summary.min_interval_hours,
  eligible: diagnostics.filter((item) => item.eligible).length,
  reply_found: diagnostics.filter((item) => item.reason === "reply_detected").length,
  pending_reply_check: diagnostics.filter((item) => item.reason === "reply_check_unavailable").length,
  next_eligible_at: diagnostics.filter((item) => item.reason === "interval_not_reached")
    .map((item) => item.eligible_at).filter(Boolean).sort()[0] ?? null,
  reasons,
  leads: diagnostics.map((item) => ({
    company: item.company_name,
    reason: item.reason,
    sent_at: item.sent_at,
    smtp_message_id_present: item.smtp_message_id_present,
    reply_check_status: item.reply_check_status,
    eligible_at: item.eligible_at,
  })),
  });
};

console.log(JSON.stringify({
  mode: "read_only_no_send",
  ui_button_enabled: uiSummary.eligible > 0,
  global: compact(globalSummary),
  latest_campaign: compact(globalSummary, latest.id),
}, null, 2));
