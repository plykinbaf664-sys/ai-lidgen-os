import type {
  DecisionMakerProfile,
  LeadgenContact,
  LeadgenLead,
  LeadPriority,
  OpportunityAssessment,
  PeopleDiscoveryResult,
  PersonaSearchStatus,
} from "@/lib/leadgen/types";

const statusLabels: Record<LeadgenLead["status"], string> = {
  new: "New",
  approved: "Approved",
  rejected: "Rejected",
  paused: "Paused",
};

export type TelegramCardContext = {
  decisionMaker?: DecisionMakerProfile | null;
  bestAvailableEntry?: LeadgenContact | null;
  bestOutreachEntry?: LeadgenContact | null;
  fallbackEntry?: LeadgenContact | null;
  peopleDiscovery?: PeopleDiscoveryResult | null;
  personaSearchStatus?: PersonaSearchStatus;
  leadPriority?: LeadPriority | null;
  opportunity?: OpportunityAssessment | null;
};

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
    company_website: "Company website",
    no_contact_found: "No contact found",
  };

  return labels[contact.contact_type];
}

function getPersonaSearchStatusLabel(status?: PersonaSearchStatus): string {
  const labels: Record<PersonaSearchStatus, string> = {
    target_persona_found: "Target persona found",
    alternative_persona_found: "Alternative persona found",
    department_entry_found: "Department-level entry found",
    generic_entry_found: "Generic business entry found",
    fallback_only:
      "Fallback only - target persona not found in available public data",
    no_entry_found: "No public entry point found",
  };

  return status ? labels[status] : "Persona search context unavailable";
}

function isDirectOutreachEntry(contact?: LeadgenContact | null): boolean {
  return (
    contact?.contact_type === "work_email" ||
    contact?.contact_type === "linkedin" ||
    contact?.contact_type === "telegram" ||
    contact?.contact_type === "phone" ||
    contact?.contact_type === "confirmed_person" ||
    contact?.contact_type === "role_based_person"
  );
}

export function formatTelegramCard(
  lead: LeadgenLead,
  context: TelegramCardContext = {},
): string {
  const bestOutreachEntry =
    context.bestOutreachEntry ??
    (isDirectOutreachEntry(context.bestAvailableEntry)
      ? context.bestAvailableEntry
      : null);
  const fallbackEntry = context.fallbackEntry;
  const bestContactChannel = bestOutreachEntry ?? fallbackEntry;
  const bestContactChannelValue = bestContactChannel
    ? getContactValue(bestContactChannel)
    : null;
  const bestContactChannelLabel = bestContactChannel
    ? `${getContactLabel(bestContactChannel)}: ${
        bestContactChannelValue ?? "No direct value"
      } Confidence: ${bestContactChannel.confidence_score}/100 Source: ${
        bestContactChannel.source_label ?? "source not available"
      }`
    : "No contact channel found";
  const bestOutreachEntryValue = bestOutreachEntry
    ? getContactValue(bestOutreachEntry)
    : null;
  const bestOutreachEntryLabel =
    bestOutreachEntry && isDirectOutreachEntry(bestOutreachEntry)
      ? `${getContactLabel(bestOutreachEntry)}: ${
          bestOutreachEntryValue ?? "No direct value"
        } Confidence: ${bestOutreachEntry.confidence_score}/100`
      : "Not found yet";
  const fallbackEntryValue = fallbackEntry ? getContactValue(fallbackEntry) : null;
  const fallbackEntryLabel = fallbackEntry
    ? `${getContactLabel(fallbackEntry)}: ${
        fallbackEntryValue ?? "No direct value"
      } Confidence: ${fallbackEntry.confidence_score}/100`
    : "No fallback entry found";
  const decisionMaker = context.decisionMaker;
  const leadPriority = context.leadPriority;
  const opportunity = context.opportunity;
  const foundPerson = context.peopleDiscovery?.primary_person;
  const whyThisCompany =
    opportunity?.why_this_company ??
    lead.signal_detail ??
    "The company matched the discovery pipeline, but the specific business reason is not available.";
  const whyNow =
    opportunity?.why_now ??
    "No precise timing reason is available; treat this as a lower-confidence outreach window.";
  const businessReasoning =
    opportunity?.business_reasoning ??
    decisionMaker?.expected_pain ??
    "Commercial reasoning is not available in this card context.";
  const personaLines = decisionMaker
    ? [
        `Target persona: ${decisionMaker.primary_persona}`,
        `Why this person: ${decisionMaker.reasoning}`,
        `Expected pain: ${decisionMaker.expected_pain}`,
        `Expected goal: ${decisionMaker.expected_goal}`,
        `Alternative personas: ${decisionMaker.alternative_personas.join(", ")}`,
        `Persona search status: ${getPersonaSearchStatusLabel(
          context.personaSearchStatus,
        )}`,
      ]
    : [
        "Target persona: not available in this card context",
        `Persona search status: ${getPersonaSearchStatusLabel(
          context.personaSearchStatus,
        )}`,
      ];
  const confidenceLines = decisionMaker
    ? [
        `Decision confidence: ${decisionMaker.confidence_score}/100`,
        `Business problem owner: ${decisionMaker.business_problem_owner}`,
      ]
    : [];

  return [
    `NEW LEAD: ${lead.company_name}`,
    "",
    `Segment: ${lead.company_segment}`,
    `Website: ${lead.company_domain ?? "not found"}`,
    `Why this company: ${whyThisCompany}`,
    `Why now: ${whyNow}`,
    `Business reasoning: ${businessReasoning}`,
    ...personaLines,
    ...confidenceLines,
    `Found person: ${foundPerson?.full_name ?? "Not found"}`,
    ...(foundPerson
      ? [
          `Found role: ${foundPerson.role_title ?? "unknown"}`,
          `Found LinkedIn: ${foundPerson.linkedin_url ?? "not found"}`,
          `Found email: ${foundPerson.work_email ?? "not found"}`,
          `People source: ${foundPerson.source}`,
          `People confidence: ${foundPerson.confidence_score}/100`,
        ]
      : [
          `People discovery status: ${
            context.peopleDiscovery?.search_status ?? "not_run"
          }`,
        ]),
    `Best contact channel: ${bestContactChannelLabel}`,
    `Best outreach entry: ${bestOutreachEntryLabel}`,
    `Fallback entry: ${fallbackEntryLabel}`,
    ...(leadPriority
      ? [
          `Lead priority: ${leadPriority.priority} (${leadPriority.priority_score}/100)`,
          `Priority reason: ${leadPriority.reasoning}`,
          `Recommended next action: ${leadPriority.recommended_next_action}`,
        ]
      : []),
    ...(opportunity
      ? [
          `Opportunity: ${opportunity.opportunity_type} (${opportunity.opportunity_score}/100)`,
          `Opportunity action: ${opportunity.recommended_action}`,
        ]
      : []),
    "",
    `Signal: ${lead.signal_title}`,
    `${lead.signal_detail}`,
    `Source: ${lead.signal_source_label}`,
    "",
    `Hook: ${lead.hook}`,
    "",
    `Message: ${lead.message}`,
    "",
    `Follow-up: ${lead.follow_up}`,
    "",
    `Status: ${statusLabels[lead.status]}`,
  ].join("\n");
}
