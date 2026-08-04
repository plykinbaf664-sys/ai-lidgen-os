import assert from "node:assert/strict";

const baseUrl = process.env.LEADGEN_SMOKE_BASE_URL ?? "http://localhost:3000";
const campaignsResponse = await fetch(`${baseUrl}/api/leadgen/campaigns`);
assert.equal(campaignsResponse.ok, true);
const campaigns = await campaignsResponse.json();
const campaign = campaigns.campaigns?.[0];
assert.ok(campaign?.id);

const campaignId = encodeURIComponent(campaign.id);
const [outreachResponse, followupResponse] = await Promise.all([
  fetch(`${baseUrl}/api/leadgen/outreach?campaignId=${campaignId}`),
  fetch(`${baseUrl}/api/leadgen/followups?campaignId=${campaignId}`),
]);
assert.equal(outreachResponse.ok, true);
assert.equal(followupResponse.ok, true);
const outreach = await outreachResponse.json();
const followups = await followupResponse.json();
assert.equal(outreach.success, true);
assert.equal(followups.success, true);

const summary = outreach.summary;
assert.equal(summary.campaignId, campaign.id);
assert.equal(summary.diagnostics.healthy, true, summary.diagnostics.issues?.join("; "));
assert.equal(summary.initial.generated, outreach.working_set.counters.total);
assert.equal(summary.initial.needsReview, outreach.working_set.counters.needs_review);
assert.equal(summary.initial.approved, outreach.working_set.counters.approved);
assert.equal(campaign.needs_review_count, summary.initial.needsReview);
assert.equal(campaign.approved_count, summary.initial.approved);
assert.equal(campaign.queued_count, summary.initial.queued);
assert.equal(campaign.sending_count, summary.initial.sending);
assert.equal(campaign.initial_sent_count, summary.initial.sent);
const rejectedFollowupStatuses = new Set([
  "skipped",
  "cancelled",
  "paused",
  "replied",
  "completed",
  "follow_up_due",
]);
assert.equal(
  summary.followUps.generated,
  followups.entries.filter(
    (entry) => !rejectedFollowupStatuses.has(entry.status),
  ).length,
);
assert.equal(summary.followUps.needsReview, followups.summary.needs_review);
assert.equal(summary.followUps.approved, followups.summary.approved);
assert.equal(summary.followUps.sent, followups.summary.sent);
assert.equal(
  summary.followUps.eligibleForBulkApproval,
  followups.summary.eligible_for_bulk_approval,
);
assert.equal(
  summary.today.totalSent,
  summary.today.initialSent + summary.today.followUpSent,
);
assert.equal(
  summary.today.totalQueued,
  summary.today.initialQueued + summary.today.followUpQueued,
);

console.log(
  JSON.stringify({
    status: "OUTREACH_SUMMARY_API_CHECK_OK",
    campaign_id: campaign.id,
    initial: summary.initial,
    follow_ups: summary.followUps,
    today: summary.today,
  }),
);
