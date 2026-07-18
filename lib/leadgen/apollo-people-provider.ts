import type {
  PeopleEnrichmentProvider,
  PeopleProviderInput,
  PeopleProviderResult,
} from "@/lib/leadgen/people-provider";
import {
  buildProviderUnavailableResult,
  getCompanyDomain,
  getRoleFitConfidence,
  getTargetTitles,
  hasTargetRoleMatch,
} from "@/lib/leadgen/people-provider-utils";
import type { PersonCandidate } from "@/lib/leadgen/types";

type ApolloPerson = {
  name?: string;
  title?: string | null;
  email?: string | null;
  email_status?: string | null;
  linkedin_url?: string | null;
  phone_numbers?: Array<{ raw_number?: string | null; sanitized_number?: string | null }>;
  organization?: {
    name?: string | null;
  };
};

type ApolloResponse = {
  people?: ApolloPerson[];
  contacts?: ApolloPerson[];
};

export class ApolloPeopleProvider implements PeopleEnrichmentProvider {
  id = "apollo";
  label = "Apollo";

  private getApiKey(): string | null {
    return process.env.APOLLO_API_KEY?.trim() || null;
  }

  private toCandidate(
    person: ApolloPerson,
    input: PeopleProviderInput,
  ): PersonCandidate | null {
    const fullName = person.name?.trim();

    if (!fullName) {
      return null;
    }

    const phone =
      person.phone_numbers?.find(
        (phoneNumber) => phoneNumber.sanitized_number || phoneNumber.raw_number,
      ) ?? null;
    const workEmail =
      person.email && person.email_status !== "unavailable" ? person.email : null;
    const candidate: PersonCandidate = {
      full_name: fullName,
      role_title: person.title ?? null,
      department: input.decisionMaker.department,
      linkedin_url: person.linkedin_url ?? null,
      work_email: workEmail,
      phone: phone?.sanitized_number ?? phone?.raw_number ?? null,
      source: this.label,
      confidence_score: 0,
      evidence: [
        person.title ? `Apollo title: ${person.title}` : null,
        person.organization?.name
          ? `Apollo organization: ${person.organization.name}`
          : null,
        person.email_status ? `Apollo email status: ${person.email_status}` : null,
      ].filter((value): value is string => Boolean(value)),
      metadata: {
        provider_id: this.id,
        email_status: person.email_status ?? null,
      },
    };

    return {
      ...candidate,
      confidence_score: getRoleFitConfidence({
        candidate,
        decisionMaker: input.decisionMaker,
        hasDirectContact: Boolean(workEmail || candidate.linkedin_url || candidate.phone),
        baseConfidence: hasTargetRoleMatch(candidate, input.decisionMaker) ? 62 : 48,
      }),
    };
  }

  async findPeople(input: PeopleProviderInput): Promise<PeopleProviderResult> {
    const apiKey = this.getApiKey();
    const domain = getCompanyDomain(input.company);

    if (!apiKey || !domain) {
      return buildProviderUnavailableResult({
        providerId: this.id,
        providerLabel: this.label,
        reason: !apiKey
          ? "APOLLO_API_KEY is not configured."
          : "Company domain is missing; Apollo people search requires a domain.",
      });
    }

    const response = await fetch("https://api.apollo.io/api/v1/mixed_people/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify({
        q_organization_domains: domain,
        person_titles: getTargetTitles(input.decisionMaker).slice(0, 12),
        page: 1,
        per_page: 10,
      }),
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => "");

      return buildProviderUnavailableResult({
        providerId: this.id,
        providerLabel: this.label,
        reason: `Apollo people search failed with ${response.status}: ${responseText.slice(0, 240)}`,
      });
    }

    const data = (await response.json()) as ApolloResponse;
    const people = [...(data.people ?? []), ...(data.contacts ?? [])];

    return {
      provider_id: this.id,
      provider_label: this.label,
      candidates: people
        .map((person) => this.toCandidate(person, input))
        .filter((candidate): candidate is PersonCandidate => Boolean(candidate)),
    };
  }
}
