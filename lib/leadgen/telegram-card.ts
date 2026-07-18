import {
  getActionForReadiness,
  getContactDisplay,
  getContactValue,
  getPersonSelectionLabel,
  getReadinessLabel,
  getSourceDisplay,
  makeShortWhyNow,
} from "@/lib/leadgen/ui-labels";
import { buildEmailOutreach } from "@/lib/leadgen/email-outreach-builder";
import { normalizeLeadgenText } from "@/lib/leadgen/text-normalization";
import {
  isFallbackEmailContact,
  isSendableEmailContact,
} from "@/lib/leadgen/contact-channel-ranking";
import type {
  DecisionMakerProfile,
  IdentityProfile,
  LeadgenContact,
  LeadgenLead,
  LeadPriority,
  LeadReadinessStatus,
  OpportunityAssessment,
  PeopleDiscoveryResult,
  PersonaSearchStatus,
} from "@/lib/leadgen/types";

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

function isDirectOutreachEntry(contact?: LeadgenContact | null): boolean {
  return isSendableEmailContact(contact ?? null);
}

function getContactReadiness({
  bestOutreachEntry,
  fallbackEntry,
  peopleDiscovery,
}: {
  bestOutreachEntry?: LeadgenContact | null;
  fallbackEntry?: LeadgenContact | null;
  peopleDiscovery?: PeopleDiscoveryResult | null;
}): LeadReadinessStatus {
  if (isSendableEmailContact(bestOutreachEntry ?? null)) {
    return "outreach_ready";
  }

  if (isFallbackEmailContact(fallbackEntry ?? null)) {
    return "fallback_ready";
  }

  return peopleDiscovery?.primary_person
    ? "enrichment_required"
    : "provider_exhausted";
}

function getPersonSelectionType(
  peopleDiscovery?: PeopleDiscoveryResult | null,
): string {
  const intelligence = peopleDiscovery?.primary_person_intelligence;

  if (!peopleDiscovery?.primary_person) {
    return "not_found";
  }

  if (!intelligence) {
    return "unverified_fallback";
  }

  if (intelligence.persona_match_score >= 70) {
    return "exact_persona_match";
  }

  if (intelligence.persona_match_score >= 45) {
    return "alternative_persona_match";
  }

  if (intelligence.decision_authority === "high") {
    return "authority_fallback";
  }

  return "unverified_fallback";
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
  const displayedContact = bestOutreachEntry ?? fallbackEntry ?? null;
  const readiness = getContactReadiness({
    bestOutreachEntry,
    fallbackEntry,
    peopleDiscovery: context.peopleDiscovery,
  });
  const contact = getContactDisplay(displayedContact);
  const foundPerson = context.peopleDiscovery?.primary_person;
  const whyNow = makeShortWhyNow(
    lead.signal_title,
    context.opportunity?.why_now ?? lead.signal_detail,
  );
  const draft = buildEmailOutreach({
    companyName: lead.company_name,
    personName: foundPerson?.full_name,
    contact: displayedContact,
    readiness,
    whyNow,
    signalTitle: lead.signal_title,
    signalDetail: lead.signal_detail,
  });

  return [
    `Компания: ${normalizeLeadgenText(lead.company_name)}`,
    `Почему сейчас: ${whyNow}`,
    `Кому писать: ${
      foundPerson?.full_name
          ? `${normalizeLeadgenText(foundPerson.full_name)}, ${
              foundPerson.role_title
                ? normalizeLeadgenText(foundPerson.role_title)
                : "роль не найдена"
            }`
        : "ЛПР не найден"
    }`,
    `Тип выбора: ${getPersonSelectionLabel(
      getPersonSelectionType(context.peopleDiscovery),
    )}`,
    `Контакт: ${contact.value}`,
    `Тип контакта: ${contact.type}`,
    `Готовность: ${getReadinessLabel(readiness)}`,
    `Следующий шаг: ${getActionForReadiness(readiness)}`,
    "",
    draft.readyToSend
      ? `Тема письма: ${draft.subject}\n\nТекст письма:\n${draft.body}`
      : draft.body,
    "",
    `Источник контакта: ${getSourceDisplay(displayedContact?.source_url)}`,
    `Прямой контакт: ${getContactValue(bestOutreachEntry ?? null) ?? "не найден"}`,
    `Резервный контакт: ${getContactValue(fallbackEntry ?? null) ?? "не найден"}`,
  ].join("\n");
}
