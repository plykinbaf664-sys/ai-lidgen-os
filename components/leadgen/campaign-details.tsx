"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  getActionForReadiness,
  getContactDisplay,
  getContactValue,
  getPersonSelectionLabel,
  getReadinessClass,
  getReadinessLabel,
  getSourceDisplay,
  translateDiagnosticValue,
} from "@/lib/leadgen/ui-labels";
import { buildEmailOutreach } from "@/lib/leadgen/email-outreach-builder";
import { normalizeLeadgenText } from "@/lib/leadgen/text-normalization";
import {
  getCommercialSignalTypeLabel,
  NO_VERIFIED_COMMERCIAL_SIGNAL,
  validateCommercialSignalCandidate,
} from "@/lib/leadgen/signals/commercial-signal-validator";
import {
  isFallbackEmailContact,
  isIdentityEvidenceContact,
  isSendableEmailContact,
} from "@/lib/leadgen/contact-channel-ranking";
import type {
  CommercialSignal,
  LeadgenCampaignDetails,
  LeadgenContact,
  LeadgenLead,
  LeadgenSignal,
  LeadReadinessStatus,
} from "@/lib/leadgen/types";

type CampaignDetailsProps = {
  details: LeadgenCampaignDetails | null;
  errorMessage: string | null;
  isLoading: boolean;
};

type PeopleDiscoveryView = {
  primary_person?: {
    full_name?: string;
    role_title?: string | null;
    source?: string | null;
    metadata?: Record<string, unknown>;
  } | null;
  primary_person_intelligence?: {
    persona_match_score?: number;
    decision_authority?: string;
  } | null;
  providers_used?: string[];
  search_status?: string;
};

type ContactDiscoveryView = {
  final_contact_readiness?: LeadReadinessStatus;
  stop_reason?: string;
  search_strategies_attempted?: string[];
  queries_executed?: string[];
  urls_inspected?: string[];
  channels_rejected?: string[];
  emails_extracted?: string[];
  emails_rejected?: string[];
  email_search_status?: string | null;
  email_stop_reason?: string | null;
};

function getCommercialSignal(
  lead: LeadgenLead,
  details: LeadgenCampaignDetails,
  primarySignal: LeadgenSignal | undefined,
): CommercialSignal | null {
  const stored = getMetadata<CommercialSignal>(
    lead,
    details,
    "commercial_signal",
  );

  if (
    stored &&
    typeof stored.type === "string" &&
    typeof stored.summary === "string" &&
    typeof stored.evidence === "string" &&
    typeof stored.sourceUrl === "string" &&
    typeof stored.confidence === "number"
  ) {
    return stored;
  }

  return validateCommercialSignalCandidate({
    text: primarySignal?.signal_detail ?? lead.signal_detail,
    sourceUrl: primarySignal?.source_url ?? lead.company_source_url,
    sourceTitle: primarySignal?.signal_source_label,
    confidence: primarySignal?.confidence_score,
    detectedAt: primarySignal?.found_at,
    pipelineSignalType: primarySignal?.signal_type,
  });
}

function getMetadata<T>(
  lead: LeadgenLead,
  details: LeadgenCampaignDetails,
  key: string,
): T | null {
  const company = lead.company_id
    ? details.companies.find((item) => item.id === lead.company_id)
    : null;
  const value = company?.metadata[key];

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  return value as T;
}

function getContactsForLead(
  lead: LeadgenLead,
  details: LeadgenCampaignDetails,
): LeadgenContact[] {
  return details.contacts.filter((contact) => contact.lead_id === lead.id);
}

function getSignalsForLead(
  lead: LeadgenLead,
  details: LeadgenCampaignDetails,
): LeadgenSignal[] {
  const signals = details.signals.filter((signal) => signal.lead_id === lead.id);

  return signals.length > 0 ? signals : [];
}

function getBestOutreachEntry(contacts: LeadgenContact[]): LeadgenContact | null {
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

function getFallbackEntry(contacts: LeadgenContact[]): LeadgenContact | null {
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
  bestOutreachEntry,
  fallbackEntry,
  hasPerson,
}: {
  contactDiscovery: ContactDiscoveryView | null;
  bestOutreachEntry: LeadgenContact | null;
  fallbackEntry: LeadgenContact | null;
  hasPerson: boolean;
}): LeadReadinessStatus {
  if (contactDiscovery?.final_contact_readiness) {
    if (
      contactDiscovery.final_contact_readiness === "outreach_ready" &&
      !bestOutreachEntry
    ) {
      return hasPerson ? "enrichment_required" : "provider_exhausted";
    }

    if (
      contactDiscovery.final_contact_readiness === "fallback_ready" &&
      !fallbackEntry
    ) {
      return hasPerson ? "enrichment_required" : "provider_exhausted";
    }

    return contactDiscovery.final_contact_readiness;
  }

  if (bestOutreachEntry) {
    return "outreach_ready";
  }

  if (fallbackEntry && fallbackEntry.contact_type !== "company_website") {
    return "fallback_ready";
  }

  return hasPerson ? "enrichment_required" : "provider_exhausted";
}

function getSelectionType(peopleDiscovery: PeopleDiscoveryView | null): string {
  const intelligence = peopleDiscovery?.primary_person_intelligence;

  if (!peopleDiscovery?.primary_person) {
    return "not_found";
  }

  if (!intelligence) {
    return "unverified_fallback";
  }

  if ((intelligence.persona_match_score ?? 0) >= 70) {
    return "exact_persona_match";
  }

  if ((intelligence.persona_match_score ?? 0) >= 45) {
    return "alternative_persona_match";
  }

  if (intelligence.decision_authority === "high") {
    return "authority_fallback";
  }

  return "unverified_fallback";
}

function getVerificationSource(peopleDiscovery: PeopleDiscoveryView | null): string {
  const person = peopleDiscovery?.primary_person;
  const sourceUrl = person?.metadata?.source_url;

  if (typeof sourceUrl === "string") {
    return getSourceDisplay(sourceUrl);
  }

  return person?.source
    ? normalizeLeadgenText(person.source)
    : "Не найден";
}

function formatDiagnosticList(values?: string[]): string {
  return values?.length
    ? values.map(translateDiagnosticValue).join(", ")
    : "Нет данных";
}

function formatUrlList(values?: string[]): string {
  return values?.length
    ? values.slice(0, 8).map((value) => getSourceDisplay(value)).join(", ")
    : "Нет данных";
}

function getAdditionalSources(contacts: LeadgenContact[]): LeadgenContact[] {
  return contacts.filter(
    (contact) =>
      isIdentityEvidenceContact(contact) &&
      contact.contact_type !== "no_contact_found",
  );
}

function getMessageModeLabel(value?: string | null): string {
  if (value === "personal") {
    return "Персональное письмо";
  }

  if (value === "department") {
    return "Письмо в отдел";
  }

  if (value === "generic_routing") {
    return "Маршрутизация через общий email";
  }

  return "Письмо не создано";
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
          <p>Получаю сохранённые компании, контакты и сигналы.</p>
        </div>
      </section>
    );
  }

  if (errorMessage) {
    return (
      <section className="panel campaign-details-panel">
        <div className="empty-state">
          <h3>Не удалось открыть кампанию</h3>
          <p>Попробуйте обновить страницу.</p>
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
        <span className="status-pill status-approved">Завершена</span>
      </div>

      <div className="campaign-details-content">
        <div className="campaign-details-stats">
          <div>
            <span className="field-label">Найдено компаний</span>
            <strong>{details.stats.companies_count}</strong>
          </div>
          <div>
            <span className="field-label">Найдено контактов</span>
            <strong>{details.stats.contacts_count}</strong>
          </div>
          <div>
            <span className="field-label">Найдено лидов</span>
            <strong>{details.stats.leads_count}</strong>
          </div>
          <div>
            <span className="field-label">Сигналы</span>
            <strong>{details.stats.signals_count}</strong>
          </div>
        </div>

        <div className="campaign-details-leads">
          {details.leads.map((lead) => {
            const contacts = getContactsForLead(lead, details);
            const signals = getSignalsForLead(lead, details);
            const peopleDiscovery = getMetadata<PeopleDiscoveryView>(
              lead,
              details,
              "people_discovery",
            );
            const contactDiscovery = getMetadata<ContactDiscoveryView>(
              lead,
              details,
              "contact_discovery",
            );
            const bestOutreachEntry = getBestOutreachEntry(contacts);
            const fallbackEntry = getFallbackEntry(contacts);
            const displayedContact = bestOutreachEntry ?? fallbackEntry;
            const additionalSources = getAdditionalSources(contacts);
            const readiness = getReadiness({
              contactDiscovery,
              bestOutreachEntry,
              fallbackEntry,
              hasPerson: Boolean(peopleDiscovery?.primary_person?.full_name),
            });
            const contact = getContactDisplay(displayedContact);
            const primarySignal = signals[0];
            const signalTitle = primarySignal?.signal_title ?? lead.signal_title;
            const signalDetail = primarySignal?.signal_detail ?? lead.signal_detail;
            const commercialSignal = getCommercialSignal(
              lead,
              details,
              primarySignal,
            );
            const whyNow =
              commercialSignal?.summary ?? NO_VERIFIED_COMMERCIAL_SIGNAL;
            const draft = buildEmailOutreach({
              companyName: lead.company_name,
              personName: peopleDiscovery?.primary_person?.full_name,
              contact: displayedContact,
              readiness,
              whyNow: commercialSignal?.summary ?? "",
              signalType: primarySignal?.signal_type,
              signalTitle,
              signalDetail,
            });
            const emailSubject =
              draft.subject ??
              (typeof displayedContact?.metadata.email_subject === "string"
                ? displayedContact.metadata.email_subject
                : null);
            const emailBody =
              draft.body ||
              (typeof displayedContact?.metadata.email_body === "string"
                ? displayedContact.metadata.email_body
                : "");

            return (
              <article className="campaign-details-lead" key={lead.id}>
                <div className="sales-lead-card">
                  <div className="sales-lead-heading">
                    <div>
                      <h3 title={normalizeLeadgenText(lead.company_name)}>
                        {normalizeLeadgenText(lead.company_name)}
                      </h3>
                      <p className="company-domain">
                        {lead.company_domain ?? "Домен не найден"}
                      </p>
                    </div>
                    <span className={`readiness-badge ${getReadinessClass(readiness)}`}>
                      {getReadinessLabel(readiness)}
                    </span>
                  </div>

                  <div className="sales-lead-grid">
                    <div>
                      <span className="field-label">Коммерческий сигнал</span>
                      <p>{whyNow}</p>
                    </div>
                    <div>
                      <span className="field-label">Кому писать</span>
                      <p>
                        {peopleDiscovery?.primary_person?.full_name
                          ? normalizeLeadgenText(
                              peopleDiscovery.primary_person.full_name,
                            )
                          : "ЛПР не найден"}
                      </p>
                      <p className="company-domain">
                        {peopleDiscovery?.primary_person?.role_title
                          ? normalizeLeadgenText(
                              peopleDiscovery.primary_person.role_title,
                            )
                          : "Роль не найдена"}
                      </p>
                      <p className="company-domain">
                        {getPersonSelectionLabel(getSelectionType(peopleDiscovery))}
                      </p>
                    </div>
                    <div>
                      <span className="field-label">Куда писать</span>
                      <p>{contact.value}</p>
                      <p className="company-domain">{contact.type}</p>
                      <p className="company-domain">
                        Источник: {getSourceDisplay(displayedContact?.source_url)}
                      </p>
                    </div>
                    <div>
                      <span className="field-label">Что делать</span>
                      <p>{getActionForReadiness(readiness)}</p>
                    </div>
                  </div>

                  {additionalSources.length > 0 ? (
                    <div className="outreach-draft">
                      <span className="field-label">Дополнительные источники</span>
                      <div className="additional-source-list">
                        {additionalSources.slice(0, 8).map((source) => {
                          const sourceContact = getContactDisplay(source);

                          return (
                            <span className="mock-pill" key={source.id}>
                              {sourceContact.type}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  <div className="outreach-draft">
                    <span className="field-label">
                      {draft.readyToSend ? "Тема письма" : "Сообщение"}
                    </span>
                    <p>{emailSubject ?? "Письмо не создано"}</p>
                  </div>

                  <div className="outreach-draft">
                    <span className="field-label">
                      {draft.readyToSend ? "Текст письма" : "Черновик"}
                    </span>
                    <p>{emailBody}</p>
                  </div>

                  <Button
                    className="sales-details-button"
                    onClick={() => toggleLead(lead.id)}
                    variant="ghost"
                  >
                    {expandedLeadId === lead.id
                      ? "Скрыть диагностику"
                      : "Техническая диагностика"}
                  </Button>
                </div>

                {expandedLeadId === lead.id ? (
                  <div className="campaign-details-signal">
                    <div className="campaign-details-copy">
                      <div>
                        <span className="field-label">Источник подтверждения</span>
                        <p>{getVerificationSource(peopleDiscovery)}</p>
                      </div>
                      <div>
                        <span className="field-label">Тип сигнала</span>
                        <p>
                          {getCommercialSignalTypeLabel(
                            commercialSignal?.type ?? "none",
                          )}
                        </p>
                      </div>
                      <div>
                        <span className="field-label">Доказательство сигнала</span>
                        <p>
                          {commercialSignal?.evidence ??
                            NO_VERIFIED_COMMERCIAL_SIGNAL}
                        </p>
                      </div>
                      <div>
                        <span className="field-label">Источник сигнала</span>
                        <p>{getSourceDisplay(commercialSignal?.sourceUrl)}</p>
                      </div>
                      <div>
                        <span className="field-label">Уверенность</span>
                        <p>
                          {commercialSignal
                            ? `${commercialSignal.confidence}%`
                            : "0%"}
                        </p>
                      </div>
                      <div>
                        <span className="field-label">Тип сообщения</span>
                        <p>{getMessageModeLabel(draft.messageMode)}</p>
                      </div>
                      <div>
                        <span className="field-label">Прямой контакт</span>
                        <p>{getContactValue(bestOutreachEntry) ?? "Не найден"}</p>
                      </div>
                      <div>
                        <span className="field-label">Резервный контакт</span>
                        <p>{getContactValue(fallbackEntry) ?? "Не найден"}</p>
                      </div>
                      <div>
                        <span className="field-label">Причина остановки</span>
                        <p>{translateDiagnosticValue(contactDiscovery?.stop_reason)}</p>
                      </div>
                      <div>
                        <span className="field-label">Проверенные стратегии</span>
                        <p>
                          {formatDiagnosticList(
                            contactDiscovery?.search_strategies_attempted,
                          )}
                        </p>
                      </div>
                      <div>
                        <span className="field-label">Выполненные запросы</span>
                        <p>{formatDiagnosticList(contactDiscovery?.queries_executed)}</p>
                      </div>
                      <div>
                        <span className="field-label">Проверенные страницы</span>
                        <p>
                          {formatUrlList(contactDiscovery?.urls_inspected)}
                        </p>
                      </div>
                      <div>
                        <span className="field-label">Найденные email</span>
                        <p>{formatDiagnosticList(contactDiscovery?.emails_extracted)}</p>
                      </div>
                      <div>
                        <span className="field-label">Отклонённые email</span>
                        <p>{formatDiagnosticList(contactDiscovery?.emails_rejected)}</p>
                      </div>
                      <div>
                        <span className="field-label">Сигналы</span>
                        <div className="campaign-details-signal-list">
                          {signals.map((signal) => {
                            const verified =
                              validateCommercialSignalCandidate({
                                text: signal.signal_detail,
                                sourceUrl: signal.source_url,
                                sourceTitle: signal.signal_source_label,
                                confidence: signal.confidence_score,
                                detectedAt: signal.found_at,
                                pipelineSignalType: signal.signal_type,
                              });

                            return (
                              <article
                                className="campaign-details-signal-card"
                                key={signal.id}
                              >
                                <h4>
                                  {verified?.summary ??
                                    NO_VERIFIED_COMMERCIAL_SIGNAL}
                                </h4>
                                <p>
                                  Тип:{" "}
                                  {getCommercialSignalTypeLabel(
                                    verified?.type ?? "none",
                                  )}
                                </p>
                                {verified?.sourceUrl ? (
                                  <a
                                    className="source-link"
                                    href={verified.sourceUrl}
                                    rel="noreferrer"
                                    target="_blank"
                                  >
                                    Открыть источник
                                  </a>
                                ) : null}
                              </article>
                            );
                          })}
                        </div>
                      </div>
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
