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
  dailyLeadLimit: readBoundedInteger(
    "LEADGEN_DAILY_LEAD_LIMIT",
    20,
    1,
    20,
  ),
  discoveryCandidateBudget: readBoundedInteger(
    "LEADGEN_DISCOVERY_CANDIDATE_BUDGET",
    1_200,
    50,
    2_000,
  ),
  searchMaxPages: readBoundedInteger("LEADGEN_SEARCH_MAX_PAGES", 10, 1, 10),
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
  followupEnabled:
    process.env.FOLLOWUP_ENABLED?.trim().toLowerCase() !== "false",
  followupMinIntervalHours: readBoundedInteger(
    "FOLLOWUP_MIN_INTERVAL_HOURS",
    24,
    1,
    24 * 30,
  ),
  followupMaxPerLead: readBoundedInteger(
    "FOLLOWUP_MAX_PER_LEAD",
    1,
    1,
    5,
  ),
} as const;

export function getEmailDelayBounds() {
  const minimum = leadgenProductionConfig.emailMinDelaySeconds;
  const maximum = Math.max(
    minimum,
    leadgenProductionConfig.emailMaxDelaySeconds,
  );
  return { minimum, maximum };
}
