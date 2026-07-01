import type { SearchProvider } from "@/lib/leadgen/search/search-provider";
import { assessOpportunity } from "@/lib/leadgen/opportunity-intelligence";
import type { EvidenceResult } from "@/lib/leadgen/signals/evidence-collector";
import { interpretSignal } from "@/lib/leadgen/signals/signal-interpreter";
import type {
  SignalQueryAngle,
  SignalSearchMarket,
} from "@/lib/leadgen/signals/query-builder";
import {
  runSignalPipeline,
  type SignalPipelineEvidenceResult,
  type SignalPipelineQueryUsed,
  type SignalPipelineStoppedReason,
} from "@/lib/leadgen/signals/signal-pipeline";
import type {
  LeadCandidate,
  OpportunityAssessment,
  SignalType,
} from "@/lib/leadgen/types";

export type SignalPipelineTestStoppedReason = SignalPipelineStoppedReason;

export type { SignalPipelineQueryUsed };

export type SignalPipelineEvidenceDiagnostic = {
  title: string;
  source_url: string;
  decision: EvidenceResult["decision"];
  rejection_reason?: EvidenceResult["rejection_reason"];
  source_type: EvidenceResult["source_type"];
  market: SignalPipelineEvidenceResult["market"];
  query_language: SignalPipelineEvidenceResult["query_language"];
  query_angle: SignalPipelineEvidenceResult["query_angle"];
  source_country_hint: string | null;
  source_domain: string | null;
  source_platform: string | null;
  is_platform_like_source: boolean;
  is_company_owned_domain: boolean;
  extraction_strategy_used: EvidenceResult["company_extraction"]["extraction_strategy_used"];
  matched_ru_pattern: string | null;
  candidate_company: string | null;
  is_candidate_company_valid: boolean;
  invalid_reason: EvidenceResult["company_extraction"]["invalid_reason"];
  validation_reason: string;
  company_quality_score: number;
  candidate_selection_score: number;
  candidate_selection_reason: string;
  candidate_options: EvidenceResult["company_extraction"]["candidate_options"];
  event_strength_score: number;
  event_strength_breakdown: EvidenceResult["event_strength_breakdown"];
};

export type RunSignalPipelineTestInput = {
  signalType: SignalType;
  searchProvider: SearchProvider;
  targetCandidates?: number;
  maxQueries?: number;
  maxResultsPerQuery?: number;
  market?: SignalSearchMarket;
};

export type SignalPipelineTestResult = {
  signal: SignalType;
  target_candidates: number;
  candidates_found: number;
  queries_used: SignalPipelineQueryUsed[];
  candidates_by_angle: Record<SignalQueryAngle, number>;
  candidates_by_market: Record<Exclude<SignalSearchMarket, "mixed">, number>;
  candidates: LeadCandidate[];
  opportunity_diagnostics: Array<{
    company_name: string;
    signal_type: SignalType | null;
    opportunity_score: number;
    opportunity_type: OpportunityAssessment["opportunity_type"];
    business_reasoning: string;
    why_now: string;
    why_this_company: string;
    positive_factors: string[];
    negative_factors: string[];
    missing_information: string[];
    recommended_action: OpportunityAssessment["recommended_action"];
    should_create_lead: boolean;
    opportunity: OpportunityAssessment;
  }>;
  weak_evidence: SignalPipelineEvidenceResult[];
  rejected_results: SignalPipelineEvidenceResult[];
  evidence_diagnostics: SignalPipelineEvidenceDiagnostic[];
  stopped_reason: SignalPipelineTestStoppedReason;
};

function getPrimarySignal(candidate: LeadCandidate) {
  return [...candidate.signals].sort(
    (left, right) => right.confidence_score - left.confidence_score,
  )[0] ?? null;
}

function assessCandidateOpportunity(candidate: LeadCandidate): {
  company_name: string;
  signal_type: SignalType | null;
  opportunity_score: number;
  opportunity_type: OpportunityAssessment["opportunity_type"];
  business_reasoning: string;
  why_now: string;
  why_this_company: string;
  positive_factors: string[];
  negative_factors: string[];
  missing_information: string[];
  recommended_action: OpportunityAssessment["recommended_action"];
  should_create_lead: boolean;
  opportunity: OpportunityAssessment;
} | null {
  const primarySignal = getPrimarySignal(candidate);

  if (!primarySignal) {
    return null;
  }

  const interpretedCandidate = {
    ...candidate,
    ...interpretSignal({ candidate, primarySignal }),
  };

  const opportunity = assessOpportunity({ candidate: interpretedCandidate });

  return {
    company_name: candidate.company_name,
    signal_type: interpretedCandidate.signal_type ?? primarySignal.signal_type,
    opportunity_score: opportunity.opportunity_score,
    opportunity_type: opportunity.opportunity_type,
    business_reasoning: opportunity.business_reasoning,
    why_now: opportunity.why_now,
    why_this_company: opportunity.why_this_company,
    positive_factors: opportunity.positive_factors,
    negative_factors: opportunity.negative_factors,
    missing_information: opportunity.missing_information,
    recommended_action: opportunity.recommended_action,
    should_create_lead: opportunity.should_create_lead,
    opportunity,
  };
}

function toEvidenceDiagnostic(
  evidence: SignalPipelineEvidenceResult,
): SignalPipelineEvidenceDiagnostic {
  return {
    title: evidence.signal_detail,
    source_url: evidence.source_url,
    decision: evidence.decision,
    rejection_reason: evidence.rejection_reason,
    source_type: evidence.source_type,
    market: evidence.market,
    query_language: evidence.query_language,
    query_angle: evidence.query_angle,
    source_country_hint: evidence.source_country_hint,
    source_domain: evidence.company_extraction.source_domain,
    source_platform: evidence.company_extraction.source_platform,
    is_platform_like_source:
      evidence.company_extraction.is_platform_like_source,
    is_company_owned_domain:
      evidence.company_extraction.is_company_owned_domain,
    extraction_strategy_used:
      evidence.company_extraction.extraction_strategy_used,
    matched_ru_pattern: evidence.company_extraction.matched_ru_pattern,
    candidate_company: evidence.company_extraction.company_name,
    is_candidate_company_valid:
      evidence.company_extraction.is_candidate_company_valid,
    invalid_reason: evidence.company_extraction.invalid_reason,
    validation_reason: evidence.company_extraction.validation_reason,
    company_quality_score: evidence.company_extraction.company_quality_score,
    candidate_selection_score:
      evidence.company_extraction.candidate_selection_score,
    candidate_selection_reason:
      evidence.company_extraction.candidate_selection_reason,
    candidate_options: evidence.company_extraction.candidate_options,
    event_strength_score: evidence.event_strength_score,
    event_strength_breakdown: evidence.event_strength_breakdown,
  };
}

export async function runSignalPipelineTest({
  signalType,
  searchProvider,
  targetCandidates,
  maxQueries,
  maxResultsPerQuery,
  market,
}: RunSignalPipelineTestInput): Promise<SignalPipelineTestResult> {
  const result = await runSignalPipeline({
    signalType,
    searchProvider,
    targetCandidates,
    maxQueries,
    maxResultsPerQuery,
    market,
  });

  return {
    signal: result.signal,
    target_candidates: result.target_candidates,
    candidates_found: result.candidates_found,
    queries_used: result.queries_used,
    candidates_by_angle: result.candidates_by_angle,
    candidates_by_market: result.candidates_by_market,
    candidates: result.candidates,
    opportunity_diagnostics: result.candidates
      .map(assessCandidateOpportunity)
      .filter(
        (
          diagnostic,
        ): diagnostic is {
          company_name: string;
          signal_type: SignalType | null;
          opportunity_score: number;
          opportunity_type: OpportunityAssessment["opportunity_type"];
          business_reasoning: string;
          why_now: string;
          why_this_company: string;
          positive_factors: string[];
          negative_factors: string[];
          missing_information: string[];
          recommended_action: OpportunityAssessment["recommended_action"];
          should_create_lead: boolean;
          opportunity: OpportunityAssessment;
        } => Boolean(diagnostic),
      ),
    weak_evidence: result.weak_evidence,
    rejected_results: result.rejected_results,
    evidence_diagnostics: result.all_evidence.map(toEvidenceDiagnostic),
    stopped_reason: result.stopped_reason,
  };
}
