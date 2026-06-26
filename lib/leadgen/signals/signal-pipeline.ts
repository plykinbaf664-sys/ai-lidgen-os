import { leadgenConfig } from "@/lib/leadgen/config";
import type { SearchProvider } from "@/lib/leadgen/search/search-provider";
import type { EvidenceResult } from "@/lib/leadgen/signals/evidence-collector";
import { collectSignalEvidence } from "@/lib/leadgen/signals/evidence-collector";
import type {
  SignalQuery,
  SignalQueryAngle,
} from "@/lib/leadgen/signals/query-builder";
import { buildSignalQueries } from "@/lib/leadgen/signals/query-builder";
import { buildLeadCandidates } from "@/lib/leadgen/signals/lead-candidate-builder";
import type { LeadCandidate, SignalType } from "@/lib/leadgen/types";

export type SignalPipelineStoppedReason =
  | "target_reached"
  | "query_limit_reached"
  | "no_more_queries";

export type SignalPipelineQueryUsed = SignalQuery & {
  results_count: number;
  candidates_found_after_query: number;
};

export type RunSignalPipelineInput = {
  signalType: SignalType;
  searchProvider: SearchProvider;
  targetCandidates?: number;
  maxQueries?: number;
  maxResultsPerQuery?: number;
};

export type SignalPipelineResult = {
  signal: SignalType;
  target_candidates: number;
  candidates_found: number;
  queries_used: SignalPipelineQueryUsed[];
  candidates_by_angle: Record<SignalQueryAngle, number>;
  candidates: LeadCandidate[];
  valid_evidence: EvidenceResult[];
  weak_evidence: EvidenceResult[];
  rejected_results: EvidenceResult[];
  all_evidence: EvidenceResult[];
  stopped_reason: SignalPipelineStoppedReason;
};

const DEFAULT_TARGET_CANDIDATES = 5;
const DEFAULT_MAX_QUERIES = 5;
const DEFAULT_MAX_RESULTS_PER_QUERY = 5;

const TARGET_CANDIDATES_CAP = 10;
const MAX_QUERIES_CAP = 8;
const MAX_RESULTS_PER_QUERY_CAP = 10;
const MAX_CANDIDATES_PER_ANGLE = 2;

const signalQueryAngles: SignalQueryAngle[] = [
  "company_careers",
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

function selectCandidatesWithDiversity({
  candidates,
  candidateAngleByKey,
  targetCandidates,
  allowOverflow,
}: {
  candidates: LeadCandidate[];
  candidateAngleByKey: Map<string, SignalQueryAngle>;
  targetCandidates: number;
  allowOverflow: boolean;
}): LeadCandidate[] {
  const selected: LeadCandidate[] = [];
  const selectedKeys = new Set<string>();
  const countsByAngle = createEmptyCandidatesByAngle();

  for (const candidate of candidates) {
    const key = getLeadCandidateKey(candidate);
    const angle = candidateAngleByKey.get(key);

    if (!angle || countsByAngle[angle] >= MAX_CANDIDATES_PER_ANGLE) {
      continue;
    }

    selected.push(candidate);
    selectedKeys.add(key);
    countsByAngle[angle] += 1;

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
  candidateQueryByKey,
}: {
  queryEvidence: EvidenceResult[];
  query: SignalQuery;
  candidateAngleByKey: Map<string, SignalQueryAngle>;
  candidateQueryByKey: Map<string, string>;
}) {
  const queryCandidates = buildLeadCandidates(queryEvidence).candidates;

  for (const candidate of queryCandidates) {
    const key = getLeadCandidateKey(candidate);

    if (!candidateAngleByKey.has(key)) {
      candidateAngleByKey.set(key, query.angle);
    }

    if (!candidateQueryByKey.has(key)) {
      candidateQueryByKey.set(key, query.query);
    }
  }
}

function enrichCandidates(
  candidates: LeadCandidate[],
  signalType: SignalType,
  candidateQueryByKey: Map<string, string>,
): LeadCandidate[] {
  return candidates.map((candidate) => ({
    ...candidate,
    signal_type: signalType,
    discovery_query: candidateQueryByKey.get(getLeadCandidateKey(candidate)) ?? null,
    matched_signal_count: candidate.signals.length,
  }));
}

export async function runSignalPipeline({
  signalType,
  searchProvider,
  targetCandidates,
  maxQueries,
  maxResultsPerQuery,
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
  });
  const queriesUsed: SignalPipelineQueryUsed[] = [];
  const evidenceResults: EvidenceResult[] = [];
  const candidateAngleByKey = new Map<string, SignalQueryAngle>();
  const candidateQueryByKey = new Map<string, string>();
  let candidates: LeadCandidate[] = [];

  for (let queryIndex = 0; queryIndex < queries.length; queryIndex += 1) {
    const query = queries[queryIndex];
    const searchResults = await searchProvider.search({
      query: query.query,
      maxResults: safeMaxResultsPerQuery,
    });
    const queryEvidence = searchResults.map((result) =>
      collectSignalEvidence({
        result,
        signalType,
        icp: leadgenConfig.icp,
      }),
    );

    evidenceResults.push(...queryEvidence);
    rememberCandidateMetadata({
      queryEvidence,
      query,
      candidateAngleByKey,
      candidateQueryByKey,
    });

    const allCandidates = buildLeadCandidates(evidenceResults).candidates;
    const isLastQuery = queryIndex === queries.length - 1;

    candidates = selectCandidatesWithDiversity({
      candidates: allCandidates,
      candidateAngleByKey,
      targetCandidates: safeTargetCandidates,
      allowOverflow: isLastQuery,
    });

    queriesUsed.push({
      ...query,
      results_count: searchResults.length,
      candidates_found_after_query: candidates.length,
    });

    if (candidates.length >= safeTargetCandidates) {
      candidates = candidates.slice(0, safeTargetCandidates);
      break;
    }
  }

  if (candidates.length < safeTargetCandidates) {
    candidates = selectCandidatesWithDiversity({
      candidates: buildLeadCandidates(evidenceResults).candidates,
      candidateAngleByKey,
      targetCandidates: safeTargetCandidates,
      allowOverflow: true,
    });
  }

  const enrichedCandidates = enrichCandidates(
    candidates,
    signalType,
    candidateQueryByKey,
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
