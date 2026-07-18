import type { ContactEntryRole, LeadgenContact } from "@/lib/leadgen/types";

export const contactTypePriority: Record<LeadgenContact["contact_type"], number> =
  {
    work_email: 110,
    generic_email: 80,
    linkedin: 30,
    telegram: 28,
    phone: 25,
    social_profile: 24,
    website_form: 20,
    company_social: 18,
    no_contact_found: 0,
    // Evidence-only records verify identity and must never outrank real
    // contact channels.
    confirmed_person: 1,
    role_based_person: 1,
    contact_form: 20,
    company_website: 10,
  };

const outreachContactTypes = new Set<LeadgenContact["contact_type"]>([
  "work_email",
]);

const fallbackContactTypes = new Set<LeadgenContact["contact_type"]>([
  "generic_email",
]);

const identityEvidenceContactTypes = new Set<LeadgenContact["contact_type"]>([
  "linkedin",
  "telegram",
  "phone",
  "social_profile",
  "website_form",
  "contact_form",
  "company_social",
  "company_website",
  "confirmed_person",
  "role_based_person",
]);

const evidenceOnlyContactTypes = new Set<LeadgenContact["contact_type"]>([
  "confirmed_person",
  "role_based_person",
]);

export function isEvidenceOnlyContact(contact: LeadgenContact): boolean {
  return evidenceOnlyContactTypes.has(contact.contact_type);
}

export function isSendableEmailContact(contact: LeadgenContact | null): boolean {
  if (!contact) {
    return false;
  }

  return contact.contact_type === "work_email" && Boolean(contact.email);
}

export function isFallbackEmailContact(contact: LeadgenContact | null): boolean {
  if (!contact) {
    return false;
  }

  return contact.contact_type === "generic_email" && Boolean(contact.email);
}

export function isEmailContact(contact: LeadgenContact | null): boolean {
  return isSendableEmailContact(contact) || isFallbackEmailContact(contact);
}

export function isIdentityEvidenceContact(contact: LeadgenContact): boolean {
  return identityEvidenceContactTypes.has(contact.contact_type);
}

function hasReachableValue(contact: LeadgenContact): boolean {
  if (isEvidenceOnlyContact(contact)) {
    return false;
  }

  if (!hasValidReachableChannelShape(contact)) {
    return false;
  }

  return Boolean(
    contact.email ||
      (!isIdentityEvidenceContact(contact) &&
        (contact.linkedin_url ||
          contact.telegram_url ||
          typeof contact.metadata.phone === "string" ||
          contact.contact_url)) ||
      contact.contact_type === "no_contact_found",
  );
}

function hasValidReachableChannelShape(contact: LeadgenContact): boolean {
  const url =
    contact.telegram_url ??
    (contact.contact_type === "telegram" ? contact.contact_url : null);

  if (contact.contact_type !== "telegram" || !url) {
    return true;
  }

  try {
    const parsedUrl = new URL(url);
    const host = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
    const segments = parsedUrl.pathname.split("/").filter(Boolean);
    const username = segments[0]?.toLowerCase() ?? "";

    if (!["t.me", "telegram.me"].includes(host)) {
      return false;
    }

    if (segments.length !== 1) {
      return false;
    }

    return (
      username.length > 0 &&
      !username.startsWith("gk") &&
      !username.startsWith("ooo") &&
      !username.includes("company") &&
      !username.includes("channel") &&
      !username.includes("news") &&
      !username.includes("job") &&
      !username.includes("vacanc")
    );
  } catch {
    return false;
  }
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

function isOutreachContact(contact: LeadgenContact): boolean {
  return outreachContactTypes.has(contact.contact_type) && isSendableEmailContact(contact) && hasSource(contact);
}

function isRankableContactChannel(contact: LeadgenContact): boolean {
  return !isEvidenceOnlyContact(contact) && hasReachableValue(contact);
}

export type RankedContactEntries = {
  best_available_entry: LeadgenContact;
  best_outreach_entry: LeadgenContact | null;
  fallback_entry: LeadgenContact | null;
};

export type RankContactEntriesOptions = {
  requirePrimaryPersonForOutreach?: boolean;
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
  const rankableContacts = contacts.filter(isRankableContactChannel);

  return [...(rankableContacts.length > 0 ? rankableContacts : contacts)].sort(
    sortByContactPriority,
  )[0];
}

export function chooseBestOutreachEntry(
  contacts: LeadgenContact[],
  options: RankContactEntriesOptions = {},
): LeadgenContact | null {
  const outreachContacts = contacts.filter(isOutreachContact);
  const primaryPersonOutreachContacts = outreachContacts.filter(
    isPrimaryPersonContact,
  );

  return (
    [
      ...(options.requirePrimaryPersonForOutreach &&
      primaryPersonOutreachContacts.length > 0
        ? primaryPersonOutreachContacts
        : outreachContacts),
    ].sort(sortByContactPriority)[0] ?? null
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
  options: RankContactEntriesOptions = {},
): RankedContactEntries {
  const bestOutreachEntry = chooseBestOutreachEntry(contacts, options);
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
