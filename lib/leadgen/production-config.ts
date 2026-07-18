function readBoundedInteger(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isInteger(value)
    ? Math.min(Math.max(value, minimum), maximum)
    : fallback;
}

export const leadgenProductionConfig = {
  campaignCompanyLimit: readBoundedInteger(
    "LEADGEN_CAMPAIGN_COMPANY_LIMIT",
    20,
    1,
    20,
  ),
  discoveryCandidateBudget: readBoundedInteger(
    "LEADGEN_DISCOVERY_CANDIDATE_BUDGET",
    100,
    20,
    200,
  ),
  searchMaxPages: readBoundedInteger("LEADGEN_SEARCH_MAX_PAGES", 3, 1, 5),
  emailDailySendLimit: readBoundedInteger(
    "EMAIL_DAILY_SEND_LIMIT",
    20,
    1,
    20,
  ),
  emailBatchSendLimit: readBoundedInteger(
    "EMAIL_BATCH_SEND_LIMIT",
    20,
    1,
    20,
  ),
  emailMinDelaySeconds: readBoundedInteger(
    "EMAIL_MIN_DELAY_SECONDS",
    300,
    1,
    3_600,
  ),
  emailMaxDelaySeconds: readBoundedInteger(
    "EMAIL_MAX_DELAY_SECONDS",
    600,
    1,
    3_600,
  ),
  emailBusinessTimezone:
    process.env.EMAIL_BUSINESS_TIMEZONE?.trim() || "Europe/Moscow",
} as const;

export function getEmailDelayBounds() {
  const minimum = leadgenProductionConfig.emailMinDelaySeconds;
  const maximum = Math.max(
    minimum,
    leadgenProductionConfig.emailMaxDelaySeconds,
  );
  return { minimum, maximum };
}
