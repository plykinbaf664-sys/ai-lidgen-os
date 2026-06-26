import type { EvidenceResult } from "@/lib/leadgen/signals/evidence-collector";

export type IcpFitBreakdown = {
  business_fit: number;
  commercial_fit: number;
  pain_fit: number;
  exclusion_risk: number;
  matched_business_terms: string[];
  matched_commercial_terms: string[];
  matched_pain_terms: string[];
  matched_exclusion_terms: string[];
};

export type IcpFitResult = {
  icp_fit_score: number;
  breakdown: IcpFitBreakdown;
};

const businessFitTerms = [
  "b2b saas",
  "saas",
  "platform",
  "crm",
  "sales automation",
  "marketing automation",
  "customer success",
  "revenue operations",
  "workflow",
  "product-led",
  "subscription",
  "enterprise software",
];

const commercialFitTerms = [
  "sales",
  "marketing",
  "customer success",
  "support",
  "revenue",
  "go-to-market",
  "gtm",
  "demand generation",
  "account executive",
  "sales development",
  "customer operations",
  "onboarding",
  "operations",
];

const painFitTerms = [
  "hiring",
  "growing",
  "growth",
  "expansion",
  "scaling",
  "launch",
  "released",
  "announced",
  "manual",
  "workflow",
  "support volume",
  "customer requests",
  "pipeline",
  "operations",
];

const exclusionRiskTerms = [
  "software development agency",
  "development agency",
  "dev agency",
  "ai agency",
  "automation agency",
  "consulting agency",
  "recruiting agency",
  "recruitment agency",
  "staffing agency",
  "job board",
  "marketplace",
  "directory",
  "outsourcing",
  "custom software development",
  "web development services",
  "mobile app development",
  "hire developers",
  "ai consulting services",
];

function normalizeText(value: string): string {
  return value.toLowerCase();
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function clampScore(score: number): number {
  return Math.min(Math.max(Math.round(score), 0), 100);
}

function findMatches(text: string, terms: readonly string[]): string[] {
  return terms.filter((term) => text.includes(normalizeText(term)));
}

function getEvidenceText(evidence: EvidenceResult[]): string {
  return normalizeText(
    evidence
      .flatMap((item) => [
        item.signal_title,
        item.signal_detail,
        item.signal_source_label,
        item.source_url,
        item.company_extraction.company_name ?? "",
        item.company_extraction.company_domain ?? "",
        ...item.matched_icp_terms,
        ...item.matched_signal_phrases,
        ...item.matched_source_hints,
      ])
      .join(" "),
  );
}

function calculateTermScore(matches: string[], pointsPerMatch: number, cap: number) {
  return Math.min(matches.length * pointsPerMatch, cap);
}

export function scoreIcpFit(evidence: EvidenceResult[]): IcpFitResult {
  if (evidence.length === 0) {
    return {
      icp_fit_score: 0,
      breakdown: {
        business_fit: 0,
        commercial_fit: 0,
        pain_fit: 0,
        exclusion_risk: 0,
        matched_business_terms: [],
        matched_commercial_terms: [],
        matched_pain_terms: [],
        matched_exclusion_terms: [],
      },
    };
  }

  const text = getEvidenceText(evidence);
  const matchedBusinessTerms = unique(findMatches(text, businessFitTerms));
  const matchedCommercialTerms = unique(findMatches(text, commercialFitTerms));
  const matchedPainTerms = unique(findMatches(text, painFitTerms));
  const matchedExclusionTerms = unique(findMatches(text, exclusionRiskTerms));
  const businessFit = calculateTermScore(matchedBusinessTerms, 7, 25);
  const commercialFit = calculateTermScore(matchedCommercialTerms, 7, 25);
  const painFit = calculateTermScore(matchedPainTerms, 6, 25);
  const exclusionRisk = calculateTermScore(matchedExclusionTerms, 8, 35);

  return {
    icp_fit_score: clampScore(
      businessFit + commercialFit + painFit - exclusionRisk,
    ),
    breakdown: {
      business_fit: businessFit,
      commercial_fit: commercialFit,
      pain_fit: painFit,
      exclusion_risk: exclusionRisk,
      matched_business_terms: matchedBusinessTerms,
      matched_commercial_terms: matchedCommercialTerms,
      matched_pain_terms: matchedPainTerms,
      matched_exclusion_terms: matchedExclusionTerms,
    },
  };
}
