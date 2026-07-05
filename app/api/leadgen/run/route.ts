import { NextResponse } from "next/server";
import { runLeadDiscoveryEngine } from "@/lib/leadgen/lead-discovery-engine";
import {
  createLeadgenSearchProvider,
  isLeadgenSearchProviderMode,
  type LeadgenSearchProviderMode,
} from "@/lib/leadgen/search/leadgen-search-provider";
import type { SignalSearchMarket } from "@/lib/leadgen/signals/query-builder";
import { savePipelineResult } from "@/lib/leadgen/storage";
import { prepareTelegramNotification } from "@/lib/leadgen/telegram-notification";
import type {
  CampaignInput,
  DecisionMakerProfile,
  LeadgenCompany,
  LeadgenContact,
  LeadgenLead,
  LeadPriority,
  OpportunityAssessment,
  PeopleDiscoveryResult,
  PersonaSearchStatus,
} from "@/lib/leadgen/types";

type RunLeadgenRequestBody = Partial<CampaignInput> & {
  searchProvider?: string;
  market?: string;
};

const DEFAULT_PRODUCTION_SEARCH_PROVIDER: LeadgenSearchProviderMode = "yandex";
const DEFAULT_PRODUCTION_MARKET: SignalSearchMarket = "ru";

function getDecisionMakerProfile(
  company: LeadgenCompany | undefined,
): DecisionMakerProfile | null {
  const rawDecisionMaker = company?.metadata.decision_maker;

  if (
    typeof rawDecisionMaker !== "object" ||
    rawDecisionMaker === null ||
    Array.isArray(rawDecisionMaker)
  ) {
    return null;
  }

  return rawDecisionMaker as DecisionMakerProfile;
}

function getPeopleDiscoveryResult(
  company: LeadgenCompany | undefined,
): PeopleDiscoveryResult | null {
  const rawPeopleDiscovery = company?.metadata.people_discovery;

  if (
    typeof rawPeopleDiscovery !== "object" ||
    rawPeopleDiscovery === null ||
    Array.isArray(rawPeopleDiscovery)
  ) {
    return null;
  }

  return rawPeopleDiscovery as PeopleDiscoveryResult;
}

function getLeadPriority(company: LeadgenCompany | undefined): LeadPriority | null {
  const rawLeadPriority = company?.metadata.lead_priority;

  if (
    typeof rawLeadPriority !== "object" ||
    rawLeadPriority === null ||
    Array.isArray(rawLeadPriority)
  ) {
    return null;
  }

  return rawLeadPriority as LeadPriority;
}

function getOpportunityAssessment(
  company: LeadgenCompany | undefined,
): OpportunityAssessment | null {
  const rawOpportunity = company?.metadata.opportunity;

  if (
    typeof rawOpportunity !== "object" ||
    rawOpportunity === null ||
    Array.isArray(rawOpportunity)
  ) {
    return null;
  }

  return rawOpportunity as OpportunityAssessment;
}

function getPrimaryContact(
  lead: LeadgenLead,
  contacts: LeadgenContact[],
): LeadgenContact | null {
  const leadContacts = contacts.filter((contact) => contact.lead_id === lead.id);

  return (
    leadContacts.find((contact) => contact.is_primary) ??
    leadContacts[0] ??
    null
  );
}

function getBestOutreachEntry(
  lead: LeadgenLead,
  contacts: LeadgenContact[],
): LeadgenContact | null {
  const leadContacts = contacts.filter((contact) => contact.lead_id === lead.id);

  return (
    leadContacts.find(
      (contact) => contact.metadata.entry_role === "best_outreach_entry",
    ) ??
    leadContacts.find(
      (contact) =>
        contact.contact_type !== "company_website" &&
        contact.contact_type !== "no_contact_found" &&
        contact.is_primary,
    ) ??
    leadContacts.find(
      (contact) =>
        contact.contact_type !== "company_website" &&
        contact.contact_type !== "no_contact_found",
    ) ??
    null
  );
}

function getFallbackEntry(
  lead: LeadgenLead,
  contacts: LeadgenContact[],
): LeadgenContact | null {
  const leadContacts = contacts.filter((contact) => contact.lead_id === lead.id);

  return (
    leadContacts.find((contact) => contact.metadata.entry_role === "fallback_entry") ??
    leadContacts.find((contact) => contact.contact_type === "company_website") ??
    null
  );
}

function getPersonaSearchStatus(
  contact: LeadgenContact | null,
): PersonaSearchStatus | undefined {
  const rawStatus = contact?.metadata.persona_search_status;

  return typeof rawStatus === "string"
    ? (rawStatus as PersonaSearchStatus)
    : undefined;
}

function formatRouteError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error !== null) {
    const maybeError = error as {
      message?: unknown;
      code?: unknown;
      details?: unknown;
      hint?: unknown;
    };

    return JSON.stringify({
      message: maybeError.message,
      code: maybeError.code,
      details: maybeError.details,
      hint: maybeError.hint,
    });
  }

  return String(error);
}

async function readRunRequest(request: Request): Promise<{
  campaignInput: CampaignInput;
  searchProviderMode: LeadgenSearchProviderMode;
  market: SignalSearchMarket;
}> {
  const body = (await request.json().catch(() => ({}))) as RunLeadgenRequestBody;
  const market =
    body.market === "global" || body.market === "mixed" || body.market === "ru"
      ? body.market
      : DEFAULT_PRODUCTION_MARKET;

  return {
    campaignInput: {
      name: body.name?.trim() || "\u0422\u0435\u0441\u0442\u043e\u0432\u0430\u044f \u043a\u0430\u043c\u043f\u0430\u043d\u0438\u044f Leadgen OS",
      requestedBy: body.requestedBy?.trim() || "api/leadgen/run",
    },
    searchProviderMode: isLeadgenSearchProviderMode(body.searchProvider)
      ? body.searchProvider
      : DEFAULT_PRODUCTION_SEARCH_PROVIDER,
    market,
  };
}
export async function POST(request: Request) {
  try {
    const { campaignInput, searchProviderMode, market } = await readRunRequest(request);

    const result = await runLeadDiscoveryEngine({
      campaignInput,
      searchProvider: createLeadgenSearchProvider({
        mode: searchProviderMode,
      }),
      market,
    });
    const companiesById = new Map(
      result.companies.map((company) => [company.id, company]),
    );
    const notifications = result.leads.map((lead) => {
      const company = lead.company_id
        ? companiesById.get(lead.company_id)
        : undefined;
      const bestAvailableEntry = getPrimaryContact(lead, result.contacts);
      const bestOutreachEntry = getBestOutreachEntry(lead, result.contacts);
      const fallbackEntry = getFallbackEntry(lead, result.contacts);
      const opportunity = getOpportunityAssessment(company);
      const notification = prepareTelegramNotification(lead, {
        decisionMaker: getDecisionMakerProfile(company),
        peopleDiscovery: getPeopleDiscoveryResult(company),
        bestAvailableEntry,
        bestOutreachEntry,
        fallbackEntry,
        opportunity,
        personaSearchStatus: getPersonaSearchStatus(
          bestOutreachEntry ?? fallbackEntry ?? bestAvailableEntry,
        ),
        leadPriority: getLeadPriority(company),
      });

      return notification;
    });
    const saved = await savePipelineResult({ result, notifications });

    return NextResponse.json({
      success: true,
      pipeline_run_id: result.campaign.pipeline_run_id,
      campaign: result.campaign,
      companies: result.companies,
      contacts: result.contacts,
      leads: result.leads,
      signals: result.signals,
      events: result.events,
      notifications,
      saved,
      search_settings: {
        provider: searchProviderMode,
        market,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: formatRouteError(error),
      },
      { status: 500 },
    );
  }
}
