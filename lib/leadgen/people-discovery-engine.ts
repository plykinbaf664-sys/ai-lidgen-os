import { MockPeopleProvider } from "@/lib/leadgen/mock-people-provider";
import { PeopleProviderManager } from "@/lib/leadgen/people-provider-manager";
import type { PeopleEnrichmentProvider } from "@/lib/leadgen/people-provider";
import type {
  DecisionMakerProfile,
  LeadgenCompany,
  PeopleDiscoveryResult,
  PersonCandidate,
} from "@/lib/leadgen/types";

export type PeopleDiscoveryInput = {
  company: LeadgenCompany;
  decisionMaker: DecisionMakerProfile;
};

function normalizeText(value: string | null): string {
  return value?.toLowerCase().trim() ?? "";
}

function getCandidateKey(candidate: PersonCandidate): string {
  if (candidate.linkedin_url) {
    return `linkedin:${candidate.linkedin_url.toLowerCase()}`;
  }

  if (candidate.work_email) {
    return `email:${candidate.work_email.toLowerCase()}`;
  }

  return `name:${candidate.full_name.toLowerCase()}:${normalizeText(
    candidate.role_title,
  )}`;
}

function dedupeCandidates(candidates: PersonCandidate[]): PersonCandidate[] {
  const byKey = new Map<string, PersonCandidate>();

  for (const candidate of candidates) {
    const key = getCandidateKey(candidate);
    const existing = byKey.get(key);

    if (!existing || candidate.confidence_score > existing.confidence_score) {
      byKey.set(key, candidate);
    }
  }

  return [...byKey.values()];
}

function getCandidateRankScore(
  candidate: PersonCandidate,
  decisionMaker: DecisionMakerProfile,
): number {
  const roleText = normalizeText(candidate.role_title);
  const departmentText = normalizeText(candidate.department);
  const primaryPersona = decisionMaker.primary_persona.toLowerCase();
  const keywordMatches = decisionMaker.search_keywords.filter((keyword) =>
    roleText.includes(keyword.toLowerCase()),
  ).length;
  let score = candidate.confidence_score;

  if (roleText.includes(primaryPersona)) {
    score += 35;
  }

  score += keywordMatches * 8;

  if (departmentText.includes(decisionMaker.department.toLowerCase())) {
    score += 12;
  }

  if (candidate.linkedin_url) {
    score += 8;
  }

  if (candidate.work_email) {
    score += 10;
  }

  return score;
}

export class PeopleDiscoveryEngine {
  private readonly providerManager: PeopleProviderManager;

  constructor(
    providers: PeopleEnrichmentProvider[] = [new MockPeopleProvider()],
  ) {
    this.providerManager = new PeopleProviderManager(providers);
  }

  async discoverPeople({
    company,
    decisionMaker,
  }: PeopleDiscoveryInput): Promise<PeopleDiscoveryResult> {
    const providerResults = await this.providerManager.findPeople({
      company,
      decisionMaker,
      searchKeywords: decisionMaker.search_keywords,
    });
    const providersUsed = providerResults.map((result) => result.provider_label);
    const candidates = dedupeCandidates(
      providerResults.flatMap((result) => result.candidates),
    ).sort(
      (left, right) =>
        getCandidateRankScore(right, decisionMaker) -
        getCandidateRankScore(left, decisionMaker),
    );
    const unavailableProviders = providerResults.filter(
      (result) => result.unavailable,
    );

    if (candidates.length === 0) {
      return {
        primary_person: null,
        alternative_people: [],
        all_candidates: [],
        search_status:
          unavailableProviders.length === providerResults.length &&
          providerResults.length > 0
            ? "provider_unavailable"
            : "no_person_found",
        providers_used: providersUsed,
      };
    }

    return {
      primary_person: candidates[0],
      alternative_people: candidates.slice(1, 4),
      all_candidates: candidates,
      search_status: "person_found",
      providers_used: providersUsed,
    };
  }
}
