import { getLeadCandidateIdentity } from "@/lib/leadgen/company-identity";
import { leadgenProductionConfig } from "@/lib/leadgen/production-config";
import { verifyCompanySegment, type SegmentVerification } from "@/lib/leadgen/segment-guard";
import type { LeadCandidate, OpportunityAssessment } from "@/lib/leadgen/types";
import type { LeadgenVerticalId } from "@/lib/leadgen/verticals";

export type CandidatePrefilterResult = {
  decision: "PASS" | "UNCERTAIN" | "FAIL";
  reason: string;
  segment: SegmentVerification | null;
};

export type CachedWebsiteResolution = {
  domain: string | null;
  website: string | null;
  sourceUrl: string | null;
  status: "confirmed" | "not_found" | "unconfirmed";
  confidence: number;
  reason: string;
};

type ResearchCacheEntry = {
  expiresAt: number;
  segment?: SegmentVerification;
  website?: CachedWebsiteResolution;
};

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const researchCache = new Map<string, ResearchCacheEntry>();

function candidateIdentityKey(candidate: LeadCandidate) {
  return getLeadCandidateIdentity({
    company_name: candidate.company_name,
    company_domain: candidate.company_domain,
    region: candidate.source_country_hint,
  }).identityKey;
}

function cacheKey(candidate: LeadCandidate, verticalId: LeadgenVerticalId) {
  return `${verticalId}:${candidateIdentityKey(candidate)}`;
}

function pruneCache() {
  const now = Date.now();
  for (const [key, value] of researchCache) {
    if (value.expiresAt <= now) researchCache.delete(key);
  }
  while (researchCache.size > leadgenProductionConfig.discoveryResearchCacheSize) {
    const oldest = researchCache.keys().next().value;
    if (!oldest) break;
    researchCache.delete(oldest);
  }
}

export function getCachedCandidateResearch(candidate: LeadCandidate, verticalId: LeadgenVerticalId) {
  pruneCache();
  const key = cacheKey(candidate, verticalId);
  const value = researchCache.get(key) ?? null;
  if (value) {
    researchCache.delete(key);
    researchCache.set(key, value);
  }
  return value;
}

export function cacheCandidateResearch(
  candidate: LeadCandidate,
  verticalId: LeadgenVerticalId,
  patch: Omit<Partial<ResearchCacheEntry>, "expiresAt">,
) {
  const key = cacheKey(candidate, verticalId);
  researchCache.set(key, {
    ...(researchCache.get(key) ?? {}),
    ...patch,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  pruneCache();
}

function hasPlausibleCompanyName(value: string) {
  const normalized = value.trim();
  return normalized.length >= 2 && normalized.length <= 140 &&
    !/^(компания|работодатель|вакансия|неизвестно|unknown)$/i.test(normalized);
}

export function prefilterCandidate(
  candidate: LeadCandidate,
  verticalId: LeadgenVerticalId,
): CandidatePrefilterResult {
  if (!hasPlausibleCompanyName(candidate.company_name)) {
    return { decision: "FAIL", reason: "invalid_company_identity", segment: null };
  }
  if (candidate.signals.length === 0 || !candidate.company_source_url) {
    return { decision: "FAIL", reason: "missing_public_signal_evidence", segment: null };
  }
  const cached = getCachedCandidateResearch(candidate, verticalId);
  if (cached?.segment?.match === "MISMATCH") {
    return { decision: "FAIL", reason: "cached_segment_mismatch", segment: cached.segment };
  }
  const signal = candidate.commercial_signal;
  const segment = verifyCompanySegment({
    selectedSegment: verticalId,
    companyName: candidate.company_name,
    companySegment: candidate.company_segment,
    signalTitle: signal?.sourceTitle ?? null,
    signalSummary: signal?.summary ?? candidate.signal_summary ?? null,
    signalEvidence: signal?.evidence ?? null,
    discoveryQuery: candidate.discovery_query,
  });
  if (segment.match === "MISMATCH") {
    cacheCandidateResearch(candidate, verticalId, { segment });
    return { decision: "FAIL", reason: "obvious_segment_mismatch", segment };
  }
  return {
    decision: segment.match === "MATCH" ? "PASS" : "UNCERTAIN",
    reason: segment.match === "MATCH" ? "cheap_prefilter_pass" : "segment_requires_verification",
    segment,
  };
}

export function getCandidateResearchPriority(
  candidate: LeadCandidate,
  opportunity: OpportunityAssessment,
  prefilter: CandidatePrefilterResult,
) {
  const signalConfidence = Math.max(0, ...candidate.signals.map((signal) => signal.confidence_score));
  return opportunity.opportunity_score * 0.45 +
    candidate.icp_fit_score * 0.25 +
    signalConfidence * 0.2 +
    (candidate.company_domain ? 5 : 0) +
    (prefilter.decision === "PASS" ? 10 : 0) +
    (candidate.commercial_signal?.confidence ?? 0) * 0.05;
}

export function clearResearchCacheForTests() {
  researchCache.clear();
}
