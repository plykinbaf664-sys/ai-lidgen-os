import type {
  DecisionMakerProfile,
  LeadgenCompany,
  PersonCandidate,
} from "@/lib/leadgen/types";

export type PeopleProviderInput = {
  company: LeadgenCompany;
  decisionMaker: DecisionMakerProfile;
  searchKeywords: string[];
};

export type PeopleProviderResult = {
  provider_id: string;
  provider_label: string;
  candidates: PersonCandidate[];
  unavailable?: boolean;
};

export interface PeopleEnrichmentProvider {
  id: string;
  label: string;
  findPeople(input: PeopleProviderInput): Promise<PeopleProviderResult>;
}
