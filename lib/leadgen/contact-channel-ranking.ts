import type { ContactEntryRole, LeadgenContact } from "@/lib/leadgen/types";

export const contactTypePriority: Record<LeadgenContact["contact_type"], number> =
  {
    work_email: 110,
    linkedin: 95,
    telegram: 90,
    phone: 85,
    generic_email: 80,
    website_form: 70,
    company_social: 50,
    no_contact_found: 0,
    // Legacy types are kept for stored records, but new discovery emits the
    // normalized contact types above.
    confirmed_person: 100,
    role_based_person: 90,
    contact_form: 75,
    social_profile: 55,
    company_website: 35,
  };

const outreachContactTypes = new Set<LeadgenContact["contact_type"]>([
  "work_email",
  "linkedin",
  "telegram",
  "phone",
]);

const fallbackContactTypes = new Set<LeadgenContact["contact_type"]>([
  "generic_email",
  "website_form",
  "company_social",
  "company_website",
  "no_contact_found",
]);

function hasReachableValue(contact: LeadgenContact): boolean {
  return Boolean(
    contact.email ||
      contact.linkedin_url ||
      contact.telegram_url ||
      typeof contact.metadata.phone === "string" ||
      contact.contact_url ||
      contact.contact_type === "no_contact_found",
  );
}

function hasSource(contact: LeadgenContact): boolean {
  return Boolean(contact.source_label || contact.source_url);
}

function getPeopleDiscoveryRole(contact: LeadgenContact): string | null {
  const role = contact.metadata.people_discovery_role;

  return typeof role === "string" ? role : null;
}

function isPrimaryPersonContact(contact: LeadgenContact): boolean {
  return getPeopleDiscoveryRole(contact) === "primary";
}

function isAlternativePersonContact(contact: LeadgenContact): boolean {
  return getPeopleDiscoveryRole(contact) === "alternative";
}

export type RankedContactEntries = {
  best_available_entry: LeadgenContact;
  best_outreach_entry: LeadgenContact | null;
  fallback_entry: LeadgenContact | null;
};

function sortByContactPriority(
  left: LeadgenContact,
  right: LeadgenContact,
): number {
  const primaryPersonDiff =
    Number(isPrimaryPersonContact(right)) - Number(isPrimaryPersonContact(left));

  if (primaryPersonDiff !== 0) {
    return primaryPersonDiff;
  }

  const alternativePersonDiff =
    Number(isAlternativePersonContact(right)) -
    Number(isAlternativePersonContact(left));

  if (alternativePersonDiff !== 0) {
    return alternativePersonDiff;
  }

  const priorityDiff =
    contactTypePriority[right.contact_type] -
    contactTypePriority[left.contact_type];

  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  return right.confidence_score - left.confidence_score;
}

export function chooseBestAvailableEntry(
  contacts: LeadgenContact[],
): LeadgenContact {
  return [...contacts].sort(sortByContactPriority)[0];
}

export function chooseBestOutreachEntry(
  contacts: LeadgenContact[],
): LeadgenContact | null {
  return (
    [...contacts]
      .filter(
        (contact) =>
          outreachContactTypes.has(contact.contact_type) &&
          hasReachableValue(contact) &&
          hasSource(contact),
      )
      .sort(sortByContactPriority)[0] ?? null
  );
}

export function chooseFallbackEntry(
  contacts: LeadgenContact[],
): LeadgenContact | null {
  return (
    [...contacts]
      .filter(
        (contact) =>
          fallbackContactTypes.has(contact.contact_type) &&
          hasReachableValue(contact) &&
          hasSource(contact),
      )
      .sort(sortByContactPriority)[0] ?? null
  );
}

export function rankContactEntries(
  contacts: LeadgenContact[],
): RankedContactEntries {
  const bestOutreachEntry = chooseBestOutreachEntry(contacts);
  const fallbackEntry = chooseFallbackEntry(contacts);

  return {
    best_available_entry:
      bestOutreachEntry ?? fallbackEntry ?? chooseBestAvailableEntry(contacts),
    best_outreach_entry: bestOutreachEntry,
    fallback_entry: fallbackEntry,
  };
}

export function getContactEntryRole({
  contact,
  bestOutreachEntry,
  fallbackEntry,
}: {
  contact: LeadgenContact;
  bestOutreachEntry: LeadgenContact | null;
  fallbackEntry: LeadgenContact | null;
}): ContactEntryRole {
  if (bestOutreachEntry?.id === contact.id) {
    return "best_outreach_entry";
  }

  if (fallbackEntry?.id === contact.id) {
    return "fallback_entry";
  }

  return "other_entry";
}
