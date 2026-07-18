import type {
  PeopleEnrichmentProvider,
  PeopleProviderInput,
  PeopleProviderResult,
} from "@/lib/leadgen/people-provider";
import {
  buildProviderUnavailableResult,
  getCompanyDomain,
  getRoleFitConfidence,
  hasTargetRoleMatch,
} from "@/lib/leadgen/people-provider-utils";
import type { PersonCandidate } from "@/lib/leadgen/types";

type HunterEmail = {
  value?: string;
  type?: string | null;
  confidence?: number | null;
  first_name?: string | null;
  last_name?: string | null;
  position?: string | null;
  department?: string | null;
  linkedin?: string | null;
  phone_number?: string | null;
  sources?: Array<{ uri?: string | null; domain?: string | null }>;
};

type HunterResponse = {
  data?: {
    emails?: HunterEmail[];
  };
};

export class HunterPeopleProvider implements PeopleEnrichmentProvider {
  id = "hunter";
  label = "Hunter";

  private getApiKey(): string | null {
    return process.env.HUNTER_API_KEY?.trim() || null;
  }

  private toCandidate(
    email: HunterEmail,
    input: PeopleProviderInput,
  ): PersonCandidate | null {
    const fullName = [email.first_name, email.last_name].filter(Boolean).join(" ");

    if (!fullName || !email.value || email.type === "generic") {
      return null;
    }

    const sourceUrl =
      email.sources?.find((source) => source.uri)?.uri ??
      email.sources?.find((source) => source.domain)?.domain ??
      null;
    const candidate: PersonCandidate = {
      full_name: fullName,
      role_title: email.position ?? null,
      department: email.department ?? input.decisionMaker.department,
      linkedin_url: email.linkedin ?? null,
      work_email: email.value,
      phone: email.phone_number ?? null,
      source: this.label,
      confidence_score: 0,
      evidence: [
        email.position ? `Hunter position: ${email.position}` : null,
        email.confidence ? `Hunter confidence: ${email.confidence}` : null,
        sourceUrl ? `Hunter source: ${sourceUrl}` : null,
      ].filter((value): value is string => Boolean(value)),
      metadata: {
        provider_id: this.id,
        email_type: email.type ?? null,
        provider_confidence: email.confidence ?? null,
        source_url: sourceUrl,
      },
    };

    return {
      ...candidate,
      confidence_score: getRoleFitConfidence({
        candidate,
        decisionMaker: input.decisionMaker,
        hasDirectContact: true,
        baseConfidence: Math.min(email.confidence ?? 55, 78),
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
          ? "HUNTER_API_KEY is not configured."
          : "Company domain is missing; Hunter domain search requires a domain.",
      });
    }

    const url = new URL("https://api.hunter.io/v2/domain-search");
    url.searchParams.set("domain", domain);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("limit", "20");

    const response = await fetch(url);

    if (!response.ok) {
      const responseText = await response.text().catch(() => "");

      return buildProviderUnavailableResult({
        providerId: this.id,
        providerLabel: this.label,
        reason: `Hunter domain search failed with ${response.status}: ${responseText.slice(0, 240)}`,
      });
    }

    const data = (await response.json()) as HunterResponse;
    const candidates = (data.data?.emails ?? [])
      .map((email) => this.toCandidate(email, input))
      .filter((candidate): candidate is PersonCandidate => Boolean(candidate))
      .filter((candidate) => hasTargetRoleMatch(candidate, input.decisionMaker))
      .slice(0, 10);

    return {
      provider_id: this.id,
      provider_label: this.label,
      candidates,
    };
  }
}
