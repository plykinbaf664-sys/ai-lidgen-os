import type {
  DecisionMakerProfile,
  LeadgenCampaign,
  LeadgenCompany,
  LeadgenContact,
  LeadgenLead,
  LeadgenSignal,
  PeopleDiscoveryResult,
} from "@/lib/leadgen/types";

export type ContactProviderInput = {
  campaign: LeadgenCampaign;
  company: LeadgenCompany;
  lead: LeadgenLead;
  signals: LeadgenSignal[];
  decisionMaker?: DecisionMakerProfile;
  peopleDiscovery?: PeopleDiscoveryResult;
  createdAt: string;
};

export type ContactProviderResult = {
  contacts: LeadgenContact[];
};

export interface ContactProvider {
  findContacts(input: ContactProviderInput): Promise<ContactProviderResult>;
}
