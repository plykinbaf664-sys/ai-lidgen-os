import assert from "node:assert/strict";
import {
  countCanonicalStatuses,
  isGeneratedOutreachStatus,
  normalizeOutreachStatus,
  validateOutreachSummary,
} from "../lib/leadgen/outreach-summary-model.ts";

const initialBefore = [
  { status: "needs_review" },
  { status: "needs_review" },
  { status: "sent" },
];
const followupBefore = [
  { status: "needs_review" },
  { status: "sent" },
];

const initialAfter = [
  { status: "approved" },
  { status: "approved" },
  { status: "sent" },
];
const followupAfter = [
  { status: "approved" },
  { status: "sent" },
];

const initialBeforeCounts = countCanonicalStatuses(initialBefore);
const followupBeforeCounts = countCanonicalStatuses(followupBefore);
const initialAfterCounts = countCanonicalStatuses(initialAfter);
const followupAfterCounts = countCanonicalStatuses(followupAfter);

assert.equal(initialBeforeCounts.needsReview, 2);
assert.equal(initialAfterCounts.needsReview, 0);
assert.equal(initialAfterCounts.approved, 2);
assert.deepEqual(
  followupBeforeCounts,
  countCanonicalStatuses(followupBefore),
  "Initial approval must not affect follow-up counters",
);

assert.equal(followupBeforeCounts.needsReview, 1);
assert.equal(followupAfterCounts.needsReview, 0);
assert.equal(followupAfterCounts.approved, 1);
assert.deepEqual(
  initialBeforeCounts,
  countCanonicalStatuses(initialBefore),
  "Follow-up approval must not affect initial counters",
);

assert.equal(normalizeOutreachStatus("ready_for_review"), "needs_review");
assert.equal(normalizeOutreachStatus("accepted"), "approved");
assert.equal(normalizeOutreachStatus("skipped"), "rejected");
assert.equal(isGeneratedOutreachStatus("duplicate"), false);
assert.equal(isGeneratedOutreachStatus("cancelled"), false);
assert.equal(isGeneratedOutreachStatus("failed"), true);

const initial = {
  ...initialAfterCounts,
  candidates: 4,
  workingEmails: 3,
  generated: 3,
  skipped: 1,
  eligibleForBulkApproval: 0,
};
const followUps = {
  ...followupAfterCounts,
  candidates: 2,
  generated: 2,
  eligible: 0,
  unavailableNow: 2,
  eligibleForBulkApproval: 0,
  approvalBlocked: 0,
};
const today = {
  initialQueued: 1,
  initialSent: 2,
  followUpQueued: 2,
  followUpSent: 3,
  totalQueued: 3,
  totalSent: 5,
  dailyLimit: 20,
  dailyRemaining: 12,
  dailyAvailableToQueue: 10,
};

assert.deepEqual(
  validateOutreachSummary({
    campaignId: "campaign-test",
    initial,
    followUps,
    today,
  }),
  [],
);
assert.equal(today.totalSent, today.initialSent + today.followUpSent);

console.log("OUTREACH_SUMMARY_CHECK_OK (approval isolation, status normalization, today invariant)");
