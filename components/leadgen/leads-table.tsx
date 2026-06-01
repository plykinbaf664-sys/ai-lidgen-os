"use client";

import type { LeadgenLead } from "@/lib/leadgen/types";

const statusLabels = {
  new: "Новый",
  approved: "Одобрен",
  rejected: "Отклонен",
  paused: "На паузе",
} as const;

type LeadsTableProps = {
  leads: LeadgenLead[];
  selectedLeadId: string | null;
  onSelectLead: (leadId: string) => void;
};

export function LeadsTable({
  leads,
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
            <th>Лучший вход</th>
            <th>Сигнал</th>
            <th>Зацепка</th>
            <th>Статус</th>
            <th>Telegram</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr key={lead.id}>
              <td>
                <div className="lead-company">
                  <div>
                    <strong>{lead.company_name}</strong>
                    <div className="company-domain">{lead.company_domain}</div>
                  </div>
                  <span className="mock-pill">тест</span>
                </div>
              </td>
              <td>
                {lead.contact_label ? (
                  <>
                    <strong>{lead.contact_label}</strong>
                    <div className="company-domain">{lead.contact_value}</div>
                  </>
                ) : (
                  "Нет подтвержденного входа"
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
          ))}
        </tbody>
      </table>
    </div>
  );
}
