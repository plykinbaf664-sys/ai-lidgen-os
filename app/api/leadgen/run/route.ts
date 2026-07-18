import { NextResponse } from "next/server";
import {
  getRegisteredCompanyIdentities,
  registerDiscoveredCompanies,
  touchDiscoveredCompanies,
} from "@/lib/leadgen/company-registry";
import { leadgenProductionConfig } from "@/lib/leadgen/production-config";
import { runDiscoveryOrchestrator } from "@/lib/leadgen/discovery-orchestrator";
import { runLeadDiscoveryEngine } from "@/lib/leadgen/lead-discovery-engine";
import {
  createLeadgenSearchProvider,
  isLeadgenSearchProviderMode,
  type LeadgenSearchProviderMode,
} from "@/lib/leadgen/search/leadgen-search-provider";
import type { SignalSearchMarket } from "@/lib/leadgen/signals/query-builder";
import { savePipelineResult } from "@/lib/leadgen/storage";
import { prepareTelegramNotification } from "@/lib/leadgen/telegram-notification";
import { normalizeLeadgenStrings, normalizeLeadgenText } from "@/lib/leadgen/text-normalization";
import {
  isFallbackEmailContact,
  isSendableEmailContact,
} from "@/lib/leadgen/contact-channel-ranking";
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
  targetCompanies?: number;
  dryRun?: boolean;
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
      (contact) =>
        contact.metadata.entry_role === "best_outreach_entry" &&
        isSendableEmailContact(contact),
    ) ??
    leadContacts.find((contact) => isSendableEmailContact(contact) && contact.is_primary) ??
    leadContacts.find(isSendableEmailContact) ??
    null
  );
}

function getFallbackEntry(
  lead: LeadgenLead,
  contacts: LeadgenContact[],
): LeadgenContact | null {
  const leadContacts = contacts.filter((contact) => contact.lead_id === lead.id);

  return (
    leadContacts.find(
      (contact) =>
        contact.metadata.entry_role === "fallback_entry" &&
        isFallbackEmailContact(contact),
    ) ??
    leadContacts.find(isFallbackEmailContact) ??
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
  targetCompanies?: number;
  dryRun: boolean;
}> {
  const body = (await request.json().catch(() => ({}))) as RunLeadgenRequestBody;
  const market =
    body.market === "global" || body.market === "mixed" || body.market === "ru"
      ? body.market
      : DEFAULT_PRODUCTION_MARKET;
  const targetCompanies =
    Number.isInteger(body.targetCompanies) && body.targetCompanies
      ? Math.min(
          Math.max(body.targetCompanies, 1),
          leadgenProductionConfig.campaignCompanyLimit,
        )
      : leadgenProductionConfig.campaignCompanyLimit;

  return {
    campaignInput: {
      name: normalizeLeadgenText(
        body.name?.trim() || "Тестовая кампания Leadgen OS",
        { source: "api.run.body.name" },
      ),
      requestedBy: normalizeLeadgenText(
        body.requestedBy?.trim() || "api/leadgen/run",
        { source: "api.run.body.requestedBy" },
      ),
    },
    searchProviderMode: isLeadgenSearchProviderMode(body.searchProvider)
      ? body.searchProvider
      : DEFAULT_PRODUCTION_SEARCH_PROVIDER,
    market,
    targetCompanies,
    dryRun: body.dryRun === true,
  };
}
export async function POST(request: Request) {
  try {
    const { campaignInput, searchProviderMode, market, targetCompanies, dryRun } =
      await readRunRequest(request);

    const knownCompanyIdentities = dryRun
      ? []
      : await getRegisteredCompanyIdentities();
    const result = await runLeadDiscoveryEngine({
      campaignInput,
      searchProvider: createLeadgenSearchProvider({
        mode: searchProviderMode,
      }),
      market,
      targetCompanies,
      knownCompanyIdentities,
    });
    const discovery = await runDiscoveryOrchestrator({
      signalFirstResult: result,
    });
    const leadReadyCandidateByCompanyId = new Map(
      discovery.candidates
        .filter((candidate) => candidate.raw_refs.company_id)
        .map((candidate) => [candidate.raw_refs.company_id, candidate]),
    );
    const enrichedResult = normalizeLeadgenStrings({
      ...result,
      campaign: {
        ...result.campaign,
        production_discovery_stats: result.production_discovery_stats,
      },
      companies: result.companies.map((company) => ({
        ...company,
        metadata: {
          ...company.metadata,
          lead_ready_candidate: leadReadyCandidateByCompanyId.get(company.id) ?? null,
        },
      })),
      lead_ready_candidates: discovery.candidates,
      discovery_metrics: discovery.metrics,
      discovery_diagnostics: discovery.diagnostics,
    }, "api.run.result");
    const companiesById = new Map(
      enrichedResult.companies.map((company) => [company.id, company]),
    );
    const notifications = normalizeLeadgenStrings(enrichedResult.leads.map((lead) => {
      const company = lead.company_id
        ? companiesById.get(lead.company_id)
        : undefined;
      const bestAvailableEntry = getPrimaryContact(lead, enrichedResult.contacts);
      const bestOutreachEntry = getBestOutreachEntry(lead, enrichedResult.contacts);
      const fallbackEntry = getFallbackEntry(lead, enrichedResult.contacts);
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
    }), "api.run.notifications");
    const saved = dryRun
      ? null
      : await savePipelineResult({ result: enrichedResult, notifications });
    if (!dryRun) {
      await touchDiscoveredCompanies(
        enrichedResult.production_discovery_stats?.skipped_identity_keys ?? [],
        enrichedResult.campaign.id,
      );
      await registerDiscoveredCompanies(enrichedResult.companies);
    }

    return NextResponse.json({
      success: true,
      pipeline_run_id: enrichedResult.campaign.pipeline_run_id,
      campaign: enrichedResult.campaign,
      companies: enrichedResult.companies,
      contacts: enrichedResult.contacts,
      leads: enrichedResult.leads,
      signals: enrichedResult.signals,
      events: enrichedResult.events,
      lead_ready_candidates: enrichedResult.lead_ready_candidates,
      discovery_metrics: enrichedResult.discovery_metrics,
      discovery_diagnostics: enrichedResult.discovery_diagnostics,
      production_discovery_stats: enrichedResult.production_discovery_stats,
      notifications,
      saved,
      dry_run: dryRun,
      search_settings: {
        provider: searchProviderMode,
        market,
        target_companies: targetCompanies ?? null,
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

