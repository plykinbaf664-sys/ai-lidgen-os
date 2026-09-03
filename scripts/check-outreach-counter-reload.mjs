import assert from "node:assert/strict";

const baseUrl = process.env.LEADGEN_SMOKE_BASE_URL ?? "http://localhost:3000";
const campaignsResponse = await fetch(`${baseUrl}/api/leadgen/campaigns`, {
  cache: "no-store",
});
assert.equal(campaignsResponse.ok, true);
const campaigns = await campaignsResponse.json();
const campaignId = campaigns.campaigns?.[0]?.id;
assert.ok(campaignId);

const snapshots = [];
for (let pass = 0; pass < 3; pass += 1) {
  const response = await fetch(
    `${baseUrl}/api/leadgen/outreach?campaignId=${encodeURIComponent(campaignId)}`,
    { cache: "no-store" },
  );
  assert.equal(response.ok, true);
  const payload = await response.json();
  assert.equal(payload.success, true);
  const counters = payload.summary?.initial;
  assert.ok(counters);
  const accounted =
    counters.draft +
    counters.needsReview +
    counters.approved +
    counters.queued +
    counters.sending +
    counters.sent +
    counters.failed +
    counters.rejected;
  assert.equal(accounted, counters.generated);
  snapshots.push({
    generated: counters.generated,
    needsReview: counters.needsReview,
    approved: counters.approved,
    queued: counters.queued,
    sending: counters.sending,
    sent: counters.sent,
    failed: counters.failed,
    rejected: counters.rejected,
    eligible: counters.eligibleForBulkApproval,
  });
}

assert.deepEqual(snapshots[1], snapshots[0]);
assert.deepEqual(snapshots[2], snapshots[0]);
console.log(
  JSON.stringify({
    status: "OUTREACH_COUNTER_RELOAD_OK",
    campaign_id: campaignId,
    counters: snapshots[0],
  }),
);
