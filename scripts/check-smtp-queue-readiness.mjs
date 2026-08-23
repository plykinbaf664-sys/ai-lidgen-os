import assert from "node:assert/strict";
import fs from "node:fs";

const batchRoute = fs.readFileSync("app/api/leadgen/outreach/batch/route.ts", "utf8");
const ui = fs.readFileSync("components/leadgen/email-outreach-queue.tsx", "utf8");
const readinessRoute = fs.readFileSync("app/api/leadgen/outreach/readiness/route.ts", "utf8");

const preflight = batchRoute.indexOf("createEmailProvider().validateConnection()");
const localSchedule = batchRoute.lastIndexOf("scheduleLocalApprovedBatch");
const persistentSchedule = batchRoute.indexOf("scheduleApprovedBatch({");
assert.ok(preflight >= 0, "SMTP preflight is required before queueing");
assert.ok(preflight < localSchedule, "Local queue must be protected by SMTP preflight");
assert.ok(preflight < persistentSchedule, "Persistent queue must be protected by SMTP preflight");
assert.match(batchRoute, /code:\s*"smtp_unavailable"/);
assert.match(batchRoute, /smtp:\s*\{ connected: true, message: smtp\.message \}/);
assert.match(ui, /data\.smtp\?\.connected/);
assert.match(ui, /smtp_connected: true/);
assert.match(readinessRoute, /createEmailProvider\(\)\.validateConnection\(\)/);

console.log("SMTP_QUEUE_READINESS_OK preflight=server ui_state=reconciled no_send=true");
