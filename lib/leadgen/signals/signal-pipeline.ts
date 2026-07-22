import { leadgenConfig } from "@/lib/leadgen/config";
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

export type SignalPipelineStoppedReason =
  | "target_reached"
  | "query_limit_reached"
  | "no_more_queries";

export type SignalPipelineQueryUsed = SignalQuery & {
  page: number;
  results_count: number;
  candidates_found_after_query: number;
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
  market?: SignalSearchMarket;
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
const MAX_RESULTS_PER_QUERY_CAP = 10;
const MAX_CANDIDATES_PER_ANGLE = 2;
const MAX_SOFT_MARKET_SHARE = 0.7;

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
  market = "mixed",
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
  const queries = buildSignalQueries({
    icp: leadgenConfig.icp,
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

  queryLoop: for (let queryIndex = 0; queryIndex < queries.length; queryIndex += 1) {
    const query = queries[queryIndex];
    const safeMaxPages = Math.min(
      Math.max(maxPagesPerQuery, 1),
      leadgenProductionConfig.searchMaxPages,
    );

    for (let page = 0; page < safeMaxPages; page += 1) {
      const providerPage = Math.max(0, pageOffset) + page;
      const searchResults = await searchProvider.search({
      query: query.query,
      maxResults: safeMaxResultsPerQuery,
      page: providerPage,
      market: query.market,
      queryLanguage: query.query_language,
      });
      const evidenceSearchResults =
        signalType === "HIRING_SIGNAL"
          ? await Promise.all(searchResults.map(enrichJobPostingSearchResult))
          : searchResults;
      const queryEvidence = evidenceSearchResults.map((result) => ({
      ...collectSignalEvidence({
        result,
        signalType,
        icp: leadgenConfig.icp,
      }),
      market: query.market,
      query_language: query.query_language,
      query_angle: query.query_angle,
      source_country_hint: query.source_country_hint,
      why_market_selected: query.why_market_selected,
    }));

      evidenceResults.push(...queryEvidence);
      rememberCandidateMetadata({
      queryEvidence,
      query,
      candidateAngleByKey,
      candidateMarketByKey,
      candidateQueryByKey,
      candidateQueryLanguageByKey,
      candidateQueryAngleByKey,
      candidateSourceCountryHintByKey,
      });

      const allCandidates = buildLeadCandidates(evidenceResults).candidates;
      const isLastQuery =
        queryIndex === queries.length - 1 && page === safeMaxPages - 1;

      candidates = selectCandidatesWithDiversity({
      candidates: allCandidates,
      candidateAngleByKey,
      candidateMarketByKey,
      targetCandidates: safeTargetCandidates,
      allowOverflow: isLastQuery,
      });

      queriesUsed.push({
        ...query,
        page: providerPage,
        results_count: searchResults.length,
        candidates_found_after_query: candidates.length,
      });

      if (candidates.length >= safeTargetCandidates) {
        candidates = candidates.slice(0, safeTargetCandidates);
        break queryLoop;
      }

      if (searchResults.length < safeMaxResultsPerQuery) {
        break;
      }
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
    stopped_reason: getStoppedReason({
      candidatesFound: enrichedCandidates.length,
      targetCandidates: safeTargetCandidates,
      queriesUsed: queriesUsed.length,
      maxQueries: safeMaxQueries,
    }),
  };
}
