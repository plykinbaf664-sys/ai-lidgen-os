import { MockPeopleProvider } from "@/lib/leadgen/mock-people-provider";
import { PeopleProviderManager } from "@/lib/leadgen/people-provider-manager";
import type { PeopleEnrichmentProvider } from "@/lib/leadgen/people-provider";
import { rankPersonCandidates } from "@/lib/leadgen/person-ranking-engine";
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
    );
    const unavailableProviders = providerResults.filter(
      (result) => result.unavailable,
    );
    const ranking = rankPersonCandidates({
      candidates,
      decisionMaker,
    });

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
      primary_person: ranking.primary_person?.candidate ?? null,
      alternative_people: ranking.alternative_people.map(
        (person) => person.candidate,
      ),
      all_candidates: ranking.ranked_people.map((person) => person.candidate),
      primary_person_intelligence: ranking.primary_person,
      alternative_people_intelligence: ranking.alternative_people,
      ranked_people: ranking.ranked_people,
      selection_reasoning: ranking.primary_person?.selection_reason ?? null,
      search_status: "person_found",
      providers_used: providersUsed,
    };
  }
}
