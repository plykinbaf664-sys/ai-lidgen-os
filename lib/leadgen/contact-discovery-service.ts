import { PublicContactProvider } from "@/lib/leadgen/public-contact-provider";
import type { ContactProvider } from "@/lib/leadgen/contact-provider";
import type {
  ContactEntryRole,
  DecisionMakerProfile,
  LeadgenCampaign,
  LeadgenCompany,
  LeadgenContact,
  LeadgenLead,
  LeadgenSignal,
  PeopleDiscoveryResult,
  PersonaSearchStatus,
} from "@/lib/leadgen/types";

export type ContactDiscoveryInput = {
  campaign: LeadgenCampaign;
  company: LeadgenCompany;
  lead: LeadgenLead;
  signals: LeadgenSignal[];
  decisionMaker?: DecisionMakerProfile;
  peopleDiscovery?: PeopleDiscoveryResult;
  createdAt: string;
};

export type ContactDiscoveryResult = {
  contacts: LeadgenContact[];
  best_available_entry: LeadgenContact;
  best_outreach_entry: LeadgenContact | null;
  fallback_entry: LeadgenContact | null;
  persona_search_status: PersonaSearchStatus;
};

const contactTypePriority: Record<LeadgenContact["contact_type"], number> = {
  confirmed_person: 100,
  role_based_person: 90,
  contact_form: 75,
  generic_email: 65,
  social_profile: 55,
  company_website: 35,
  no_contact_found: 0,
};

const outreachContactTypes = new Set<LeadgenContact["contact_type"]>([
  "confirmed_person",
  "role_based_person",
  "contact_form",
  "generic_email",
  "social_profile",
]);

const fallbackContactTypes = new Set<LeadgenContact["contact_type"]>([
  "company_website",
  "no_contact_found",
]);

function dedupeContacts(contacts: LeadgenContact[]): LeadgenContact[] {
  const seenKeys = new Set<string>();
  const dedupedContacts: LeadgenContact[] = [];

  for (const contact of contacts) {
    const key = [
      contact.contact_type,
      contact.email,
      contact.linkedin_url,
      contact.telegram_url,
      contact.contact_url,
    ]
      .filter(Boolean)
      .join(":");

    if (key && seenKeys.has(key)) {
      continue;
    }

    if (key) {
      seenKeys.add(key);
    }

    dedupedContacts.push(contact);
  }

  return dedupedContacts;
}

function chooseBestAvailableEntry(contacts: LeadgenContact[]): LeadgenContact {
  return [...contacts].sort((left, right) => {
    const priorityDiff =
      contactTypePriority[right.contact_type] -
      contactTypePriority[left.contact_type];

    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    return right.confidence_score - left.confidence_score;
  })[0];
}

function chooseBestOutreachEntry(
  contacts: LeadgenContact[],
): LeadgenContact | null {
  return (
    [...contacts]
      .filter((contact) => outreachContactTypes.has(contact.contact_type))
      .sort((left, right) => {
        const priorityDiff =
          contactTypePriority[right.contact_type] -
          contactTypePriority[left.contact_type];

        if (priorityDiff !== 0) {
          return priorityDiff;
        }

        return right.confidence_score - left.confidence_score;
      })[0] ?? null
  );
}

function chooseFallbackEntry(contacts: LeadgenContact[]): LeadgenContact | null {
  return (
    [...contacts]
      .filter((contact) => fallbackContactTypes.has(contact.contact_type))
      .sort((left, right) => {
        const priorityDiff =
          contactTypePriority[right.contact_type] -
          contactTypePriority[left.contact_type];

        if (priorityDiff !== 0) {
          return priorityDiff;
        }

        return right.confidence_score - left.confidence_score;
      })[0] ?? null
  );
}

function markPrimaryContact(
  contacts: LeadgenContact[],
  primaryContact: LeadgenContact,
): LeadgenContact[] {
  return contacts.map((contact) => ({
    ...contact,
    is_primary: contact.id === primaryContact.id,
  }));
}

function applyEntryRoles({
  contacts,
  bestOutreachEntry,
  fallbackEntry,
}: {
  contacts: LeadgenContact[];
  bestOutreachEntry: LeadgenContact | null;
  fallbackEntry: LeadgenContact | null;
}): LeadgenContact[] {
  return contacts.map((contact) => {
    let entryRole: ContactEntryRole = "other_entry";

    if (bestOutreachEntry?.id === contact.id) {
      entryRole = "best_outreach_entry";
    } else if (fallbackEntry?.id === contact.id) {
      entryRole = "fallback_entry";
    }

    return {
      ...contact,
      metadata: {
        ...contact.metadata,
        entry_role: entryRole,
      },
    };
  });
}

function getSearchText(contact: LeadgenContact): string {
  return [
    contact.full_name,
    contact.role_title,
    contact.department,
    contact.email,
    contact.linkedin_url,
    contact.telegram_url,
    contact.contact_url,
    contact.source_label,
    JSON.stringify(contact.metadata),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function hasKeywordMatch(contact: LeadgenContact, keywords: string[]): boolean {
  const searchText = getSearchText(contact);

  return keywords.some((keyword) => searchText.includes(keyword.toLowerCase()));
}

function getPersonaSearchStatus({
  contacts,
  bestAvailableEntry,
  decisionMaker,
}: {
  contacts: LeadgenContact[];
  bestAvailableEntry: LeadgenContact;
  decisionMaker?: DecisionMakerProfile;
}): PersonaSearchStatus {
  if (bestAvailableEntry.contact_type === "no_contact_found") {
    return "no_entry_found";
  }

  if (bestAvailableEntry.contact_type === "company_website") {
    return "fallback_only";
  }

  if (!decisionMaker) {
    return bestAvailableEntry.contact_type === "generic_email"
      ? "generic_entry_found"
      : "fallback_only";
  }

  const personContacts = contacts.filter(
    (contact) =>
      contact.contact_type === "confirmed_person" ||
      contact.contact_type === "role_based_person",
  );
  const primaryKeywords = [
    decisionMaker.primary_persona,
    ...decisionMaker.search_keywords,
  ];
  const alternativeKeywords = decisionMaker.alternative_personas;

  if (personContacts.some((contact) => hasKeywordMatch(contact, primaryKeywords))) {
    return "target_persona_found";
  }

  if (
    personContacts.some((contact) => hasKeywordMatch(contact, alternativeKeywords))
  ) {
    return "alternative_persona_found";
  }

  if (
    contacts.some(
      (contact) =>
        contact.department?.toLowerCase() ===
          decisionMaker.department.toLowerCase() ||
        hasKeywordMatch(contact, [decisionMaker.department]),
    )
  ) {
    return "department_entry_found";
  }

  if (bestAvailableEntry.contact_type === "generic_email") {
    return "generic_entry_found";
  }

  return "fallback_only";
}

function applyPersonaSearchStatus(
  contacts: LeadgenContact[],
  status: PersonaSearchStatus,
): LeadgenContact[] {
  return contacts.map((contact) => ({
    ...contact,
    metadata: {
      ...contact.metadata,
      persona_search_status: status,
    },
  }));
}

export class ContactDiscoveryService {
  constructor(
    private readonly providers: ContactProvider[] = [
      new PublicContactProvider(),
    ],
  ) {}

  async discoverContacts(
    input: ContactDiscoveryInput,
  ): Promise<ContactDiscoveryResult> {
    const providerResults = await Promise.all(
      this.providers.map((provider) => provider.findContacts(input)),
    );
    const contacts = dedupeContacts(
      providerResults.flatMap((result) => result.contacts),
    );
    const bestOutreachEntry = chooseBestOutreachEntry(contacts);
    const fallbackEntry = chooseFallbackEntry(contacts);
    const bestAvailableEntry =
      bestOutreachEntry ?? fallbackEntry ?? chooseBestAvailableEntry(contacts);
    const contactsWithRoles = applyEntryRoles({
      contacts,
      bestOutreachEntry,
      fallbackEntry,
    });
    const contactsWithPrimary = markPrimaryContact(
      contactsWithRoles,
      bestAvailableEntry,
    );
    const personaSearchStatus = getPersonaSearchStatus({
      contacts: contactsWithPrimary,
      bestAvailableEntry:
        contactsWithPrimary.find((contact) => contact.is_primary) ??
        bestAvailableEntry,
      decisionMaker: input.decisionMaker,
    });
    const contactsWithStatus = applyPersonaSearchStatus(
      contactsWithPrimary,
      personaSearchStatus,
    );

    return {
      contacts: contactsWithStatus,
      best_available_entry:
        contactsWithStatus.find((contact) => contact.is_primary) ??
        bestAvailableEntry,
      best_outreach_entry:
        contactsWithStatus.find(
          (contact) => contact.metadata.entry_role === "best_outreach_entry",
        ) ?? null,
      fallback_entry:
        contactsWithStatus.find(
          (contact) => contact.metadata.entry_role === "fallback_entry",
        ) ?? null,
      persona_search_status: personaSearchStatus,
    };
  }
}
