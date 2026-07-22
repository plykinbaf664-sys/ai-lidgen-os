import { NextResponse } from "next/server";
import { formatUnknownError } from "@/lib/leadgen/error-format";
import {
  getRegisteredCompanyIdentities,
  registerDiscoveredCompanies,
  touchDiscoveredCompanies,
} from "@/lib/leadgen/company-registry";
import { getDailyLeadStats } from "@/lib/leadgen/daily-lead-limit";
import { selectCampaignEmailTarget } from "@/lib/leadgen/email-target-selector";
import { runDiscoveryOrchestrator } from "@/lib/leadgen/discovery-orchestrator";
import { runLeadDiscoveryEngine } from "@/lib/leadgen/lead-discovery-engine";
import {
  createLeadgenSearchProvider,
  isLeadgenSearchProviderMode,
  type LeadgenSearchProviderMode,
} from "@/lib/leadgen/search/leadgen-search-provider";
import type { SignalSearchMarket } from "@/lib/leadgen/signals/query-builder";
import { savePipelineResult } from "@/lib/leadgen/storage";
import { getKnownRecipientEmails } from "@/lib/leadgen/outreach-storage";
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
  dryRun?: boolean;
};

const DEFAULT_PRODUCTION_MARKET: SignalSearchMarket = "ru";

function getDefaultProductionSearchProvider(): LeadgenSearchProviderMode {
  return isLeadgenSearchProviderMode(process.env.LEADGEN_SEARCH_PROVIDER)
    ? process.env.LEADGEN_SEARCH_PROVIDER
    : "auto";
}

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
  return formatUnknownError(error, "Не удалось выполнить поиск лидов.");
}

async function readRunRequest(request: Request): Promise<{
  campaignInput: CampaignInput;
  searchProviderMode: LeadgenSearchProviderMode;
  market: SignalSearchMarket;
  dryRun: boolean;
}> {
  const body = (await request.json().catch(() => ({}))) as RunLeadgenRequestBody;
  const market =
    body.market === "global" || body.market === "mixed" || body.market === "ru"
      ? body.market
      : DEFAULT_PRODUCTION_MARKET;
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
      : getDefaultProductionSearchProvider(),
    market,
    dryRun: body.dryRun === true,
  };
}
export async function POST(request: Request) {
  try {
    const { campaignInput, searchProviderMode, market, dryRun } =
      await readRunRequest(request);

    const [knownCompanyIdentities, knownRecipientEmails, dailyLeads] = await Promise.all([
      getRegisteredCompanyIdentities(),
      getKnownRecipientEmails(),
      getDailyLeadStats(),
    ]);
    if (!dryRun && dailyLeads.remaining === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Дневной лимит новых лидов исчерпан.",
          daily_leads: {
            created_today: dailyLeads.createdToday,
            daily_limit: dailyLeads.dailyLimit,
            remaining: 0,
          },
        },
        { status: 429 },
      );
    }
    const leadTarget = dryRun ? dailyLeads.dailyLimit : dailyLeads.remaining;
    const result = await runLeadDiscoveryEngine({
      campaignInput,
      searchProvider: createLeadgenSearchProvider({
        mode: searchProviderMode,
      }),
      leadTarget,
      market,
      knownCompanyIdentities,
      knownRecipientEmails,
    });
    const emailTargetSelection = selectCampaignEmailTarget({
      result,
      knownEmails: knownRecipientEmails,
      target: leadTarget,
    });
    const campaignResult = emailTargetSelection.result;
    const discovery = await runDiscoveryOrchestrator({
      signalFirstResult: campaignResult,
    });
    const leadReadyCandidateByCompanyId = new Map(
      discovery.candidates
        .filter((candidate) => candidate.raw_refs.company_id)
        .map((candidate) => [candidate.raw_refs.company_id, candidate]),
    );
    const enrichedResult = normalizeLeadgenStrings({
      ...campaignResult,
      campaign: {
        ...campaignResult.campaign,
        production_discovery_stats:
          campaignResult.production_discovery_stats,
      },
      companies: campaignResult.companies.map((company) => ({
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
      const selectedCompanyIds = new Set(
        enrichedResult.companies.map((company) => company.id),
      );
      await registerDiscoveredCompanies(
        result.companies.filter(
          (company) => !selectedCompanyIds.has(company.id),
        ),
      );
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
        lead_target: leadTarget,
        selected_emails: emailTargetSelection.selectedEmails.length,
      },
      daily_leads: {
        created_today: dailyLeads.createdToday,
        daily_limit: dailyLeads.dailyLimit,
        remaining_before_run: dailyLeads.remaining,
        remaining_after_run: Math.max(
          0,
          dailyLeads.remaining - emailTargetSelection.selectedEmails.length,
        ),
      },
      dry_run_audit: dryRun
        ? result.companies.map((company) => {
            const contactDiscovery =
              company.metadata.contact_discovery as
                | Record<string, unknown>
                | undefined;
            return {
              company_name: company.company_name,
              company_domain: company.company_domain,
              source_url: company.source_url,
              contact_count: result.contacts.filter(
                (contact) => contact.company_id === company.id,
              ).length,
              email_count: result.contacts.filter(
                (contact) =>
                  contact.company_id === company.id && Boolean(contact.email),
              ).length,
              email_search_status:
                contactDiscovery?.email_search_status ?? null,
              email_stop_reason: contactDiscovery?.email_stop_reason ?? null,
              urls_inspected_count: Array.isArray(
                contactDiscovery?.urls_inspected,
              )
                ? contactDiscovery.urls_inspected.length
                : 0,
              emails_extracted_count: Array.isArray(
                contactDiscovery?.emails_extracted,
              )
                ? contactDiscovery.emails_extracted.length
                : 0,
              emails_rejected_count: Array.isArray(
                contactDiscovery?.emails_rejected,
              )
                ? contactDiscovery.emails_rejected.length
                : 0,
              provider_errors: contactDiscovery?.provider_errors ?? [],
            };
          })
        : undefined,
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

