import type { ProductionDiscoveryStats } from "@/lib/leadgen/types";
import { leadgenProductionConfig } from "@/lib/leadgen/production-config";

export const DISCOVERY_PASS_BUDGET_MS = 240_000;
export const DISCOVERY_MAX_PASSES = 100;
export const DISCOVERY_MAX_SEARCH_CURSORS = 500;
export const DISCOVERY_PROVIDER_PAGE_WINDOW = 10;
// Kept as a diagnostic threshold. Empty passes no longer finish a campaign:
// a later geographic query wave can still produce new companies.
export const DISCOVERY_EMPTY_PASS_LIMIT = leadgenProductionConfig.discoveryDiminishingPassLimit;
export const DISCOVERY_PAGES_PER_QUERY_PER_PASS = 1;

const RU_SEARCH_WAVES = [
  "",
  "Москва",
  "Санкт-Петербург",
  "Московская область",
  "Ленинградская область",
  "Новосибирск",
  "Екатеринбург",
  "Казань",
  "Нижний Новгород",
  "Красноярск",
  "Челябинск",
  "Самара",
  "Уфа",
  "Ростов-на-Дону",
  "Краснодар",
  "Омск",
  "Воронеж",
  "Пермь",
  "Волгоград",
  "Саратов",
  "Тюмень",
  "Тольятти",
  "Ижевск",
  "Барнаул",
  "Ульяновск",
  "Иркутск",
  "Хабаровск",
  "Ярославль",
  "Владивосток",
  "Махачкала",
  "Томск",
  "Оренбург",
  "Кемерово",
  "Новокузнецк",
  "Рязань",
  "Астрахань",
  "Набережные Челны",
  "Пенза",
  "Липецк",
  "Киров",
  "Чебоксары",
  "Тула",
  "Калининград",
  "Курск",
  "Ставрополь",
  "Сочи",
  "Белгород",
  "Архангельск",
  "Владимир",
  "Смоленск",
] as const;

export function getDiscoverySearchCursor(cursor: number) {
  const safeCursor = Math.max(0, Math.floor(cursor));
  const wave = Math.floor(safeCursor / DISCOVERY_PROVIDER_PAGE_WINDOW);
  return {
    cursor: safeCursor,
    providerPage: safeCursor % DISCOVERY_PROVIDER_PAGE_WINDOW,
    queryExpansion: RU_SEARCH_WAVES[wave] ?? `регион России ${wave + 1}`,
    wave,
  };
}

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

function mergeStrategyMetrics(
  left: ProductionDiscoveryStats["search_strategy_metrics"] = {},
  right: ProductionDiscoveryStats["search_strategy_metrics"] = {},
) {
  const result = { ...left };
  for (const [key, value] of Object.entries(right)) {
    const current = result[key] ?? { attempts: 0, results: 0, unique_candidates: 0 };
    result[key] = {
      attempts: current.attempts + value.attempts,
      results: current.results + value.results,
      unique_candidates: current.unique_candidates + value.unique_candidates,
    };
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
  if (
    stats?.search_exhausted === true &&
    !stats.stop_reason &&
    qualified > enriched
  ) {
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
    : (previous?.consecutive_empty_passes ?? 0) + 1;
  const diminishingPasses = passEmails <= 1
    ? (previous?.diminishing_return_passes ?? 0) + 1
    : 0;
  const searchExhausted =
    totalEmails >= target ||
    passesCompleted >= DISCOVERY_MAX_PASSES;
  const currentOffset = previous
    ? getDiscoveryPageOffset(previous, pagesPerPass)
    : pass.search_page_offset ?? 0;
  const nextSequentialOffset = currentOffset + pagesPerPass;
  const nextWaveOffset =
    Math.floor(currentOffset / DISCOVERY_PROVIDER_PAGE_WINDOW + 1) *
    DISCOVERY_PROVIDER_PAGE_WINDOW;
  // A pass can contain candidates that fail the segment/contact gates. Staying
  // on the adjacent provider page then repeats the same weak result cluster.
  // Jump to the next geographic wave whenever a pass yields no usable email.
  const nextOffset = passEmails === 0
      ? nextWaveOffset
      : nextSequentialOffset;
  const cursorExhausted = nextOffset >= DISCOVERY_MAX_SEARCH_CURSORS;

  return {
    ...pass,
    lead_target: target,
    email_target: target,
    email_ready_target: target,
    email_ready_companies: totalEmails,
    contact_ready_people: totalContactReadyPeople,
    unresolved_people:
      (previous?.unresolved_people ?? 0) + (pass.unresolved_people ?? 0),
    results_received:
      (previous?.results_received ?? 0) + pass.results_received,
    raw_candidates: (previous?.raw_candidates ?? 0) + (pass.raw_candidates ?? 0),
    unique_candidates: (previous?.unique_candidates ?? 0) + (pass.unique_candidates ?? 0),
    prefiltered_candidates:
      (previous?.prefiltered_candidates ?? 0) + (pass.prefiltered_candidates ?? 0),
    rejected_candidates:
      (previous?.rejected_candidates ?? 0) + (pass.rejected_candidates ?? 0),
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
    segment_matches: (previous?.segment_matches ?? 0) + (pass.segment_matches ?? 0),
    segment_uncertain: (previous?.segment_uncertain ?? 0) + (pass.segment_uncertain ?? 0),
    segment_mismatches: (previous?.segment_mismatches ?? 0) + (pass.segment_mismatches ?? 0),
    deep_research_count:
      (previous?.deep_research_count ?? 0) + (pass.deep_research_count ?? 0),
    research_errors: (previous?.research_errors ?? 0) + (pass.research_errors ?? 0),
    search_attempts: (previous?.search_attempts ?? 0) + (pass.search_attempts ?? 0),
    cache_hits: (previous?.cache_hits ?? 0) + (pass.cache_hits ?? 0),
    search_strategy_metrics: mergeStrategyMetrics(
      previous?.search_strategy_metrics,
      pass.search_strategy_metrics,
    ),
    timings_ms: {
      discovery: (previous?.timings_ms?.discovery ?? 0) + (pass.timings_ms?.discovery ?? 0),
      prefilter: (previous?.timings_ms?.prefilter ?? 0) + (pass.timings_ms?.prefilter ?? 0),
      deep_research: (previous?.timings_ms?.deep_research ?? 0) + (pass.timings_ms?.deep_research ?? 0),
      total: (previous?.timings_ms?.total ?? 0) + (pass.timings_ms?.total ?? 0),
      website_resolution:
        (previous?.timings_ms?.website_resolution ?? 0) +
        (pass.timings_ms?.website_resolution ?? 0),
      segment_verification:
        (previous?.timings_ms?.segment_verification ?? 0) +
        (pass.timings_ms?.segment_verification ?? 0),
      lpr_research:
        (previous?.timings_ms?.lpr_research ?? 0) +
        (pass.timings_ms?.lpr_research ?? 0),
      email_resolution:
        (previous?.timings_ms?.email_resolution ?? 0) +
        (pass.timings_ms?.email_resolution ?? 0),
    },
    skip_reasons: addRecords(previous?.skip_reasons, pass.skip_reasons),
    rejection_samples: [
      ...(previous?.rejection_samples ?? []),
      ...(pass.rejection_samples ?? []),
    ].slice(0, 5),
    skipped_identity_keys: [
      ...new Set([
        ...(previous?.skipped_identity_keys ?? []),
        ...(pass.skipped_identity_keys ?? []),
      ]),
    ],
    passes_completed: passesCompleted,
    consecutive_empty_passes: emptyPasses,
    diminishing_return_passes: diminishingPasses,
    search_page_offset: currentOffset,
    next_page_offset: nextOffset,
    continuation_available: !searchExhausted && !cursorExhausted,
    search_exhausted:
      (searchExhausted || cursorExhausted) && totalEmails < target,
    target_reached: totalEmails >= target,
    stop_reason: totalEmails >= target
      ? "target_reached"
      : cursorExhausted
        ? "cursor_exhausted"
        : passesCompleted >= DISCOVERY_MAX_PASSES
            ? "pass_budget_exhausted"
            : null,
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
  if (stats.stop_reason) return false;

  // Legacy repair: the previous checkpoint incorrectly called the search
  // exhausted after advancing past a still-unprocessed candidate pool.
  return Boolean(
    stats.search_exhausted === true &&
      (stats.qualified_candidates_found ?? 0) >
        (stats.enriched_candidates_checked ?? 0) &&
      (stats.passes_completed ?? 0) < DISCOVERY_MAX_PASSES,
  );
}
