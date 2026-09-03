import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [dashboard, history, outreach] = await Promise.all([
  read("components/leadgen/leadgen-dashboard.tsx"),
  read("components/leadgen/campaign-history.tsx"),
  read("components/leadgen/email-outreach-queue.tsx"),
]);

assert.ok(
  dashboard.indexOf("<CampaignHistory") <
    dashboard.indexOf("{activeCampaignId ? ("),
  "Campaign history must render before the opened campaign",
);
assert.match(dashboard, /key=\{activeCampaignId\}/);
assert.match(dashboard, /cache: "no-store"/);
assert.match(history, /Открыть · не отправлено/);
assert.match(history, /Все сообщения отправлены/);
assert.match(outreach, /Продолжить отправку ·/);
assert.match(outreach, /Отправка продолжается ·/);
assert.match(outreach, /Не отправлено с ошибкой ·/);
assert.match(outreach, /scheduleBatch\(Math\.min\(metrics\.approved, maxBatch\)\)/);
assert.doesNotMatch(outreach, />\s*Продолжить отправку\s*<\/Button>/);

console.log("CAMPAIGN_HISTORY_DELIVERY_OK");
