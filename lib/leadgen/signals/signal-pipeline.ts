import { leadgenProductionConfig } from "@/lib/leadgen/production-config";
import type { SearchProvider } from "@/lib/leadgen/search/search-provider";
import type { EvidenceResult } from "@/lib/leadgen/signals/evidence-collector";
import { collectSignalEvidence } from "@/lib/leadgen/signals/evidence-collector";
import type {
  SignalQuery,
  SignalQueryAngle,
  SignalSearchMarket,
} from "@/lib/leadgen/signals/query-builder";
import { buildSignalQueries } from "@/lib/leadgen/signals/query-builder";
import { buildLeadCandidates } from "@/lib/leadgen/signals/lead-candidate-builder";
import { enrichJobPostingSearchResult } from "@/lib/leadgen/signals/job-posting-context";
import type { LeadCandidate, SignalType } from "@/lib/leadgen/types";
import { getVerticalIcp, type LeadgenVerticalId } from "@/lib/leadgen/verticals";

export type SignalPipelineStoppedReason =
  | "target_reached"
  | "query_limit_reached"
  | "deadline_reached"
  | "no_more_queries"
  | "diminishing_returns";

export type SignalPipelineQueryUsed = SignalQuery & {
  page: number;
  results_count: number;
  candidates_found_after_query: number;
  unique_candidates_added: number;
};

export type SignalPipelineEvidenceResult = EvidenceResult & {
  market: Exclude<SignalSearchMarket, "mixed">;
  query_language: SignalQuery["query_language"];
  query_angle: SignalQuery["query_angle"];
  source_country_hint: string | null;
  why_market_selected: string;
};

export type RunSignalPipelineInput = {
  signalType: SignalType;
  searchProvider: SearchProvider;
  targetCandidates?: number;
  maxQueries?: number;
  maxResultsPerQuery?: number;
  maxPagesPerQuery?: number;
  pageOffset?: number;
  queryExpansion?: string;
  market?: SignalSearchMarket;
  verticalId?: LeadgenVerticalId;
  deadlineAt?: number;
};

export type SignalPipelineResult = {
  signal: SignalType;
  target_candidates: number;
  candidates_found: number;
  queries_used: SignalPipelineQueryUsed[];
  candidates_by_angle: Record<SignalQueryAngle, number>;
  candidates_by_market: Record<Exclude<SignalSearchMarket, "mixed">, number>;
  candidates: LeadCandidate[];
  valid_evidence: SignalPipelineEvidenceResult[];
  weak_evidence: SignalPipelineEvidenceResult[];
  rejected_results: SignalPipelineEvidenceResult[];
  all_evidence: SignalPipelineEvidenceResult[];
  stopped_reason: SignalPipelineStoppedReason;
};

const DEFAULT_TARGET_CANDIDATES = 5;
const DEFAULT_MAX_QUERIES = 5;
const DEFAULT_MAX_RESULTS_PER_QUERY = 5;

const TARGET_CANDIDATES_CAP = 100;
const MAX_QUERIES_CAP = 20;
const MAX_RESULTS_PER_QUERY_CAP = 20;
const MAX_CANDIDATES_PER_ANGLE = 2;
const MAX_SOFT_MARKET_SHARE = 0.7;
const SEARCH_CALL_TIMEOUT_MS = 20_000;

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index]);
    }
  }
  await Promise.all(Array.from(
    { length: Math.min(items.length, Math.max(1, concurrency)) },
    () => worker(),
  ));
  return results;
}

async function searchWithinDeadline(
  searchProvider: SearchProvider,
  input: Parameters<SearchProvider["search"]>[0],
  deadlineAt?: number,
) {
  const available = deadlineAt
    ? Math.max(1, deadlineAt - Date.now())
    : SEARCH_CALL_TIMEOUT_MS;
  const timeoutMs = Math.min(SEARCH_CALL_TIMEOUT_MS, available);
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      searchProvider.search(input).catch(() => []),
      new Promise<Awaited<ReturnType<SearchProvider["search"]>>>((resolve) => {
        timeout = setTimeout(() => resolve([]), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

const signalQueryAngles: SignalQueryAngle[] = [
  "company_careers",
  "company_contacts",
  "ats",
  "job_board",
  "ru_job_board",
  "company_blog",
  "market_news",
];

function applyLimit(value: number | undefined, fallback: number, cap: number) {
  if (!Number.isInteger(value) || !value || value < 1) {
    return fallback;
  }

  return Math.min(value, cap);
}

function getStoppedReason({
  candidatesFound,
  targetCandidates,
  queriesUsed,
  maxQueries,
}: {
  candidatesFound: number;
  targetCandidates: number;
  queriesUsed: number;
  maxQueries: number;
}): SignalPipelineStoppedReason {
  if (candidatesFound >= targetCandidates) {
    return "target_reached";
  }

  if (queriesUsed >= maxQueries) {
    return "query_limit_reached";
  }

  return "no_more_queries";
}

function normalizeCompanyName(companyName: string): string {
  return companyName
    .toLowerCase()
    .replace(/[^a-z\u0430-\u044f\u04510-9]+/gi, "-");
}

function getLeadCandidateKey(candidate: LeadCandidate): string {
  if (candidate.company_domain) {
    return `domain:${candidate.company_domain.toLowerCase()}`;
  }

  return `name:${normalizeCompanyName(candidate.company_name)}`;
}

function createEmptyCandidatesByAngle(): Record<SignalQueryAngle, number> {
  return signalQueryAngles.reduce(
    (accumulator, angle) => ({
      ...accumulator,
      [angle]: 0,
    }),
    {} as Record<SignalQueryAngle, number>,
  );
}

function createEmptyCandidatesByMarket(): Record<
  Exclude<SignalSearchMarket, "mixed">,
  number
> {
  return {
    global: 0,
    ru: 0,
  };
}

function countCandidatesByAngle(
  candidates: LeadCandidate[],
  candidateAngleByKey: Map<string, SignalQueryAngle>,
): Record<SignalQueryAngle, number> {
  const counts = createEmptyCandidatesByAngle();

  for (const candidate of candidates) {
    const angle = candidateAngleByKey.get(getLeadCandidateKey(candidate));

    if (angle) {
      counts[angle] += 1;
    }
  }

  return counts;
}

function countCandidatesByMarket(
  candidates: LeadCandidate[],
  candidateMarketByKey: Map<string, Exclude<SignalSearchMarket, "mixed">>,
): Record<Exclude<SignalSearchMarket, "mixed">, number> {
  const counts = createEmptyCandidatesByMarket();

  for (const candidate of candidates) {
    const market = candidateMarketByKey.get(getLeadCandidateKey(candidate));

    if (market) {
      counts[market] += 1;
    }
  }

  return counts;
}

function selectCandidatesWithDiversity({
  candidates,
  candidateAngleByKey,
  candidateMarketByKey,
  targetCandidates,
  allowOverflow,
}: {
  candidates: LeadCandidate[];
  candidateAngleByKey: Map<string, SignalQueryAngle>;
  candidateMarketByKey: Map<string, Exclude<SignalSearchMarket, "mixed">>;
  targetCandidates: number;
  allowOverflow: boolean;
}): LeadCandidate[] {
  const selected: LeadCandidate[] = [];
  const selectedKeys = new Set<string>();
  const countsByAngle = createEmptyCandidatesByAngle();
  const countsByMarket = createEmptyCandidatesByMarket();
  const softMarketCap = Math.max(
    1,
    Math.ceil(targetCandidates * MAX_SOFT_MARKET_SHARE),
  );

  for (const candidate of candidates) {
    const key = getLeadCandidateKey(candidate);
    const angle = candidateAngleByKey.get(key);
    const market = candidateMarketByKey.get(key);

    if (!angle || countsByAngle[angle] >= MAX_CANDIDATES_PER_ANGLE) {
      continue;
    }

    if (
      !allowOverflow &&
      market &&
      countsByMarket[market] >= softMarketCap
    ) {
      continue;
    }

    selected.push(candidate);
    selectedKeys.add(key);
    countsByAngle[angle] += 1;
    if (market) {
      countsByMarket[market] += 1;
    }

    if (selected.length >= targetCandidates) {
      return selected;
    }
  }

  if (!allowOverflow) {
    return selected;
  }

  for (const candidate of candidates) {
    const key = getLeadCandidateKey(candidate);

    if (selectedKeys.has(key)) {
      continue;
    }

    selected.push(candidate);
    selectedKeys.add(key);

    if (selected.length >= targetCandidates) {
      break;
    }
  }

  return selected;
}

function rememberCandidateMetadata({
  queryEvidence,
  query,
  candidateAngleByKey,
  candidateMarketByKey,
  candidateQueryByKey,
  candidateQueryLanguageByKey,
  candidateQueryAngleByKey,
  candidateSourceCountryHintByKey,
}: {
  queryEvidence: SignalPipelineEvidenceResult[];
  query: SignalQuery;
  candidateAngleByKey: Map<string, SignalQueryAngle>;
  candidateMarketByKey: Map<string, Exclude<SignalSearchMarket, "mixed">>;
  candidateQueryByKey: Map<string, string>;
  candidateQueryLanguageByKey: Map<string, SignalQuery["query_language"]>;
  candidateQueryAngleByKey: Map<string, SignalQuery["query_angle"]>;
  candidateSourceCountryHintByKey: Map<string, string | null>;
}) {
  const queryCandidates = buildLeadCandidates(queryEvidence).candidates;

  for (const candidate of queryCandidates) {
    const key = getLeadCandidateKey(candidate);

    if (!candidateAngleByKey.has(key)) {
      candidateAngleByKey.set(key, query.angle);
    }

    if (!candidateMarketByKey.has(key)) {
      candidateMarketByKey.set(key, query.market);
    }

    if (!candidateQueryByKey.has(key)) {
      candidateQueryByKey.set(key, query.query);
    }

    if (!candidateQueryLanguageByKey.has(key)) {
      candidateQueryLanguageByKey.set(key, query.query_language);
    }

    if (!candidateQueryAngleByKey.has(key)) {
      candidateQueryAngleByKey.set(key, query.query_angle);
    }

    if (!candidateSourceCountryHintByKey.has(key)) {
      candidateSourceCountryHintByKey.set(key, query.source_country_hint);
    }
  }
}

function enrichCandidates(
  candidates: LeadCandidate[],
  signalType: SignalType,
  candidateQueryByKey: Map<string, string>,
  candidateMarketByKey: Map<string, Exclude<SignalSearchMarket, "mixed">>,
  candidateQueryLanguageByKey: Map<string, SignalQuery["query_language"]>,
  candidateQueryAngleByKey: Map<string, SignalQuery["query_angle"]>,
  candidateSourceCountryHintByKey: Map<string, string | null>,
): LeadCandidate[] {
  return candidates.map((candidate) => ({
    ...candidate,
    signal_type: signalType,
    discovery_query: candidateQueryByKey.get(getLeadCandidateKey(candidate)) ?? null,
    discovery_market:
      candidateMarketByKey.get(getLeadCandidateKey(candidate)) ?? null,
    discovery_query_language:
      candidateQueryLanguageByKey.get(getLeadCandidateKey(candidate)) ?? null,
    discovery_query_angle:
      candidateQueryAngleByKey.get(getLeadCandidateKey(candidate)) ?? null,
    source_country_hint:
      candidateSourceCountryHintByKey.get(getLeadCandidateKey(candidate)) ??
      null,
    matched_signal_count: candidate.signals.length,
  }));
}

export async function runSignalPipeline({
  signalType,
  searchProvider,
  targetCandidates,
  maxQueries,
  maxResultsPerQuery,
  maxPagesPerQuery = leadgenProductionConfig.searchMaxPages,
  pageOffset = 0,
  queryExpansion = "",
  market = "mixed",
  verticalId,
  deadlineAt,
}: RunSignalPipelineInput): Promise<SignalPipelineResult> {
  const safeTargetCandidates = applyLimit(
    targetCandidates,
    DEFAULT_TARGET_CANDIDATES,
    TARGET_CANDIDATES_CAP,
  );
  const safeMaxQueries = applyLimit(
    maxQueries,
    DEFAULT_MAX_QUERIES,
    MAX_QUERIES_CAP,
  );
  const safeMaxResultsPerQuery = applyLimit(
    maxResultsPerQuery,
    DEFAULT_MAX_RESULTS_PER_QUERY,
    MAX_RESULTS_PER_QUERY_CAP,
  );
  const verticalIcp = getVerticalIcp(verticalId);
  const queries = buildSignalQueries({
    icp: verticalIcp,
    signalType,
    maxQueries: safeMaxQueries,
    market,
  });
  const queriesUsed: SignalPipelineQueryUsed[] = [];
  const evidenceResults: SignalPipelineEvidenceResult[] = [];
  const candidateAngleByKey = new Map<string, SignalQueryAngle>();
  const candidateMarketByKey = new Map<
    string,
    Exclude<SignalSearchMarket, "mixed">
  >();
  const candidateQueryByKey = new Map<string, string>();
  const candidateQueryLanguageByKey = new Map<
    string,
    SignalQuery["query_language"]
  >();
  const candidateQueryAngleByKey = new Map<string, SignalQuery["query_angle"]>();
  const candidateSourceCountryHintByKey = new Map<string, string | null>();
  let candidates: LeadCandidate[] = [];
  let deadlineReached = false;
  let diminishingBatches = 0;
  let diminishingReturnsReached = false;
  const knownCandidateKeys = new Set<string>();

  queryLoop: for (
    let queryIndex = 0;
    queryIndex < queries.length;
    queryIndex += leadgenProductionConfig.discoverySearchConcurrency
  ) {
    if (deadlineAt && Date.now() >= deadlineAt) {
      deadlineReached = true;
      break;
    }
    const safeMaxPages = Math.min(
      Math.max(maxPagesPerQuery, 1),
      leadgenProductionConfig.searchMaxPages,
    );
    const queryBatch = queries
      .slice(queryIndex, queryIndex + leadgenProductionConfig.discoverySearchConcurrency)
      .map((query) => queryExpansion.trim()
        ? { ...query, query: `${query.query} ${queryExpansion.trim()}` }
        : query);
    const executions = await Promise.all(queryBatch.map(async (activeQuery) => {
      const pages: Array<{
        page: number;
        resultsCount: number;
        evidence: SignalPipelineEvidenceResult[];
      }> = [];
      for (let page = 0; page < safeMaxPages; page += 1) {
        if (deadlineAt && Date.now() >= deadlineAt) break;
        const providerPage = Math.max(0, pageOffset) + page;
        const searchResults = await searchWithinDeadline(searchProvider, {
          query: activeQuery.query,
          maxResults: safeMaxResultsPerQuery,
          page: providerPage,
          market: activeQuery.market,
          queryLanguage: activeQuery.query_language,
        }, deadlineAt);
        const evidenceSearchResults = signalType === "HIRING_SIGNAL"
          ? await mapWithConcurrency(searchResults, 5, async (result) =>
              enrichJobPostingSearchResult(result).catch(() => result))
          : searchResults;
        const evidence = evidenceSearchResults.map((result) => ({
          ...collectSignalEvidence({ result, signalType, icp: verticalIcp }),
          market: activeQuery.market,
          query_language: activeQuery.query_language,
          query_angle: activeQuery.query_angle,
          source_country_hint: activeQuery.source_country_hint,
          why_market_selected: activeQuery.why_market_selected,
        }));
        pages.push({ page: providerPage, resultsCount: searchResults.length, evidence });
        if (searchResults.length < safeMaxResultsPerQuery) break;
      }
      return { activeQuery, pages };
    }));

    let batchUniqueAdded = 0;
    for (const execution of executions) {
      for (const pageResult of execution.pages) {
        evidenceResults.push(...pageResult.evidence);
        rememberCandidateMetadata({
          queryEvidence: pageResult.evidence,
          query: execution.activeQuery,
          candidateAngleByKey,
          candidateMarketByKey,
          candidateQueryByKey,
          candidateQueryLanguageByKey,
          candidateQueryAngleByKey,
          candidateSourceCountryHintByKey,
        });
        const allCandidates = buildLeadCandidates(evidenceResults).candidates;
        let uniqueAdded = 0;
        for (const candidate of allCandidates) {
          const key = getLeadCandidateKey(candidate);
          if (!knownCandidateKeys.has(key)) {
            knownCandidateKeys.add(key);
            uniqueAdded += 1;
          }
        }
        batchUniqueAdded += uniqueAdded;
        candidates = selectCandidatesWithDiversity({
          candidates: allCandidates,
          candidateAngleByKey,
          candidateMarketByKey,
          targetCandidates: safeTargetCandidates,
          allowOverflow: false,
        });
        queriesUsed.push({
          ...execution.activeQuery,
          page: pageResult.page,
          results_count: pageResult.resultsCount,
          candidates_found_after_query: candidates.length,
          unique_candidates_added: uniqueAdded,
        });
      }
    }
    if (candidates.length >= safeTargetCandidates) {
      candidates = candidates.slice(0, safeTargetCandidates);
      break queryLoop;
    }
    diminishingBatches = batchUniqueAdded <= 1 ? diminishingBatches + 1 : 0;
    if (diminishingBatches >= leadgenProductionConfig.discoveryDiminishingBatchLimit) {
      diminishingReturnsReached = true;
      break;
    }
  }

  if (candidates.length < safeTargetCandidates) {
    candidates = selectCandidatesWithDiversity({
      candidates: buildLeadCandidates(evidenceResults).candidates,
      candidateAngleByKey,
      candidateMarketByKey,
      targetCandidates: safeTargetCandidates,
      allowOverflow: true,
    });
  }

  const enrichedCandidates = enrichCandidates(
    candidates,
    signalType,
    candidateQueryByKey,
    candidateMarketByKey,
    candidateQueryLanguageByKey,
    candidateQueryAngleByKey,
    candidateSourceCountryHintByKey,
  );

  return {
    signal: signalType,
    target_candidates: safeTargetCandidates,
    candidates_found: enrichedCandidates.length,
    queries_used: queriesUsed,
    candidates_by_angle: countCandidatesByAngle(
      enrichedCandidates,
      candidateAngleByKey,
    ),
    candidates_by_market: countCandidatesByMarket(
      enrichedCandidates,
      candidateMarketByKey,
    ),
    candidates: enrichedCandidates,
    valid_evidence: evidenceResults.filter(
      (evidence) => evidence.decision === "valid_signal",
    ),
    weak_evidence: evidenceResults.filter(
      (evidence) => evidence.decision === "weak_signal",
    ),
    rejected_results: evidenceResults.filter(
      (evidence) => evidence.decision === "rejected",
    ),
    all_evidence: evidenceResults,
    stopped_reason: deadlineReached
      ? "deadline_reached"
      : diminishingReturnsReached
        ? "diminishing_returns"
      : getStoppedReason({
          candidatesFound: enrichedCandidates.length,
          targetCandidates: safeTargetCandidates,
          queriesUsed: queriesUsed.length,
          maxQueries: safeMaxQueries,
        }),
  };
}
