import { runContactFirstDiscoveryTrack } from "@/lib/leadgen/contact-first-discovery-track";
import {
  normalizeLeadReadyCompanyName,
} from "@/lib/leadgen/lead-ready-candidate-mapper";
import { assessLeadReadiness } from "@/lib/leadgen/lead-readiness-assessment";
import { runSignalFirstDiscoveryTrack } from "@/lib/leadgen/signal-first-discovery-track";
import type {
  DiscoveryOrchestratorResult,
  DiscoverySuccessMetrics,
  LeadDiscoveryResult,
  LeadReadyCandidate,
  ProviderDiagnostic,
} from "@/lib/leadgen/types";

function getCandidateMergeKey(candidate: LeadReadyCandidate): string {
  if (candidate.company.domain) {
    return `domain:${candidate.company.domain.toLowerCase()}`;
  }

  return `name:${candidate.company.normalized_name}`;
}

function chooseStrongerContact(
  left: LeadReadyCandidate,
  right: LeadReadyCandidate,
): LeadReadyCandidate["contact"] {
  return right.scores.contact_readiness > left.scores.contact_readiness
    ? right.contact
    : left.contact;
}

function chooseStrongerPerson(
  left: LeadReadyCandidate,
  right: LeadReadyCandidate,
): LeadReadyCandidate["person"] {
  if (!left.person.full_name && right.person.full_name) {
    return right.person;
  }

  if (right.scores.decision_authority > left.scores.decision_authority) {
    return right.person;
  }

  return left.person;
}

function chooseStrongerSignal(
  left: LeadReadyCandidate,
  right: LeadReadyCandidate,
): LeadReadyCandidate["signal"] {
  return right.signal.strength > left.signal.strength ? right.signal : left.signal;
}

function mergeDiagnostics(
  left: ProviderDiagnostic[],
  right: ProviderDiagnostic[],
): ProviderDiagnostic[] {
  const seen = new Set<string>();
  const merged: ProviderDiagnostic[] = [];

  for (const diagnostic of [...left, ...right]) {
    const key = [
      diagnostic.provider_id,
      diagnostic.level,
      diagnostic.message,
    ].join(":");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push(diagnostic);
  }

  return merged;
}

function mergeCandidate(
  left: LeadReadyCandidate,
  right: LeadReadyCandidate,
): LeadReadyCandidate {
  const merged: LeadReadyCandidate = {
    ...left,
    id: `merged:${getCandidateMergeKey(left).replace(/[^a-z0-9\u0430-\u044f\u0451]+/gi, "-")}`,
    source_track: "merged",
    company: {
      ...left.company,
      name: left.company.name || right.company.name,
      normalized_name:
        left.company.normalized_name ||
        normalizeLeadReadyCompanyName(right.company.name),
      domain: left.company.domain ?? right.company.domain,
      website: left.company.website ?? right.company.website,
      source_url: left.company.source_url ?? right.company.source_url,
      location: left.company.location ?? right.company.location,
      industry: left.company.industry ?? right.company.industry,
    },
    person: chooseStrongerPerson(left, right),
    contact: chooseStrongerContact(left, right),
    signal: chooseStrongerSignal(left, right),
    scores: {
      icp_fit: Math.max(left.scores.icp_fit, right.scores.icp_fit),
      contact_readiness: Math.max(
        left.scores.contact_readiness,
        right.scores.contact_readiness,
      ),
      signal_strength: Math.max(
        left.scores.signal_strength,
        right.scores.signal_strength,
      ),
      decision_authority: Math.max(
        left.scores.decision_authority,
        right.scores.decision_authority,
      ),
      overall: Math.max(left.scores.overall, right.scores.overall),
    },
    providers_used: [
      ...new Set([...left.providers_used, ...right.providers_used]),
    ],
    diagnostics: mergeDiagnostics(left.diagnostics, right.diagnostics),
    raw_refs: {
      ...left.raw_refs,
      ...right.raw_refs,
    },
  };

  return assessLeadReadiness(merged);
}

function mergeCandidates(candidates: LeadReadyCandidate[]): LeadReadyCandidate[] {
  const byKey = new Map<string, LeadReadyCandidate>();

  for (const candidate of candidates.map(assessLeadReadiness)) {
    const key = getCandidateMergeKey(candidate);
    const existing = byKey.get(key);

    byKey.set(key, existing ? mergeCandidate(existing, candidate) : candidate);
  }

  return [...byKey.values()].sort(
    (left, right) => right.scores.overall - left.scores.overall,
  );
}

export function calculateDiscoverySuccessMetrics(
  candidates: LeadReadyCandidate[],
): DiscoverySuccessMetrics {
  const hasDirectContact = (candidate: LeadReadyCandidate) =>
    candidate.contact.verified &&
    Boolean(candidate.contact.value) &&
    (candidate.contact.type === "work_email" ||
      candidate.contact.type === "linkedin" ||
      candidate.contact.type === "telegram" ||
      candidate.contact.type === "phone");
  const hasFallbackContact = (candidate: LeadReadyCandidate) =>
    Boolean(candidate.contact.value) &&
    (candidate.contact.type === "generic_email" ||
      candidate.contact.type === "website_form" ||
      candidate.contact.type === "company_social");

  return {
    companies_discovered: candidates.length,
    people_verified: candidates.filter((candidate) =>
      Boolean(candidate.person.full_name),
    ).length,
    confirmed_people_count: candidates.filter((candidate) =>
      Boolean(candidate.person.full_name),
    ).length,
    direct_contacts_found: candidates.filter(hasDirectContact).length,
    fallback_contacts_found: candidates.filter(hasFallbackContact).length,
    verified_contacts_count: candidates.filter(hasDirectContact).length,
    outreach_ready_count: candidates.filter(
      (candidate) => candidate.readiness_status === "outreach_ready",
    ).length,
    fallback_ready_count: candidates.filter(
      (candidate) => candidate.readiness_status === "fallback_ready",
    ).length,
    enrichment_required_count: candidates.filter(
      (candidate) => candidate.readiness_status === "enrichment_required",
    ).length,
    manual_research_required_count: candidates.filter(
      (candidate) => candidate.readiness_status === "manual_research_required",
    ).length,
    provider_exhausted_count: candidates.filter(
      (candidate) => candidate.readiness_status === "provider_exhausted",
    ).length,
    rejected_count: candidates.filter(
      (candidate) => candidate.readiness_status === "rejected",
    ).length,
  };
}

export async function runDiscoveryOrchestrator({
  signalFirstResult,
}: {
  signalFirstResult: LeadDiscoveryResult;
}): Promise<DiscoveryOrchestratorResult> {
  const [contactFirstTrack, signalFirstTrack] = await Promise.all([
    runContactFirstDiscoveryTrack(),
    Promise.resolve(runSignalFirstDiscoveryTrack(signalFirstResult)),
  ]);
  const candidates = mergeCandidates([
    ...contactFirstTrack.candidates,
    ...signalFirstTrack.candidates,
  ]);
  const diagnostics = mergeDiagnostics(
    contactFirstTrack.diagnostics,
    signalFirstTrack.diagnostics,
  );

  return {
    candidates,
    metrics: calculateDiscoverySuccessMetrics(candidates),
    diagnostics,
  };
}
