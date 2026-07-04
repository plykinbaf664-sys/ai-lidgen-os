import { PublicContactProvider } from "@/lib/leadgen/public-contact-provider";
import {
  getContactEntryRole,
  rankContactEntries,
} from "@/lib/leadgen/contact-channel-ranking";
import type { ContactProvider } from "@/lib/leadgen/contact-provider";
import { buildIdentityProfile } from "@/lib/leadgen/identity-discovery-engine";
import type {
  ContactDiscoveryInput,
  ContactDiscoveryResult,
  ContactDiscoveryStatus,
  ContactRecommendedNextAction,
  DecisionMakerProfile,
  LeadgenContact,
  LeadgenContactType,
  IdentityProfile,
  PersonCandidate,
  PersonIntelligence,
  PersonaSearchStatus,
} from "@/lib/leadgen/types";

const allowedContactTypes = new Set<LeadgenContactType>([
  "work_email",
  "linkedin",
  "telegram",
  "phone",
  "website_form",
  "generic_email",
  "company_social",
  "social_profile",
  "company_website",
  "no_contact_found",
]);

function dedupeContacts(contacts: LeadgenContact[]): LeadgenContact[] {
  const seenKeys = new Set<string>();
  const dedupedContacts: LeadgenContact[] = [];

  for (const contact of contacts) {
    const phone =
      typeof contact.metadata.phone === "string" ? contact.metadata.phone : null;
    const key = [
      contact.contact_type,
      contact.email,
      contact.linkedin_url,
      contact.telegram_url,
      contact.contact_url,
      phone,
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

function createRecordId(...parts: string[]): string {
  return parts
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9\u0430-\u044f\u0451]+/gi, "-")
    .replace(/(^-|-$)/g, "");
}

function createNoContactFoundEntry(input: ContactDiscoveryInput): LeadgenContact {
  return {
    id: createRecordId("contact", input.lead.id, "no-contact-found", "1"),
    pipeline_run_id: input.campaign.pipeline_run_id,
    campaign_id: input.campaign.id,
    company_id: input.company.id,
    lead_id: input.lead.id,
    contact_type: "no_contact_found",
    full_name: null,
    role_title: null,
    department: null,
    email: null,
    linkedin_url: null,
    telegram_url: null,
    contact_url: null,
    source_url: input.company.source_url,
    source_label: "available company context",
    confidence_score: 0,
    is_primary: false,
    metadata: {
      reason: "No contact provider returned a public entry point",
    },
    created_at: input.createdAt,
  };
}

function clampConfidenceScore(score: number): number {
  if (!Number.isFinite(score)) {
    return 0;
  }

  return Math.min(Math.max(Math.round(score), 0), 100);
}

function normalizeContactType(contact: LeadgenContact): LeadgenContactType {
  if (allowedContactTypes.has(contact.contact_type)) {
    return contact.contact_type;
  }

  if (contact.email) {
    return "work_email";
  }

  if (contact.linkedin_url) {
    return "linkedin";
  }

  if (contact.telegram_url) {
    return "telegram";
  }

  if (typeof contact.metadata.phone === "string") {
    return "phone";
  }

  if (contact.contact_type === "contact_form") {
    return "website_form";
  }

  return contact.contact_url ? "company_social" : "no_contact_found";
}

function normalizeProviderContact({
  contact,
  providerLabel,
}: {
  contact: LeadgenContact;
  providerLabel: string;
}): LeadgenContact {
  const sourceLabel = contact.source_label ?? providerLabel;
  const hasSource = Boolean(sourceLabel || contact.source_url);
  const normalizedContactType = normalizeContactType(contact);

  return {
    ...contact,
    contact_type: normalizedContactType,
    source_label: sourceLabel,
    confidence_score: hasSource
      ? clampConfidenceScore(contact.confidence_score)
      : 0,
    metadata: {
      ...contact.metadata,
      original_contact_type:
        contact.contact_type === normalizedContactType
          ? undefined
          : contact.contact_type,
      contact_type_normalized:
        contact.contact_type === normalizedContactType ? false : true,
      missing_source: !hasSource,
    },
  };
}

function getPersonPhone(person: PersonCandidate): string | null {
  return person.phone;
}

function getPersonTelegramUrl(person: PersonCandidate): string | null {
  const telegramUrl = person.metadata.telegram_url;

  return typeof telegramUrl === "string" && telegramUrl.trim()
    ? telegramUrl
    : null;
}

function getPrimaryPersonIntelligence(
  input: ContactDiscoveryInput,
): PersonIntelligence | null {
  return input.peopleDiscovery.primary_person_intelligence ?? null;
}

function getPersonIntelligenceMetadata(intelligence: PersonIntelligence | null) {
  if (!intelligence) {
    return {};
  }

  return {
    person_score: intelligence.person_score,
    persona_match_score: intelligence.persona_match_score,
    business_problem_ownership: intelligence.business_problem_ownership,
    decision_authority: intelligence.decision_authority,
    influence_level: intelligence.influence_level,
    person_confidence_score: intelligence.confidence_score,
    person_selection_reason: intelligence.selection_reason,
  };
}

function createPrimaryPersonContactEntries(
  input: ContactDiscoveryInput,
): LeadgenContact[] {
  const person = input.peopleDiscovery.primary_person;

  if (!person) {
    return [];
  }

  const intelligenceMetadata = getPersonIntelligenceMetadata(
    getPrimaryPersonIntelligence(input),
  );
  const primaryIntelligence = getPrimaryPersonIntelligence(input);
  const baseContact = {
    pipeline_run_id: input.campaign.pipeline_run_id,
    campaign_id: input.campaign.id,
    company_id: input.company.id,
    lead_id: input.lead.id,
    full_name: person.full_name,
    role_title: person.role_title,
    department: person.department,
    source_url: person.linkedin_url ?? input.company.source_url,
    source_label: person.source,
    confidence_score: clampConfidenceScore(
      primaryIntelligence?.confidence_score ?? person.confidence_score,
    ),
    is_primary: false,
    created_at: input.createdAt,
  };
  const entries: LeadgenContact[] = [];

  if (person.work_email) {
    entries.push({
      ...baseContact,
      id: createRecordId("contact", input.lead.id, "primary-person-work-email"),
      contact_type: "work_email",
      email: person.work_email,
      linkedin_url: null,
      telegram_url: null,
      contact_url: null,
      metadata: {
        ...intelligenceMetadata,
        people_discovery_role: "primary",
        people_discovery_source: person.source,
        source: "people_discovery.primary_person",
      },
    });
  }

  if (person.linkedin_url) {
    entries.push({
      ...baseContact,
      id: createRecordId("contact", input.lead.id, "primary-person-linkedin"),
      contact_type: "linkedin",
      email: null,
      linkedin_url: person.linkedin_url,
      telegram_url: null,
      contact_url: person.linkedin_url,
      source_url: person.linkedin_url,
      metadata: {
        ...intelligenceMetadata,
        people_discovery_role: "primary",
        people_discovery_source: person.source,
        source: "people_discovery.primary_person",
      },
    });
  }

  const telegramUrl = getPersonTelegramUrl(person);

  if (telegramUrl) {
    entries.push({
      ...baseContact,
      id: createRecordId("contact", input.lead.id, "primary-person-telegram"),
      contact_type: "telegram",
      email: null,
      linkedin_url: null,
      telegram_url: telegramUrl,
      contact_url: telegramUrl,
      metadata: {
        ...intelligenceMetadata,
        people_discovery_role: "primary",
        people_discovery_source: person.source,
        source: "people_discovery.primary_person",
      },
    });
  }

  const phone = getPersonPhone(person);

  if (phone) {
    entries.push({
      ...baseContact,
      id: createRecordId("contact", input.lead.id, "primary-person-phone"),
      contact_type: "phone",
      email: null,
      linkedin_url: null,
      telegram_url: null,
      contact_url: null,
      metadata: {
        ...intelligenceMetadata,
        phone,
        people_discovery_role: "primary",
        people_discovery_source: person.source,
        source: "people_discovery.primary_person",
      },
    });
  }

  return entries;
}

function matchesPerson(contact: LeadgenContact, person: PersonCandidate): boolean {
  return Boolean(
    (person.work_email && contact.email === person.work_email) ||
      (person.linkedin_url && contact.linkedin_url === person.linkedin_url) ||
      (getPersonPhone(person) &&
        contact.metadata.phone === getPersonPhone(person)) ||
      (person.full_name && contact.full_name === person.full_name),
  );
}

function matchesPersonCandidate(
  left: PersonCandidate,
  right: PersonCandidate,
): boolean {
  return Boolean(
    (left.work_email && left.work_email === right.work_email) ||
      (left.linkedin_url && left.linkedin_url === right.linkedin_url) ||
      (left.phone && left.phone === right.phone) ||
      (left.full_name === right.full_name &&
        left.role_title === right.role_title),
  );
}

function findMatchedPersonIntelligence(
  input: ContactDiscoveryInput,
  person: PersonCandidate,
): PersonIntelligence | null {
  const rankedPeople = input.peopleDiscovery.ranked_people ?? [];

  return (
    rankedPeople.find((intelligence) =>
      matchesPersonCandidate(intelligence.candidate, person),
    ) ?? null
  );
}

function applyPeopleDiscoveryContext(
  input: ContactDiscoveryInput,
  contacts: LeadgenContact[],
): LeadgenContact[] {
  const primaryPerson = input.peopleDiscovery.primary_person;
  const alternativePeople = input.peopleDiscovery.alternative_people;

  return contacts.map((contact) => {
    const isPrimaryPersonContact = primaryPerson
      ? matchesPerson(contact, primaryPerson)
      : false;
    const matchedAlternativePerson = alternativePeople.find((person) =>
      matchesPerson(contact, person),
    );
    const matchedPerson = isPrimaryPersonContact
      ? primaryPerson
      : matchedAlternativePerson;

    if (!matchedPerson) {
      return contact;
    }

    return {
      ...contact,
      full_name: contact.full_name ?? matchedPerson.full_name,
      role_title: contact.role_title ?? matchedPerson.role_title,
      department: contact.department ?? matchedPerson.department,
      source_label: contact.source_label ?? matchedPerson.source,
      confidence_score: Math.max(
        contact.confidence_score,
        findMatchedPersonIntelligence(input, matchedPerson)?.confidence_score ??
          matchedPerson.confidence_score,
      ),
      metadata: {
        ...contact.metadata,
        ...getPersonIntelligenceMetadata(
          findMatchedPersonIntelligence(input, matchedPerson),
        ),
        people_discovery_role: isPrimaryPersonContact
          ? "primary"
          : "alternative",
        people_discovery_source: matchedPerson.source,
      },
    };
  });
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
  recommendedNextAction,
  identityProfile,
}: {
  contacts: LeadgenContact[];
  bestOutreachEntry: LeadgenContact | null;
  fallbackEntry: LeadgenContact | null;
  recommendedNextAction: ContactRecommendedNextAction;
  identityProfile?: IdentityProfile;
}): LeadgenContact[] {
  const alternativeContactIds = contacts
    .filter(
      (contact) =>
        contact.id !== bestOutreachEntry?.id &&
        contact.id !== fallbackEntry?.id &&
        contact.contact_type !== "no_contact_found",
    )
    .map((contact) => contact.id);
  const alternativeChannels = contacts
    .filter((contact) => alternativeContactIds.includes(contact.id))
    .map((contact) => ({
      id: contact.id,
      contact_type: contact.contact_type,
      confidence_score: contact.confidence_score,
      source_label: contact.source_label,
    }));

  return contacts.map((contact) => {
    return {
      ...contact,
      metadata: {
        ...contact.metadata,
        entry_role: getContactEntryRole({
          contact,
          bestOutreachEntry,
          fallbackEntry,
        }),
        recommended_next_action: recommendedNextAction,
        best_outreach_channel: bestOutreachEntry?.contact_type ?? null,
        best_outreach_contact_id: bestOutreachEntry?.id ?? null,
        best_outreach_confidence: bestOutreachEntry?.confidence_score ?? null,
        fallback_channel: fallbackEntry?.contact_type ?? null,
        fallback_contact_id: fallbackEntry?.id ?? null,
        fallback_confidence: fallbackEntry?.confidence_score ?? null,
        alternative_channel_ids: alternativeContactIds,
        alternative_channels: alternativeChannels,
        identity_profile: identityProfile,
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

  if (
    bestAvailableEntry.contact_type === "website_form" ||
    bestAvailableEntry.contact_type === "generic_email" ||
    bestAvailableEntry.contact_type === "company_social"
  ) {
    return "generic_entry_found";
  }

  if (!decisionMaker) {
    return "fallback_only";
  }

  const personContacts = contacts.filter(
    (contact) =>
      contact.contact_type === "work_email" ||
      contact.contact_type === "linkedin" ||
      contact.contact_type === "telegram" ||
      contact.contact_type === "phone",
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

function getAlternativeChannels(contacts: LeadgenContact[]): LeadgenContact[] {
  return contacts.filter(
    (contact) =>
      contact.metadata.entry_role === "other_entry" &&
      contact.contact_type !== "no_contact_found",
  );
}

function getContactDiscoveryStatus({
  bestOutreachEntry,
  fallbackEntry,
  personaSearchStatus,
}: {
  bestOutreachEntry: LeadgenContact | null;
  fallbackEntry: LeadgenContact | null;
  personaSearchStatus: PersonaSearchStatus;
}): ContactDiscoveryStatus {
  if (personaSearchStatus === "no_entry_found") {
    return "no_entry_found";
  }

  if (bestOutreachEntry) {
    return "entry_found";
  }

  return fallbackEntry ? "fallback_only" : "no_entry_found";
}

function getRecommendedNextAction({
  bestOutreachEntry,
  fallbackEntry,
  personaSearchStatus,
}: {
  bestOutreachEntry: LeadgenContact | null;
  fallbackEntry: LeadgenContact | null;
  personaSearchStatus: PersonaSearchStatus;
}): ContactRecommendedNextAction {
  if (bestOutreachEntry) {
    if (
      bestOutreachEntry.contact_type === "work_email" ||
      bestOutreachEntry.contact_type === "linkedin" ||
      bestOutreachEntry.contact_type === "telegram" ||
      bestOutreachEntry.contact_type === "phone"
    ) {
      return "send_outreach";
    }

    if (
      bestOutreachEntry.contact_type === "website_form" ||
      bestOutreachEntry.contact_type === "generic_email" ||
      bestOutreachEntry.contact_type === "company_social"
    ) {
      return personaSearchStatus === "target_persona_found" ||
        personaSearchStatus === "alternative_persona_found"
        ? "manual_review"
        : "run_enrichment";
    }
  }

  if (fallbackEntry?.contact_type === "company_website") {
    return "run_enrichment";
  }

  return personaSearchStatus === "no_entry_found"
    ? "skip_until_contact_found"
    : "use_fallback_channel";
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
    if (!input.peopleDiscovery?.search_status) {
      throw new Error(
        "Contact Discovery requires People Discovery result and must run after People Discovery.",
      );
    }

    const providerResults = await Promise.all(
      this.providers.map((provider) => provider.findContacts(input)),
    );
    const providersUsed = providerResults
      .map((result, index) => {
        const provider = this.providers[index];

        return result.provider_id ?? provider?.id ?? provider?.constructor.name;
      })
      .filter((providerId): providerId is string => Boolean(providerId));
    const warnings = providerResults.flatMap((result) => result.warnings ?? []);
    const contacts = applyPeopleDiscoveryContext(
      input,
      dedupeContacts(
        [
          ...createPrimaryPersonContactEntries(input),
          ...providerResults.flatMap((result, index) =>
            result.contacts.map((contact) =>
              normalizeProviderContact({
                contact,
                providerLabel:
                  result.provider_label ??
                  this.providers[index]?.label ??
                  "contact provider",
              }),
            ),
          ),
        ],
      ),
    );
    const discoverableContacts =
      contacts.length > 0 ? contacts : [createNoContactFoundEntry(input)];
    const {
      best_available_entry: bestAvailableEntry,
      best_outreach_entry: bestOutreachEntry,
      fallback_entry: fallbackEntry,
    } = rankContactEntries(discoverableContacts, {
      requirePrimaryPersonForOutreach: Boolean(
        input.peopleDiscovery.primary_person,
      ),
    });
    const contactsWithPrimary = markPrimaryContact(
      discoverableContacts,
      bestAvailableEntry,
    );
    const personaSearchStatus = getPersonaSearchStatus({
      contacts: contactsWithPrimary,
      bestAvailableEntry:
        contactsWithPrimary.find((contact) => contact.is_primary) ??
        bestAvailableEntry,
      decisionMaker: input.decisionMaker,
    });
    const recommendedNextAction = getRecommendedNextAction({
      bestOutreachEntry,
      fallbackEntry,
      personaSearchStatus,
    });
    const identityProfile = buildIdentityProfile({
      peopleDiscovery: input.peopleDiscovery,
      contacts: contactsWithPrimary,
      bestOutreachEntry,
      fallbackEntry,
    });
    const contactsWithRoles = applyEntryRoles({
      contacts: contactsWithPrimary,
      bestOutreachEntry,
      fallbackEntry,
      recommendedNextAction,
      identityProfile,
    });
    const contactsWithStatus = applyPersonaSearchStatus(
      contactsWithRoles,
      personaSearchStatus,
    );
    const discoveryStatus = getContactDiscoveryStatus({
      bestOutreachEntry,
      fallbackEntry,
      personaSearchStatus,
    });
    const alternativeChannels = getAlternativeChannels(contactsWithStatus);

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
        ) ??
        (fallbackEntry
          ? contactsWithStatus.find((contact) => contact.id === fallbackEntry.id) ??
            fallbackEntry
          : null),
      alternative_channels: alternativeChannels,
      identity_profile: identityProfile,
      persona_search_status: personaSearchStatus,
      discovery_status: discoveryStatus,
      recommended_next_action: recommendedNextAction,
      providers_used: providersUsed,
      warnings,
    };
  }
}
