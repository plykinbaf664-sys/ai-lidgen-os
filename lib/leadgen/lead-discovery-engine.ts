import { leadgenConfig } from "@/lib/leadgen/config";
import { ContactEnrichmentEngine } from "@/lib/leadgen/contact-enrichment-engine";
import { discoverDecisionMaker } from "@/lib/leadgen/decision-maker-discovery";
import { prioritizeLead } from "@/lib/leadgen/lead-prioritization-engine";
import { assessOpportunity } from "@/lib/leadgen/opportunity-intelligence";
import { PeopleDiscoveryEngine } from "@/lib/leadgen/people-discovery-engine";
import type { SearchProvider } from "@/lib/leadgen/search/search-provider";
import { interpretSignal } from "@/lib/leadgen/signals/signal-interpreter";
import { runSignalPipeline } from "@/lib/leadgen/signals/signal-pipeline";
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
  LeadPriority,
  OpportunityAssessment,
  ContactDiscoveryResult,
  PeopleDiscoveryResult,
  SignalType,
} from "@/lib/leadgen/types";

type RunLeadDiscoveryInput = {
  campaignInput: CampaignInput;
  searchProvider: SearchProvider;
  targetCompanies?: number;
};

type CandidateRecord = {
  candidate: LeadCandidate;
  signalType: SignalType;
  opportunity: OpportunityAssessment;
};

const DEFAULT_TARGET_COMPANIES = 10;
const MAX_SIGNALS_PER_RUN = 3;
const TARGET_PER_SIGNAL = 12;
const MAX_QUERIES_PER_SIGNAL = 10;
const MAX_RESULTS_PER_QUERY = 10;

function createRecordId(...parts: string[]): string {
  return parts
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9\u0430-\u044f\u0451]+/gi, "-")
    .replace(/(^-|-$)/g, "");
}

function normalizeCompanyName(companyName: string): string {
  return companyName
    .toLowerCase()
    .replace(/[^a-z0-9\u0430-\u044f\u0451]+/gi, "-")
    .replace(/(^-|-$)/g, "");
}

function getCandidateKey(candidate: LeadCandidate): string {
  return `name:${normalizeCompanyName(candidate.company_name)}`;
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

function getSignalOrder(): SignalType[] {
  return Object.entries(leadgenConfig.icp.signalPriorities)
    .sort((left, right) => right[1] - left[1])
    .map(([signalType]) => signalType as SignalType)
    .slice(0, MAX_SIGNALS_PER_RUN);
}

function buildCampaign(
  campaignInput: CampaignInput,
  pipelineRunId: string,
  createdAt: string,
): LeadgenCampaign {
  return {
    id: createRecordId("campaign", campaignInput.name, createdAt),
    pipeline_run_id: pipelineRunId,
    name: campaignInput.name,
    requested_by: campaignInput.requestedBy,
    status: "completed",
    icp_label: leadgenConfig.icp.label,
    offer_label: leadgenConfig.offer.label,
    created_at: createdAt,
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
      signal_source_urls: candidate.signals.map((signal) => signal.source_url),
      signal_types: [
        ...new Set(candidate.signals.map((signal) => signal.signal_type)),
      ],
      icp_fit_breakdown: candidate.icp_fit_breakdown,
      discovery_market: candidate.discovery_market,
      discovery_query_language: candidate.discovery_query_language,
      discovery_query_angle: candidate.discovery_query_angle,
      source_country_hint: candidate.source_country_hint,
      final_decision: opportunity.should_create_lead
        ? "lead_created"
        : "skipped_before_lead_creation",
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
  return {
    ...company,
    metadata: {
      ...company.metadata,
      contact_discovery: {
        discovery_status: contactDiscovery.discovery_status,
        persona_search_status: contactDiscovery.persona_search_status,
        recommended_next_action: contactDiscovery.recommended_next_action,
        providers_used: contactDiscovery.providers_used,
        warnings: contactDiscovery.warnings,
        best_outreach_entry_id: contactDiscovery.best_outreach_entry?.id ?? null,
        fallback_entry_id: contactDiscovery.fallback_entry?.id ?? null,
        alternative_channel_ids: contactDiscovery.alternative_channels.map(
          (contact) => contact.id,
        ),
      },
      identity_profile: contactDiscovery.identity_profile,
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
  const signalSummary =
    candidate.signal_summary ??
    "I found a business signal that may point to current workflow pressure";
  const whyNow =
    candidate.why_now ??
    "the timing looks relevant based on the available public evidence";
  const confidenceNote =
    candidate.confidence_level === "weak_evidence"
      ? "I would treat this as a working hypothesis rather than a confirmed internal priority."
      : "This looks like a reasonable moment to check whether the team is feeling related process load.";

  return [
    `I noticed ${signalSummary}`,
    `The reason for reaching out now is that ${whyNow}`,
    `For a ${decisionMaker.primary_persona}, the likely pain is: ${decisionMaker.expected_pain}`,
    `${confidenceNote} I can send a short, concrete hypothesis map for where AI agents or workflow automation may help ${company.company_name}.`,
  ].join(" ");
}

function writeFollowUp(
  company: LeadgenCompany,
  candidate: LeadCandidate,
  decisionMaker: DecisionMakerProfile,
): string {
  return `Quick follow-up on ${company.company_name}. I reached out because ${candidate.why_now ?? "the public signal suggested a possible current workflow window"}. The relevant owner looks like ${decisionMaker.primary_persona}; the hypothesis is ${decisionMaker.expected_goal}`;
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
    hook: createHook(company, candidate, decisionMaker),
    message: writeMessage(company, candidate, decisionMaker),
    follow_up: writeFollowUp(company, candidate, decisionMaker),
    status: "new",
    created_at: createdAt,
    updated_at: createdAt,
  };
}

function getContactValue(contact: LeadgenContact): string | null {
  return (
    contact.email ??
    contact.linkedin_url ??
    contact.telegram_url ??
    (typeof contact.metadata.phone === "string" ? contact.metadata.phone : null) ??
    contact.contact_url
  );
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
  if (contact.contact_type === "confirmed_person") {
    return "decision-maker";
  }

  if (contact.contact_type === "role_based_person") {
    return "department-head";
  }

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
  bestAvailableEntry: LeadgenContact,
): LeadgenLead {
  if (bestAvailableEntry.contact_type === "no_contact_found") {
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
  targetCompanies,
}: {
  searchProvider: SearchProvider;
  targetCompanies: number;
}): Promise<CandidateRecord[]> {
  const candidateRecords = new Map<string, CandidateRecord>();
  let acceptedOpportunityCount = 0;

  for (const signalType of getSignalOrder()) {
    const result = await runSignalPipeline({
      signalType,
      searchProvider,
      targetCandidates: TARGET_PER_SIGNAL,
      maxQueries: MAX_QUERIES_PER_SIGNAL,
      maxResultsPerQuery: MAX_RESULTS_PER_QUERY,
    });

    for (const candidate of result.candidates) {
      const interpretedCandidate = interpretCandidate(candidate);

      if (!interpretedCandidate) {
        continue;
      }

      const candidateKey = getCandidateKey(candidate);
      const opportunity = assessOpportunity({
        candidate: interpretedCandidate,
      });

      if (!candidateRecords.has(candidateKey)) {
        candidateRecords.set(candidateKey, {
          candidate: interpretedCandidate,
          signalType,
          opportunity,
        });
        if (opportunity.should_create_lead) {
          acceptedOpportunityCount += 1;
        }
      } else {
        const existingRecord = candidateRecords.get(candidateKey);
        const nextRecord = {
          candidate: interpretedCandidate,
          signalType,
          opportunity,
        };

        if (existingRecord && shouldReplaceCandidateRecord(nextRecord, existingRecord)) {
          if (
            !existingRecord.opportunity.should_create_lead &&
            opportunity.should_create_lead
          ) {
            acceptedOpportunityCount += 1;
          }

          candidateRecords.set(candidateKey, nextRecord);
        }
      }

      if (acceptedOpportunityCount >= targetCompanies) {
        return [...candidateRecords.values()];
      }
    }
  }

  return [...candidateRecords.values()];
}

export async function runLeadDiscoveryEngine({
  campaignInput,
  searchProvider,
  targetCompanies = DEFAULT_TARGET_COMPANIES,
}: RunLeadDiscoveryInput): Promise<LeadDiscoveryResult> {
  const createdAt = new Date().toISOString();
  const pipelineRunId = createRecordId(
    "pipeline-run",
    campaignInput.name,
    createdAt,
  );
  const campaign = buildCampaign(campaignInput, pipelineRunId, createdAt);
  const candidateRecords = await discoverCandidates({
    searchProvider,
    targetCompanies,
  });
  const acceptedCandidateRecords = candidateRecords.filter(
    (record) => record.opportunity.should_create_lead,
  );
  const decisionMakerRecommendations = acceptedCandidateRecords.map(
    ({ candidate, signalType }) =>
      discoverDecisionMaker({
        candidate,
        signalType,
      }),
  );
  const acceptedDecisionMakerByKey = new Map(
    acceptedCandidateRecords.map((record, index) => [
      getCandidateKey(record.candidate),
      decisionMakerRecommendations[index],
    ]),
  );
  const baseCompanies = candidateRecords.map((record, index) =>
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
  const companiesByCandidateKey = new Map(
    candidateRecords.map((record, index) => [
      getCandidateKey(record.candidate),
      baseCompanies[index],
    ]),
  );
  const peopleDiscoveryEngine = new PeopleDiscoveryEngine();
  const peopleDiscoveryResults = await Promise.all(
    acceptedCandidateRecords.map((record, index) =>
      peopleDiscoveryEngine.discoverPeople({
        company:
          companiesByCandidateKey.get(getCandidateKey(record.candidate)) ??
          baseCompanies[index],
        decisionMaker: decisionMakerRecommendations[index],
      }),
    ),
  );
  const peopleDiscoveryByCompanyId = new Map(
    acceptedCandidateRecords.map((record, index) => {
      const company = companiesByCandidateKey.get(getCandidateKey(record.candidate));

      return [company?.id ?? "", peopleDiscoveryResults[index]] as const;
    }),
  );
  const companies = baseCompanies.map((company) => {
    const peopleDiscovery = peopleDiscoveryByCompanyId.get(company.id);

    return peopleDiscovery
      ? attachPeopleDiscoveryToCompany(company, peopleDiscovery)
      : company;
  });
  const companiesById = new Map(companies.map((company) => [company.id, company]));
  const leadRecords = acceptedCandidateRecords
    .map((record, index) => {
      const candidate = record.candidate;
      const company = companiesByCandidateKey.get(getCandidateKey(candidate));
      const primarySignal = getPrimarySignal(candidate);
      const companyWithMetadata = company ? companiesById.get(company.id) : null;

      if (!primarySignal || !companyWithMetadata) {
        return null;
      }

      const lead = buildLead({
        campaign,
        company: companyWithMetadata,
        primarySignal,
        candidate,
        decisionMaker: decisionMakerRecommendations[index],
        createdAt,
      });

      return {
        lead,
        company: companyWithMetadata,
        candidate,
        decisionMaker: decisionMakerRecommendations[index],
        peopleDiscovery: peopleDiscoveryResults[index],
        signals: buildSignals({
          campaign,
          company: companyWithMetadata,
          lead,
          candidate,
          createdAt,
        }),
      };
    })
    .filter(
      (
        record,
      ): record is {
        lead: LeadgenLead;
        company: LeadgenCompany;
        candidate: LeadCandidate;
        decisionMaker: DecisionMakerProfile;
        signals: LeadgenSignal[];
        peopleDiscovery: PeopleDiscoveryResult;
      } => Boolean(record),
    );
  const contactEnrichmentEngine = new ContactEnrichmentEngine();
  const contactDiscoveryResults = await Promise.all(
    leadRecords.map((record) =>
      contactEnrichmentEngine.enrichContacts({
        campaign,
        company: record.company,
        lead: record.lead,
        signals: record.signals,
        decisionMaker: record.decisionMaker,
        peopleDiscovery: record.peopleDiscovery,
        createdAt,
      }),
    ),
  );
  const leads = leadRecords.map((record, index) =>
    applyBestAvailableEntryToLead(
      record.lead,
      contactDiscoveryResults[index].best_available_entry,
    ),
  );
  const signals = leadRecords.flatMap((record) => record.signals);
  const contacts = contactDiscoveryResults.flatMap((result) => result.contacts);
  const prioritizedCompaniesById = new Map(
    leadRecords.map((record, index) => [
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
  };
}
