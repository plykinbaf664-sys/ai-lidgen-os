import { getCompanyIdentity, normalizeRecipientEmail } from "@/lib/leadgen/company-identity";
import { mergeLeadOriginContexts } from "@/lib/leadgen/lead-origin";
import type { LeadOriginContext } from "@/lib/leadgen/types";

export type UnifiedSourceCandidate = {
  companyName: string;
  domain: string | null;
  website: string | null;
  fullName: string | null;
  email: string | null;
  originContext: LeadOriginContext;
  signals: Array<{
    type: string;
    sourceUrl: string | null;
    evidence: string;
  }>;
};

function personKey(candidate: UnifiedSourceCandidate) {
  const domain = getCompanyIdentity({
    company_name: candidate.companyName,
    company_domain: candidate.domain,
    website: candidate.website,
  }).normalizedDomain;
  const name = candidate.fullName?.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  return domain && name ? `${domain}:${name}` : null;
}

function candidateKeys(candidate: UnifiedSourceCandidate) {
  const identity = getCompanyIdentity({
    company_name: candidate.companyName,
    company_domain: candidate.domain,
    website: candidate.website,
  });
  return [
    candidate.email ? `email:${normalizeRecipientEmail(candidate.email)}` : null,
    personKey(candidate) ? `person:${personKey(candidate)}` : null,
    `company:${identity.identityKey}`,
  ].filter((key): key is string => Boolean(key));
}

export function deduplicateUnifiedSourceCandidates(
  candidates: UnifiedSourceCandidate[],
) {
  const merged: UnifiedSourceCandidate[] = [];
  const indexByKey = new Map<string, number>();
  for (const candidate of candidates) {
    const keys = candidateKeys(candidate);
    const existingIndex = keys
      .map((key) => indexByKey.get(key))
      .find((index): index is number => index !== undefined);
    if (existingIndex === undefined) {
      const index = merged.length;
      merged.push(candidate);
      keys.forEach((key) => indexByKey.set(key, index));
      continue;
    }
    const existing = merged[existingIndex];
    const signalKeys = new Set(
      existing.signals.map((signal) => `${signal.type}:${signal.sourceUrl ?? ""}`),
    );
    merged[existingIndex] = {
      ...existing,
      domain: existing.domain ?? candidate.domain,
      website: existing.website ?? candidate.website,
      fullName: existing.fullName ?? candidate.fullName,
      email: existing.email ?? candidate.email,
      originContext: mergeLeadOriginContexts(
        existing.originContext,
        candidate.originContext,
      ),
      signals: [
        ...existing.signals,
        ...candidate.signals.filter(
          (signal) => !signalKeys.has(`${signal.type}:${signal.sourceUrl ?? ""}`),
        ),
      ],
    };
    candidateKeys(merged[existingIndex]).forEach((key) =>
      indexByKey.set(key, existingIndex),
    );
  }
  return merged;
}
