import { normalizeRecipientEmail } from "@/lib/leadgen/company-identity";
import { isEmailReadyContact } from "@/lib/leadgen/outreach-queue";
import type {
  LeadDiscoveryResult,
  LeadgenContact,
  LeadgenLead,
} from "@/lib/leadgen/types";
import { selectCampaignLeadIds } from "@/lib/leadgen/campaign-target-policy";
import {
  getContactedPersonKey,
  isConfirmedOutreachEmail,
  isContactReadyPerson,
} from "@/lib/leadgen/adaptive-contact-intelligence";

function getRankedEmailContacts(
  lead: LeadgenLead,
  contacts: LeadgenContact[],
): LeadgenContact[] {
  const leadContacts = contacts.filter(
    (contact) =>
      contact.lead_id === lead.id &&
      isEmailReadyContact(contact) &&
      isConfirmedOutreachEmail(contact),
  );

  return [...leadContacts].sort((left, right) => {
    const rank = (contact: LeadgenContact) =>
      isContactReadyPerson(contact)
        ? 0
        : contact.metadata.email_status === "department_email_ready"
          ? 1
          : contact.metadata.entry_role === "best_outreach_entry"
            ? 2
            : contact.is_primary
              ? 3
              : 4;
    return rank(left) - rank(right);
  });
}

export function selectCampaignEmailTarget({
  result,
  knownEmails,
  knownPersonKeys = [],
  target,
}: {
  result: LeadDiscoveryResult;
  knownEmails: Iterable<string>;
  knownPersonKeys?: Iterable<string>;
  target: number;
}) {
  const unavailableEmails = new Set(
    [...knownEmails].map(normalizeRecipientEmail).filter(Boolean),
  );
  const selectedEmails = new Set<string>();
  const unavailablePeople = new Set(knownPersonKeys);
  const selectedPeople = new Set<string>();
  const selectedLeadIds = new Set<string>();
  const selectedCompanyIds = new Set<string>();
  const selectedContactIds = new Set<string>();
  let knownEmailsSkipped = 0;
  let duplicateEmailsSkipped = 0;
  let duplicatePeopleSkipped = 0;
  let contactReadyPeople = 0;

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
      const personKey = contact.full_name
        ? getContactedPersonKey(lead.company_name, contact.full_name)
        : "";
      if (personKey && (unavailablePeople.has(personKey) || selectedPeople.has(personKey))) {
        duplicatePeopleSkipped += 1;
        continue;
      }
      selectedContact = contact;
      selectedEmail = normalizedEmail;
      if (personKey) selectedPeople.add(personKey);
      break;
    }
    if (!selectedContact || !selectedEmail) continue;

    selectedEmails.add(selectedEmail);
    selectedLeadIds.add(lead.id);
    selectedContactIds.add(selectedContact.id);
    if (isContactReadyPerson(selectedContact)) contactReadyPeople += 1;
    if (lead.company_id) selectedCompanyIds.add(lead.company_id);
  }

  const campaignLeadIds = selectCampaignLeadIds({
    orderedLeadIds: result.leads.map((lead) => lead.id),
    emailReadyLeadIds: [...selectedLeadIds],
    target,
  });
  selectedLeadIds.clear();
  for (const leadId of campaignLeadIds) selectedLeadIds.add(leadId);
  selectedCompanyIds.clear();
  for (const lead of result.leads) {
    if (selectedLeadIds.has(lead.id) && lead.company_id) {
      selectedCompanyIds.add(lead.company_id);
    }
  }

  const productionStats = result.production_discovery_stats
    ? {
        ...result.production_discovery_stats,
        qualified_candidates_found: result.production_discovery_stats.new_unique_companies,
        new_unique_companies: selectedCompanyIds.size,
        email_target: target,
        new_unique_emails: selectedEmails.size,
        contact_ready_people: contactReadyPeople,
        email_ready_companies: selectedEmails.size,
        known_emails_skipped: knownEmailsSkipped,
        duplicate_emails_skipped: duplicateEmailsSkipped,
        duplicate_people_skipped: duplicatePeopleSkipped,
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
    duplicatePeopleSkipped,
  };
}
