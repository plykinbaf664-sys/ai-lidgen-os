import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [storage, followups, ui, bulkRoute, singleRoute, guideConfig, outreachRoute, localStore, controlRoute] = await Promise.all([
  read("lib/leadgen/outreach-storage.ts"),
  read("lib/leadgen/followup-storage.ts"),
  read("components/leadgen/email-outreach-queue.tsx"),
  read("app/api/leadgen/outreach/bulk-approve/route.ts"),
  read("app/api/leadgen/outreach/[id]/approve/route.ts"),
  read("lib/leadgen/outreach-guide-config.ts"),
  read("app/api/leadgen/outreach/route.ts"),
  read("lib/leadgen/local-outreach-store.ts"),
  read("app/api/leadgen/outreach/control/route.ts"),
]);

const bulkApproval = storage.slice(
  storage.indexOf("export async function bulkApproveOutreach"),
  storage.indexOf("export async function regenerateLatestUnsentOutreach"),
);
const sync = storage.slice(
  storage.indexOf("export async function syncOutreachQueue"),
  storage.indexOf("export async function repairLegacyTruncatedOutreachBodies"),
);

assert.doesNotMatch(bulkApproval, /await syncOutreachQueue/);
assert.doesNotMatch(bulkApproval, /for \(const entry of eligible\)/);
assert.match(bulkApproval, /\.in\("id", eligible\.map/);
assert.match(bulkApproval, /approved_ids: approvedIds/);
assert.match(sync, /pendingRows/);
assert.match(sync, /\.insert\(pendingRows\)/);
assert.doesNotMatch(ui, /selectEntry\(data\.entry\)/);
assert.match(ui, /async function fetchMutation/);
assert.match(ui, /data\.eligible_count === 0/);
assert.match(ui, /data\.skipped\.already_approved/);
assert.match(ui, /Уже одобрено:/);
assert.match(ui, /window\.clearTimeout\(timeout\)/);
assert.match(ui, /Обновите данные перед повторной попыткой/);
assert.doesNotMatch(ui, /\{ manual: true, \.\.\.payload \}/);
assert.match(followups, /approved_ids: approvedIds/);
assert.doesNotMatch(bulkRoute, /getOutreachSummary/);
assert.doesNotMatch(singleRoute, /getOutreachSummary/);
assert.match(bulkRoute, /summary: null/);
assert.match(singleRoute, /summary: null/);
assert.match(ui, /В очереди всего/);
assert.match(ui, /После полуночи/);
assert.match(ui, /dailyAvailableToQueue/);
assert.match(ui, /readiness\?\.queued_total \?\? initialQueuedToday/);
assert.doesNotMatch(ui, /campaignInProgress - queuedToday/);
assert.match(ui, /Всего сообщений в очереди/);
assert.match(guideConfig, /OUTREACH_GUIDE_ATTACHMENTS_ENABLED = false/);
assert.match(outreachRoute, /getLocalDailySendStats/);
assert.match(outreachRoute, /getLocalOutreachOperationalState/);
assert.match(localStore, /export async function resumeLocalQueue/);
assert.match(localStore, /latestScheduledAt/);
assert.match(localStore, /const queuedTotal = entries\.filter/);
assert.match(localStore, /const queued = entries[\s\S]*?\.sort\(/);
assert.match(controlRoute, /await resumeLocalQueue\(body\.campaignId\)/);

console.log("APPROVAL_STABILITY_OK");
