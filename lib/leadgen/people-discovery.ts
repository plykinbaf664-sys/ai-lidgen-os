import type {
  DecisionMakerProfile,
  LeadgenCompany,
  PeopleDiscoveryResult,
  PersonCandidate,
} from "@/lib/leadgen/types";

export type PeopleDiscoveryInput = {
  company: LeadgenCompany;
  decisionMaker: DecisionMakerProfile;
  signal?: AbortSignal;
};

export type PeopleDiscoveryContract = {
  discoverPeople(input: PeopleDiscoveryInput): Promise<PeopleDiscoveryResult>;
};

export type PeopleDiscoverySourceResult = {
  provider_id: string;
  provider_label: string;
  candidates: PersonCandidate[];
  unavailable?: boolean;
};
