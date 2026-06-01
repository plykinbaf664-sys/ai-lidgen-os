"use client";

import { formatTelegramCard } from "@/lib/leadgen/telegram-card";
import type { LeadgenLead, LeadStatus } from "@/lib/leadgen/types";

const statuses: LeadStatus[] = ["approved", "rejected", "paused", "new"];

const statusLabels: Record<LeadStatus, string> = {
  approved: "Одобрить",
  rejected: "Отклонить",
  paused: "Поставить на паузу",
  new: "Вернуть в новые",
};

type TelegramCardPreviewProps = {
  lead: LeadgenLead | null;
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
          <p className="eyebrow">Готово для Telegram</p>
          <h2>Предпросмотр карточки</h2>
        </div>
        <span className="mock-pill">без отправки</span>
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
                {statusLabels[status]}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <h3>Карточка не выбрана</h3>
          <p>
            Создайте лиды, затем откройте запись для проверки Telegram-карточки.
          </p>
        </div>
      )}
    </section>
  );
}
