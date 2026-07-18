import type {
  PeopleEnrichmentProvider,
  PeopleProviderInput,
  PeopleProviderResult,
} from "@/lib/leadgen/people-provider";
import {
  buildPeopleSearchPayload,
  buildProviderUnavailableResult,
  getRoleFitConfidence,
} from "@/lib/leadgen/people-provider-utils";
import type { PersonCandidate } from "@/lib/leadgen/types";

type ClayCandidate = {
  full_name?: string;
  name?: string;
  role_title?: string | null;
  title?: string | null;
  department?: string | null;
  linkedin_url?: string | null;
  work_email?: string | null;
  email?: string | null;
  phone?: string | null;
  telegram_url?: string | null;
  source_url?: string | null;
  confidence_score?: number | null;
  evidence?: string[];
  metadata?: Record<string, unknown>;
};

type ClayResponse = {
  candidates?: ClayCandidate[];
  people?: ClayCandidate[];
};

export class ClayPeopleProvider implements PeopleEnrichmentProvider {
  id = "clay";
  label = "Clay";

  private getWebhookUrl(): string | null {
    return process.env.CLAY_PEOPLE_WEBHOOK_URL?.trim() || null;
  }

  private getApiKey(): string | null {
    return process.env.CLAY_API_KEY?.trim() || null;
  }

  private toCandidate(
    rawCandidate: ClayCandidate,
    input: PeopleProviderInput,
  ): PersonCandidate | null {
    const fullName = rawCandidate.full_name ?? rawCandidate.name;

    if (!fullName) {
      return null;
    }

    const candidate: PersonCandidate = {
      full_name: fullName,
      role_title: rawCandidate.role_title ?? rawCandidate.title ?? null,
      department: rawCandidate.department ?? input.decisionMaker.department,
      linkedin_url: rawCandidate.linkedin_url ?? null,
      work_email: rawCandidate.work_email ?? rawCandidate.email ?? null,
      phone: rawCandidate.phone ?? null,
      source: this.label,
      confidence_score: 0,
      evidence: rawCandidate.evidence ?? [
        rawCandidate.source_url ? `Clay source: ${rawCandidate.source_url}` : null,
      ].filter((value): value is string => Boolean(value)),
      metadata: {
        provider_id: this.id,
        telegram_url: rawCandidate.telegram_url ?? null,
        source_url: rawCandidate.source_url ?? null,
        ...(rawCandidate.metadata ?? {}),
      },
    };

    return {
      ...candidate,
      confidence_score: getRoleFitConfidence({
        candidate,
        decisionMaker: input.decisionMaker,
        hasDirectContact: Boolean(
          candidate.work_email ||
            candidate.linkedin_url ||
            candidate.phone ||
            rawCandidate.telegram_url,
        ),
        baseConfidence: rawCandidate.confidence_score ?? 60,
      }),
    };
  }

  async findPeople(input: PeopleProviderInput): Promise<PeopleProviderResult> {
    const webhookUrl = this.getWebhookUrl();

    if (!webhookUrl) {
      return buildProviderUnavailableResult({
        providerId: this.id,
        providerLabel: this.label,
      });
    }

    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };
    const apiKey = this.getApiKey();

    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(buildPeopleSearchPayload(input)),
    });

    if (!response.ok) {
      return buildProviderUnavailableResult({
        providerId: this.id,
        providerLabel: this.label,
      });
    }

    const data = (await response.json()) as ClayResponse | ClayCandidate[];
    const rawCandidates = Array.isArray(data)
      ? data
      : [...(data.candidates ?? []), ...(data.people ?? [])];

    return {
      provider_id: this.id,
      provider_label: this.label,
      candidates: rawCandidates
        .map((candidate) => this.toCandidate(candidate, input))
        .filter((candidate): candidate is PersonCandidate => Boolean(candidate)),
    };
  }
}
