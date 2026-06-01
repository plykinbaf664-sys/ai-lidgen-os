"use client";

import type { Lead } from "@/lib/leadgen/types";

type LeadsTableProps = {
  leads: Lead[];
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
        <h3>No leads yet</h3>
        <p>
          Run the mock campaign to generate three fictional records and inspect
          the first pipeline result.
        </p>
      </div>
    );
  }

  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Company</th>
            <th>Best entry</th>
            <th>Signal</th>
            <th>Hook</th>
            <th>Status</th>
            <th>Telegram</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr key={lead.id}>
              <td>
                <div className="lead-company">
                  <div>
                    <strong>{lead.company.name}</strong>
                    <div className="company-domain">{lead.company.domain}</div>
                  </div>
                  <span className="mock-pill">mock</span>
                </div>
              </td>
              <td>
                {lead.contact ? (
                  <>
                    <strong>{lead.contact.label}</strong>
                    <div className="company-domain">{lead.contact.value}</div>
                  </>
                ) : (
                  "No verified entry"
                )}
              </td>
              <td>
                <strong>{lead.signal.title}</strong>
                <div className="company-domain">{lead.signal.sourceLabel}</div>
              </td>
              <td>{lead.hook}</td>
              <td>
                <span className={`status-pill status-${lead.status}`}>
                  {lead.status}
                </span>
              </td>
              <td>
                <button
                  className="detail-button"
                  type="button"
                  onClick={() => onSelectLead(lead.id)}
                >
                  {selectedLeadId === lead.id ? "Selected" : "Preview"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
