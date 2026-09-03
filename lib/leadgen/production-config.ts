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
    50,
    1,
    50,
  ),
  contactReadyTarget: readBoundedInteger(
    "LEADGEN_CONTACT_READY_TARGET",
    50,
    1,
    50,
  ),
  campaignEmailTarget: readBoundedInteger(
    "LEADGEN_CAMPAIGN_EMAIL_TARGET",
    50,
    1,
    50,
  ),
  dailyLeadLimit: readBoundedInteger(
    "LEADGEN_DAILY_LEAD_LIMIT",
    50,
    1,
    50,
  ),
  discoveryCandidateBudget: readBoundedInteger(
    "LEADGEN_DISCOVERY_CANDIDATE_BUDGET",
    1_200,
    50,
    2_000,
  ),
  discoverySearchConcurrency: readBoundedInteger(
    "LEADGEN_DISCOVERY_SEARCH_CONCURRENCY",
    4,
    1,
    8,
  ),
  discoverySearchStrategyBudget: readBoundedInteger(
    "LEADGEN_DISCOVERY_SEARCH_STRATEGY_BUDGET",
    24,
    8,
    40,
  ),
  discoveryResearchConcurrency: readBoundedInteger(
    "LEADGEN_DISCOVERY_RESEARCH_CONCURRENCY",
    5,
    1,
    8,
  ),
  discoveryPoolMultiplier: readBoundedInteger(
    "LEADGEN_DISCOVERY_POOL_MULTIPLIER",
    4,
    2,
    8,
  ),
  discoveryDiminishingBatchLimit: readBoundedInteger(
    "LEADGEN_DISCOVERY_DIMINISHING_BATCH_LIMIT",
    2,
    1,
    6,
  ),
  discoveryDiminishingPassLimit: readBoundedInteger(
    "LEADGEN_DISCOVERY_DIMINISHING_PASS_LIMIT",
    3,
    1,
    10,
  ),
  discoveryResearchCacheSize: readBoundedInteger(
    "LEADGEN_DISCOVERY_RESEARCH_CACHE_SIZE",
    2_000,
    100,
    10_000,
  ),
  searchMaxPages: readBoundedInteger("LEADGEN_SEARCH_MAX_PAGES", 500, 1, 500),
  emailDailySendLimit: readBoundedInteger(
    "EMAIL_DAILY_SEND_LIMIT",
    100,
    1,
    100,
  ),
  emailBatchSendLimit: readBoundedInteger(
    "EMAIL_BATCH_SEND_LIMIT",
    50,
    1,
    50,
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
  followupAutomationEnabled:
    process.env.FOLLOWUP_AUTOMATION_ENABLED?.trim().toLowerCase() === "true",
  followupAutomationScanMinutes: readBoundedInteger(
    "FOLLOWUP_AUTOMATION_SCAN_MINUTES",
    15,
    5,
    1_440,
  ),
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
