import { NextResponse } from "next/server";
import { runLeadDiscoveryEngine } from "@/lib/leadgen/lead-discovery-engine";
import { TavilySearchProvider } from "@/lib/leadgen/search/tavily-provider";
import { savePipelineResult } from "@/lib/leadgen/storage";
import { prepareTelegramNotification } from "@/lib/leadgen/telegram-notification";
import type {
  CampaignInput,
  DecisionMakerProfile,
  LeadgenCompany,
  LeadgenContact,
  LeadgenLead,
  PeopleDiscoveryResult,
  PersonaSearchStatus,
} from "@/lib/leadgen/types";

type RunLeadgenRequestBody = Partial<CampaignInput>;

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

async function readCampaignInput(request: Request): Promise<CampaignInput> {
  const body = (await request.json().catch(() => ({}))) as RunLeadgenRequestBody;

  return {
    name: body.name?.trim() || "Тестовая кампания Leadgen OS",
    requestedBy: body.requestedBy?.trim() || "api/leadgen/run",
  };
}

export async function POST(request: Request) {
  try {
    const campaignInput = await readCampaignInput(request);

    if (!process.env.TAVILY_API_KEY) {
      return NextResponse.json(
        {
          success: false,
          error:
            "TAVILY_API_KEY is not configured. Real lead discovery was not started and no mock campaign was created.",
        },
        { status: 500 },
      );
    }

    const result = await runLeadDiscoveryEngine({
      campaignInput,
      searchProvider: new TavilySearchProvider(),
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

      return prepareTelegramNotification(lead, {
        decisionMaker: getDecisionMakerProfile(company),
        peopleDiscovery: getPeopleDiscoveryResult(company),
        bestAvailableEntry,
        bestOutreachEntry,
        fallbackEntry,
        personaSearchStatus: getPersonaSearchStatus(
          bestOutreachEntry ?? fallbackEntry ?? bestAvailableEntry,
        ),
      });
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
