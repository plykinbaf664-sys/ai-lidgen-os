"use client";

import { useState } from "react";
import type {
  LeadgenCampaignDetails,
  LeadgenContact,
  LeadgenLead,
  LeadPriority,
  LeadgenSignal,
  SignalType,
} from "@/lib/leadgen/types";

const statusLabels: Record<LeadgenCampaignDetails["campaign"]["status"], string> =
  {
    completed: "Завершена",
  };

const signalTypeLabels: Record<SignalType, string> = {
  HIRING_SIGNAL: "Найм",
  GO_TO_MARKET_SIGNAL: "Go-to-market",
  GROWTH_SIGNAL: "Рост",
  CONTENT_SIGNAL: "Контент",
  TRAFFIC_SIGNAL: "Трафик",
  TECH_SIGNAL: "Технологии",
};

const contactTypeLabels: Record<LeadgenContact["contact_type"], string> = {
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

type PeopleDiscoveryView = {
  primary_person?: PersonCandidateView;
  alternative_people?: PersonCandidateView[];
  search_status?: string;
  providers_used?: string[];
};

type LeadPriorityView = Partial<LeadPriority>;

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

function getRecommendedNextActionLabel(action?: string): string {
  const labels: Record<string, string> = {
    send_outreach: "Send outreach",
    run_enrichment: "Run enrichment",
    find_target_persona: "Find target persona",
    monitor_for_new_signal: "Monitor for a stronger signal",
    defer: "Defer",
    review_manually: "Review manually",
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

function getContactValue(contact: LeadgenContact): string | null {
  return (
    contact.email ??
    contact.linkedin_url ??
    contact.telegram_url ??
    contact.contact_url
  );
}

function getBestContactForLead(
  lead: LeadgenLead,
  contactsByLeadId: Map<string, LeadgenContact[]>,
): LeadgenContact | null {
  const contacts = contactsByLeadId.get(lead.id) ?? [];
  const primaryContact = contacts.find((contact) => contact.is_primary);

  return primaryContact ?? contacts[0] ?? null;
}

function getBestOutreachEntryForLead(
  lead: LeadgenLead,
  contactsByLeadId: Map<string, LeadgenContact[]>,
): LeadgenContact | null {
  const contacts = contactsByLeadId.get(lead.id) ?? [];
  const bestOutreachEntry = contacts.find(
    (contact) => contact.metadata.entry_role === "best_outreach_entry",
  );

  if (bestOutreachEntry) {
    return bestOutreachEntry;
  }

  return (
    contacts.find(
      (contact) =>
        contact.contact_type !== "company_website" &&
        contact.contact_type !== "no_contact_found" &&
        contact.is_primary,
    ) ??
    contacts.find(
      (contact) =>
        contact.contact_type !== "company_website" &&
        contact.contact_type !== "no_contact_found",
    ) ??
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
          <h3>Загружаю детали кампании</h3>
          <p>Получаю сохранённые компании, события и уведомления из Supabase.</p>
        </div>
      </section>
    );
  }

  if (errorMessage) {
    return (
      <section className="panel campaign-details-panel">
        <div className="empty-state">
          <h3>Не удалось открыть кампанию</h3>
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
          <p className="eyebrow">Детали запуска</p>
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
            <span className="field-label">Компаний найдено</span>
            <strong>{details.stats.companies_count}</strong>
          </div>
          <div>
            <span className="field-label">Контактов найдено</span>
            <strong>{details.stats.contacts_count}</strong>
          </div>
          <div>
            <span className="field-label">Сигналов найдено</span>
            <strong>{details.stats.signals_count}</strong>
          </div>
          <div>
            <span className="field-label">Уведомлений подготовлено</span>
            <strong>{details.stats.notifications_count}</strong>
          </div>
          <div>
            <span className="field-label">Событий создано</span>
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
            const bestContact = getBestContactForLead(lead, contactsByLeadId);
            const bestOutreachEntry = getBestOutreachEntryForLead(
              lead,
              contactsByLeadId,
            );
            const fallbackEntry = getFallbackEntryForLead(lead, contactsByLeadId);
            const bestOutreachValue = bestOutreachEntry
              ? getContactValue(bestOutreachEntry)
              : null;
            const fallbackValue = fallbackEntry
              ? getContactValue(fallbackEntry)
              : null;
            const personaSearchStatus = getPersonaSearchStatus(
              bestOutreachEntry ?? fallbackEntry ?? bestContact,
            );

            return (
              <article className="campaign-details-lead" key={lead.id}>
                <div className="campaign-details-lead-main">
                  <div>
                    <h3>{lead.company_name}</h3>
                    <p className="company-domain">
                      {lead.company_domain ?? "Р”РѕРјРµРЅ РЅРµ РЅР°Р№РґРµРЅ"}
                    </p>
                    {lead.company_source_url ? (
                      <a
                        className="source-link"
                        href={lead.company_source_url}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Источник компании
                      </a>
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
                    <span className="field-label">Fallback entry</span>
                    <p>
                      {fallbackEntry
                        ? contactTypeLabels[fallbackEntry.contact_type]
                        : "No fallback found"}
                    </p>
                    <p className="company-domain">
                      {fallbackValue ?? "No fallback entry point found"}
                    </p>
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
                    {expandedLeadId === lead.id ? "Скрыть" : "Раскрыть"}
                  </button>
                </div>

                <div className="campaign-details-signal">
                  <span className="field-label">Сигналы</span>
                  <div className="campaign-details-copy">
                    <div>
                      <span className="field-label">Signal summary</span>
                      <p>{lead.signal_detail}</p>
                    </div>
                    <div>
                      <span className="field-label">Why this company</span>
                      <p>
                        {interpretation.why_it_matters ??
                          "This company entered the lead queue because the signal passed production quality checks and matched the ICP scoring layer."}
                      </p>
                    </div>
                    <div>
                      <span className="field-label">Why now</span>
                      <p>
                        {interpretation.why_now ??
                          "The current public evidence is not strong enough to state a precise timing reason; treat this as a lower-confidence outreach window."}
                      </p>
                    </div>
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
                          ICP {leadPriority.components.icp_score}/100 · Signal{" "}
                          {leadPriority.components.signal_strength}/100 · Intent{" "}
                          {leadPriority.components.buying_intent}/100 · Timing{" "}
                          {leadPriority.components.timing_score}/100 · Contact{" "}
                          {leadPriority.components.contact_readiness}/100 ·
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
                          {signal.signal_source_label} ·{" "}
                          {new Date(signal.found_at).toLocaleString("ru-RU")}
                        </p>
                        {signal.source_url ? (
                          <a
                            className="source-link"
                            href={signal.source_url}
                            rel="noreferrer"
                            target="_blank"
                          >
                            Открыть источник сигнала
                          </a>
                        ) : null}
                      </article>
                    ))}
                  </div>
                </div>

                {expandedLeadId === lead.id ? (
                  <div className="campaign-details-copy">
                    <div>
                      <span className="field-label">Хук</span>
                      <p>{lead.hook}</p>
                    </div>
                    <div>
                      <span className="field-label">Сообщение</span>
                      <p>{lead.message}</p>
                    </div>
                    <div>
                      <span className="field-label">Повторное сообщение</span>
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
