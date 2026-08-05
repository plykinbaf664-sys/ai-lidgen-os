import assert from "node:assert/strict";

const previous = {
  campaign: process.env.LEADGEN_CAMPAIGN_COMPANY_LIMIT,
  leads: process.env.LEADGEN_DAILY_LEAD_LIMIT,
  daily: process.env.EMAIL_DAILY_SEND_LIMIT,
  batch: process.env.EMAIL_BATCH_SEND_LIMIT,
};

delete process.env.LEADGEN_CAMPAIGN_COMPANY_LIMIT;
delete process.env.LEADGEN_DAILY_LEAD_LIMIT;
delete process.env.EMAIL_DAILY_SEND_LIMIT;
delete process.env.EMAIL_BATCH_SEND_LIMIT;

const { leadgenProductionConfig } = await import(
  `../lib/leadgen/production-config.ts?limits=${Date.now()}`
);

assert.equal(leadgenProductionConfig.campaignCompanyLimit, 50);
assert.equal(leadgenProductionConfig.dailyLeadLimit, 50);
assert.equal(leadgenProductionConfig.emailDailySendLimit, 50);
assert.equal(leadgenProductionConfig.emailBatchSendLimit, 50);

for (const [key, value] of Object.entries(previous)) {
  const envKey = {
    campaign: "LEADGEN_CAMPAIGN_COMPANY_LIMIT",
    leads: "LEADGEN_DAILY_LEAD_LIMIT",
    daily: "EMAIL_DAILY_SEND_LIMIT",
    batch: "EMAIL_BATCH_SEND_LIMIT",
  }[key];
  if (value === undefined) delete process.env[envKey];
  else process.env[envKey] = value;
}

console.log("PRODUCTION_LIMITS_OK discovery=50 initial_daily=50 initial_batch=50");
