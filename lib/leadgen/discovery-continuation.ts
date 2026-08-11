import type { ProductionDiscoveryStats } from "@/lib/leadgen/types";

export const DISCOVERY_PASS_BUDGET_MS = 160_000;
export const DISCOVERY_MAX_PASSES = 30;
export const DISCOVERY_EMPTY_PASS_LIMIT = 3;
export const DISCOVERY_PAGES_PER_QUERY_PER_PASS = 1;

function addRecords(
  left: Record<string, number> = {},
  right: Record<string, number> = {},
) {
  const result = { ...left };
  for (const [key, value] of Object.entries(right)) {
    result[key] = (result[key] ?? 0) + value;
  }
  return result;
}

export function getDiscoveryPassNumber(stats?: ProductionDiscoveryStats | null) {
  return Math.max(1, (stats?.passes_completed ?? 0) + 1);
}

export function getDiscoveryPageOffset(
  stats: ProductionDiscoveryStats | null | undefined,
  pagesPerPass: number,
) {
  const qualified = stats?.qualified_candidates_found ?? 0;
  const enriched = stats?.enriched_candidates_checked ?? 0;
  if (stats?.search_exhausted === true && qualified > enriched) {
    // Repair checkpoints created by the first continuation implementation:
    // it advanced pages while a large part of the original candidate pool
    // had never reached enrichment.
    return 0;
  }
  if (typeof stats?.next_page_offset === "number") {
    return Math.max(0, stats.next_page_offset);
  }
  return stats ? Math.max(0, pagesPerPass) : 0;
}

export function mergeDiscoveryPassStats({
  previous,
  pass,
  target,
  pagesPerPass,
}: {
  previous?: ProductionDiscoveryStats | null;
  pass: ProductionDiscoveryStats;
  target: number;
  pagesPerPass: number;
}): ProductionDiscoveryStats {
  const passEmails = pass.email_ready_companies ?? pass.new_unique_emails ?? pass.new_unique_companies;
  const previousEmails = previous?.email_ready_companies ?? previous?.new_unique_emails ?? previous?.new_unique_companies ?? 0;
  const totalEmails = Math.min(target, previousEmails + passEmails);
  const totalContactReadyPeople = Math.min(
    totalEmails,
    (previous?.contact_ready_people ?? 0) + (pass.contact_ready_people ?? 0),
  );
  const passesCompleted = previous
    ? Math.max(1, previous.passes_completed ?? 1) + 1
    : 1;
  const emptyPasses = passEmails > 0
    ? 0
    : pass.enrichment_budget_exhausted
      ? 0
      : (previous?.consecutive_empty_passes ?? 0) + 1;
  const searchExhausted =
    totalEmails >= target ||
    passesCompleted >= DISCOVERY_MAX_PASSES ||
    emptyPasses >= DISCOVERY_EMPTY_PASS_LIMIT;
  const currentOffset = previous
    ? getDiscoveryPageOffset(previous, pagesPerPass)
    : pass.search_page_offset ?? 0;
  const nextOffset = pass.enrichment_budget_exhausted
    ? currentOffset
    : currentOffset + pagesPerPass;

  return {
    ...pass,
    lead_target: target,
    email_target: target,
    email_ready_target: target,
    email_ready_companies: totalEmails,
    contact_ready_people: totalContactReadyPeople,
    results_received:
      (previous?.results_received ?? 0) + pass.results_received,
    previously_discovered_skipped:
      (previous?.previously_discovered_skipped ?? 0) +
      pass.previously_discovered_skipped,
    within_run_duplicates:
      (previous?.within_run_duplicates ?? 0) + pass.within_run_duplicates,
    qualified_candidates_found:
      (previous?.qualified_candidates_found ?? 0) +
      (pass.qualified_candidates_found ?? 0),
    new_unique_companies: totalEmails,
    new_unique_emails: totalEmails,
    known_emails_skipped:
      (previous?.known_emails_skipped ?? 0) +
      (pass.known_emails_skipped ?? 0),
    duplicate_emails_skipped:
      (previous?.duplicate_emails_skipped ?? 0) +
      (pass.duplicate_emails_skipped ?? 0),
    duplicate_people_skipped:
      (previous?.duplicate_people_skipped ?? 0) +
      (pass.duplicate_people_skipped ?? 0),
    enriched_candidates_checked:
      (previous?.enriched_candidates_checked ?? 0) +
      (pass.enriched_candidates_checked ?? 0),
    official_sites_found:
      (previous?.official_sites_found ?? 0) +
      (pass.official_sites_found ?? 0),
    skip_reasons: addRecords(previous?.skip_reasons, pass.skip_reasons),
    skipped_identity_keys: [
      ...new Set([
        ...(previous?.skipped_identity_keys ?? []),
        ...(pass.skipped_identity_keys ?? []),
      ]),
    ],
    passes_completed: passesCompleted,
    consecutive_empty_passes: emptyPasses,
    search_page_offset: currentOffset,
    next_page_offset: nextOffset,
    continuation_available: !searchExhausted,
    search_exhausted: searchExhausted && totalEmails < target,
    target_reached: totalEmails >= target,
  };
}

export function canContinueDiscovery(
  stats: ProductionDiscoveryStats | null | undefined,
  fallbackTarget = 50,
) {
  if (!stats) return false;
  const target = stats.email_ready_target ?? stats.email_target ?? stats.lead_target ?? fallbackTarget;
  const found = stats.email_ready_companies ?? stats.new_unique_emails ?? stats.new_unique_companies;
  if (found >= target || stats.target_reached === true) return false;
  if (stats.continuation_available === true) return true;

  // Legacy repair: the previous checkpoint incorrectly called the search
  // exhausted after advancing past a still-unprocessed candidate pool.
  return Boolean(
    stats.search_exhausted === true &&
      (stats.qualified_candidates_found ?? 0) >
        (stats.enriched_candidates_checked ?? 0) &&
      (stats.passes_completed ?? 0) < DISCOVERY_MAX_PASSES,
  );
}
