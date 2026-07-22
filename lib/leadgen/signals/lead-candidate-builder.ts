import type { EvidenceResult } from "@/lib/leadgen/signals/evidence-collector";
import { scoreIcpFit } from "@/lib/leadgen/signals/icp-fit-scorer";
import type { LeadCandidate, LeadgenSignal } from "@/lib/leadgen/types";

type CandidateGroup = {
  companyName: string;
  companyDomain: string | null;
  companySourceUrl: string;
  signals: LeadgenSignal[];
  evidence: EvidenceResult[];
};

type BuildLeadCandidatesResult = {
  candidates: LeadCandidate[];
  skipped_evidence: EvidenceResult[];
};

function normalizeCompanyName(companyName: string): string {
  return companyName.toLowerCase().replace(/[^a-z\u0430-\u044f\u04510-9]+/gi, "-");
}

function getCandidateKey(evidence: EvidenceResult): string | null {
  const companyDomain = evidence.company_extraction.company_domain;
  const companyName = evidence.company_extraction.company_name;

  if (companyDomain) {
    return `domain:${companyDomain.toLowerCase()}`;
  }

  if (companyName) {
    return `name:${normalizeCompanyName(companyName)}`;
  }

  return null;
}

function createSignalId(evidence: EvidenceResult, index: number): string {
  return [
    "candidate-signal",
    evidence.signal_type.toLowerCase(),
    normalizeCompanyName(evidence.company_extraction.company_name ?? "unknown"),
    index + 1,
  ].join("-");
}

function toLeadgenSignal(
  evidence: EvidenceResult,
  index: number,
): LeadgenSignal {
  return {
    id: createSignalId(evidence, index),
    pipeline_run_id: "candidate-test",
    campaign_id: "candidate-test",
    lead_id: "candidate-test",
    company_id: null,
    signal_type: evidence.signal_type,
    signal_title: evidence.signal_title,
    signal_detail: evidence.signal_detail,
    signal_source_label: evidence.signal_source_label,
    source_url: evidence.source_url,
    confidence_score: evidence.confidence_score,
    found_at: evidence.found_at,
    created_at: new Date().toISOString(),
  };
}

function getSourceQualityBonus(evidence: EvidenceResult[]): number {
  const sourceTypes = new Set(evidence.map((item) => item.source_type));

  if (
    sourceTypes.has("company_site") ||
    sourceTypes.has("company_careers") ||
    sourceTypes.has("press_release") ||
    sourceTypes.has("news")
  ) {
    return 10;
  }

  if (sourceTypes.has("job_board") || sourceTypes.has("blog")) {
    return 7;
  }

  if (sourceTypes.has("social")) {
    return 5;
  }

  if (sourceTypes.has("directory")) {
    return 2;
  }

  return 0;
}

function calculateLeadScore(evidence: EvidenceResult[]): number {
  const confidenceScores = evidence.map((item) => item.confidence_score);
  const maxConfidence = Math.max(...confidenceScores);
  const averageConfidence =
    confidenceScores.reduce((sum, score) => sum + score, 0) /
    confidenceScores.length;
  const signalCountBonus =
    evidence.length >= 3 ? 15 : evidence.length === 2 ? 8 : 0;
  const sourceQualityBonus = getSourceQualityBonus(evidence);
  const uniqueIcpTerms = new Set(
    evidence.flatMap((item) => item.matched_icp_terms),
  );
  const icpMatchBonus = Math.min(uniqueIcpTerms.size * 2, 10);
  const { icp_fit_score: icpFitScore } = scoreIcpFit(evidence);

  return Math.min(
    Math.round(
      maxConfidence * 0.28 +
        averageConfidence * 0.2 +
        icpFitScore * 0.28 +
        signalCountBonus +
        sourceQualityBonus +
        icpMatchBonus,
    ),
    100,
  );
}

function getCompanySegment(evidence: EvidenceResult[]): string {
  const icpTerms = evidence.flatMap((item) => item.matched_icp_terms);

  return icpTerms[0] ?? "ICP-matched company";
}

function getGtmSignalType(
  evidence: EvidenceResult[],
): LeadCandidate["gtm_signal_type"] {
  const gtmEvidence = evidence
    .filter((item) => item.signal_type === "GO_TO_MARKET_SIGNAL")
    .sort(
      (left, right) =>
        right.event_strength_breakdown.event_evidence_score -
        left.event_strength_breakdown.event_evidence_score,
    )[0];

  return gtmEvidence?.event_strength_breakdown.gtm_signal_type;
}

function getEvidenceLanguage(
  evidence: EvidenceResult[],
): LeadCandidate["evidence_language"] {
  const languages = evidence.map((item) => item.evidence_language);

  if (languages.includes("mixed")) {
    return "mixed";
  }

  const ruCount = languages.filter((language) => language === "ru").length;
  const enCount = languages.filter((language) => language === "en").length;

  return ruCount > enCount ? "ru" : "en";
}

function createLeadCandidate(group: CandidateGroup): LeadCandidate {
  const icpFit = scoreIcpFit(group.evidence);
  const commercialSignal = [...group.evidence]
    .filter((item) => item.commercial_signal)
    .sort((left, right) => right.confidence_score - left.confidence_score)[0]
    ?.commercial_signal ?? null;

  return {
    company_name: group.companyName,
    company_domain: group.companyDomain,
    company_segment: getCompanySegment(group.evidence),
    company_source_url: group.companySourceUrl,
    signals: group.signals,
    lead_score: calculateLeadScore(group.evidence),
    icp_fit_score: icpFit.icp_fit_score,
    icp_fit_breakdown: icpFit.breakdown,
    gtm_signal_type: getGtmSignalType(group.evidence),
    evidence_language: getEvidenceLanguage(group.evidence),
    commercial_signal: commercialSignal,
  };
}

export function buildLeadCandidates(
  evidenceResults: EvidenceResult[],
): BuildLeadCandidatesResult {
  const groups = new Map<string, CandidateGroup>();
  const skippedEvidence: EvidenceResult[] = [];

  for (const evidence of evidenceResults) {
    if (evidence.decision !== "valid_signal") {
      skippedEvidence.push(evidence);
      continue;
    }

    const companyName = evidence.company_extraction.company_name;
    const candidateKey = getCandidateKey(evidence);

    if (
      !companyName ||
      !evidence.company_extraction.is_candidate_company_valid ||
      !candidateKey
    ) {
      skippedEvidence.push(evidence);
      continue;
    }

    const existingGroup = groups.get(candidateKey);

    if (!existingGroup) {
      groups.set(candidateKey, {
        companyName,
        companyDomain: evidence.company_extraction.company_domain,
        companySourceUrl: evidence.source_url,
        signals: [toLeadgenSignal(evidence, 0)],
        evidence: [evidence],
      });
      continue;
    }

    const alreadyHasSignal = existingGroup.signals.some(
      (signal) => signal.source_url === evidence.source_url,
    );

    if (!alreadyHasSignal) {
      existingGroup.signals.push(
        toLeadgenSignal(evidence, existingGroup.signals.length),
      );
    }

    existingGroup.evidence.push(evidence);
  }

  return {
    candidates: [...groups.values()]
      .map(createLeadCandidate)
      .sort((left, right) => right.lead_score - left.lead_score),
    skipped_evidence: skippedEvidence,
  };
}
