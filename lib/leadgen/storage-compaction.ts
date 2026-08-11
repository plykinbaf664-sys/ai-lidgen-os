import type { LeadgenCompany, LeadgenContact } from "@/lib/leadgen/types";

const CONTACT_METADATA_DUPLICATE_KEYS = new Set([
  "identity_profile",
  "alternative_channels",
  "alternative_channel_ids",
  "people_metadata",
  "email_context",
]);

const COMPANY_METADATA_TRANSIENT_KEYS = new Set([
  "identity_profile",
  "lead_ready_candidate",
  "people_discovery",
]);

const CONTACT_DISCOVERY_ARRAY_LIMITS: Record<string, number> = {
  warnings: 3,
  strategies_attempted: 3,
  queries_executed: 3,
  urls_inspected: 5,
  channels_found: 3,
  channels_rejected: 3,
  provider_errors: 3,
  emails_extracted: 3,
  emails_rejected: 3,
  email_pages_audit: 5,
  ranked_email_candidates: 2,
  contact_forms_found: 1,
  alternative_channel_ids: 3,
};

const SINGLETON_TECHNICAL_CONTACT_TYPES = new Set([
  "website_form",
  "contact_form",
  "company_website",
  "company_social",
]);

function compactRecord(
  value: Record<string, unknown>,
  omittedKeys: Set<string>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !omittedKeys.has(key)),
  );
}

function compactContactDiscovery(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const compacted = { ...(value as Record<string, unknown>) };
  for (const [key, limit] of Object.entries(CONTACT_DISCOVERY_ARRAY_LIMITS)) {
    const list = compacted[key];
    if (!Array.isArray(list)) continue;
    compacted[`${key}_count`] = list.length;
    compacted[key] = list.slice(0, limit);
  }
  return compacted;
}

export function compactCompanyForStorage(
  company: LeadgenCompany,
): LeadgenCompany {
  const metadata = compactRecord(
    company.metadata,
    COMPANY_METADATA_TRANSIENT_KEYS,
  );

  return {
    ...company,
    metadata: {
      ...metadata,
      contact_discovery: compactContactDiscovery(metadata.contact_discovery),
    },
  };
}

export function compactContactForStorage(
  contact: LeadgenContact,
): LeadgenContact {
  return {
    ...contact,
    metadata: compactRecord(
      contact.metadata,
      CONTACT_METADATA_DUPLICATE_KEYS,
    ),
  };
}

function getTechnicalContactPriority(contact: LeadgenContact): number {
  const entryRole = contact.metadata.entry_role;
  return (
    (contact.is_primary ? 10_000 : 0) +
    (entryRole === "best_outreach_entry" ? 5_000 : 0) +
    (entryRole === "fallback_entry" ? 2_500 : 0) +
    contact.confidence_score
  );
}

export function compactContactsForStorage(
  contacts: LeadgenContact[],
): LeadgenContact[] {
  const selectedTechnicalContacts = new Map<string, LeadgenContact>();

  for (const contact of contacts) {
    if (!SINGLETON_TECHNICAL_CONTACT_TYPES.has(contact.contact_type)) continue;
    const key = `${contact.company_id}:${contact.contact_type}`;
    const current = selectedTechnicalContacts.get(key);
    if (
      !current ||
      getTechnicalContactPriority(contact) > getTechnicalContactPriority(current)
    ) {
      selectedTechnicalContacts.set(key, contact);
    }
  }

  return contacts
    .filter((contact) => {
      if (contact.contact_type === "no_contact_found") return false;
      if (!SINGLETON_TECHNICAL_CONTACT_TYPES.has(contact.contact_type)) {
        return true;
      }
      return (
        selectedTechnicalContacts.get(
          `${contact.company_id}:${contact.contact_type}`,
        )?.id === contact.id
      );
    })
    .map(compactContactForStorage);
}
