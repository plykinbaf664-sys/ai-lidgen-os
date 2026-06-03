"use client";

import { useState } from "react";
import type { LeadgenCampaignDetails } from "@/lib/leadgen/types";

const statusLabels: Record<LeadgenCampaignDetails["campaign"]["status"], string> =
  {
    completed: "Завершена",
  };

type CampaignDetailsProps = {
  details: LeadgenCampaignDetails | null;
  errorMessage: string | null;
  isLoading: boolean;
};

export function CampaignDetails({
  details,
  errorMessage,
  isLoading,
}: CampaignDetailsProps) {
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null);

  function toggleLead(leadId: string) {
    setExpandedLeadId((currentId) => (currentId === leadId ? null : leadId));
  }

  if (isLoading) {
    return (
      <section className="panel campaign-details-panel">
        <div className="empty-state">
          <h3>Загружаю детали кампании</h3>
          <p>Получаю сохранённые компании, события и уведомления из Supabase.</p>
        </div>
      </section>
    );
  }

  if (errorMessage) {
    return (
      <section className="panel campaign-details-panel">
        <div className="empty-state">
          <h3>Не удалось открыть кампанию</h3>
          <p>{errorMessage}</p>
        </div>
      </section>
    );
  }

  if (!details) {
    return null;
  }

  return (
    <section className="panel campaign-details-panel">
      <div className="table-toolbar">
        <div>
          <p className="eyebrow">Детали запуска</p>
          <h2>{details.campaign.name}</h2>
          <p className="company-domain">
            {new Date(details.campaign.created_at).toLocaleString("ru-RU")}
          </p>
        </div>
        <span className="status-pill status-approved">
          {statusLabels[details.campaign.status]}
        </span>
      </div>

      <div className="campaign-details-content">
        <div className="campaign-details-stats">
          <div>
            <span className="field-label">Компаний найдено</span>
            <strong>{details.stats.companies_count}</strong>
          </div>
          <div>
            <span className="field-label">Контактов найдено</span>
            <strong>{details.stats.contacts_count}</strong>
          </div>
          <div>
            <span className="field-label">Уведомлений подготовлено</span>
            <strong>{details.stats.notifications_count}</strong>
          </div>
          <div>
            <span className="field-label">Событий создано</span>
            <strong>{details.stats.events_count}</strong>
          </div>
        </div>

        <div className="campaign-details-leads">
          {details.leads.map((lead) => (
            <article className="campaign-details-lead" key={lead.id}>
              <div className="campaign-details-lead-main">
                <div>
                  <h3>{lead.company_name}</h3>
                  <p className="company-domain">{lead.company_domain}</p>
                </div>
                <div>
                  <span className="field-label">Контакт</span>
                  <p>{lead.contact_value ?? "Контакт не найден"}</p>
                </div>
                <button
                  className="detail-button"
                  type="button"
                  onClick={() => toggleLead(lead.id)}
                >
                  {expandedLeadId === lead.id ? "Скрыть" : "Раскрыть"}
                </button>
              </div>

              <div className="campaign-details-signal">
                <span className="field-label">Сигнал</span>
                <h4>{lead.signal_title}</h4>
                <p>{lead.signal_detail}</p>
              </div>

              {expandedLeadId === lead.id ? (
                <div className="campaign-details-copy">
                  <div>
                    <span className="field-label">Хук</span>
                    <p>{lead.hook}</p>
                  </div>
                  <div>
                    <span className="field-label">Сообщение</span>
                    <p>{lead.message}</p>
                  </div>
                  <div>
                    <span className="field-label">Повторное сообщение</span>
                    <p>{lead.follow_up}</p>
                  </div>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
