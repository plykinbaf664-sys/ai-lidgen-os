import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const store = await readFile(
  new URL("../lib/leadgen/local-outreach-store.ts", import.meta.url),
  "utf8",
);
const processor = await readFile(
  new URL("../lib/leadgen/local-outreach-processor.ts", import.meta.url),
  "utf8",
);
const batchRoute = await readFile(
  new URL("../app/api/leadgen/outreach/batch/route.ts", import.meta.url),
  "utf8",
);
const ui = await readFile(
  new URL("../components/leadgen/email-outreach-queue.tsx", import.meta.url),
  "utf8",
);
const storage = await readFile(
  new URL("../lib/leadgen/storage.ts", import.meta.url),
  "utf8",
);
const outreachStorage = await readFile(
  new URL("../lib/leadgen/outreach-storage.ts", import.meta.url),
  "utf8",
);

assert.match(store, /atomicWrite/);
assert.match(store, /scheduleLocalApprovedBatch/);
assert.match(store, /quality_gate_failed/);
assert.match(store, /duplicate_email/);
assert.match(store, /getLocalDailySendStats/);
assert.match(store, /claimDueLocalOutreachItem/);
assert.match(processor, /provider\.validateConnection\(\)/);
assert.match(processor, /provider\.sendEmail\(entry\)/);
assert.match(processor, /reply_check_status !== "verified"/);
assert.match(batchRoute, /storage_mode: "local"/);
assert.match(batchRoute, /runLocalOutreachProcessorIteration/);
assert.match(ui, /entries,/);
assert.match(ui, /sentToday: readiness\?\.sent_today/);
assert.doesNotMatch(ui, /AbortSignal\.timeout\(40_000\)/);
assert.doesNotMatch(storage, /await saveEvents\(supabase, normalizedResult\.events\)/);
assert.doesNotMatch(storage, /await saveTelegramNotifications\(supabase, normalizedNotifications\)/);
assert.doesNotMatch(ui, /entry\.signal\.detail/);
assert.match(outreachStorage, /const signal: OutreachQueueEntry\["signal"\]/);

const { calculateBatchCapacity, getNextScheduledAt } = await import(
  "../lib/leadgen/outreach-policy.ts"
);
const { compactLocalTableRows } = await import(
  "../lib/leadgen/local-storage-compaction.ts"
);
const [legacyInitial, explicitFollowup] = compactLocalTableRows(
  "leadgen_outreach_queue",
  [
    { id: "legacy-initial", status: "needs_review" },
    { id: "followup", parent_outreach_id: "parent", followup_number: 1 },
  ],
);
assert.equal(legacyInitial.message_kind, "initial");
assert.equal(legacyInitial.message_version, 1);
assert.equal(legacyInitial.attempt_count, 0);
assert.equal(explicitFollowup.message_kind, "follow_up");
assert.equal(
  calculateBatchCapacity({
    requested: 20,
    approved: 20,
    sentToday: 10,
    queuedForToday: 5,
    dailyLimit: 50,
    batchLimit: 50,
  }),
  20,
);
assert.equal(
  getNextScheduledAt({
    currentTimestamp: 0,
    minimumDelaySeconds: 300,
    maximumDelaySeconds: 600,
    randomDelay: () => 300,
  }),
  300_000,
);

console.log("LOCAL_OUTREACH_BOUNDARY_OK");
