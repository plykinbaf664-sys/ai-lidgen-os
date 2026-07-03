import type { LeadgenContact, PersonCandidate } from "@/lib/leadgen/types";

export type ContactMethod = {
  label: string;
  value: string | null;
  confidence_score: number;
  source_label: string | null;
  source_url: string | null;
};

export type ContactIntelligence = {
  best_method: ContactMethod | null;
  best_email: ContactMethod | null;
  best_linkedin: ContactMethod | null;
  best_telegram: ContactMethod | null;
  best_alternative: ContactMethod | null;
  fallback_method: ContactMethod | null;
};

type PeopleDiscoveryContactContext = {
  primary_person?: Partial<PersonCandidate> | null;
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

export function getContactValue(contact?: LeadgenContact | null): string | null {
  return (
    contact?.email ??
    contact?.linkedin_url ??
    contact?.telegram_url ??
    (typeof contact?.metadata.phone === "string" ? contact.metadata.phone : null) ??
    contact?.contact_url ??
    null
  );
}

export function getContactSourceLabel(
  contact?: LeadgenContact | null,
): string | null {
  const extraction = contact?.metadata.extraction;

  return (
    contact?.source_label ??
    (typeof extraction === "string" ? extraction : null)
  );
}

function createContactMethod({
  label,
  value,
  confidenceScore,
  sourceLabel,
  sourceUrl,
}: {
  label: string;
  value: string | null | undefined;
  confidenceScore: number | undefined;
  sourceLabel: string | null | undefined;
  sourceUrl: string | null | undefined;
}): ContactMethod | null {
  if (!value) {
    return null;
  }

  return {
    label,
    value,
    confidence_score: confidenceScore ?? 0,
    source_label: sourceLabel ?? null,
    source_url: sourceUrl ?? null,
  };
}

function getPrimaryPersonContact({
  peopleDiscovery,
  contacts,
}: {
  peopleDiscovery?: PeopleDiscoveryContactContext | null;
  contacts: LeadgenContact[];
}): LeadgenContact | null {
  const person = peopleDiscovery?.primary_person;

  if (!person) {
    return null;
  }

  return (
    contacts.find(
      (contact) =>
        (person.linkedin_url && contact.linkedin_url === person.linkedin_url) ||
        (person.work_email && contact.email === person.work_email) ||
        (person.phone && contact.metadata.phone === person.phone) ||
        (person.full_name && contact.full_name === person.full_name),
    ) ?? null
  );
}

function getAlternativeMethod(contacts: LeadgenContact[]): ContactMethod | null {
  const alternativeContact = contacts.find(
    (contact) =>
      contact.contact_type !== "confirmed_person" &&
      contact.contact_type !== "role_based_person" &&
      contact.contact_type !== "work_email" &&
      contact.contact_type !== "linkedin" &&
      contact.contact_type !== "telegram" &&
      contact.contact_type !== "phone" &&
      contact.contact_type !== "company_website" &&
      contact.contact_type !== "no_contact_found",
  );

  if (!alternativeContact) {
    return null;
  }

  return createContactMethod({
    label: contactTypeLabels[alternativeContact.contact_type],
    value: getContactValue(alternativeContact),
    confidenceScore: alternativeContact.confidence_score,
    sourceLabel: getContactSourceLabel(alternativeContact),
    sourceUrl: alternativeContact.source_url,
  });
}

function getFallbackMethod(
  fallbackEntry?: LeadgenContact | null,
): ContactMethod | null {
  if (!fallbackEntry) {
    return null;
  }

  return createContactMethod({
    label: contactTypeLabels[fallbackEntry.contact_type],
    value: getContactValue(fallbackEntry),
    confidenceScore: fallbackEntry.confidence_score,
    sourceLabel: getContactSourceLabel(fallbackEntry),
    sourceUrl: fallbackEntry.source_url,
  });
}

export function getContactIntelligence({
  peopleDiscovery,
  contacts = [],
  bestOutreachEntry,
  fallbackEntry,
}: {
  peopleDiscovery?: PeopleDiscoveryContactContext | null;
  contacts?: LeadgenContact[];
  bestOutreachEntry?: LeadgenContact | null;
  fallbackEntry?: LeadgenContact | null;
}): ContactIntelligence {
  const availableContacts = [
    ...contacts,
    ...(bestOutreachEntry ? [bestOutreachEntry] : []),
    ...(fallbackEntry ? [fallbackEntry] : []),
  ];
  const person = peopleDiscovery?.primary_person;
  const personContact = getPrimaryPersonContact({
    peopleDiscovery,
    contacts: availableContacts,
  });
  const sourceLabel =
    person?.source ?? (personContact ? getContactSourceLabel(personContact) : null);
  const sourceUrl =
    person?.linkedin_url ?? personContact?.source_url ?? personContact?.contact_url;
  const confidenceScore =
    person?.confidence_score ?? personContact?.confidence_score ?? 0;
  const bestEmail = createContactMethod({
    label: "Email",
    value: person?.work_email ?? personContact?.email,
    confidenceScore,
    sourceLabel,
    sourceUrl,
  });
  const bestLinkedIn = createContactMethod({
    label: "LinkedIn",
    value: person?.linkedin_url ?? personContact?.linkedin_url,
    confidenceScore,
    sourceLabel,
    sourceUrl,
  });
  const bestTelegram = createContactMethod({
    label: "Telegram",
    value: personContact?.telegram_url ?? bestOutreachEntry?.telegram_url,
    confidenceScore:
      personContact?.confidence_score ?? bestOutreachEntry?.confidence_score,
    sourceLabel:
      getContactSourceLabel(personContact) ??
      getContactSourceLabel(bestOutreachEntry),
    sourceUrl: personContact?.source_url ?? bestOutreachEntry?.source_url,
  });
  const bestPhone = createContactMethod({
    label: "Phone",
    value:
      typeof personContact?.metadata.phone === "string"
        ? personContact.metadata.phone
        : typeof bestOutreachEntry?.metadata.phone === "string"
          ? bestOutreachEntry.metadata.phone
          : null,
    confidenceScore:
      personContact?.confidence_score ?? bestOutreachEntry?.confidence_score,
    sourceLabel:
      getContactSourceLabel(personContact) ??
      getContactSourceLabel(bestOutreachEntry),
    sourceUrl: personContact?.source_url ?? bestOutreachEntry?.source_url,
  });
  const bestAlternative =
    getAlternativeMethod(availableContacts) ??
    createContactMethod({
      label: "Alternative",
      value: getContactValue(bestOutreachEntry),
      confidenceScore: bestOutreachEntry?.confidence_score,
      sourceLabel: getContactSourceLabel(bestOutreachEntry),
      sourceUrl: bestOutreachEntry?.source_url,
    });
  const fallbackMethod = getFallbackMethod(fallbackEntry);

  return {
    best_method:
      bestEmail ??
      bestLinkedIn ??
      bestTelegram ??
      bestPhone ??
      bestAlternative ??
      fallbackMethod,
    best_email: bestEmail,
    best_linkedin: bestLinkedIn,
    best_telegram: bestTelegram,
    best_alternative: bestAlternative,
    fallback_method: fallbackMethod,
  };
}
