"use client";

import { formatTelegramCard } from "@/lib/leadgen/telegram-card";
import type { Lead, LeadStatus } from "@/lib/leadgen/types";

const statuses: LeadStatus[] = ["approved", "rejected", "paused", "new"];

type TelegramCardPreviewProps = {
  lead: Lead | null;
  onStatusChange: (leadId: string, status: LeadStatus) => void;
};

export function TelegramCardPreview({
  lead,
  onStatusChange,
}: TelegramCardPreviewProps) {
  return (
    <section className="panel preview-panel">
      <div className="preview-heading">
        <div>
          <p className="eyebrow">Telegram-ready</p>
          <h2>Card preview</h2>
        </div>
        <span className="mock-pill">no sending</span>
      </div>

      {lead ? (
        <div className="preview-content">
          <div className="telegram-card">{formatTelegramCard(lead)}</div>
          <div className="status-actions">
            {statuses.map((status) => (
              <button
                className={`status-button ${
                  lead.status === status ? "active" : ""
                }`}
                key={status}
                type="button"
                onClick={() => onStatusChange(lead.id, status)}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <h3>No card selected</h3>
          <p>Generate leads, then open one record to inspect its Telegram card.</p>
        </div>
      )}
    </section>
  );
}
