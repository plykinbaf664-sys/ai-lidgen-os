"use client";

import type {
  LeadgenCompany,
  LeadgenContact,
  LeadgenLead,
} from "@/lib/leadgen/types";

const statusLabels = {
  new: "Новый",
  approved: "Одобрен",
  rejected: "Отклонен",
  paused: "На паузе",
} as const;

type LeadsTableProps = {
  leads: LeadgenLead[];
  companies?: LeadgenCompany[];
  contacts?: LeadgenContact[];
  selectedLeadId: string | null;
  onSelectLead: (leadId: string) => void;
};

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
        <h3>Лидов пока нет</h3>
        <p>
          Запустите тестовую кампанию, чтобы создать три фиктивных записи и
          проверить результат процесса.
        </p>
      </div>
    );
  }

  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Компания</th>
            <th>Primary person</th>
            <th>Лучший вход</th>
            <th>Сигнал</th>
            <th>Зацепка</th>
            <th>Статус</th>
            <th>Telegram</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => {
            const company = lead.company_id
              ? companies.find((item) => item.id === lead.company_id)
              : null;
            const peopleDiscovery = company?.metadata.people_discovery as
              | {
                  primary_person?: {
                    full_name?: string;
                    role_title?: string | null;
                    confidence_score?: number;
                  } | null;
                }
              | undefined;
            const leadContacts = contacts.filter(
              (contact) => contact.lead_id === lead.id,
            );
            const bestOutreachEntry =
              leadContacts.find(
                (contact) =>
                  contact.metadata.entry_role === "best_outreach_entry",
              ) ?? null;
            const fallbackEntry =
              leadContacts.find(
                (contact) => contact.metadata.entry_role === "fallback_entry",
              ) ?? null;
            const contactEntry = bestOutreachEntry ?? fallbackEntry;
            const contactValue =
              contactEntry?.email ??
              contactEntry?.linkedin_url ??
              contactEntry?.telegram_url ??
              (typeof contactEntry?.metadata.phone === "string"
                ? contactEntry.metadata.phone
                : null) ??
              contactEntry?.contact_url ??
              lead.contact_value;
            const nextAction =
              contactEntry?.metadata.recommended_next_action ??
              "run_enrichment";

            return (
              <tr key={lead.id}>
                <td>
                  <div className="lead-company">
                    <div>
                      <strong>{lead.company_name}</strong>
                      <div className="company-domain">
                        {lead.company_domain ?? "Домен не найден"}
                      </div>
                    </div>
                    <span className="mock-pill">real</span>
                  </div>
                </td>
                <td>
                  {peopleDiscovery?.primary_person ? (
                    <>
                      <strong>{peopleDiscovery.primary_person.full_name}</strong>
                      <div className="company-domain">
                        {peopleDiscovery.primary_person.role_title ??
                          "Role not available"}
                      </div>
                      {typeof peopleDiscovery.primary_person.confidence_score ===
                      "number" ? (
                        <div className="company-domain">
                          Confidence:{" "}
                          {peopleDiscovery.primary_person.confidence_score}/100
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <span className="company-domain">
                      No decision maker found
                    </span>
                  )}
                </td>
                <td>
                  {contactEntry ? (
                    <>
                      <strong>
                        {bestOutreachEntry
                          ? "Best outreach channel"
                          : "Fallback channel"}
                      </strong>
                      <div className="company-domain">{contactValue}</div>
                      <div className="company-domain">
                        Confidence: {contactEntry.confidence_score}/100
                      </div>
                      <div className="company-domain">Next: {nextAction}</div>
                    </>
                  ) : lead.contact_label ? (
                    <>
                      <strong>{lead.contact_label}</strong>
                      <div className="company-domain">{lead.contact_value}</div>
                    </>
                  ) : (
                    "Needs enrichment"
                  )}
                </td>
                <td>
                  <strong>{lead.signal_title}</strong>
                  <div className="company-domain">{lead.signal_source_label}</div>
                </td>
                <td>{lead.hook}</td>
                <td>
                  <span className={`status-pill status-${lead.status}`}>
                    {statusLabels[lead.status]}
                  </span>
                </td>
                <td>
                  <button
                    className="detail-button"
                    type="button"
                    onClick={() => onSelectLead(lead.id)}
                  >
                    {selectedLeadId === lead.id ? "Выбрано" : "Открыть"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
