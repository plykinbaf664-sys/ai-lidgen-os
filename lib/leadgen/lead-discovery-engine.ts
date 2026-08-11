import {
  getDuplicateReason,
  getLeadCandidateIdentity,
  type CompanyIdentity,
} from "@/lib/leadgen/company-identity";
import { leadgenProductionConfig } from "@/lib/leadgen/production-config";
import { ContactEnrichmentEngine } from "@/lib/leadgen/contact-enrichment-engine";
import { resolveOfficialCompanyWebsite } from "@/lib/leadgen/public-contact-provider";
import { generateFirstEmailV2 } from "@/lib/leadgen/first-email-generator";
import { isEvidenceOnlyContact } from "@/lib/leadgen/contact-channel-ranking";
import {
  attachContactIntelligence,
  createUnresolvedContactIntelligence,
  evaluateAdaptiveContactIntelligence,
  isConfirmedOutreachEmail,
  isContactReadyPerson,
} from "@/lib/leadgen/adaptive-contact-intelligence";
import { discoverDecisionMaker } from "@/lib/leadgen/decision-maker-discovery";
import { prioritizeLead } from "@/lib/leadgen/lead-prioritization-engine";
import { assessOpportunity } from "@/lib/leadgen/opportunity-intelligence";
import { PeopleDiscoveryEngine } from "@/lib/leadgen/people-discovery-engine";
import type { SearchProvider } from "@/lib/leadgen/search/search-provider";
import type { SignalSearchMarket } from "@/lib/leadgen/signals/query-builder";
import { interpretSignal } from "@/lib/leadgen/signals/signal-interpreter";
import { runSignalPipeline } from "@/lib/leadgen/signals/signal-pipeline";
import { DISCOVERY_PAGES_PER_QUERY_PER_PASS } from "@/lib/leadgen/discovery-continuation";
import { getVerticalIcp, getVerticalProfile, type LeadgenVerticalId } from "@/lib/leadgen/verticals";
import type {
  CampaignInput,
  DecisionMakerProfile,
  LeadCandidate,
  LeadDiscoveryResult,
  LeadgenCampaign,
  LeadgenCompany,
  LeadgenContact,
  LeadgenEvent,
  LeadgenLead,
  LeadgenSignal,
  LeadReadinessStatus,
  LeadPriority,
  OpportunityAssessment,
  ContactDiscoveryResult,
  PeopleDiscoveryResult,
  SignalType,
} from "@/lib/leadgen/types";

type RunLeadDiscoveryInput = {
  campaignInput: CampaignInput;
  searchProvider: SearchProvider;
  leadTarget?: number;
  market?: SignalSearchMarket;
  knownCompanyIdentities?: CompanyIdentity[];
  knownRecipientEmails?: string[];
  knownPersonKeys?: string[];
  emailReadyTarget?: number;
  campaignId?: string;
  searchPageOffset?: number;
  runBudgetMs?: number;
};

type CandidateRecord = {
  candidate: LeadCandidate;
  signalType: SignalType;
  opportunity: OpportunityAssessment;
};

type EnrichedLeadRecord = {
  lead: LeadgenLead;
  company: LeadgenCompany;
  candidate: LeadCandidate;
  decisionMaker: DecisionMakerProfile;
  signals: LeadgenSignal[];
  peopleDiscovery: PeopleDiscoveryResult;
};

const MAX_SIGNALS_PER_RUN = 5;
const MAX_QUERIES_PER_SIGNAL = 20;
const MAX_RESULTS_PER_QUERY = 10;
const MIN_ENRICHMENT_OPPORTUNITY_SCORE = 50;
const DISCOVERY_ENRICHMENT_CONCURRENCY = 12;
const WEBSITE_RESOLUTION_CONCURRENCY = 12;
const DISCOVERY_ENRICHMENT_POOL_MULTIPLIER = 4;
const WEBSITE_RESOLUTION_TIMEOUT_MS = 25_000;
// Person enrichment is best-effort. It must not block an already verifiable
// company email from occupying one of the campaign's 50 delivery slots.
const PEOPLE_DISCOVERY_TIMEOUT_MS = 8_000;
const CONTACT_ENRICHMENT_TIMEOUT_MS = 40_000;
const DISCOVERY_DEADLINE_RESERVE_MS = 5_000;
const DISCOVERY_SEARCH_BUDGET_MS = 45_000;
// Keep enough headroom for an in-flight enrichment batch to settle before the
// 300-second serverless request ceiling.
const DISCOVERY_RUN_BUDGET_MS = 200_000;

async function resolveBeforeDeadline<T>({
  operation,
  deadlineAt,
  timeoutMs,
  fallback,
}: {
  operation: Promise<T>;
  deadlineAt: number;
  timeoutMs: number;
  fallback: T;
}): Promise<T> {
  const availableMs = Math.max(
    1,
    deadlineAt - Date.now() - DISCOVERY_DEADLINE_RESERVE_MS,
  );
  const effectiveTimeoutMs = Math.min(timeoutMs, availableMs);

  return new Promise<T>((resolve) => {
    let settled = false;
    const finish = (value: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      resolve(value);
    };
    const timeoutId = setTimeout(() => finish(fallback), effectiveTimeoutMs);

    operation.then(finish, () => finish(fallback));
  });
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(Math.max(concurrency, 1), items.length) },
      () => worker(),
    ),
  );

  return results;
}

function shouldDeferPeopleDiscovery(company: LeadgenCompany): boolean {
  if (!company.company_domain) {
    return true;
  }

  if (
    company.metadata.official_website_status === "confirmed" &&
    typeof company.metadata.official_website === "string"
  ) {
    // HH remains evidence for the commercial signal only. Once the official
    // website is resolved, people discovery must continue on that domain.
    return false;
  }

  const sourceCandidates = [
    company.source_url,
    company.metadata.signal_source_url,
  ];
  for (const source of sourceCandidates) {
    if (typeof source !== "string") continue;
    try {
      const hostname = new URL(source).hostname.toLowerCase();
      if (hostname === "hh.ru" || hostname.endsWith(".hh.ru")) {
        return true;
      }
    } catch {
      // Continue with the next known source.
    }
  }

  return false;
}

function getDeferredPeopleDiscoveryResult(): PeopleDiscoveryResult {
  return {
    primary_person: null,
    alternative_people: [],
    all_candidates: [],
    search_status: "provider_unavailable",
    providers_used: [],
    provider_diagnostics: [
      {
        provider_id: "deferred_until_official_domain",
        provider_label: "People Discovery",
        level: "info",
        message:
          "People search deferred while the best available company email is resolved; company email discovery remains active.",
      },
    ],
  };
}

function createRecordId(...parts: string[]): string {
  return parts
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9\u0430-\u044f\u0451]+/gi, "-")
    .replace(/(^-|-$)/g, "");
}

function getCandidateKey(candidate: LeadCandidate): string {
  return getLeadCandidateIdentity({
    company_name: candidate.company_name,
    company_domain: candidate.company_domain,
    region: candidate.source_country_hint,
  }).identityKey;
}

function getCompanyIdentityTokens(companyName: string): string[] {
  return companyName
    .toLowerCase()
    .split(/[^a-z0-9\u0430-\u044f\u0451]+/gi)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
    .filter(
      (token) =>
        ![
          "company",
          "group",
          "supply",
          "chain",
          "inc",
          "llc",
          "ltd",
          "corp",
          "компания",
          "группа",
        ].includes(token),
    );
}

function getDomainFromUrl(url: string | null | undefined): string {
  if (!url) {
    return "";
  }

  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function getCompanyOwnedSourceScore(candidate: LeadCandidate): number {
  const tokens = getCompanyIdentityTokens(candidate.company_name);
  const domainText = [
    candidate.company_domain ?? "",
    getDomainFromUrl(candidate.company_source_url),
  ]
    .join(" ")
    .toLowerCase();

  return tokens.filter((token) => domainText.includes(token)).length;
}

function shouldReplaceCandidateRecord(
  nextRecord: CandidateRecord,
  existingRecord: CandidateRecord,
): boolean {
  if (
    existingRecord.opportunity.should_create_lead &&
    !nextRecord.opportunity.should_create_lead
  ) {
    return false;
  }

  if (
    !existingRecord.opportunity.should_create_lead &&
    nextRecord.opportunity.should_create_lead
  ) {
    return true;
  }

  if (
    nextRecord.opportunity.opportunity_score >
    existingRecord.opportunity.opportunity_score
  ) {
    return true;
  }

  if (
    nextRecord.opportunity.opportunity_score ===
    existingRecord.opportunity.opportunity_score
  ) {
    return (
      getCompanyOwnedSourceScore(nextRecord.candidate) >
      getCompanyOwnedSourceScore(existingRecord.candidate)
    );
  }

  return false;
}

function shouldRunLeadWorkflow(record: CandidateRecord): boolean {
  return (
    hasVerifiedHiringEvent(record.candidate) ||
    record.opportunity.should_create_lead ||
    (record.opportunity.recommended_action === "run_enrichment" &&
      record.opportunity.opportunity_score >= MIN_ENRICHMENT_OPPORTUNITY_SCORE)
  );
}

function hasVerifiedHiringEvent(candidate: LeadCandidate): boolean {
  if (
    candidate.signal_type !== "HIRING_SIGNAL" ||
    candidate.commercial_signal?.type !== "hiring" ||
    candidate.commercial_signal.confidence < 60
  ) {
    return false;
  }

  try {
    const hostname = new URL(candidate.company_source_url).hostname.toLowerCase();
    return hostname === "hh.ru" || hostname.endsWith(".hh.ru");
  } catch {
    return false;
  }
}

function getOpportunityFinalDecision(opportunity: OpportunityAssessment): string {
  if (opportunity.should_create_lead) {
    return "lead_created";
  }

  if (
    opportunity.recommended_action === "run_enrichment" &&
    opportunity.opportunity_score >= MIN_ENRICHMENT_OPPORTUNITY_SCORE
  ) {
    return "lead_created_for_enrichment";
  }

  return "skipped_before_lead_creation";
}

function getSignalOrder(verticalId?: LeadgenVerticalId): SignalType[] {
  const prioritizedSignals = Object.entries(getVerticalIcp(verticalId).signalPriorities)
    .sort((left, right) => right[1] - left[1])
    .map(([signalType]) => signalType as SignalType);

  return [
    "HIRING_SIGNAL" as const,
    ...prioritizedSignals.filter(
      (signalType) =>
        signalType !== "HIRING_SIGNAL" && signalType !== "TRAFFIC_SIGNAL",
    ),
  ].slice(0, MAX_SIGNALS_PER_RUN);
}

function buildCampaign(
  campaignInput: CampaignInput,
  pipelineRunId: string,
  createdAt: string,
  campaignId?: string,
): LeadgenCampaign {
  return {
    id: campaignId ?? createRecordId("campaign", campaignInput.name, createdAt),
    pipeline_run_id: pipelineRunId,
    name: campaignInput.name,
    requested_by: campaignInput.requestedBy,
    status: "completed",
    icp_label: getVerticalIcp(campaignInput.verticalId).label,
    offer_label: getVerticalProfile(campaignInput.verticalId).offer,
    created_at: createdAt,
    vertical_id: campaignInput.verticalId,
  };
}

function getPrimarySignal(candidate: LeadCandidate): LeadgenSignal | null {
  return [...candidate.signals].sort(
    (left, right) => right.confidence_score - left.confidence_score,
  )[0] ?? null;
}

function getConfidenceScore(candidate: LeadCandidate): number {
  if (candidate.signals.length === 0) {
    return 0;
  }

  return Math.max(...candidate.signals.map((signal) => signal.confidence_score));
}

function interpretCandidate(candidate: LeadCandidate): LeadCandidate | null {
  const primarySignal = getPrimarySignal(candidate);

  if (!primarySignal) {
    return null;
  }

  const interpretation = interpretSignal({
    candidate,
    primarySignal,
  });

  return {
    ...candidate,
    ...interpretation,
  };
}

function buildCompany({
  campaign,
  candidate,
  signalType,
  decisionMaker,
  opportunity,
  createdAt,
  index,
}: {
  campaign: LeadgenCampaign;
  candidate: LeadCandidate;
  signalType: SignalType;
  decisionMaker?: DecisionMakerProfile;
  opportunity: OpportunityAssessment;
  createdAt: string;
  index: number;
}): LeadgenCompany {
  const primarySignal = getPrimarySignal(candidate);

  return {
    id: createRecordId(
      "company",
      campaign.id,
      candidate.company_domain ?? candidate.company_name,
      String(index + 1),
    ),
    pipeline_run_id: campaign.pipeline_run_id,
    campaign_id: campaign.id,
    company_name: candidate.company_name,
    company_domain: candidate.company_domain,
    company_segment: candidate.company_segment,
    source: "signal_pipeline",
    source_url: candidate.company_source_url || primarySignal?.source_url || null,
    source_label: primarySignal?.signal_source_label ?? null,
    signal_type: candidate.signal_type ?? signalType,
    discovery_query: candidate.discovery_query ?? null,
    matched_signal_count:
      candidate.matched_signal_count ?? candidate.signals.length,
    lead_score: candidate.lead_score,
    icp_fit_score: candidate.icp_fit_score,
    confidence_score: getConfidenceScore(candidate),
    country: null,
    industry: null,
    company_size: null,
    linkedin_url: null,
    metadata: {
      vertical_id: campaign.vertical_id ?? null,
      commercial_signal: candidate.commercial_signal ?? null,
      signal_source_urls: candidate.signals.map((signal) => signal.source_url),
      signal_types: [
        ...new Set(candidate.signals.map((signal) => signal.signal_type)),
      ],
      icp_fit_breakdown: candidate.icp_fit_breakdown,
      discovery_market: candidate.discovery_market,
      discovery_query_language: candidate.discovery_query_language,
      discovery_query_angle: candidate.discovery_query_angle,
      source_country_hint: candidate.source_country_hint,
      final_decision: getOpportunityFinalDecision(opportunity),
      rejection_reason: opportunity.should_create_lead
        ? null
        : opportunity.negative_factors[0] ??
          opportunity.missing_information[0] ??
          "Opportunity engine did not find a strong enough reason to create a lead.",
      skipped_reason: opportunity.should_create_lead
        ? null
        : opportunity.recommended_action,
      recommended_next_action: opportunity.recommended_action,
      signal_interpretation: {
        evidence_language: candidate.evidence_language,
        confirmed_facts: candidate.confirmed_facts,
        inferred_insights: candidate.inferred_insights,
        confidence_level: candidate.confidence_level,
        signal_summary: candidate.signal_summary,
        why_it_matters: candidate.why_it_matters,
        why_now: candidate.why_now,
        outreach_hypothesis: candidate.outreach_hypothesis,
        evidence_quality: candidate.evidence_quality,
        card_signal_title: candidate.card_signal_title,
        should_create_lead: candidate.should_create_lead,
      },
      opportunity,
      ...(decisionMaker
        ? {
            decision_maker: {
              primary_persona: decisionMaker.primary_persona,
              alternative_personas: decisionMaker.alternative_personas,
              department: decisionMaker.department,
              buying_role: decisionMaker.buying_role,
              influence_level: decisionMaker.influence_level,
              decision_authority: decisionMaker.decision_authority,
              business_problem_owner: decisionMaker.business_problem_owner,
              expected_pain: decisionMaker.expected_pain,
              expected_goal: decisionMaker.expected_goal,
              search_keywords: decisionMaker.search_keywords,
              priority: decisionMaker.priority,
              reasoning: decisionMaker.reasoning,
              confidence_score: decisionMaker.confidence_score,
            },
            source_reasoning: decisionMaker.source_reasoning,
          }
        : {}),
    },
    created_at: createdAt,
    updated_at: createdAt,
  };
}

function attachPeopleDiscoveryToCompany(
  company: LeadgenCompany,
  peopleDiscovery: PeopleDiscoveryResult,
): LeadgenCompany {
  return {
    ...company,
    metadata: {
      ...company.metadata,
      people_discovery: peopleDiscovery,
    },
  };
}

function attachLeadPriorityToCompany(
  company: LeadgenCompany,
  leadPriority: LeadPriority,
): LeadgenCompany {
  return {
    ...company,
    metadata: {
      ...company.metadata,
      lead_priority: leadPriority,
    },
  };
}

function attachContactDiscoveryToCompany(
  company: LeadgenCompany,
  contactDiscovery: ContactDiscoveryResult,
): LeadgenCompany {
  const contactReadiness = getContactReadinessStatus(contactDiscovery);
  const contactIntelligence = contactDiscovery.contacts
    .map((contact) => contact.metadata.contact_intelligence)
    .find(Boolean) ?? null;

  return {
    ...company,
    company_domain:
      contactDiscovery.resolved_official_domain ?? company.company_domain,
    metadata: {
      ...company.metadata,
      official_website: contactDiscovery.official_website,
      resolved_official_domain: contactDiscovery.resolved_official_domain,
      official_website_status: contactDiscovery.official_website_status,
      official_website_source_url:
        contactDiscovery.official_website_source_url,
      official_website_confidence:
        contactDiscovery.official_website_confidence,
      official_website_reason: contactDiscovery.official_website_reason,
      contact_discovery: {
        final_contact_readiness: contactReadiness,
        stop_reason:
          contactDiscovery.email_stop_reason ??
          (contactReadiness === "outreach_ready"
            ? "direct_email_found"
            : contactReadiness === "fallback_ready"
              ? "fallback_email_found"
              : contactReadiness === "enrichment_required"
                ? "email_search_incomplete"
                : "email_search_exhausted"),
        discovery_status: contactDiscovery.discovery_status,
        persona_search_status: contactDiscovery.persona_search_status,
        recommended_next_action: contactDiscovery.recommended_next_action,
        providers_used: contactDiscovery.providers_used,
        warnings: contactDiscovery.warnings,
        strategies_attempted: contactDiscovery.strategies_attempted,
        queries_executed: contactDiscovery.queries_executed ?? [],
        urls_inspected: contactDiscovery.urls_inspected,
        channels_found: contactDiscovery.channels_found,
        channels_rejected: contactDiscovery.channels_rejected,
        provider_errors: contactDiscovery.provider_errors,
        emails_extracted: contactDiscovery.emails_extracted ?? [],
        emails_rejected: contactDiscovery.emails_rejected ?? [],
        email_search_completed: contactDiscovery.email_search_completed ?? false,
        email_search_status: contactDiscovery.email_search_status ?? null,
        email_stop_reason: contactDiscovery.email_stop_reason ?? null,
        email_pages_audit: contactDiscovery.email_pages_audit,
        ranked_email_candidates: contactDiscovery.ranked_email_candidates,
        contact_forms_found: contactDiscovery.contact_forms_found,
        email_final_reason: contactDiscovery.email_final_reason,
        official_website_status: contactDiscovery.official_website_status,
        official_website_reason: contactDiscovery.official_website_reason,
        best_outreach_entry_id: contactDiscovery.best_outreach_entry?.id ?? null,
        fallback_entry_id: contactDiscovery.fallback_entry?.id ?? null,
        alternative_channel_ids: contactDiscovery.alternative_channels.map(
          (contact) => contact.id,
        ),
      },
      identity_profile: contactDiscovery.identity_profile,
      contact_intelligence: contactIntelligence,
    },
  };
}

function createHook(
  company: LeadgenCompany,
  candidate: LeadCandidate,
  decisionMaker: DecisionMakerProfile,
): string {
  return `${company.company_name}: ${candidate.why_now ?? candidate.signal_summary} Target persona: ${decisionMaker.primary_persona}.`;
}

function writeMessage(
  company: LeadgenCompany,
  candidate: LeadCandidate,
  decisionMaker: DecisionMakerProfile,
): string {
  return generateFirstEmailV2({
    companyName: company.company_name,
    website: company.company_domain ?? company.source_url,
    industry: company.industry ?? company.company_segment,
    decisionMakerRole: decisionMaker.primary_persona,
    growthSignal: [
      candidate.signal_type,
      candidate.signal_summary,
      candidate.why_now,
    ]
      .filter(Boolean)
      .join(" "),
    selectionReason: candidate.outreach_hypothesis,
    verticalId: company.metadata.vertical_id as LeadgenVerticalId | undefined,
  }).body;
}

function writeFollowUp(
  company: LeadgenCompany,
  candidate: LeadCandidate,
  decisionMaker: DecisionMakerProfile,
): string {
  return `Quick follow-up on ${company.company_name}. I reached out because ${candidate.why_now ?? "the public signal suggested a possible current workflow window"}. The relevant owner looks like ${decisionMaker.primary_persona}; the hypothesis is ${decisionMaker.expected_goal}`;
}

function writeDraftHypothesis(
  company: LeadgenCompany,
  candidate: LeadCandidate,
  decisionMaker: DecisionMakerProfile,
): string {
  return [
    "Draft only - not ready to send.",
    "No confirmed outreach channel has been selected yet.",
    writeMessage(company, candidate, decisionMaker),
  ].join(" ");
}

function buildLead({
  campaign,
  company,
  primarySignal,
  candidate,
  decisionMaker,
  createdAt,
}: {
  campaign: LeadgenCampaign;
  company: LeadgenCompany;
  primarySignal: LeadgenSignal;
  candidate: LeadCandidate;
  decisionMaker: DecisionMakerProfile;
  createdAt: string;
}): LeadgenLead {
  return {
    id: createRecordId("lead", campaign.id, company.id),
    pipeline_run_id: campaign.pipeline_run_id,
    campaign_id: campaign.id,
    company_id: company.id,
    company_name: company.company_name,
    company_domain: company.company_domain,
    company_segment: company.company_segment,
    contact_channel: null,
    contact_label: null,
    contact_value: null,
    company_source_url: company.source_url,
    lead_score: company.lead_score,
    icp_fit_score: company.icp_fit_score,
    signal_title: candidate.card_signal_title ?? primarySignal.signal_title,
    signal_detail: candidate.signal_summary ?? primarySignal.signal_detail,
    signal_source_label: primarySignal.signal_source_label,
    hook: `Draft hypothesis pending contact readiness. ${createHook(
      company,
      candidate,
      decisionMaker,
    )}`,
    message: writeDraftHypothesis(company, candidate, decisionMaker),
    follow_up:
      "Not ready to send - follow-up is disabled until a direct or fallback channel is confirmed.",
    status: "new",
    created_at: createdAt,
    updated_at: createdAt,
  };
}

function getContactReadinessStatus(
  contactDiscovery: ContactDiscoveryResult,
): LeadReadinessStatus {
  if (
    contactDiscovery.best_outreach_entry &&
    isConfirmedOutreachEmail(contactDiscovery.best_outreach_entry)
  ) {
    return "outreach_ready";
  }

  if (
    contactDiscovery.fallback_entry &&
    isConfirmedOutreachEmail(contactDiscovery.fallback_entry) &&
    contactDiscovery.fallback_entry.contact_type !== "company_website" &&
    contactDiscovery.fallback_entry.contact_type !== "no_contact_found"
  ) {
    return "fallback_ready";
  }

  if (contactDiscovery.identity_profile.person) {
    return "enrichment_required";
  }

  if (contactDiscovery.fallback_entry?.contact_type === "company_website") {
    return "enrichment_required";
  }

  return "provider_exhausted";
}

function getLeadStatusForReadiness(
  readinessStatus: LeadReadinessStatus,
): LeadgenLead["status"] {
  if (readinessStatus === "outreach_ready" || readinessStatus === "fallback_ready") {
    return "new";
  }

  if (
    readinessStatus === "provider_exhausted" ||
    readinessStatus === "rejected"
  ) {
    return "rejected";
  }

  return "paused";
}

function finalizeLeadOutput({
  lead,
  company,
  candidate,
  decisionMaker,
  contactDiscovery,
}: {
  lead: LeadgenLead;
  company: LeadgenCompany;
  candidate: LeadCandidate;
  decisionMaker: DecisionMakerProfile;
  contactDiscovery: ContactDiscoveryResult;
}): LeadgenLead {
  const readinessStatus = getContactReadinessStatus(contactDiscovery);
  const leadWithContact = applyBestAvailableEntryToLead(
    lead,
    contactDiscovery.best_outreach_entry ?? contactDiscovery.fallback_entry,
  );
  const isReadyToSend =
    readinessStatus === "outreach_ready" || readinessStatus === "fallback_ready";
  const readinessNote = `Contact readiness: ${readinessStatus}.`;

  return {
    ...leadWithContact,
    hook: isReadyToSend
      ? createHook(company, candidate, decisionMaker)
      : `Draft hypothesis only - not ready to send. ${createHook(
          company,
          candidate,
          decisionMaker,
        )}`,
    message: isReadyToSend
      ? writeMessage(company, candidate, decisionMaker)
      : `${readinessNote} Draft only - no confirmed sendable channel found. ${writeMessage(
          company,
          candidate,
          decisionMaker,
        )}`,
    follow_up: isReadyToSend
      ? writeFollowUp(company, candidate, decisionMaker)
      : `${readinessNote} Follow-up is not ready to send until contact enrichment confirms a usable channel.`,
    status: getLeadStatusForReadiness(readinessStatus),
  };
}

function getContactValue(contact: LeadgenContact): string | null {
  if (
    isEvidenceOnlyContact(contact) ||
    (contact.contact_type !== "work_email" &&
      contact.contact_type !== "generic_email")
  ) {
    return null;
  }

  return contact.email;
}

function getContactLabel(contact: LeadgenContact): string {
  if (contact.full_name && contact.role_title) {
    return `${contact.full_name}, ${contact.role_title}`;
  }

  if (contact.full_name) {
    return contact.full_name;
  }

  if (contact.role_title) {
    return contact.role_title;
  }

  const labels: Record<LeadgenContact["contact_type"], string> = {
    work_email: "Work email",
    linkedin: "LinkedIn",
    telegram: "Telegram",
    phone: "Phone",
    website_form: "Website/contact page",
    company_social: "Company social",
    confirmed_person: "Confirmed person",
    role_based_person: "Relevant role",
    generic_email: "Generic email",
    contact_form: "Contact form",
    social_profile: "Social profile",
    company_website: "Fallback: Company website",
    no_contact_found: "No contact found",
  };

  return labels[contact.contact_type];
}

function getContactChannel(
  contact: LeadgenContact,
): LeadgenLead["contact_channel"] {
  if (contact.contact_type === "generic_email") {
    return "general-email";
  }

  if (contact.contact_type === "work_email") {
    return "decision-maker";
  }

  if (contact.contact_type === "telegram") {
    return "telegram";
  }

  if (contact.contact_type === "phone") {
    return "phone";
  }

  if (
    contact.contact_type === "website_form" ||
    contact.contact_type === "contact_form" ||
    contact.contact_type === "company_website"
  ) {
    return "website-form";
  }

  if (contact.contact_type === "linkedin" || contact.linkedin_url) {
    return "linkedin";
  }

  if (
    contact.contact_type === "company_social" ||
    contact.contact_type === "social_profile"
  ) {
    return "social";
  }

  return null;
}

function applyBestAvailableEntryToLead(
  lead: LeadgenLead,
  bestAvailableEntry: LeadgenContact | null,
): LeadgenLead {
  if (
    !bestAvailableEntry ||
    bestAvailableEntry.contact_type === "no_contact_found" ||
    isEvidenceOnlyContact(bestAvailableEntry) ||
    !getContactValue(bestAvailableEntry)
  ) {
    return {
      ...lead,
      contact_channel: null,
      contact_label: "No contact found",
      contact_value: null,
    };
  }

  return {
    ...lead,
    contact_channel: getContactChannel(bestAvailableEntry),
    contact_label: getContactLabel(bestAvailableEntry),
    contact_value: getContactValue(bestAvailableEntry),
  };
}

function buildSignals({
  campaign,
  company,
  lead,
  candidate,
  createdAt,
}: {
  campaign: LeadgenCampaign;
  company: LeadgenCompany;
  lead: LeadgenLead;
  candidate: LeadCandidate;
  createdAt: string;
}): LeadgenSignal[] {
  return candidate.signals.map((signal, index) => ({
    ...signal,
    id: createRecordId(
      "signal",
      lead.id,
      signal.signal_type,
      String(index + 1),
    ),
    pipeline_run_id: campaign.pipeline_run_id,
    campaign_id: campaign.id,
    lead_id: lead.id,
    company_id: company.id,
    created_at: createdAt,
  }));
}

function buildEvent(
  pipelineRunId: string,
  campaignId: string,
  leadId: string | null,
  eventType: LeadgenEvent["event_type"],
  payload: LeadgenEvent["payload"],
  createdAt: string,
): LeadgenEvent {
  return {
    id: createRecordId("event", campaignId, leadId ?? "campaign", eventType),
    pipeline_run_id: pipelineRunId,
    campaign_id: campaignId,
    lead_id: leadId,
    event_type: eventType,
    payload,
    created_at: createdAt,
  };
}

async function discoverCandidates({
  searchProvider,
  leadTarget,
  market,
  knownCompanyIdentities,
  deadlineAt,
  searchPageOffset,
  verticalId,
}: {
  searchProvider: SearchProvider;
  leadTarget: number;
  market: SignalSearchMarket;
  knownCompanyIdentities: CompanyIdentity[];
  deadlineAt: number;
  searchPageOffset: number;
  verticalId?: LeadgenVerticalId;
}): Promise<{
  records: CandidateRecord[];
  stats: NonNullable<LeadDiscoveryResult["production_discovery_stats"]>;
}> {
  const candidateRecords = new Map<string, CandidateRecord>();
  let resultsReceived = 0;
  let candidatesViewed = 0;
  let previouslyDiscoveredSkipped = 0;
  let withinRunDuplicates = 0;
  const skipReasons: Record<string, number> = {};
  const skippedIdentityKeys = new Set<string>();
  const pageOffset = Math.max(0, searchPageOffset);
  const searchDeadlineAt = Math.min(
    deadlineAt - DISCOVERY_DEADLINE_RESERVE_MS,
    Date.now() + DISCOVERY_SEARCH_BUDGET_MS,
  );
  const enrichmentCandidateTarget = Math.min(
    leadgenProductionConfig.discoveryCandidateBudget,
    Math.max(leadTarget * DISCOVERY_ENRICHMENT_POOL_MULTIPLIER, 80),
  );
  const candidatesPerSignal = Math.min(
    leadgenProductionConfig.discoveryCandidateBudget,
    Math.max(leadTarget * 3, 60),
  );
  const queriesPerSignal = Math.min(
    MAX_QUERIES_PER_SIGNAL,
    Math.max(4, Math.ceil(leadTarget / 3)),
  );

  for (const signalType of getSignalOrder(verticalId)) {
    if (Date.now() >= searchDeadlineAt) break;
    const result = await runSignalPipeline({
      signalType,
      searchProvider,
      targetCandidates: candidatesPerSignal,
      maxQueries: queriesPerSignal,
      maxResultsPerQuery: MAX_RESULTS_PER_QUERY,
      maxPagesPerQuery: DISCOVERY_PAGES_PER_QUERY_PER_PASS,
      pageOffset,
      market,
      verticalId,
      deadlineAt: searchDeadlineAt,
    });
    resultsReceived += result.all_evidence.length;

    for (const candidate of result.candidates) {
      candidatesViewed += 1;
      if (candidatesViewed > leadgenProductionConfig.discoveryCandidateBudget) {
        break;
      }
      const interpretedCandidate = interpretCandidate(candidate);

      if (!interpretedCandidate) {
        continue;
      }

      const candidateKey = getCandidateKey(candidate);
      const identity = getLeadCandidateIdentity({
        company_name: candidate.company_name,
        company_domain: candidate.company_domain,
        region: candidate.source_country_hint,
      });
      const registryMatch = knownCompanyIdentities
        .map((known) => getDuplicateReason(identity, known))
        .find(Boolean);
      if (registryMatch) {
        skippedIdentityKeys.add(identity.identityKey);
        previouslyDiscoveredSkipped += 1;
        skipReasons[registryMatch] = (skipReasons[registryMatch] ?? 0) + 1;
        continue;
      }
      const opportunity = assessOpportunity({
        candidate: interpretedCandidate,
      });

      if (!candidateRecords.has(candidateKey)) {
        candidateRecords.set(candidateKey, {
          candidate: interpretedCandidate,
          signalType,
          opportunity,
        });
      } else {
        withinRunDuplicates += 1;
        skipReasons.duplicate_within_run =
          (skipReasons.duplicate_within_run ?? 0) + 1;
        const existingRecord = candidateRecords.get(candidateKey);
        const nextRecord = {
          candidate: interpretedCandidate,
          signalType,
          opportunity,
        };

        if (existingRecord && shouldReplaceCandidateRecord(nextRecord, existingRecord)) {
          candidateRecords.set(candidateKey, nextRecord);
        }
      }
    }
    if (candidatesViewed >= leadgenProductionConfig.discoveryCandidateBudget) {
      break;
    }
    if (
      [...candidateRecords.values()].filter(shouldRunLeadWorkflow).length >=
      enrichmentCandidateTarget
    ) {
      break;
    }
  }

  const records = [...candidateRecords.values()]
    .filter(shouldRunLeadWorkflow);
  return {
    records,
    stats: {
      results_received: resultsReceived,
      previously_discovered_skipped: previouslyDiscoveredSkipped,
      within_run_duplicates: withinRunDuplicates,
      new_unique_companies: records.length,
      lead_target: leadTarget,
      search_budget: leadgenProductionConfig.discoveryCandidateBudget,
      skip_reasons: skipReasons,
      skipped_identity_keys: [...skippedIdentityKeys],
    },
  };
}

export async function runLeadDiscoveryEngine({
  campaignInput,
  searchProvider,
  leadTarget = leadgenProductionConfig.dailyLeadLimit,
  market = "ru",
  knownCompanyIdentities = [],
  knownRecipientEmails = [],
  knownPersonKeys = [],
  emailReadyTarget = leadgenProductionConfig.campaignEmailTarget,
  campaignId,
  searchPageOffset = 0,
  runBudgetMs = DISCOVERY_RUN_BUDGET_MS,
}: RunLeadDiscoveryInput): Promise<LeadDiscoveryResult> {
  const deadlineAt = Date.now() + Math.max(10_000, runBudgetMs);
  const createdAt = new Date().toISOString();
  const pipelineRunId = createRecordId(
    "pipeline-run",
    campaignInput.name,
    createdAt,
  );
  const campaign = buildCampaign(
    campaignInput,
    pipelineRunId,
    createdAt,
    campaignId,
  );
  const discovery = await discoverCandidates({
    searchProvider,
    leadTarget,
    market,
    knownCompanyIdentities,
    deadlineAt,
    searchPageOffset,
    verticalId: campaignInput.verticalId,
  });
  const candidateRecords = discovery.records;
  const leadWorkflowCandidateRecords = candidateRecords;
  const decisionMakerRecommendations = leadWorkflowCandidateRecords.map(
    ({ candidate, signalType }) =>
      discoverDecisionMaker({
        candidate,
        signalType,
        preferredRoles: getVerticalProfile(campaignInput.verticalId).targetRoles,
      }),
  );
  const acceptedDecisionMakerByKey = new Map(
    leadWorkflowCandidateRecords.map((record, index) => [
      getCandidateKey(record.candidate),
      decisionMakerRecommendations[index],
    ]),
  );
  const unresolvedCompanies = candidateRecords.map((record, index) =>
    buildCompany({
      campaign,
      candidate: record.candidate,
      signalType: record.signalType,
      decisionMaker: acceptedDecisionMakerByKey.get(
        getCandidateKey(record.candidate),
      ),
      opportunity: record.opportunity,
      createdAt,
      index,
    }),
  );
  const peopleDiscoveryEngine = new PeopleDiscoveryEngine();
  const contactEnrichmentEngine = new ContactEnrichmentEngine();
  const knownEmailSet = new Set(
    knownRecipientEmails.map((email) => email.trim().toLowerCase()),
  );
  const discoveredEmailSet = new Set<string>();
  const emailReadyLeadIds = new Set<string>();
  const contactReadyLeadIds = new Set<string>();
  const processedLeadRecords: EnrichedLeadRecord[] = [];
  const contactDiscoveryResults: ContactDiscoveryResult[] = [];
  const enrichedCompaniesById = new Map<string, LeadgenCompany>();

  for (
    let offset = 0;
    offset < leadWorkflowCandidateRecords.length &&
    emailReadyLeadIds.size < emailReadyTarget &&
    Date.now() + DISCOVERY_DEADLINE_RESERVE_MS < deadlineAt;
    offset += DISCOVERY_ENRICHMENT_CONCURRENCY
  ) {
    const indexedBatch = leadWorkflowCandidateRecords
      .slice(offset, offset + DISCOVERY_ENRICHMENT_CONCURRENCY)
      .map((record, batchIndex) => ({
        record,
        index: offset + batchIndex,
      }));
    const resolvedCompanies = await mapWithConcurrency(
      indexedBatch,
      WEBSITE_RESOLUTION_CONCURRENCY,
      async ({ index }) => {
        const company = unresolvedCompanies[index];
        const resolution = await resolveBeforeDeadline({
          operation: resolveOfficialCompanyWebsite(company, searchProvider),
          deadlineAt,
          timeoutMs: WEBSITE_RESOLUTION_TIMEOUT_MS,
          fallback: {
            domain: null,
            website: null,
            sourceUrl: null,
            status: "not_found" as const,
            confidence: 0,
            reason: "official_site_resolution_timeout",
          },
        });

        return {
          ...company,
          company_domain: resolution.domain,
          source_url: resolution.website,
          source_label:
            resolution.status === "confirmed"
              ? "official company website"
              : null,
          metadata: {
            ...company.metadata,
            signal_source_url: company.source_url,
            signal_source_label: company.source_label,
            official_website: resolution.website,
            resolved_official_domain: resolution.domain,
            official_website_status: resolution.status,
            official_website_source_url: resolution.sourceUrl,
            official_website_confidence: resolution.confidence,
            official_website_reason: resolution.reason,
          },
        };
      },
    );
    const batchPeopleDiscovery = await mapWithConcurrency(
      indexedBatch,
      DISCOVERY_ENRICHMENT_CONCURRENCY,
      ({ index }, batchIndex) => {
        const company = resolvedCompanies[batchIndex];

        return shouldDeferPeopleDiscovery(company)
          ? Promise.resolve(getDeferredPeopleDiscoveryResult())
          : resolveBeforeDeadline({
              operation: peopleDiscoveryEngine.discoverPeople({
                company,
                decisionMaker: decisionMakerRecommendations[index],
              }),
              deadlineAt,
              timeoutMs: PEOPLE_DISCOVERY_TIMEOUT_MS,
              fallback: getDeferredPeopleDiscoveryResult(),
            });
      },
    );
    const batch = indexedBatch
      .map(({ record, index }, batchIndex): EnrichedLeadRecord | null => {
        const candidate = record.candidate;
        const baseCompany = resolvedCompanies[batchIndex];
        const peopleDiscovery = batchPeopleDiscovery[batchIndex];
        const company = attachPeopleDiscoveryToCompany(
          baseCompany,
          peopleDiscovery,
        );
        const primarySignal = getPrimarySignal(candidate);
        enrichedCompaniesById.set(company.id, company);

        if (!primarySignal) {
          return null;
        }

        const decisionMaker = decisionMakerRecommendations[index];
        const lead = buildLead({
          campaign,
          company,
          primarySignal,
          candidate,
          decisionMaker,
          createdAt,
        });

        return {
          lead,
          company,
          candidate,
          decisionMaker,
          peopleDiscovery,
          signals: buildSignals({
            campaign,
            company,
            lead,
            candidate,
            createdAt,
          }),
        };
      })
      .filter((record): record is EnrichedLeadRecord => Boolean(record));
    const completedBatch = (
      await mapWithConcurrency(
      batch,
      DISCOVERY_ENRICHMENT_CONCURRENCY,
      async (record) => {
        const result = await resolveBeforeDeadline({
          operation: contactEnrichmentEngine.enrichContacts({
            campaign,
            company: record.company,
            lead: record.lead,
            signals: record.signals,
            decisionMaker: record.decisionMaker,
            // Reuse the bounded People Discovery result. Passing a deferred
            // placeholder here disconnected known people from their public
            // corporate email and forced the pipeline toward generic inboxes.
            peopleDiscovery: record.peopleDiscovery,
            createdAt,
          }),
          deadlineAt,
          timeoutMs: CONTACT_ENRICHMENT_TIMEOUT_MS,
          fallback: null,
        });

        if (!result) return null;
        const intelligence = await resolveBeforeDeadline({
          operation: evaluateAdaptiveContactIntelligence({
            company: record.company,
            decisionMaker: record.decisionMaker,
            peopleDiscovery: record.peopleDiscovery,
            contactDiscovery: result,
            knownPersonKeys,
          }),
          deadlineAt,
          timeoutMs: 5_000,
          fallback: createUnresolvedContactIntelligence({
            decisionMaker: record.decisionMaker,
            peopleDiscovery: record.peopleDiscovery,
            stopReason: "contact_evaluation_deadline_reached",
          }),
        });
        return {
          record,
          result: attachContactIntelligence(result, intelligence),
        };
      },
    )
    ).filter(
      (
        completed,
      ): completed is {
        record: EnrichedLeadRecord;
        result: ContactDiscoveryResult;
      } => Boolean(completed),
    );
    const completedRecords = completedBatch.map(({ record }) => record);
    const batchResults = completedBatch.map(({ result }) => result);

    processedLeadRecords.push(...completedRecords);
    contactDiscoveryResults.push(...batchResults);
    for (const [resultIndex, result] of batchResults.entries()) {
      let hasNewContactReadyPerson = false;
      let hasNewConfirmedEmail = false;
      for (const contact of result.contacts) {
        if (!isConfirmedOutreachEmail(contact)) continue;
        const email = getContactValue(contact)?.trim().toLowerCase();
        if (
          email &&
          !knownEmailSet.has(email) &&
          !discoveredEmailSet.has(email)
        ) {
          discoveredEmailSet.add(email);
          hasNewConfirmedEmail = true;
          if (isContactReadyPerson(contact)) hasNewContactReadyPerson = true;
        }
      }
      if (hasNewContactReadyPerson) {
        contactReadyLeadIds.add(completedRecords[resultIndex].lead.id);
      }
      if (hasNewConfirmedEmail) {
        emailReadyLeadIds.add(completedRecords[resultIndex].lead.id);
      }
    }
  }

  const companies = processedLeadRecords.map(
    (record) => enrichedCompaniesById.get(record.company.id) ?? record.company,
  );
  const leads = processedLeadRecords.map((record, index) =>
    finalizeLeadOutput({
      lead: record.lead,
      company: record.company,
      candidate: record.candidate,
      decisionMaker: record.decisionMaker,
      contactDiscovery: contactDiscoveryResults[index],
    }),
  );
  const signals = processedLeadRecords.flatMap((record) => record.signals);
  const contacts = contactDiscoveryResults.flatMap((result) => result.contacts);
  const prioritizedCompaniesById = new Map(
    processedLeadRecords.map((record, index) => [
      record.company.id,
      attachLeadPriorityToCompany(
        attachContactDiscoveryToCompany(
          record.company,
          contactDiscoveryResults[index],
        ),
        prioritizeLead({
          candidate: record.candidate,
          company: record.company,
          decisionMaker: record.decisionMaker,
          bestOutreachEntry: contactDiscoveryResults[index].best_outreach_entry,
          fallbackEntry: contactDiscoveryResults[index].fallback_entry,
          personaSearchStatus:
            contactDiscoveryResults[index].persona_search_status,
        }),
      ),
    ]),
  );
  const prioritizedCompanies = companies.map(
    (company) => prioritizedCompaniesById.get(company.id) ?? company,
  );
  const events = [
    buildEvent(
      pipelineRunId,
      campaign.id,
      null,
      "campaign_started",
      { campaign_name: campaign.name },
      createdAt,
    ),
    ...leads.map((lead) =>
      buildEvent(
        pipelineRunId,
        campaign.id,
        lead.id,
        "lead_generated",
        { company_name: lead.company_name },
        createdAt,
      ),
    ),
  ];

  return {
    campaign,
    companies: prioritizedCompanies,
    contacts,
    leads,
    signals,
    events,
    production_discovery_stats: {
      ...discovery.stats,
      enriched_candidates_checked: processedLeadRecords.length,
      official_sites_found: companies.filter(
        (company) => company.metadata.official_website_status === "confirmed",
      ).length,
      enrichment_budget_exhausted:
        emailReadyLeadIds.size < emailReadyTarget &&
        processedLeadRecords.length < leadWorkflowCandidateRecords.length,
      email_ready_target: emailReadyTarget,
      email_ready_companies: emailReadyLeadIds.size,
      contact_ready_target: leadgenProductionConfig.contactReadyTarget,
      contact_ready_people: contactReadyLeadIds.size,
      unresolved_people: Math.max(0, processedLeadRecords.length - contactReadyLeadIds.size),
      search_page_offset: searchPageOffset,
    },
  };
}
