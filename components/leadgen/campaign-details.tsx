"use client";

import { useState } from "react";
import {
  getContactIntelligence,
  getContactValue,
  type ContactMethod,
} from "@/lib/leadgen/contact-intelligence";
import type {
  LeadgenCampaignDetails,
  LeadgenContact,
  LeadgenLead,
  LeadPriority,
  LeadgenSignal,
  OpportunityAssessment,
  IdentityProfile,
  IdentityChannel,
  SignalType,
} from "@/lib/leadgen/types";

const statusLabels: Record<LeadgenCampaignDetails["campaign"]["status"], string> =
  {
    completed: "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u0430",
  };

const signalTypeLabels: Record<SignalType, string> = {
  HIRING_SIGNAL: "\u041d\u0430\u0439\u043c",
  GO_TO_MARKET_SIGNAL: "Go-to-market",
  GROWTH_SIGNAL: "\u0420\u043e\u0441\u0442",
  CONTENT_SIGNAL: "\u041a\u043e\u043d\u0442\u0435\u043d\u0442",
  TRAFFIC_SIGNAL: "\u0422\u0440\u0430\u0444\u0438\u043a",
  TECH_SIGNAL: "\u0422\u0435\u0445\u043d\u043e\u043b\u043e\u0433\u0438\u0438",
};
const contactTypeLabels: Record<LeadgenContact["contact_type"], string> = {
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

type CampaignDetailsProps = {
  details: LeadgenCampaignDetails | null;
  errorMessage: string | null;
  isLoading: boolean;
};

type SignalView = Pick<
  LeadgenSignal,
  | "signal_type"
  | "signal_title"
  | "signal_detail"
  | "signal_source_label"
  | "source_url"
  | "confidence_score"
  | "found_at"
>;

type SignalInterpretationView = {
  confirmed_facts?: string[];
  inferred_insights?: string[];
  confidence_level?: string;
  why_it_matters?: string;
  why_now?: string;
  outreach_hypothesis?: string;
  evidence_quality?: string;
};

type DecisionMakerView = {
  primary_persona?: string;
  alternative_personas?: string[];
  department?: string;
  buying_role?: string;
  influence_level?: string;
  decision_authority?: string;
  business_problem_owner?: string;
  expected_pain?: string;
  expected_goal?: string;
  search_keywords?: string[];
  priority?: string;
  reasoning?: string;
  confidence_score?: number;
  source_reasoning?: {
    signal_type?: string;
    company_segment?: string;
    matched_context_terms?: string[];
    confidence_reason?: string;
    competing_departments?: string[];
  };
};

type PersonCandidateView = {
  full_name?: string;
  role_title?: string;
  department?: string;
  linkedin_url?: string;
  work_email?: string;
  phone?: string;
  source?: string;
  confidence_score?: number;
};

type PersonIntelligenceView = {
  candidate: PersonCandidateView;
  person_score?: number;
  persona_match_score?: number;
  business_problem_ownership?: string;
  decision_authority?: string;
  influence_level?: string;
  confidence_score?: number;
  recommended_next_action?: string;
  selection_reason?: string;
  reasoning?: string;
  matched_keywords?: string[];
  strengths?: string[];
  weaknesses?: string[];
  why_not_other_candidates?: string[];
};

type PeopleDiscoveryView = {
  primary_person?: PersonCandidateView;
  alternative_people?: PersonCandidateView[];
  primary_person_intelligence?: PersonIntelligenceView;
  alternative_people_intelligence?: PersonIntelligenceView[];
  selection_reasoning?: string;
  search_status?: string;
  providers_used?: string[];
};

type IdentityChannelView = Partial<IdentityChannel>;

type IdentityProfileView = Partial<
  Omit<
    IdentityProfile,
    | "available_channels"
    | "primary_contact_channel"
    | "fallback_channel"
    | "alternative_channels"
  >
> & {
  available_channels?: IdentityChannelView[];
  primary_contact_channel?: IdentityChannelView | null;
  fallback_channel?: IdentityChannelView | null;
  alternative_channels?: IdentityChannelView[];
};

type LeadPriorityView = Partial<LeadPriority>;

type OpportunityView = Partial<OpportunityAssessment>;

function getStringValue(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];

  return typeof value === "string" && value.trim() ? value : undefined;
}

function getStringListValue(
  record: Record<string, unknown>,
  key: string,
): string[] | undefined {
  const value = record[key];

  if (!Array.isArray(value)) {
    return undefined;
  }

  const values = value.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  );

  return values.length > 0 ? values : undefined;
}

function getLeadInterpretation(
  lead: LeadgenLead,
  companiesById: Map<string, LeadgenCampaignDetails["companies"][number]>,
): SignalInterpretationView {
  if (!lead.company_id) {
    return {};
  }

  const company = companiesById.get(lead.company_id);
  const rawInterpretation = company?.metadata.signal_interpretation;

  if (
    typeof rawInterpretation !== "object" ||
    rawInterpretation === null ||
    Array.isArray(rawInterpretation)
  ) {
    return {};
  }

  const interpretation = rawInterpretation as Record<string, unknown>;

  return {
    confirmed_facts: getStringListValue(interpretation, "confirmed_facts"),
    inferred_insights: getStringListValue(interpretation, "inferred_insights"),
    confidence_level: getStringValue(interpretation, "confidence_level"),
    why_it_matters: getStringValue(interpretation, "why_it_matters"),
    why_now: getStringValue(interpretation, "why_now"),
    outreach_hypothesis: getStringValue(interpretation, "outreach_hypothesis"),
    evidence_quality: getStringValue(interpretation, "evidence_quality"),
  };
}

function getNumberValue(
  record: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = record[key];

  return typeof value === "number" ? value : undefined;
}

function getLeadDecisionMaker(
  lead: LeadgenLead,
  companiesById: Map<string, LeadgenCampaignDetails["companies"][number]>,
): DecisionMakerView {
  if (!lead.company_id) {
    return {};
  }

  const company = companiesById.get(lead.company_id);
  const rawDecisionMaker = company?.metadata.decision_maker;
  const rawSourceReasoning = company?.metadata.source_reasoning;

  if (
    typeof rawDecisionMaker !== "object" ||
    rawDecisionMaker === null ||
    Array.isArray(rawDecisionMaker)
  ) {
    return {};
  }

  const decisionMaker = rawDecisionMaker as Record<string, unknown>;
  const sourceReasoning =
    typeof rawSourceReasoning === "object" &&
    rawSourceReasoning !== null &&
    !Array.isArray(rawSourceReasoning)
      ? (rawSourceReasoning as Record<string, unknown>)
      : {};

  return {
    primary_persona:
      getStringValue(decisionMaker, "primary_persona") ??
      getStringValue(decisionMaker, "ideal_persona"),
    alternative_personas: getStringListValue(
      decisionMaker,
      "alternative_personas",
    ),
    department: getStringValue(decisionMaker, "department"),
    buying_role: getStringValue(decisionMaker, "buying_role"),
    influence_level: getStringValue(decisionMaker, "influence_level"),
    decision_authority: getStringValue(decisionMaker, "decision_authority"),
    business_problem_owner: getStringValue(
      decisionMaker,
      "business_problem_owner",
    ),
    expected_pain: getStringValue(decisionMaker, "expected_pain"),
    expected_goal: getStringValue(decisionMaker, "expected_goal"),
    search_keywords: getStringListValue(decisionMaker, "search_keywords"),
    priority: getStringValue(decisionMaker, "priority"),
    reasoning: getStringValue(decisionMaker, "reasoning"),
    confidence_score:
      getNumberValue(decisionMaker, "confidence_score") ??
      getNumberValue(decisionMaker, "confidence"),
    source_reasoning: {
      signal_type: getStringValue(sourceReasoning, "signal_type"),
      company_segment: getStringValue(sourceReasoning, "company_segment"),
      matched_context_terms: getStringListValue(
        sourceReasoning,
        "matched_context_terms",
      ),
      confidence_reason: getStringValue(sourceReasoning, "confidence_reason"),
      competing_departments: getStringListValue(
        sourceReasoning,
        "competing_departments",
      ),
    },
  };
}

function getPersonCandidateValue(value: unknown): PersonCandidateView | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;

  return {
    full_name: getStringValue(candidate, "full_name"),
    role_title: getStringValue(candidate, "role_title"),
    department: getStringValue(candidate, "department"),
    linkedin_url: getStringValue(candidate, "linkedin_url"),
    work_email: getStringValue(candidate, "work_email"),
    phone: getStringValue(candidate, "phone"),
    source: getStringValue(candidate, "source"),
    confidence_score: getNumberValue(candidate, "confidence_score"),
  };
}

function getPeopleCandidatesValue(value: unknown): PersonCandidateView[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const candidates = value
    .map(getPersonCandidateValue)
    .filter((candidate): candidate is PersonCandidateView => Boolean(candidate));

  return candidates.length > 0 ? candidates : undefined;
}

function getPersonIntelligenceValue(
  value: unknown,
): PersonIntelligenceView | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const intelligence = value as Record<string, unknown>;
  const candidate = getPersonCandidateValue(intelligence.candidate) ?? {};

  return {
    candidate,
    person_score: getNumberValue(intelligence, "person_score"),
    persona_match_score: getNumberValue(intelligence, "persona_match_score"),
    business_problem_ownership: getStringValue(
      intelligence,
      "business_problem_ownership",
    ),
    decision_authority: getStringValue(intelligence, "decision_authority"),
    influence_level: getStringValue(intelligence, "influence_level"),
    confidence_score: getNumberValue(intelligence, "confidence_score"),
    recommended_next_action: getStringValue(
      intelligence,
      "recommended_next_action",
    ),
    selection_reason: getStringValue(intelligence, "selection_reason"),
    reasoning: getStringValue(intelligence, "reasoning"),
    matched_keywords: getStringListValue(intelligence, "matched_keywords"),
    strengths: getStringListValue(intelligence, "strengths"),
    weaknesses: getStringListValue(intelligence, "weaknesses"),
    why_not_other_candidates: getStringListValue(
      intelligence,
      "why_not_other_candidates",
    ),
  };
}

function getPersonIntelligenceListValue(
  value: unknown,
): PersonIntelligenceView[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const values = value
    .map(getPersonIntelligenceValue)
    .filter(
      (intelligence): intelligence is PersonIntelligenceView =>
        Boolean(intelligence),
    );

  return values.length > 0 ? values : undefined;
}

function getLeadPeopleDiscovery(
  lead: LeadgenLead,
  companiesById: Map<string, LeadgenCampaignDetails["companies"][number]>,
): PeopleDiscoveryView {
  if (!lead.company_id) {
    return {};
  }

  const company = companiesById.get(lead.company_id);
  const rawPeopleDiscovery = company?.metadata.people_discovery;

  if (
    typeof rawPeopleDiscovery !== "object" ||
    rawPeopleDiscovery === null ||
    Array.isArray(rawPeopleDiscovery)
  ) {
    return {};
  }

  const peopleDiscovery = rawPeopleDiscovery as Record<string, unknown>;
  const primaryPerson = getPersonCandidateValue(
    peopleDiscovery.primary_person,
  );

  return {
    primary_person: primaryPerson,
    alternative_people: getPeopleCandidatesValue(
      peopleDiscovery.alternative_people,
    ),
    primary_person_intelligence: getPersonIntelligenceValue(
      peopleDiscovery.primary_person_intelligence,
    ),
    alternative_people_intelligence: getPersonIntelligenceListValue(
      peopleDiscovery.alternative_people_intelligence,
    ),
    selection_reasoning: getStringValue(peopleDiscovery, "selection_reasoning"),
    search_status: getStringValue(peopleDiscovery, "search_status"),
    providers_used: getStringListValue(peopleDiscovery, "providers_used"),
  };
}

function getLeadPriority(
  lead: LeadgenLead,
  companiesById: Map<string, LeadgenCampaignDetails["companies"][number]>,
): LeadPriorityView {
  if (!lead.company_id) {
    return {};
  }

  const company = companiesById.get(lead.company_id);
  const rawLeadPriority = company?.metadata.lead_priority;

  if (
    typeof rawLeadPriority !== "object" ||
    rawLeadPriority === null ||
    Array.isArray(rawLeadPriority)
  ) {
    return {};
  }

  return rawLeadPriority as LeadPriorityView;
}

function getLeadOpportunity(
  lead: LeadgenLead,
  companiesById: Map<string, LeadgenCampaignDetails["companies"][number]>,
): OpportunityView {
  if (!lead.company_id) {
    return {};
  }

  const company = companiesById.get(lead.company_id);
  const rawOpportunity = company?.metadata.opportunity;

  if (
    typeof rawOpportunity !== "object" ||
    rawOpportunity === null ||
    Array.isArray(rawOpportunity)
  ) {
    return {};
  }

  return rawOpportunity as OpportunityView;
}

function getLeadIdentityProfile({
  lead,
  companiesById,
  contacts,
}: {
  lead: LeadgenLead;
  companiesById: Map<string, LeadgenCampaignDetails["companies"][number]>;
  contacts: LeadgenContact[];
}): IdentityProfileView {
  const company = lead.company_id ? companiesById.get(lead.company_id) : null;
  const rawIdentityProfile =
    company?.metadata.identity_profile ??
    contacts
      .map((contact) => contact.metadata.identity_profile)
      .find(
        (value) =>
          typeof value === "object" && value !== null && !Array.isArray(value),
      );

  if (
    typeof rawIdentityProfile !== "object" ||
    rawIdentityProfile === null ||
    Array.isArray(rawIdentityProfile)
  ) {
    return {};
  }

  return rawIdentityProfile as IdentityProfileView;
}

function getRecommendedNextActionLabel(action?: string): string {
  const labels: Record<string, string> = {
    send_outreach: "Send outreach",
    run_enrichment: "Run enrichment",
    use_fallback_channel: "Use fallback channel",
    skip_until_contact_found: "Skip until contact is found",
    contact_primary_person: "Contact primary person",
    contact_alternative_person: "Contact alternative person",
    monitor_changes: "Monitor changes",
    find_target_persona: "Find target persona",
    monitor_for_new_signal: "Monitor for a stronger signal",
    defer: "Defer",
    review_manually: "Review manually",
  };

  return action ? labels[action] ?? action : "Not calculated";
}

function getOpportunityActionLabel(action?: string): string {
  const labels: Record<string, string> = {
    create_lead: "Create lead",
    run_enrichment: "Run enrichment",
    monitor: "Monitor for a stronger signal",
    discard: "Discard",
  };

  return action ? labels[action] ?? action : "Not calculated";
}

function getPersonaSearchStatus(contact: LeadgenContact | null): string {
  const rawStatus = contact?.metadata.persona_search_status;

  return typeof rawStatus === "string" ? rawStatus : "no_entry_found";
}

function getPersonaSearchStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    target_persona_found: "Target persona found",
    alternative_persona_found: "Alternative persona found",
    department_entry_found: "Department-level entry found",
    generic_entry_found: "Generic business entry found",
    fallback_only: "Fallback only - target persona not found yet",
    no_entry_found: "No public entry point found",
  };

  return labels[status] ?? status;
}

function formatContactMethod(method: ContactMethod | null): string {
  if (!method) {
    return "Not found";
  }

  const source = method.source_label ? ` Source: ${method.source_label}.` : "";

  return `${method.value} Confidence: ${method.confidence_score}/100.${source}`;
}

function getBestContactForLead(
  lead: LeadgenLead,
  contactsByLeadId: Map<string, LeadgenContact[]>,
): LeadgenContact | null {
  const contacts = contactsByLeadId.get(lead.id) ?? [];
  const primaryContact = contacts.find((contact) => contact.is_primary);

  return primaryContact ?? contacts[0] ?? null;
}

function isDirectOutreachEntry(contact: LeadgenContact): boolean {
  return (
    contact.contact_type === "work_email" ||
    contact.contact_type === "linkedin" ||
    contact.contact_type === "telegram" ||
    contact.contact_type === "phone"
  );
}

function getBestOutreachEntryForLead(
  lead: LeadgenLead,
  contactsByLeadId: Map<string, LeadgenContact[]>,
): LeadgenContact | null {
  const contacts = contactsByLeadId.get(lead.id) ?? [];
  const bestOutreachEntry = contacts.find(
    (contact) =>
      contact.metadata.entry_role === "best_outreach_entry" &&
      isDirectOutreachEntry(contact),
  );

  if (bestOutreachEntry) {
    return bestOutreachEntry;
  }

  return (
    contacts.find(
      (contact) => isDirectOutreachEntry(contact) && contact.is_primary,
    ) ??
    contacts.find((contact) => isDirectOutreachEntry(contact)) ??
    null
  );
}

function getFallbackEntryForLead(
  lead: LeadgenLead,
  contactsByLeadId: Map<string, LeadgenContact[]>,
): LeadgenContact | null {
  const contacts = contactsByLeadId.get(lead.id) ?? [];

  return (
    contacts.find((contact) => contact.metadata.entry_role === "fallback_entry") ??
    contacts.find((contact) => contact.contact_type === "generic_email") ??
    contacts.find((contact) => contact.contact_type === "website_form") ??
    contacts.find((contact) => contact.contact_type === "company_social") ??
    contacts.find((contact) => contact.contact_type === "company_website") ??
    null
  );
}

function getSignalsForLead(
  lead: LeadgenLead,
  signalsByLeadId: Map<string, LeadgenSignal[]>,
): SignalView[] {
  const storedSignals = signalsByLeadId.get(lead.id);

  if (storedSignals && storedSignals.length > 0) {
    return storedSignals;
  }

  return [
    {
      signal_type: "GROWTH_SIGNAL",
      signal_title: lead.signal_title,
      signal_detail: lead.signal_detail,
      signal_source_label: lead.signal_source_label,
      source_url: lead.company_source_url ?? "",
      confidence_score: lead.lead_score || 0,
      found_at: lead.created_at,
    },
  ];
}

export function CampaignDetails({
  details,
  errorMessage,
  isLoading,
}: CampaignDetailsProps) {
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null);

  function toggleLead(leadId: string) {
    setExpandedLeadId((currentId) => (currentId === leadId ? null : leadId));
  }

  if (isLoading) {
    return (
      <section className="panel campaign-details-panel">
        <div className="empty-state">
          <h3>{"\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u044e \u0434\u0435\u0442\u0430\u043b\u0438 \u043a\u0430\u043c\u043f\u0430\u043d\u0438\u0438"}</h3>
          <p>{"\u041f\u043e\u043b\u0443\u0447\u0430\u044e \u0441\u043e\u0445\u0440\u0430\u043d\u0451\u043d\u043d\u044b\u0435 \u043a\u043e\u043c\u043f\u0430\u043d\u0438\u0438, \u0441\u043e\u0431\u044b\u0442\u0438\u044f \u0438 \u0443\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u044f \u0438\u0437 Supabase."}</p>
        </div>
      </section>
    );
  }

  if (errorMessage) {
    return (
      <section className="panel campaign-details-panel">
        <div className="empty-state">
          <h3>{"\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0442\u043a\u0440\u044b\u0442\u044c \u043a\u0430\u043c\u043f\u0430\u043d\u0438\u044e"}</h3>
          <p>{errorMessage}</p>
        </div>
      </section>
    );
  }

  if (!details) {
    return null;
  }

  const signalsByLeadId = new Map<string, LeadgenSignal[]>();
  const contactsByLeadId = new Map<string, LeadgenContact[]>();
  const companiesById = new Map(
    details.companies.map((company) => [company.id, company]),
  );

  for (const signal of details.signals) {
    const currentSignals = signalsByLeadId.get(signal.lead_id) ?? [];
    signalsByLeadId.set(signal.lead_id, [...currentSignals, signal]);
  }

  for (const contact of details.contacts) {
    const currentContacts = contactsByLeadId.get(contact.lead_id) ?? [];
    contactsByLeadId.set(contact.lead_id, [...currentContacts, contact]);
  }

  return (
    <section className="panel campaign-details-panel">
      <div className="table-toolbar">
        <div>
          <p className="eyebrow">{"\u0414\u0435\u0442\u0430\u043b\u0438 \u0437\u0430\u043f\u0443\u0441\u043a\u0430"}</p>
          <h2>{details.campaign.name}</h2>
          <p className="company-domain">
            {new Date(details.campaign.created_at).toLocaleString("ru-RU")}
          </p>
        </div>
        <span className="status-pill status-approved">
          {statusLabels[details.campaign.status]}
        </span>
      </div>

      <div className="campaign-details-content">
        <div className="campaign-details-stats">
          <div>
            <span className="field-label">\u0413\u043e\u0442\u043e\u0432\u044b\u0435 \u043b\u0438\u0434\u044b</span>
            <strong>{details.stats.leads_count}</strong>
          </div>
          <div>
            <span className="field-label">\u041a\u043e\u043c\u043f\u0430\u043d\u0438\u0439 \u043d\u0430\u0439\u0434\u0435\u043d\u043e</span>
            <strong>{details.stats.companies_count}</strong>
          </div>
          <div>
            <span className="field-label">\u041a\u043e\u043d\u0442\u0430\u043a\u0442\u043e\u0432 \u043d\u0430\u0439\u0434\u0435\u043d\u043e</span>
            <strong>{details.stats.contacts_count}</strong>
          </div>
          <div>
            <span className="field-label">\u0421\u0438\u0433\u043d\u0430\u043b\u043e\u0432 \u043d\u0430\u0439\u0434\u0435\u043d\u043e</span>
            <strong>{details.stats.signals_count}</strong>
          </div>
          <div>
            <span className="field-label">\u0423\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u0439 \u043f\u043e\u0434\u0433\u043e\u0442\u043e\u0432\u043b\u0435\u043d\u043e</span>
            <strong>{details.stats.notifications_count}</strong>
          </div>
          <div>
            <span className="field-label">\u0421\u043e\u0431\u044b\u0442\u0438\u0439 \u0441\u043e\u0437\u0434\u0430\u043d\u043e</span>
            <strong>{details.stats.events_count}</strong>
          </div>
        </div>

        <div className="campaign-details-leads">
          {details.leads.map((lead) => {
            const leadSignals = getSignalsForLead(lead, signalsByLeadId);
            const interpretation = getLeadInterpretation(lead, companiesById);
            const decisionMaker = getLeadDecisionMaker(lead, companiesById);
            const peopleDiscovery = getLeadPeopleDiscovery(lead, companiesById);
            const leadPriority = getLeadPriority(lead, companiesById);
            const opportunity = getLeadOpportunity(lead, companiesById);
            const leadContacts = contactsByLeadId.get(lead.id) ?? [];
            const bestContact = getBestContactForLead(lead, contactsByLeadId);
            const bestOutreachEntry = getBestOutreachEntryForLead(
              lead,
              contactsByLeadId,
            );
            const fallbackEntry = getFallbackEntryForLead(lead, contactsByLeadId);
            const identityProfile = getLeadIdentityProfile({
              lead,
              companiesById,
              contacts: leadContacts,
            });
            const contactIntelligence = getContactIntelligence({
              peopleDiscovery,
              contacts: leadContacts,
              bestOutreachEntry,
              fallbackEntry,
            });
            const bestOutreachValue = bestOutreachEntry
              ? getContactValue(bestOutreachEntry)
              : null;
            const fallbackValue = fallbackEntry
              ? getContactValue(fallbackEntry)
              : null;
            const personaSearchStatus = getPersonaSearchStatus(
              bestOutreachEntry ?? fallbackEntry ?? bestContact,
            );
            const primaryIdentityChannel =
              identityProfile.primary_contact_channel ?? null;
            const identityFallbackChannel =
              identityProfile.fallback_channel ?? null;

            return (
              <article className="campaign-details-lead" key={lead.id}>
                <div className="campaign-details-lead-main">
                  <div>
                    <h3>{lead.company_name}</h3>
                    <p className="company-domain">
                      {lead.company_domain ?? "\u0414\u043e\u043c\u0435\u043d \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d"}
                    </p>
                    {lead.company_source_url ? (
                      <a
                        className="source-link"
                        href={lead.company_source_url}
                        rel="noreferrer"
                        target="_blank"
                      >{"\u0418\u0441\u0442\u043e\u0447\u043d\u0438\u043a \u043a\u043e\u043c\u043f\u0430\u043d\u0438\u0438"}</a>
                    ) : null}
                  </div>
                  <div>
                    <span className="field-label">Target persona</span>
                    <p>{decisionMaker.primary_persona ?? "Not determined"}</p>
                    {decisionMaker.department ? (
                      <p className="company-domain">
                        Department: {decisionMaker.department}
                      </p>
                    ) : null}
                    {typeof decisionMaker.confidence_score === "number" ? (
                      <p className="company-domain">
                        Confidence: {decisionMaker.confidence_score}/100
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <span className="field-label">Found person</span>
                    <p>
                      {peopleDiscovery.primary_person?.full_name ?? "Not found"}
                    </p>
                    {peopleDiscovery.primary_person?.role_title ? (
                      <p className="company-domain">
                        {peopleDiscovery.primary_person.role_title}
                      </p>
                    ) : null}
                    {peopleDiscovery.search_status ? (
                      <p className="company-domain">
                        People status: {peopleDiscovery.search_status}
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <span className="field-label">Best outreach entry</span>
                    <p>
                      {bestOutreachEntry
                        ? contactTypeLabels[bestOutreachEntry.contact_type]
                        : "Not found yet"}
                    </p>
                    <p className="company-domain">
                      {bestOutreachValue ??
                        "Target persona/contact not found in available public data"}
                    </p>
                    {bestOutreachEntry ? (
                      <p className="company-domain">
                        Confidence: {bestOutreachEntry.confidence_score}/100
                      </p>
                    ) : null}
                    {bestOutreachEntry?.source_url ? (
                      <a
                        className="source-link"
                        href={bestOutreachEntry.source_url}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Contact source
                      </a>
                    ) : null}
                  </div>
                  <div>
                    <span className="field-label">Best contact method</span>
                    <p>
                      {contactIntelligence.best_method
                        ? contactIntelligence.best_method.label
                        : "Not found yet"}
                    </p>
                    <p className="company-domain">
                      {contactIntelligence.best_method?.value ??
                        "No direct channel found; use fallback/enrichment"}
                    </p>
                    {contactIntelligence.best_method ? (
                      <p className="company-domain">
                        Confidence:{" "}
                        {contactIntelligence.best_method.confidence_score}/100
                      </p>
                    ) : null}
                    {contactIntelligence.best_method?.source_label ? (
                      <p className="company-domain">
                        Source: {contactIntelligence.best_method.source_label}
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <span className="field-label">Identity Profile</span>
                    <p>
                      {identityProfile.identity_summary ??
                        "No confirmed personal contact found. Identity profile is not available for this lead yet."}
                    </p>
                    {typeof identityProfile.identity_confidence === "number" ? (
                      <p className="company-domain">
                        Identity confidence:{" "}
                        {identityProfile.identity_confidence}/100
                      </p>
                    ) : null}
                    <p className="company-domain">
                      Best identity channel:{" "}
                      {primaryIdentityChannel?.label ?? "Not found yet"}
                    </p>
                    {primaryIdentityChannel?.value ? (
                      <p className="company-domain">
                        {primaryIdentityChannel.value}
                      </p>
                    ) : null}
                    <p className="company-domain">
                      Fallback: {identityFallbackChannel?.label ?? "Not found"}
                    </p>
                    <p className="company-domain">
                      Recommended next action:{" "}
                      {getRecommendedNextActionLabel(
                        identityProfile.recommended_next_action,
                      )}
                    </p>
                  </div>
                  <div>
                    <span className="field-label">Fallback entry</span>
                    <p>
                      {fallbackEntry
                        ? contactTypeLabels[fallbackEntry.contact_type]
                        : "No fallback found"}
                    </p>
                    <p className="company-domain">
                      {fallbackValue ?? "No fallback entry point found"}
                    </p>
                    {fallbackEntry ? (
                      <p className="company-domain">
                        Confidence: {fallbackEntry.confidence_score}/100
                      </p>
                    ) : null}
                    {fallbackEntry?.source_label ? (
                      <p className="company-domain">
                        Source: {fallbackEntry.source_label}
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <span className="field-label">Persona search status</span>
                    <p>{getPersonaSearchStatusLabel(personaSearchStatus)}</p>
                  </div>
                  <div>
                    <span className="field-label">Lead score</span>
                    <p>{lead.lead_score}</p>
                  </div>
                  <div>
                    <span className="field-label">Opportunity</span>
                    <p>
                      {typeof opportunity.opportunity_score === "number"
                        ? `${opportunity.opportunity_type ?? "opportunity"} (${opportunity.opportunity_score}/100)`
                        : "Not assessed"}
                    </p>
                    <p className="company-domain">
                      {opportunity.urgency
                        ? `Urgency: ${opportunity.urgency}`
                        : "Opportunity gate result is not available"}
                    </p>
                    <p className="company-domain">
                      Should create lead:{" "}
                      {typeof opportunity.should_create_lead === "boolean"
                        ? opportunity.should_create_lead
                          ? "yes"
                          : "no"
                        : "not available"}
                    </p>
                  </div>
                  <div>
                    <span className="field-label">Lead Priority</span>
                    <p>
                      {leadPriority.priority
                        ? `${leadPriority.priority} (${leadPriority.priority_score ?? 0}/100)`
                        : "Not calculated"}
                    </p>
                    <p className="company-domain">
                      {getRecommendedNextActionLabel(
                        leadPriority.recommended_next_action,
                      )}
                    </p>
                  </div>
                  <div>
                    <span className="field-label">ICP fit</span>
                    <p>{lead.icp_fit_score}</p>
                  </div>
                  <button
                    className="detail-button"
                    type="button"
                    onClick={() => toggleLead(lead.id)}
                  >
                    {expandedLeadId === lead.id ? "\u0421\u043a\u0440\u044b\u0442\u044c" : "\u0420\u0430\u0441\u043a\u0440\u044b\u0442\u044c"}
                  </button>
                </div>

                <div className="campaign-details-signal">
                  <span className="field-label">{"\u0421\u0438\u0433\u043d\u0430\u043b\u044b"}</span>
                  <div className="campaign-details-copy">
                    <div>
                      <span className="field-label">Signal summary</span>
                      <p>{lead.signal_detail}</p>
                    </div>
                    <div>
                      <span className="field-label">Why this company</span>
                      <p>
                        {opportunity.why_this_company ??
                          interpretation.why_it_matters ??
                          "This company entered the lead queue because the signal passed production quality checks and matched the ICP scoring layer."}
                      </p>
                    </div>
                    <div>
                      <span className="field-label">Why now</span>
                      <p>
                        {opportunity.why_now ??
                          interpretation.why_now ??
                          "The current public evidence is not strong enough to state a precise timing reason; treat this as a lower-confidence outreach window."}
                      </p>
                    </div>
                    {opportunity.business_reasoning ? (
                      <div>
                        <span className="field-label">Opportunity reasoning</span>
                        <p>{opportunity.business_reasoning}</p>
                      </div>
                    ) : null}
                    {typeof opportunity.evidence_strength === "number" ? (
                      <div>
                        <span className="field-label">Opportunity evidence</span>
                        <p>
                          Strength {opportunity.evidence_strength}/100 {"\u00b7"}
                          Confidence {opportunity.confidence ?? 0}/100 {"\u00b7"} Action{" "}
                          {opportunity.recommended_action ?? "not_available"}
                        </p>
                      </div>
                    ) : null}
                    <div>
                      <span className="field-label">Opportunity recommended action</span>
                      <p>
                        {getOpportunityActionLabel(
                          opportunity.recommended_action,
                        )}
                      </p>
                    </div>
                    {opportunity.positive_factors?.length ? (
                      <div>
                        <span className="field-label">Opportunity positives</span>
                        <p>{opportunity.positive_factors.join(" ")}</p>
                      </div>
                    ) : null}
                    {opportunity.negative_factors?.length ? (
                      <div>
                        <span className="field-label">Opportunity risks</span>
                        <p>{opportunity.negative_factors.join(" ")}</p>
                      </div>
                    ) : null}
                    {opportunity.missing_information?.length ? (
                      <div>
                        <span className="field-label">Missing information</span>
                        <p>{opportunity.missing_information.join(" ")}</p>
                      </div>
                    ) : null}
                    {interpretation.confirmed_facts ? (
                      <div>
                        <span className="field-label">Confirmed facts</span>
                        <p>{interpretation.confirmed_facts.join(" ")}</p>
                      </div>
                    ) : null}
                    {interpretation.inferred_insights ? (
                      <div>
                        <span className="field-label">Inferred insights</span>
                        <p>{interpretation.inferred_insights.join(" ")}</p>
                      </div>
                    ) : null}
                    {interpretation.confidence_level ? (
                      <div>
                        <span className="field-label">Confidence</span>
                        <p>{interpretation.confidence_level}</p>
                      </div>
                    ) : null}
                    {interpretation.outreach_hypothesis ? (
                      <div>
                        <span className="field-label">Outreach hypothesis</span>
                        <p>{interpretation.outreach_hypothesis}</p>
                      </div>
                    ) : null}
                    {interpretation.evidence_quality ? (
                      <div>
                        <span className="field-label">Evidence quality</span>
                        <p>{interpretation.evidence_quality}</p>
                      </div>
                    ) : null}
                    {decisionMaker.primary_persona ? (
                      <div>
                        <span className="field-label">Primary persona</span>
                        <p>{decisionMaker.primary_persona}</p>
                      </div>
                    ) : null}
                    {decisionMaker.reasoning ? (
                      <div>
                        <span className="field-label">Why this person</span>
                        <p>{decisionMaker.reasoning}</p>
                      </div>
                    ) : null}
                    {decisionMaker.expected_pain ? (
                      <div>
                        <span className="field-label">Expected pain</span>
                        <p>{decisionMaker.expected_pain}</p>
                      </div>
                    ) : null}
                    {decisionMaker.expected_goal ? (
                      <div>
                        <span className="field-label">Expected goal</span>
                        <p>{decisionMaker.expected_goal}</p>
                      </div>
                    ) : null}
                    {decisionMaker.source_reasoning?.confidence_reason ? (
                      <div>
                        <span className="field-label">Confidence reasoning</span>
                        <p>{decisionMaker.source_reasoning.confidence_reason}</p>
                      </div>
                    ) : null}
                    {decisionMaker.alternative_personas ? (
                      <div>
                        <span className="field-label">Alternative personas</span>
                        <p>{decisionMaker.alternative_personas.join(", ")}</p>
                      </div>
                    ) : null}
                    {decisionMaker.source_reasoning?.competing_departments ? (
                      <div>
                        <span className="field-label">Competing departments</span>
                        <p>
                          {decisionMaker.source_reasoning.competing_departments.join(
                            ", ",
                          )}
                        </p>
                      </div>
                    ) : null}
                    <div>
                      <span className="field-label">People discovery</span>
                      <p>
                        {peopleDiscovery.primary_person?.full_name ??
                          "Found Person: Not found"}
                      </p>
                    </div>
                    {peopleDiscovery.selection_reasoning ? (
                      <div>
                        <span className="field-label">Person selection reason</span>
                        <p>{peopleDiscovery.selection_reasoning}</p>
                      </div>
                    ) : null}
                    {peopleDiscovery.primary_person_intelligence ? (
                      <div>
                        <span className="field-label">Person intelligence</span>
                        <p>
                          Person{" "}
                          {peopleDiscovery.primary_person_intelligence
                            .person_score ?? 0}
                          /100 - Persona{" "}
                          {peopleDiscovery.primary_person_intelligence
                            .persona_match_score ?? 0}
                          /100 - Confidence{" "}
                          {peopleDiscovery.primary_person_intelligence
                            .confidence_score ?? 0}
                          /100
                        </p>
                        <p className="company-domain">
                          Ownership:{" "}
                          {peopleDiscovery.primary_person_intelligence
                            .business_problem_ownership ?? "unknown"}
                          {" - Authority: "}
                          {peopleDiscovery.primary_person_intelligence
                            .decision_authority ?? "unknown"}
                          {" - Influence: "}
                          {peopleDiscovery.primary_person_intelligence
                            .influence_level ?? "unknown"}
                        </p>
                        <p className="company-domain">
                          Recommended next action:{" "}
                          {getRecommendedNextActionLabel(
                            peopleDiscovery.primary_person_intelligence
                              .recommended_next_action,
                          )}
                        </p>
                        {peopleDiscovery.primary_person_intelligence.strengths
                          ?.length ? (
                          <p className="company-domain">
                            Strengths:{" "}
                            {peopleDiscovery.primary_person_intelligence.strengths.join(
                              " ",
                            )}
                          </p>
                        ) : null}
                        {peopleDiscovery.primary_person_intelligence.weaknesses
                          ?.length ? (
                          <p className="company-domain">
                            Risks:{" "}
                            {peopleDiscovery.primary_person_intelligence.weaknesses.join(
                              " ",
                            )}
                          </p>
                        ) : null}
                        {peopleDiscovery.primary_person_intelligence
                          .why_not_other_candidates?.length ? (
                          <p className="company-domain">
                            Why not alternatives:{" "}
                            {peopleDiscovery.primary_person_intelligence.why_not_other_candidates.join(
                              " ",
                            )}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                    {peopleDiscovery.alternative_people_intelligence?.length ? (
                      <div>
                        <span className="field-label">
                          Alternative decision makers
                        </span>
                        <div className="campaign-details-signal-list">
                          {peopleDiscovery.alternative_people_intelligence.map(
                            (person, index) => (
                              <article
                                className="campaign-details-signal-card"
                                key={`${lead.id}-person-intelligence-${index}`}
                              >
                                <div className="campaign-details-signal-heading">
                                  <strong>{person.candidate.full_name}</strong>
                                  <span className="mock-pill">
                                    {person.person_score}/100
                                  </span>
                                </div>
                                <p>
                                  {[person.candidate.role_title, person.candidate.department]
                                    .filter(Boolean)
                                    .join(" - ") || "Role not available"}
                                </p>
                                <p className="company-domain">
                                  Authority {person.decision_authority} -
                                  Ownership {person.business_problem_ownership} -
                                  Confidence {person.confidence_score}/100
                                </p>
                                <p className="company-domain">
                                  Next:{" "}
                                  {getRecommendedNextActionLabel(
                                    person.recommended_next_action,
                                  )}
                                </p>
                              </article>
                            ),
                          )}
                        </div>
                      </div>
                    ) : null}
                    {peopleDiscovery.primary_person?.role_title ? (
                      <div>
                        <span className="field-label">Found role</span>
                        <p>{peopleDiscovery.primary_person.role_title}</p>
                      </div>
                    ) : null}
                    {peopleDiscovery.primary_person?.linkedin_url ? (
                      <div>
                        <span className="field-label">Found LinkedIn</span>
                        <a
                          className="source-link"
                          href={peopleDiscovery.primary_person.linkedin_url}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Open LinkedIn
                        </a>
                      </div>
                    ) : null}
                    {peopleDiscovery.primary_person?.work_email ? (
                      <div>
                        <span className="field-label">Found email</span>
                        <p>{peopleDiscovery.primary_person.work_email}</p>
                      </div>
                    ) : null}
                    <div>
                      <span className="field-label">Contact intelligence</span>
                      <p>
                        Best method:{" "}
                        {contactIntelligence.best_method
                          ? `${contactIntelligence.best_method.label} - ${formatContactMethod(
                              contactIntelligence.best_method,
                            )}`
                          : "Not found"}
                      </p>
                    </div>
                    <div>
                      <span className="field-label">Best email</span>
                      <p>{formatContactMethod(contactIntelligence.best_email)}</p>
                    </div>
                    <div>
                      <span className="field-label">Best LinkedIn</span>
                      <p>
                        {formatContactMethod(contactIntelligence.best_linkedin)}
                      </p>
                    </div>
                    <div>
                      <span className="field-label">Best Telegram</span>
                      <p>
                        {formatContactMethod(contactIntelligence.best_telegram)}
                      </p>
                    </div>
                    <div>
                      <span className="field-label">Best alternative channel</span>
                      <p>
                        {formatContactMethod(
                          contactIntelligence.best_alternative,
                        )}
                      </p>
                    </div>
                    <div>
                      <span className="field-label">Best fallback</span>
                      <p>
                        {formatContactMethod(contactIntelligence.fallback_method)}
                      </p>
                    </div>
                    {typeof peopleDiscovery.primary_person?.confidence_score ===
                    "number" ? (
                      <div>
                        <span className="field-label">People confidence</span>
                        <p>
                          {peopleDiscovery.primary_person.confidence_score}/100
                        </p>
                      </div>
                    ) : null}
                    {peopleDiscovery.providers_used ? (
                      <div>
                        <span className="field-label">People providers</span>
                        <p>{peopleDiscovery.providers_used.join(", ")}</p>
                      </div>
                    ) : null}
                    <div>
                      <span className="field-label">Persona search status</span>
                      <p>{getPersonaSearchStatusLabel(personaSearchStatus)}</p>
                    </div>
                    {decisionMaker.search_keywords ? (
                      <div>
                        <span className="field-label">Search keywords</span>
                        <p>{decisionMaker.search_keywords.join(", ")}</p>
                      </div>
                    ) : null}
                    {decisionMaker.source_reasoning?.matched_context_terms ? (
                      <div>
                        <span className="field-label">Matched context</span>
                        <p>
                          {decisionMaker.source_reasoning.matched_context_terms.join(
                            ", ",
                          )}
                        </p>
                      </div>
                    ) : null}
                    <div>
                      <span className="field-label">Lead Priority</span>
                      <p>
                        {leadPriority.priority
                          ? `${leadPriority.priority} (${leadPriority.priority_score ?? 0}/100)`
                          : "Not calculated"}
                      </p>
                    </div>
                    {leadPriority.reasoning ? (
                      <div>
                        <span className="field-label">Priority reasoning</span>
                        <p>{leadPriority.reasoning}</p>
                      </div>
                    ) : null}
                    {leadPriority.components ? (
                      <div>
                        <span className="field-label">Priority components</span>
                        <p>
                          ICP {leadPriority.components.icp_score}/100 {"\u00b7"} Signal{" "}
                          {leadPriority.components.signal_strength}/100 {"\u00b7"} Intent{" "}
                          {leadPriority.components.buying_intent}/100 {"\u00b7"} Timing{" "}
                          {leadPriority.components.timing_score}/100 {"\u00b7"} Contact{" "}
                          {leadPriority.components.contact_readiness}/100 {"\u00b7"}
                          Confidence {leadPriority.components.confidence}/100
                        </p>
                      </div>
                    ) : null}
                    {leadPriority.strengths?.length ? (
                      <div>
                        <span className="field-label">Strengths</span>
                        <p>{leadPriority.strengths.join(" ")}</p>
                      </div>
                    ) : null}
                    {leadPriority.risks?.length ? (
                      <div>
                        <span className="field-label">Risks</span>
                        <p>{leadPriority.risks.join(" ")}</p>
                      </div>
                    ) : null}
                    <div>
                      <span className="field-label">Recommended next action</span>
                      <p>
                        {getRecommendedNextActionLabel(
                          leadPriority.recommended_next_action,
                        )}
                      </p>
                    </div>
                  </div>
                  <span className="field-label">Sources</span>
                  <div className="campaign-details-signal-list">
                    {leadSignals.map((signal) => (
                      <article
                        className="campaign-details-signal-card"
                        key={`${lead.id}-${signal.signal_type}-${signal.signal_title}`}
                      >
                        <div className="campaign-details-signal-heading">
                          <span className="mock-pill">
                            {signalTypeLabels[signal.signal_type]}
                          </span>
                          <strong>{signal.confidence_score}/100</strong>
                        </div>
                        <h4>{signal.signal_title}</h4>
                        <p>{signal.signal_detail}</p>
                        <p className="company-domain">
                          {signal.signal_source_label} {"\u00b7"}{" "}
                          {new Date(signal.found_at).toLocaleString("ru-RU")}
                        </p>
                        {signal.source_url ? (
                          <a
                            className="source-link"
                            href={signal.source_url}
                            rel="noreferrer"
                            target="_blank"
                          >
                            {"\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a \u0441\u0438\u0433\u043d\u0430\u043b\u0430"}
                          </a>
                        ) : null}
                      </article>
                    ))}
                  </div>
                </div>

                {expandedLeadId === lead.id ? (
                  <div className="campaign-details-copy">
                    <div>
                      <span className="field-label">{"\u0425\u0443\u043a"}</span>
                      <p>{lead.hook}</p>
                    </div>
                    <div>
                      <span className="field-label">{"\u0421\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435"}</span>
                      <p>{lead.message}</p>
                    </div>
                    <div>
                      <span className="field-label">{"\u041f\u043e\u0432\u0442\u043e\u0440\u043d\u043e\u0435 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435"}</span>
                      <p>{lead.follow_up}</p>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
