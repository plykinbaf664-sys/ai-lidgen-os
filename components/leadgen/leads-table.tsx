"use client";

import {
  getActionForReadiness,
  getContactDisplay,
  getReadinessClass,
  getReadinessLabel,
  makeShortWhyNow,
  readinessOrder,
} from "@/lib/leadgen/ui-labels";
import { normalizeLeadgenText } from "@/lib/leadgen/text-normalization";
import {
  isFallbackEmailContact,
  isSendableEmailContact,
} from "@/lib/leadgen/contact-channel-ranking";
import type {
  LeadgenCompany,
  LeadgenContact,
  LeadgenLead,
  LeadReadinessStatus,
} from "@/lib/leadgen/types";

type LeadsTableProps = {
  leads: LeadgenLead[];
  companies?: LeadgenCompany[];
  contacts?: LeadgenContact[];
  selectedLeadId: string | null;
  onSelectLead: (leadId: string) => void;
};

type PeopleDiscoverySummary = {
  primary_person?: {
    full_name?: string;
    role_title?: string | null;
  } | null;
};

type ContactDiscoverySummary = {
  final_contact_readiness?: LeadReadinessStatus;
};

type SignalInterpretationSummary = {
  evidence_quality?: string;
  why_now?: string;
};

type LeadRow = {
  lead: LeadgenLead;
  company: LeadgenCompany | null;
  peopleDiscovery: PeopleDiscoverySummary | null;
  bestContact: LeadgenContact | null;
  readiness: LeadReadinessStatus;
  whyNow: string;
};

function getCompanyMetadata<T>(
  company: LeadgenCompany | null | undefined,
  key: string,
): T | null {
  const value = company?.metadata[key];

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  return value as T;
}

function getBestDirectContact(contacts: LeadgenContact[]): LeadgenContact | null {
  return (
    contacts.find(
      (contact) =>
        contact.metadata.entry_role === "best_outreach_entry" &&
        isSendableEmailContact(contact),
    ) ??
    contacts.find(isSendableEmailContact) ??
    null
  );
}

function getFallbackContact(contacts: LeadgenContact[]): LeadgenContact | null {
  return (
    contacts.find(
      (contact) =>
        contact.metadata.entry_role === "fallback_entry" &&
        isFallbackEmailContact(contact),
    ) ??
    contacts.find(isFallbackEmailContact) ??
    null
  );
}

function getReadiness({
  contactDiscovery,
  directContact,
  fallbackContact,
  hasPerson,
}: {
  contactDiscovery: ContactDiscoverySummary | null;
  directContact: LeadgenContact | null;
  fallbackContact: LeadgenContact | null;
  hasPerson: boolean;
}): LeadReadinessStatus {
  if (contactDiscovery?.final_contact_readiness) {
    if (
      contactDiscovery.final_contact_readiness === "outreach_ready" &&
      !directContact
    ) {
      return hasPerson ? "enrichment_required" : "provider_exhausted";
    }

    if (
      contactDiscovery.final_contact_readiness === "fallback_ready" &&
      !fallbackContact
    ) {
      return hasPerson ? "enrichment_required" : "provider_exhausted";
    }

    return contactDiscovery.final_contact_readiness;
  }

  if (directContact) {
    return "outreach_ready";
  }

  if (fallbackContact && fallbackContact.contact_type !== "company_website") {
    return "fallback_ready";
  }

  return hasPerson ? "enrichment_required" : "provider_exhausted";
}

export function LeadsTable({
  leads,
  companies = [],
  contacts = [],
  selectedLeadId,
  onSelectLead,
}: LeadsTableProps) {
  if (leads.length === 0) {
    return (
      <div className="empty-state">
        <h3>Лиды пока не найдены</h3>
        <p>Запустите кампанию, чтобы получить результаты.</p>
      </div>
    );
  }

  const rows: LeadRow[] = leads
    .map((lead) => {
      const company = lead.company_id
        ? companies.find((item) => item.id === lead.company_id) ?? null
        : null;
      const peopleDiscovery = getCompanyMetadata<PeopleDiscoverySummary>(
        company,
        "people_discovery",
      );
      const contactDiscovery = getCompanyMetadata<ContactDiscoverySummary>(
        company,
        "contact_discovery",
      );
      const signalInterpretation =
        getCompanyMetadata<SignalInterpretationSummary>(
          company,
          "signal_interpretation",
        );
      const leadContacts = contacts.filter((contact) => contact.lead_id === lead.id);
      const directContact = getBestDirectContact(leadContacts);
      const fallbackContact = getFallbackContact(leadContacts);
      const readiness = getReadiness({
        contactDiscovery,
        directContact,
        fallbackContact,
        hasPerson: Boolean(peopleDiscovery?.primary_person?.full_name),
      });

      return {
        lead,
        company,
        peopleDiscovery,
        bestContact: directContact ?? fallbackContact,
        readiness,
        whyNow: makeShortWhyNow(lead.signal_title, lead.signal_detail, {
          signalType: company?.signal_type,
          confidenceScore: company?.confidence_score,
          evidenceQuality: signalInterpretation?.evidence_quality,
          whyNow: signalInterpretation?.why_now,
        }),
      };
    })
    .sort((left, right) => {
      const readinessDiff =
        readinessOrder[left.readiness] - readinessOrder[right.readiness];

      if (readinessDiff !== 0) {
        return readinessDiff;
      }

      return right.lead.lead_score - left.lead.lead_score;
    });

  const readyNowCount = rows.filter(
    (row) =>
      row.readiness === "outreach_ready" || row.readiness === "fallback_ready",
  ).length;
  const needsContactCount = rows.filter(
    (row) =>
      row.readiness === "enrichment_required" ||
      row.readiness === "manual_research_required" ||
      row.readiness === "provider_exhausted",
  ).length;
  const rejectedCount = rows.filter((row) => row.readiness === "rejected").length;

  return (
    <div className="lead-queue">
      <div className="lead-queue-summary" aria-label="Очередь лидов">
        <div>
          <span>Сделать сейчас</span>
          <strong>{readyNowCount}</strong>
        </div>
        <div>
          <span>Нужно найти контакт</span>
          <strong>{needsContactCount}</strong>
        </div>
        <div>
          <span>Отклонены</span>
          <strong>{rejectedCount}</strong>
        </div>
      </div>

      <div className="table-scroll">
        <table className="leads-table">
          <thead>
            <tr>
              <th>Компания</th>
              <th>Кому писать</th>
              <th>Контакт</th>
              <th>Готовность</th>
              <th>Почему сейчас</th>
              <th>Действие</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ lead, peopleDiscovery, bestContact, readiness, whyNow }) => {
              const contact = getContactDisplay(bestContact);

              return (
                <tr key={lead.id}>
                  <td>
                    <strong
                      className="line-clamp-2"
                      title={normalizeLeadgenText(lead.company_name)}
                    >
                      {normalizeLeadgenText(lead.company_name)}
                    </strong>
                    <div className="company-domain">
                      {lead.company_domain ?? "Домен не найден"}
                    </div>
                  </td>
                  <td>
                    <strong>
                      {peopleDiscovery?.primary_person?.full_name
                        ? normalizeLeadgenText(
                            peopleDiscovery.primary_person.full_name,
                          )
                        : "ЛПР не найден"}
                    </strong>
                    <div className="company-domain">
                      {peopleDiscovery?.primary_person?.role_title ??
                        "Роль не найдена"}
                    </div>
                  </td>
                  <td>
                    <strong>{contact.value}</strong>
                    <div className="company-domain">{contact.type}</div>
                  </td>
                  <td>
                    <span className={`readiness-badge ${getReadinessClass(readiness)}`}>
                      {getReadinessLabel(readiness)}
                    </span>
                    <div className="company-domain">
                      {getActionForReadiness(readiness)}
                    </div>
                  </td>
                  <td>{whyNow}</td>
                  <td className="lead-action-cell">
                    <button
                      className="detail-button"
                      type="button"
                      onClick={() => onSelectLead(lead.id)}
                    >
                      {selectedLeadId === lead.id ? "Открыто" : "Подробнее"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
