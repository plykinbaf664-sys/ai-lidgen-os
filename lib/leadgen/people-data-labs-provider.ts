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

type PeopleDataLabsPerson = {
  full_name?: string;
  job_title?: string | null;
  job_company_name?: string | null;
  job_company_website?: string | null;
  job_company_linkedin_url?: string | null;
  linkedin_url?: string | null;
  work_email?: string | null;
  mobile_phone?: string | null;
  phone_numbers?: string[];
  emails?: Array<{ address?: string | null; type?: string | null }>;
  countries?: string[];
};

type PeopleDataLabsResponse = {
  data?: PeopleDataLabsPerson[];
};

export class PeopleDataLabsProvider implements PeopleEnrichmentProvider {
  id = "people-data-labs";
  label = "People Data Labs";

  private getApiKey(): string | null {
    return process.env.PEOPLE_DATA_LABS_API_KEY?.trim() || null;
  }

  private buildSql(input: PeopleProviderInput): string {
    const domain = getCompanyDomain(input.company);
    const titleClauses = getTargetTitles(input.decisionMaker)
      .slice(0, 12)
      .map((title) => `job_title = '${title.replace(/'/g, "''")}'`);
    const companyClause = domain
      ? `job_company_website = '${domain.replace(/'/g, "''")}'`
      : `job_company_name = '${input.company.company_name.replace(/'/g, "''")}'`;

    return `SELECT * FROM person WHERE ${companyClause} AND (${titleClauses.join(
      " OR ",
    )})`;
  }

  private getWorkEmail(person: PeopleDataLabsPerson): string | null {
    return (
      person.work_email ??
      person.emails?.find((email) => email.type === "professional")?.address ??
      null
    );
  }

  private toCandidate(
    person: PeopleDataLabsPerson,
    input: PeopleProviderInput,
  ): PersonCandidate | null {
    if (!person.full_name) {
      return null;
    }

    const workEmail = this.getWorkEmail(person);
    const candidate: PersonCandidate = {
      full_name: person.full_name,
      role_title: person.job_title ?? null,
      department: input.decisionMaker.department,
      linkedin_url: person.linkedin_url ?? null,
      work_email: workEmail,
      phone: person.mobile_phone ?? person.phone_numbers?.[0] ?? null,
      source: this.label,
      confidence_score: 0,
      evidence: [
        person.job_title ? `PDL title: ${person.job_title}` : null,
        person.job_company_name ? `PDL company: ${person.job_company_name}` : null,
        person.job_company_website
          ? `PDL company website: ${person.job_company_website}`
          : null,
      ].filter((value): value is string => Boolean(value)),
      metadata: {
        provider_id: this.id,
        job_company_linkedin_url: person.job_company_linkedin_url ?? null,
        countries: person.countries ?? [],
      },
    };

    return {
      ...candidate,
      confidence_score: getRoleFitConfidence({
        candidate,
        decisionMaker: input.decisionMaker,
        hasDirectContact: Boolean(workEmail || candidate.linkedin_url || candidate.phone),
        baseConfidence: 58,
      }),
    };
  }

  async findPeople(input: PeopleProviderInput): Promise<PeopleProviderResult> {
    const apiKey = this.getApiKey();

    if (!apiKey) {
      return buildProviderUnavailableResult({
        providerId: this.id,
        providerLabel: this.label,
      });
    }

    const response = await fetch("https://api.peopledatalabs.com/v5/person/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify({
        sql: this.buildSql(input),
        size: 10,
      }),
    });

    if (!response.ok) {
      return buildProviderUnavailableResult({
        providerId: this.id,
        providerLabel: this.label,
      });
    }

    const data = (await response.json()) as PeopleDataLabsResponse;
    const candidates = (data.data ?? [])
      .map((person) => this.toCandidate(person, input))
      .filter((candidate): candidate is PersonCandidate => Boolean(candidate))
      .filter((candidate) => hasTargetRoleMatch(candidate, input.decisionMaker));

    return {
      provider_id: this.id,
      provider_label: this.label,
      candidates,
    };
  }
}
