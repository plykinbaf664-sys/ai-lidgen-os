const baseUrl = process.argv[2] ?? "http://localhost:3000";

const campaignsResponse = await fetch(`${baseUrl}/api/leadgen/campaigns`);
const campaignsPayload = await campaignsResponse.json();
if (!campaignsResponse.ok || !campaignsPayload.success) {
  throw new Error("Campaign list is unavailable");
}

const latestCampaign = [...campaignsPayload.campaigns].sort(
  (left, right) => Date.parse(right.created_at) - Date.parse(left.created_at),
)[0];
if (!latestCampaign) throw new Error("No campaigns found");

const queueResponse = await fetch(
  `${baseUrl}/api/leadgen/outreach?campaignId=${encodeURIComponent(latestCampaign.id)}`,
);
const queuePayload = await queueResponse.json();
if (!queueResponse.ok || !queuePayload.success) {
  throw new Error("Outreach working set is unavailable");
}

const bulkResponse = await fetch(`${baseUrl}/api/leadgen/outreach/bulk-approve`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ campaignId: latestCampaign.id, execute: false }),
});
const bulkPayload = await bulkResponse.json();
if (!bulkResponse.ok || !bulkPayload.success) {
  throw new Error("Bulk approval preview is unavailable");
}

const skipReasons = {};
for (const company of queuePayload.working_set.skipped_companies) {
  skipReasons[company.reason] = (skipReasons[company.reason] ?? 0) + 1;
}

console.log(JSON.stringify({
  latest_campaign: {
    id: latestCampaign.id,
    name: latestCampaign.name,
    status: latestCampaign.status,
    created_at: latestCampaign.created_at,
  },
  working_set: {
    entries: queuePayload.entries.length,
    skipped: queuePayload.working_set.skipped_companies.length,
    skip_reasons: skipReasons,
    counters: queuePayload.working_set.counters,
    eligible_for_bulk_approval:
      queuePayload.working_set.eligible_for_bulk_approval_count,
  },
  bulk_preview: {
    checked: bulkPayload.checked,
    eligible: bulkPayload.eligible_count,
    skipped: bulkPayload.skipped_count,
    reasons: bulkPayload.skipped,
  },
}, null, 2));
