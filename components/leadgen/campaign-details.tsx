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

type SignalInterpretationView = {
  confirmed_facts?: string[];
  inferred_insights?: string[];
  confidence_level?: string;
  why_it_matters?: string;
  why_now?: string;
  outreach_hypothesis?: string;
  evidence_quality?: string;
};

function getStringValue(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];

  return typeof value === "string" && value.trim() ? value : undefined;
}

function getStringListValue(
  record: Record<string, unknown>,
  key: string,
): string[] | undefined {
  const value = record[key];

  if (!Array.isArray(value)) {
    return undefined;
  }

  const values = value.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  );

  return values.length > 0 ? values : undefined;
}

function getLeadInterpretation(
  lead: LeadgenLead,
  companiesById: Map<string, LeadgenCampaignDetails["companies"][number]>,
): SignalInterpretationView {
  if (!lead.company_id) {
    return {};
  }

  const company = companiesById.get(lead.company_id);
  const rawInterpretation = company?.metadata.signal_interpretation;

  if (
    typeof rawInterpretation !== "object" ||
    rawInterpretation === null ||
    Array.isArray(rawInterpretation)
  ) {
    return {};
  }

  const interpretation = rawInterpretation as Record<string, unknown>;

  return {
    confirmed_facts: getStringListValue(interpretation, "confirmed_facts"),
    inferred_insights: getStringListValue(interpretation, "inferred_insights"),
    confidence_level: getStringValue(interpretation, "confidence_level"),
    why_it_matters: getStringValue(interpretation, "why_it_matters"),
    why_now: getStringValue(interpretation, "why_now"),
    outreach_hypothesis: getStringValue(interpretation, "outreach_hypothesis"),
    evidence_quality: getStringValue(interpretation, "evidence_quality"),
  };
}

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
  const companiesById = new Map(
    details.companies.map((company) => [company.id, company]),
  );

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
            const interpretation = getLeadInterpretation(lead, companiesById);

            return (
              <article className="campaign-details-lead" key={lead.id}>
                <div className="campaign-details-lead-main">
                  <div>
                    <h3>{lead.company_name}</h3>
                    <p className="company-domain">
                      {lead.company_domain ?? "Р”РѕРјРµРЅ РЅРµ РЅР°Р№РґРµРЅ"}
                    </p>
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
                  <div>
                    <span className="field-label">ICP fit</span>
                    <p>{lead.icp_fit_score}</p>
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
                  <div className="campaign-details-copy">
                    <div>
                      <span className="field-label">Signal summary</span>
                      <p>{lead.signal_detail}</p>
                    </div>
                    {interpretation.confirmed_facts ? (
                      <div>
                        <span className="field-label">Confirmed facts</span>
                        <p>{interpretation.confirmed_facts.join(" ")}</p>
                      </div>
                    ) : null}
                    {interpretation.inferred_insights ? (
                      <div>
                        <span className="field-label">Inferred insights</span>
                        <p>{interpretation.inferred_insights.join(" ")}</p>
                      </div>
                    ) : null}
                    {interpretation.confidence_level ? (
                      <div>
                        <span className="field-label">Confidence</span>
                        <p>{interpretation.confidence_level}</p>
                      </div>
                    ) : null}
                    {interpretation.why_it_matters ? (
                      <div>
                        <span className="field-label">Why it matters</span>
                        <p>{interpretation.why_it_matters}</p>
                      </div>
                    ) : null}
                    {interpretation.why_now ? (
                      <div>
                        <span className="field-label">Why now</span>
                        <p>{interpretation.why_now}</p>
                      </div>
                    ) : null}
                    {interpretation.outreach_hypothesis ? (
                      <div>
                        <span className="field-label">Outreach hypothesis</span>
                        <p>{interpretation.outreach_hypothesis}</p>
                      </div>
                    ) : null}
                    {interpretation.evidence_quality ? (
                      <div>
                        <span className="field-label">Evidence quality</span>
                        <p>{interpretation.evidence_quality}</p>
                      </div>
                    ) : null}
                  </div>
                  <span className="field-label">Sources</span>
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
