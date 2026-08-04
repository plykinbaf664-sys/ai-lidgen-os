import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync("app/api/leadgen/outreach/batch/route.ts", "utf8");
const storage = fs.readFileSync("lib/leadgen/outreach-storage.ts", "utf8");
const ui = fs.readFileSync("components/leadgen/email-outreach-queue.tsx", "utf8");
const css = fs.readFileSync("app/globals.css", "utf8");
const errors = fs.readFileSync("lib/leadgen/error-format.ts", "utf8");

assert.match(route, /scheduleApprovedBatch/);
assert.doesNotMatch(route, /processNextOutreachItem/);
assert.match(route, /processor:\s*\{\s*status:\s*"starting"/);
assert.match(route, /after\(async \(\) =>/);
assert.match(route, /runOutreachProcessorIteration/);

const scheduleStart = storage.indexOf("export async function scheduleApprovedBatch");
const scheduleEnd = storage.indexOf("export async function getQueuePaused", scheduleStart);
const schedule = storage.slice(scheduleStart, scheduleEnd);
assert.match(schedule, /\.eq\("message_kind", "initial"\)/);
assert.match(schedule, /\.eq\("status", "approved"\)/);
assert.match(schedule, /\.eq\("status", "approved"\)\s*\.select/);
assert.match(schedule, /queued_count/);
assert.match(schedule, /skipped_count/);
assert.match(schedule, /reasons/);

assert.match(ui, /Запустить первичные/);
assert.match(ui, /Лимит \$\{sentToday\}\/\$\{dailyLimit\} — запуск завтра/);
assert.match(ui, /AbortSignal\.timeout\(40_000\)/);
assert.match(ui, /finally\s*\{\s*setPending\(null\)/);
assert.doesNotMatch(ui, /showBatchConfirm/);
assert.doesNotMatch(ui, /production-confirm/);

assert.match(css, /\.dispatch-queue-inline/);
assert.doesNotMatch(css, /background:\s*#fff7ed/);
assert.match(errors, /AbortError\|TimeoutError/);

console.log("INITIAL_QUEUE_BOUNDARY_OK");
