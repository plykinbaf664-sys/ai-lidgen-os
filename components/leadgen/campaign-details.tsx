"use client";

import { useState } from "react";
import type {
  LeadgenCampaignDetails,
  LeadgenLead,
  LeadgenSignal,
  SignalType,
} from "@/lib/leadgen/types";

const statusLabels: Record<LeadgenCampaignDetails["campaign"]["status"], string> =
  {
    completed: "Завершена",
  };

const signalTypeLabels: Record<SignalType, string> = {
  HIRING_SIGNAL: "Найм",
  GO_TO_MARKET_SIGNAL: "Go-to-market",
  GROWTH_SIGNAL: "Рост",
  CONTENT_SIGNAL: "Контент",
  TRAFFIC_SIGNAL: "Трафик",
  TECH_SIGNAL: "Технологии",
};

type CampaignDetailsProps = {
  details: LeadgenCampaignDetails | null;
  errorMessage: string | null;
  isLoading: boolean;
};

type SignalView = Pick<
  LeadgenSignal,
  | "signal_type"
  | "signal_title"
  | "signal_detail"
  | "signal_source_label"
  | "source_url"
  | "confidence_score"
  | "found_at"
>;

function getSignalsForLead(
  lead: LeadgenLead,
  signalsByLeadId: Map<string, LeadgenSignal[]>,
): SignalView[] {
  const storedSignals = signalsByLeadId.get(lead.id);

  if (storedSignals && storedSignals.length > 0) {
    return storedSignals;
  }

  return [
    {
      signal_type: "GROWTH_SIGNAL",
      signal_title: lead.signal_title,
      signal_detail: lead.signal_detail,
      signal_source_label: lead.signal_source_label,
      source_url: lead.company_source_url ?? "",
      confidence_score: lead.lead_score || 0,
      found_at: lead.created_at,
    },
  ];
}

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

  const signalsByLeadId = new Map<string, LeadgenSignal[]>();

  for (const signal of details.signals) {
    const currentSignals = signalsByLeadId.get(signal.lead_id) ?? [];
    signalsByLeadId.set(signal.lead_id, [...currentSignals, signal]);
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
            <span className="field-label">Сигналов найдено</span>
            <strong>{details.stats.signals_count}</strong>
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
          {details.leads.map((lead) => {
            const leadSignals = getSignalsForLead(lead, signalsByLeadId);

            return (
              <article className="campaign-details-lead" key={lead.id}>
                <div className="campaign-details-lead-main">
                  <div>
                    <h3>{lead.company_name}</h3>
                    <p className="company-domain">{lead.company_domain}</p>
                    {lead.company_source_url ? (
                      <a
                        className="source-link"
                        href={lead.company_source_url}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Источник компании
                      </a>
                    ) : null}
                  </div>
                  <div>
                    <span className="field-label">Контакт</span>
                    <p>{lead.contact_value ?? "Контакт не найден"}</p>
                  </div>
                  <div>
                    <span className="field-label">Lead score</span>
                    <p>{lead.lead_score}</p>
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
                  <span className="field-label">Сигналы</span>
                  <div className="campaign-details-signal-list">
                    {leadSignals.map((signal) => (
                      <article
                        className="campaign-details-signal-card"
                        key={`${lead.id}-${signal.signal_type}-${signal.signal_title}`}
                      >
                        <div className="campaign-details-signal-heading">
                          <span className="mock-pill">
                            {signalTypeLabels[signal.signal_type]}
                          </span>
                          <strong>{signal.confidence_score}/100</strong>
                        </div>
                        <h4>{signal.signal_title}</h4>
                        <p>{signal.signal_detail}</p>
                        <p className="company-domain">
                          {signal.signal_source_label} ·{" "}
                          {new Date(signal.found_at).toLocaleString("ru-RU")}
                        </p>
                        {signal.source_url ? (
                          <a
                            className="source-link"
                            href={signal.source_url}
                            rel="noreferrer"
                            target="_blank"
                          >
                            Открыть источник сигнала
                          </a>
                        ) : null}
                      </article>
                    ))}
                  </div>
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
            );
          })}
        </div>
      </div>
    </section>
  );
}
