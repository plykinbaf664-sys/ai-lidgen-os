import { leadgenConfig } from "@/lib/leadgen/config";
import type { SearchProvider } from "@/lib/leadgen/search/search-provider";
import type { EvidenceResult } from "@/lib/leadgen/signals/evidence-collector";
import { collectSignalEvidence } from "@/lib/leadgen/signals/evidence-collector";
import type { SignalQuery } from "@/lib/leadgen/signals/query-builder";
import { buildSignalQueries } from "@/lib/leadgen/signals/query-builder";
import { buildLeadCandidates } from "@/lib/leadgen/signals/lead-candidate-builder";
import type { LeadCandidate, SignalType } from "@/lib/leadgen/types";

export type SignalPipelineTestStoppedReason =
  | "target_reached"
  | "query_limit_reached"
  | "no_more_queries";

export type SignalPipelineQueryUsed = SignalQuery & {
  results_count: number;
  candidates_found_after_query: number;
};

export type RunSignalPipelineTestInput = {
  signalType: SignalType;
  searchProvider: SearchProvider;
  targetCandidates?: number;
  maxQueries?: number;
  maxResultsPerQuery?: number;
};

export type SignalPipelineTestResult = {
  signal: SignalType;
  target_candidates: number;
  candidates_found: number;
  queries_used: SignalPipelineQueryUsed[];
  candidates: LeadCandidate[];
  weak_evidence: EvidenceResult[];
  rejected_results: EvidenceResult[];
  stopped_reason: SignalPipelineTestStoppedReason;
};

const DEFAULT_TARGET_CANDIDATES = 5;
const DEFAULT_MAX_QUERIES = 5;
const DEFAULT_MAX_RESULTS_PER_QUERY = 5;

const TARGET_CANDIDATES_CAP = 10;
const MAX_QUERIES_CAP = 8;
const MAX_RESULTS_PER_QUERY_CAP = 10;

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
}): SignalPipelineTestStoppedReason {
  if (candidatesFound >= targetCandidates) {
    return "target_reached";
  }

  if (queriesUsed >= maxQueries) {
    return "query_limit_reached";
  }

  return "no_more_queries";
}

export async function runSignalPipelineTest({
  signalType,
  searchProvider,
  targetCandidates,
  maxQueries,
  maxResultsPerQuery,
}: RunSignalPipelineTestInput): Promise<SignalPipelineTestResult> {
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
  let candidates: LeadCandidate[] = [];

  for (const query of queries) {
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
    candidates = buildLeadCandidates(evidenceResults).candidates;
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

  return {
    signal: signalType,
    target_candidates: safeTargetCandidates,
    candidates_found: candidates.length,
    queries_used: queriesUsed,
    candidates,
    weak_evidence: evidenceResults.filter(
      (evidence) => evidence.decision === "weak_signal",
    ),
    rejected_results: evidenceResults.filter(
      (evidence) => evidence.decision === "rejected",
    ),
    stopped_reason: getStoppedReason({
      candidatesFound: candidates.length,
      targetCandidates: safeTargetCandidates,
      queriesUsed: queriesUsed.length,
      maxQueries: safeMaxQueries,
    }),
  };
}
