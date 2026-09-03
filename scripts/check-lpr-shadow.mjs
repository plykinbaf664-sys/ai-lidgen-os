import assert from "node:assert/strict";

const baseUrl = process.argv[2] ?? "http://localhost:3000";
const campaigns = await (await fetch(`${baseUrl}/api/leadgen/campaigns`)).json();
const campaign = [...campaigns.campaigns].sort(
  (left, right) => Date.parse(right.created_at) - Date.parse(left.created_at),
)[0];
assert.ok(campaign?.id, "latest campaign is required");

const queueUrl = `${baseUrl}/api/leadgen/outreach?campaignId=${encodeURIComponent(campaign.id)}`;
const before = await (await fetch(queueUrl)).json();
const beforeStatuses = before.entries.map((entry) => [entry.id, entry.status]);

const response = await fetch(`${baseUrl}/api/leadgen/lpr/shadow`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ campaignId: campaign.id, limit: 20, fresh: false }),
});
const shadow = await response.json();
assert.equal(response.ok, true);
assert.equal(shadow.success, true);
assert.equal(shadow.mode, "read_only_shadow_no_mutations_no_send");
assert.equal(shadow.metrics.background_operations_after_completion, 0);
assert.equal(shadow.quality_failures.length, 0);
assert.equal(shadow.results.every((result) => result.ready === true), true);
assert.equal(
  shadow.results.filter((result) => result.timedOut).every((result) => result.ready === true),
  true,
);

const after = await (await fetch(queueUrl)).json();
assert.deepEqual(
  after.entries.map((entry) => [entry.id, entry.status]),
  beforeStatuses,
  "shadow evaluation must not change queued/sent/review states",
);

console.log(JSON.stringify({
  status: "PASS",
  companies: shadow.companies,
  confirmed_lpr: shadow.new.confirmed_lpr,
  classifications: shadow.new.classifications,
  levels: shadow.new.levels,
  timeouts: shadow.metrics.timeouts,
  background_operations: shadow.metrics.background_operations_after_completion,
  outreach_mutations: 0,
}));
