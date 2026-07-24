import assert from "node:assert/strict";
import { selectCampaignLeadIds } from "../lib/leadgen/campaign-target-policy.ts";

const ordered = Array.from({ length: 25 }, (_, index) => `lead-${index}`);
const selected = selectCampaignLeadIds({
  orderedLeadIds: ordered,
  emailReadyLeadIds: ["lead-4", "lead-8", "lead-12"],
  target: 20,
});
assert.equal(selected.size, 3);
assert.equal(selected.has("lead-4"), true);
assert.equal(selected.has("lead-8"), true);
assert.equal(selected.has("lead-12"), true);
assert.equal(selected.has("lead-0"), false);
assert.equal(selected.has("lead-24"), false);
console.log("CAMPAIGN_EMAIL_READY_TARGET_CHECK_OK");
