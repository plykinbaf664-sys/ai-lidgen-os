import { assessLeadReadiness } from "@/lib/leadgen/lead-readiness-assessment";
import type {
  LeadDiscoveryResult,
  LeadgenCompany,
  LeadgenContact,
  LeadgenLead,
  LeadReadyCandidate,
  LeadReadyContactType,
  PeopleDiscoveryResult,
  ProviderDiagnostic,
} from "@/lib/leadgen/types";

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u0430-\u044f\u0451]+/gi, "-")
    .replace(/(^-|-$)/g, "");
}

function getCompanyWebsite(company: LeadgenCompany): string | null {
  if (!company.company_domain) {
    return null;
  }

  return company.company_domain.startsWith("http")
    ? company.company_domain
    : `https://${company.company_domain}`;
}

function getPeopleDiscovery(company: LeadgenCompany): PeopleDiscoveryResult | null {
  const value = company.metadata.people_discovery;

  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as PeopleDiscoveryResult;
  }

  return null;
}

function getDecisionAuthority(company: LeadgenCompany): LeadReadyCandidate["person"]["decision_authority"] {
  const value = company.metadata.decision_maker;

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return "unknown";
  }

  const decisionAuthority = (value as { decision_authority?: unknown }).decision_authority;

  return decisionAuthority === "high" ||
    decisionAuthority === "medium" ||
    decisionAuthority === "low"
    ? decisionAuthority
    : "unknown";
}

function getContactType(contact: LeadgenContact | null): LeadReadyContactType {
  if (!contact) {
    return "none";
  }

  if (contact.contact_type === "work_email" || contact.contact_type === "generic_email") {
    return contact.contact_type;
  }

  return "none";
}

function getContactValue(contact: LeadgenContact | null): string | null {
  if (!contact) {
    return null;
  }

  if (
    contact.contact_type === "confirmed_person" ||
    contact.contact_type === "role_based_person"
  ) {
    return null;
  }

  return (
    contact.email ??
    contact.linkedin_url ??
    contact.telegram_url ??
    contact.contact_url ??
    (typeof contact.metadata.phone === "string" ? contact.metadata.phone : null)
  );
}

function isVerifiedDirectContact(contact: LeadgenContact | null): boolean {
  if (!contact) {
    return false;
  }

  return contact.contact_type === "work_email" && Boolean(contact.email);
}

function chooseBestContact(contacts: LeadgenContact[]): LeadgenContact | null {
  const priorities = [
    "work_email",
    "generic_email",
  ];

  return (
    contacts
      .filter(
        (contact) =>
          (contact.contact_type === "work_email" ||
            contact.contact_type === "generic_email") &&
          getContactValue(contact),
      )
      .sort(
        (left, right) => {
          const leftPriority = priorities.indexOf(left.contact_type);
          const rightPriority = priorities.indexOf(right.contact_type);

          return (
            (leftPriority >= 0 ? leftPriority : 999) -
            (rightPriority >= 0 ? rightPriority : 999)
          );
        },
      )[0] ?? null
  );
}

function collectDiagnostics(
  peopleDiscovery: PeopleDiscoveryResult | null,
): ProviderDiagnostic[] {
  return peopleDiscovery?.provider_diagnostics ?? [];
}

export function mapSignalFirstResultToLeadReadyCandidates(
  result: LeadDiscoveryResult,
): LeadReadyCandidate[] {
  const leadByCompanyId = new Map<string, LeadgenLead>();

  for (const lead of result.leads) {
    if (lead.company_id) {
      leadByCompanyId.set(lead.company_id, lead);
    }
  }

  return result.companies.map((company) => {
    const lead = leadByCompanyId.get(company.id) ?? null;
    const peopleDiscovery = getPeopleDiscovery(company);
    const person = peopleDiscovery?.primary_person ?? null;
    const companyContacts = result.contacts.filter(
      (contact) =>
        contact.company_id === company.id &&
        (!lead || contact.lead_id === lead.id),
    );
    const bestContact =
      companyContacts.find(
        (contact) => contact.metadata.entry_role === "best_outreach_entry",
      ) ??
      chooseBestContact(companyContacts);
    const signal = result.signals
      .filter((item) => item.company_id === company.id)
      .sort((left, right) => right.confidence_score - left.confidence_score)[0];
    const candidate: LeadReadyCandidate = {
      id: `signal-first:${company.id}`,
      source_track: "signal_first_ru",
      company: {
        name: company.company_name,
        normalized_name: normalizeName(company.company_name),
        domain: company.company_domain,
        website: getCompanyWebsite(company),
        source_url: company.source_url,
        location: company.country,
        industry: company.industry,
      },
      person: {
        full_name: person?.full_name ?? bestContact?.full_name ?? null,
        role_title: person?.role_title ?? bestContact?.role_title ?? null,
        decision_authority: getDecisionAuthority(company),
        source: person?.source ?? bestContact?.source_label ?? null,
        source_url:
          (typeof person?.metadata.source_url === "string"
            ? person.metadata.source_url
            : null) ??
          bestContact?.source_url ??
          null,
      },
      contact: {
        type: getContactType(bestContact),
        value: getContactValue(bestContact),
        verified: isVerifiedDirectContact(bestContact),
        source: bestContact?.source_label ?? null,
        source_url: bestContact?.source_url ?? null,
      },
      signal: {
        type: signal?.signal_type ?? company.signal_type ?? null,
        strength: signal?.confidence_score ?? company.confidence_score ?? 0,
        why_now:
          (typeof company.metadata.opportunity === "object" &&
          company.metadata.opportunity !== null &&
          !Array.isArray(company.metadata.opportunity)
            ? ((company.metadata.opportunity as { why_now?: unknown }).why_now as
                | string
                | undefined)
            : undefined) ??
          lead?.hook ??
          null,
        source_url: signal?.source_url ?? company.source_url,
      },
      scores: {
        icp_fit: company.icp_fit_score,
        contact_readiness: 0,
        signal_strength: signal?.confidence_score ?? company.confidence_score ?? 0,
        decision_authority: 0,
        overall: 0,
      },
      readiness_status: "enrichment_required",
      readiness_reason: "Not assessed yet.",
      providers_used: peopleDiscovery?.providers_used ?? [company.source_label ?? company.source],
      diagnostics: collectDiagnostics(peopleDiscovery),
      raw_refs: {
        company_id: company.id,
        lead_id: lead?.id,
        people_discovery: peopleDiscovery ?? undefined,
      },
    };

    return assessLeadReadiness(candidate);
  });
}

export function normalizeLeadReadyCompanyName(value: string): string {
  return normalizeName(value);
}
