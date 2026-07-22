import { normalizeRecipientEmail } from "@/lib/leadgen/company-identity";
import { isEmailReadyContact } from "@/lib/leadgen/outreach-queue";
import type {
  LeadDiscoveryResult,
  LeadgenContact,
  LeadgenLead,
} from "@/lib/leadgen/types";

function getRankedEmailContacts(
  lead: LeadgenLead,
  contacts: LeadgenContact[],
): LeadgenContact[] {
  const leadContacts = contacts.filter(
    (contact) => contact.lead_id === lead.id && isEmailReadyContact(contact),
  );

  return [...leadContacts].sort((left, right) => {
    const rank = (contact: LeadgenContact) =>
      contact.metadata.entry_role === "best_outreach_entry"
        ? 0
        : contact.is_primary
          ? 1
          : 2;
    return rank(left) - rank(right);
  });
}

export function selectCampaignEmailTarget({
  result,
  knownEmails,
  target,
}: {
  result: LeadDiscoveryResult;
  knownEmails: Iterable<string>;
  target: number;
}) {
  const unavailableEmails = new Set(
    [...knownEmails].map(normalizeRecipientEmail).filter(Boolean),
  );
  const selectedEmails = new Set<string>();
  const selectedLeadIds = new Set<string>();
  const selectedCompanyIds = new Set<string>();
  const selectedContactIds = new Set<string>();
  let knownEmailsSkipped = 0;
  let duplicateEmailsSkipped = 0;

  for (const lead of result.leads) {
    if (selectedEmails.size >= target) break;
    const contacts = getRankedEmailContacts(lead, result.contacts);
    let selectedContact: LeadgenContact | null = null;
    let selectedEmail = "";

    for (const contact of contacts) {
      const normalizedEmail = normalizeRecipientEmail(contact.email ?? "");
      if (!normalizedEmail) continue;
      if (unavailableEmails.has(normalizedEmail)) {
        knownEmailsSkipped += 1;
        continue;
      }
      if (selectedEmails.has(normalizedEmail)) {
        duplicateEmailsSkipped += 1;
        continue;
      }
      selectedContact = contact;
      selectedEmail = normalizedEmail;
      break;
    }
    if (!selectedContact || !selectedEmail) continue;

    selectedEmails.add(selectedEmail);
    selectedLeadIds.add(lead.id);
    selectedContactIds.add(selectedContact.id);
    if (lead.company_id) selectedCompanyIds.add(lead.company_id);
  }

  const productionStats = result.production_discovery_stats
    ? {
        ...result.production_discovery_stats,
        email_target: target,
        new_unique_emails: selectedEmails.size,
        known_emails_skipped: knownEmailsSkipped,
        duplicate_emails_skipped: duplicateEmailsSkipped,
      }
    : undefined;

  const selectedResult: LeadDiscoveryResult = {
    ...result,
    campaign: {
      ...result.campaign,
      production_discovery_stats: productionStats,
    },
    companies: result.companies.filter((company) =>
      selectedCompanyIds.has(company.id),
    ),
    contacts: result.contacts.filter(
      (contact) =>
        selectedLeadIds.has(contact.lead_id) &&
        (!isEmailReadyContact(contact) || selectedContactIds.has(contact.id)),
    ),
    leads: result.leads.filter((lead) => selectedLeadIds.has(lead.id)),
    signals: result.signals.filter((signal) =>
      selectedLeadIds.has(signal.lead_id),
    ),
    events: result.events.filter(
      (event) => event.lead_id === null || selectedLeadIds.has(event.lead_id),
    ),
    production_discovery_stats: productionStats,
  };

  return {
    result: selectedResult,
    selectedEmails: [...selectedEmails],
    knownEmailsSkipped,
    duplicateEmailsSkipped,
  };
}
