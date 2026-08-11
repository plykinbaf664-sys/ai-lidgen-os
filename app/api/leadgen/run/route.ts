import { NextResponse } from "next/server";
import { formatUnknownError } from "@/lib/leadgen/error-format";
import {
  getCompanyIdentity,
  getDuplicateReason,
} from "@/lib/leadgen/company-identity";
import {
  getRegisteredCompanyIdentities,
  registerDiscoveredCompanies,
  touchDiscoveredCompanies,
} from "@/lib/leadgen/company-registry";
import { getDailyLeadStats } from "@/lib/leadgen/daily-lead-limit";
import { selectCampaignEmailTarget } from "@/lib/leadgen/email-target-selector";
import {
  DISCOVERY_PASS_BUDGET_MS,
  DISCOVERY_PAGES_PER_QUERY_PER_PASS,
  getDiscoveryPageOffset,
  getDiscoveryPassNumber,
  mergeDiscoveryPassStats,
} from "@/lib/leadgen/discovery-continuation";
import { runDiscoveryOrchestrator } from "@/lib/leadgen/discovery-orchestrator";
import { runLeadDiscoveryEngine } from "@/lib/leadgen/lead-discovery-engine";
import {
  createLeadgenSearchProvider,
  isLeadgenSearchProviderMode,
  type LeadgenSearchProviderMode,
} from "@/lib/leadgen/search/leadgen-search-provider";
import type { SignalSearchMarket } from "@/lib/leadgen/signals/query-builder";
import {
  appendPipelineResult,
  getCampaignDetails,
  savePipelineResult,
} from "@/lib/leadgen/storage";
import {
  getKnownContactedPersonKeys,
  getKnownRecipientEmails,
  syncOutreachQueue,
} from "@/lib/leadgen/outreach-storage";
import {
  isConfirmedOutreachEmail,
  isContactReadyPerson,
} from "@/lib/leadgen/adaptive-contact-intelligence";
import { leadgenProductionConfig } from "@/lib/leadgen/production-config";
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
  LeadDiscoveryResult,
  LeadPriority,
  OpportunityAssessment,
  PeopleDiscoveryResult,
  PersonaSearchStatus,
} from "@/lib/leadgen/types";
import { isLeadgenVerticalId } from "@/lib/leadgen/verticals";

type RunLeadgenRequestBody = Partial<CampaignInput> & {
  searchProvider?: string;
  market?: string;
  dryRun?: boolean;
  campaignId?: string;
};

export const maxDuration = 300;

const DEFAULT_PRODUCTION_MARKET: SignalSearchMarket = "ru";

function getCompanyWebsiteForIdentity(company: LeadgenCompany): string | null {
  const website = company.metadata.official_website;
  return typeof website === "string" ? website : company.source_url;
}

function excludeExistingCampaignCompanies({
  result,
  existingCompanies,
}: {
  result: LeadDiscoveryResult;
  existingCompanies: LeadgenCompany[];
}): LeadDiscoveryResult {
  if (existingCompanies.length === 0 || result.companies.length === 0) {
    return result;
  }

  const existingIds = new Set(existingCompanies.map((company) => company.id));
  const existingIdentities = existingCompanies.map((company) =>
    getCompanyIdentity({
      company_name: company.company_name,
      company_domain: company.company_domain,
      website: getCompanyWebsiteForIdentity(company),
      region: company.country,
    }),
  );
  const duplicateCompanyIds = new Set(
    result.companies
      .filter((company) => {
        if (existingIds.has(company.id)) return true;
        const identity = getCompanyIdentity({
          company_name: company.company_name,
          company_domain: company.company_domain,
          website: getCompanyWebsiteForIdentity(company),
          region: company.country,
        });
        return existingIdentities.some((existing) =>
          Boolean(getDuplicateReason(identity, existing)),
        );
      })
      .map((company) => company.id),
  );
  if (duplicateCompanyIds.size === 0) return result;

  const duplicateLeadIds = new Set(
    result.leads
      .filter((lead) =>
        lead.company_id ? duplicateCompanyIds.has(lead.company_id) : false,
      )
      .map((lead) => lead.id),
  );

  return {
    ...result,
    companies: result.companies.filter(
      (company) => !duplicateCompanyIds.has(company.id),
    ),
    leads: result.leads.filter((lead) => !duplicateLeadIds.has(lead.id)),
    contacts: result.contacts.filter(
      (contact) => !duplicateLeadIds.has(contact.lead_id),
    ),
    signals: result.signals.filter(
      (signal) => !duplicateLeadIds.has(signal.lead_id),
    ),
    events: result.events.filter(
      (event) => !event.lead_id || !duplicateLeadIds.has(event.lead_id),
    ),
  };
}

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
  campaignId: string | null;
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
      verticalId: isLeadgenVerticalId(body.verticalId) ? body.verticalId : undefined,
    },
    searchProviderMode: isLeadgenSearchProviderMode(body.searchProvider)
      ? body.searchProvider
      : getDefaultProductionSearchProvider(),
    market,
    dryRun: body.dryRun === true,
    campaignId:
      typeof body.campaignId === "string" && body.campaignId.trim()
        ? body.campaignId.trim()
        : null,
  };
}
export async function POST(request: Request) {
  try {
    const {
      campaignInput: requestedCampaignInput,
      searchProviderMode,
      market,
      dryRun,
      campaignId,
    } =
      await readRunRequest(request);

    const existingCampaign = campaignId
      ? await getCampaignDetails(campaignId)
      : null;
    if (campaignId && !existingCampaign) {
      return NextResponse.json(
        { success: false, error: "Кампания для продолжения поиска не найдена." },
        { status: 404 },
      );
    }
    const campaignInput = existingCampaign
      ? {
          name: existingCampaign.campaign.name,
          requestedBy: existingCampaign.campaign.requested_by,
          verticalId: existingCampaign.campaign.vertical_id,
        }
      : requestedCampaignInput;
    const storedContactReadyEmails = new Set(
      (existingCampaign?.contacts ?? [])
        .filter(isContactReadyPerson)
        .map((contact) => contact.email?.trim().toLowerCase())
        .filter((email): email is string => Boolean(email)),
    ).size;
    const storedConfirmedEmails = new Set(
      (existingCampaign?.contacts ?? [])
        .filter(isConfirmedOutreachEmail)
        .map((contact) => contact.email?.trim().toLowerCase())
        .filter((email): email is string => Boolean(email)),
    ).size;
    const storedStats =
      existingCampaign?.campaign.production_discovery_stats ?? null;
    const previousStats = storedStats
      ? {
          ...storedStats,
          // Persisted rows are authoritative. A client can disconnect after a
          // pass and old aggregate diagnostics may otherwise overstate what
          // was actually appended to the campaign.
          new_unique_emails: storedConfirmedEmails,
          new_unique_companies: storedConfirmedEmails,
          email_ready_companies: storedConfirmedEmails,
          email_ready_target: leadgenProductionConfig.campaignEmailTarget,
          contact_ready_people: storedContactReadyEmails,
          target_reached: storedConfirmedEmails >= leadgenProductionConfig.campaignEmailTarget,
        }
      : null;
    const leadTarget = leadgenProductionConfig.campaignEmailTarget;
    const alreadyFound = existingCampaign
      ? storedConfirmedEmails
      : previousStats?.email_ready_companies ?? previousStats?.new_unique_emails ?? 0;
    const passTarget = Math.max(1, leadTarget - alreadyFound);
    const passNumber = getDiscoveryPassNumber(previousStats);
    const searchPageOffset = getDiscoveryPageOffset(
      previousStats,
      DISCOVERY_PAGES_PER_QUERY_PER_PASS,
    );

    const [knownCompanyIdentities, knownRecipientEmails, knownPersonKeys, dailyLeads] = await Promise.all([
      getRegisteredCompanyIdentities(),
      getKnownRecipientEmails(),
      getKnownContactedPersonKeys(),
      getDailyLeadStats(),
    ]);
    const result = await runLeadDiscoveryEngine({
      campaignInput,
      searchProvider: createLeadgenSearchProvider({
        mode: searchProviderMode,
      }),
      leadTarget: leadgenProductionConfig.campaignCompanyLimit,
      emailReadyTarget: passTarget,
      market,
      knownCompanyIdentities,
      knownRecipientEmails,
      knownPersonKeys,
      campaignId: campaignId ?? undefined,
      searchPageOffset,
      runBudgetMs: DISCOVERY_PASS_BUDGET_MS,
    });
    const deduplicatedResult = excludeExistingCampaignCompanies({
      result,
      existingCompanies: existingCampaign?.companies ?? [],
    });
    const emailTargetSelection = selectCampaignEmailTarget({
      result: deduplicatedResult,
      knownEmails: knownRecipientEmails,
      knownPersonKeys,
      target: passTarget,
    });
    const campaignResult = emailTargetSelection.result;
    const aggregateStats = mergeDiscoveryPassStats({
      previous: previousStats,
      pass: campaignResult.production_discovery_stats!,
      target: leadTarget,
      pagesPerPass: DISCOVERY_PAGES_PER_QUERY_PER_PASS,
    });
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
        production_discovery_stats: aggregateStats,
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
      : campaignId
        ? await appendPipelineResult({ result: enrichedResult, notifications })
        : await savePipelineResult({ result: enrichedResult, notifications });
    if (!dryRun) {
      await touchDiscoveredCompanies(
        enrichedResult.production_discovery_stats?.skipped_identity_keys ?? [],
        enrichedResult.campaign.id,
      );
      await registerDiscoveredCompanies(result.companies);
      await syncOutreachQueue(enrichedResult.campaign.id);
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
        pass_number: passNumber,
        page_offset: searchPageOffset,
      },
      continuation: {
        available: aggregateStats.continuation_available === true,
        target: leadTarget,
        found: aggregateStats.new_unique_emails ?? 0,
        passes_completed: aggregateStats.passes_completed ?? passNumber,
        next_page_offset: aggregateStats.next_page_offset ?? null,
        search_exhausted: aggregateStats.search_exhausted === true,
      },
      daily_leads: {
        created_today: dailyLeads.createdToday,
        daily_limit: dailyLeads.dailyLimit,
        remaining_before_run: dailyLeads.remaining,
        remaining_after_run: Math.max(
          0,
          dailyLeads.remaining - enrichedResult.companies.length,
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

