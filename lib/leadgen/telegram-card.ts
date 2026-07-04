import type {
  DecisionMakerProfile,
  LeadgenContact,
  LeadgenLead,
  LeadPriority,
  OpportunityAssessment,
  IdentityProfile,
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
  identityProfile?: IdentityProfile | null;
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

function getRecommendedNextActionLabel(action?: unknown): string {
  const labels: Record<string, string> = {
    send_outreach: "Send outreach",
    run_enrichment: "Run enrichment",
    use_fallback_channel: "Use fallback channel",
    manual_review: "Review manually",
    skip_until_contact_found: "Skip until contact is found",
    contact_primary_person: "Contact primary person",
    contact_alternative_person: "Contact alternative person",
    monitor_changes: "Monitor changes",
  };

  return typeof action === "string" ? labels[action] ?? action : "Not calculated";
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
  const identityProfile =
    context.identityProfile ??
    ((context.bestAvailableEntry?.metadata.identity_profile ??
      context.bestOutreachEntry?.metadata.identity_profile ??
      context.fallbackEntry?.metadata.identity_profile) as
      | IdentityProfile
      | undefined) ??
    null;
  const identityPrimaryChannel = identityProfile?.primary_contact_channel ?? null;
  const identityFallbackChannel = identityProfile?.fallback_channel ?? null;
  const bestContactChannel = bestOutreachEntry ?? fallbackEntry;
  const contactRecommendedNextAction =
    bestContactChannel?.metadata.recommended_next_action;
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
  const foundPersonIntelligence =
    context.peopleDiscovery?.primary_person_intelligence;
  const personSelectionReason =
    context.peopleDiscovery?.selection_reasoning ??
    foundPersonIntelligence?.selection_reason;
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
          `Primary decision maker reason: ${
            personSelectionReason ?? "Selection reason not available"
          }`,
          `Person score: ${
            foundPersonIntelligence?.person_score ?? foundPerson.confidence_score
          }/100`,
          `Persona match score: ${
            foundPersonIntelligence?.persona_match_score ?? "not calculated"
          }`,
          `Business problem ownership: ${
            foundPersonIntelligence?.business_problem_ownership ??
            "not calculated"
          }`,
          `Decision authority: ${
            foundPersonIntelligence?.decision_authority ?? "not calculated"
          }`,
          `Influence level: ${
            foundPersonIntelligence?.influence_level ?? "not calculated"
          }`,
          `Person confidence: ${
            foundPersonIntelligence?.confidence_score ??
            foundPerson.confidence_score
          }/100`,
          `Person next action: ${getRecommendedNextActionLabel(
            foundPersonIntelligence?.recommended_next_action,
          )}`,
          `Person strengths: ${
            foundPersonIntelligence?.strengths.length
              ? foundPersonIntelligence.strengths.join(" ")
              : "not recorded"
          }`,
          `Person risks: ${
            foundPersonIntelligence?.weaknesses.length
              ? foundPersonIntelligence.weaknesses.join(" ")
              : "not recorded"
          }`,
          `Why not alternatives: ${
            foundPersonIntelligence?.why_not_other_candidates.length
              ? foundPersonIntelligence.why_not_other_candidates.join(" ")
              : "not recorded"
          }`,
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
    `Identity summary: ${
      identityProfile?.identity_summary ??
      "No confirmed personal contact found. Identity profile unavailable."
    }`,
    `Identity confidence: ${
      typeof identityProfile?.identity_confidence === "number"
        ? `${identityProfile.identity_confidence}/100`
        : "not calculated"
    }`,
    `Best identity channel: ${
      identityPrimaryChannel
        ? `${identityPrimaryChannel.label}: ${identityPrimaryChannel.value ?? "No direct value"}`
        : "Not found yet"
    }`,
    `Identity fallback: ${
      identityFallbackChannel
        ? `${identityFallbackChannel.label}: ${identityFallbackChannel.value ?? "No direct value"}`
        : "Not found"
    }`,
    `Identity next action: ${getRecommendedNextActionLabel(
      identityProfile?.recommended_next_action,
    )}`,
    `Best outreach entry: ${bestOutreachEntryLabel}`,
    `Fallback entry: ${fallbackEntryLabel}`,
    `Contact next action: ${getRecommendedNextActionLabel(
      contactRecommendedNextAction,
    )}`,
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
