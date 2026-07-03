"use client";

import { formatTelegramCard } from "@/lib/leadgen/telegram-card";
import {
  getContactIntelligence,
} from "@/lib/leadgen/contact-intelligence";
import type {
  DecisionMakerProfile,
  LeadgenContact,
  LeadgenLead,
  LeadStatus,
  OpportunityAssessment,
  PeopleDiscoveryResult,
  PersonaSearchStatus,
} from "@/lib/leadgen/types";

const statuses: LeadStatus[] = ["approved", "rejected", "paused", "new"];

const statusLabels: Record<LeadStatus, string> = {
  approved: "Одобрить",
  rejected: "Отклонить",
  paused: "Поставить на паузу",
  new: "Вернуть в новые",
};

type TelegramCardPreviewProps = {
  lead: LeadgenLead | null;
  decisionMaker?: DecisionMakerProfile | null;
  peopleDiscovery?: PeopleDiscoveryResult | null;
  bestAvailableEntry?: LeadgenContact | null;
  bestOutreachEntry?: LeadgenContact | null;
  fallbackEntry?: LeadgenContact | null;
  opportunity?: OpportunityAssessment | null;
  onStatusChange: (leadId: string, status: LeadStatus) => void;
};

function getPersonaSearchStatus(
  contact?: LeadgenContact | null,
): PersonaSearchStatus | undefined {
  const rawStatus = contact?.metadata.persona_search_status;

  return typeof rawStatus === "string"
    ? (rawStatus as PersonaSearchStatus)
    : undefined;
}

function getBestContactMethod({
  peopleDiscovery,
  bestOutreachEntry,
  fallbackEntry,
}: {
  peopleDiscovery?: PeopleDiscoveryResult | null;
  bestOutreachEntry?: LeadgenContact | null;
  fallbackEntry?: LeadgenContact | null;
}): {
  label: string;
  value: string | null;
  confidenceScore: number;
  source: string;
} {
  const intelligence = getContactIntelligence({
    peopleDiscovery,
    bestOutreachEntry,
    fallbackEntry,
  });

  if (intelligence.best_method) {
    const label =
      intelligence.best_method === intelligence.best_alternative
        ? "Alternative"
        : intelligence.best_method.label;

    return {
      label,
      value: intelligence.best_method.value,
      confidenceScore: intelligence.best_method.confidence_score,
      source: intelligence.best_method.source_label ?? "source not available",
    };
  }

  return {
    label: "Not found",
    value: null,
    confidenceScore: 0,
    source: "available public data",
  };
}

export function TelegramCardPreview({
  lead,
  decisionMaker,
  peopleDiscovery,
  bestAvailableEntry,
  bestOutreachEntry,
  fallbackEntry,
  opportunity,
  onStatusChange,
}: TelegramCardPreviewProps) {
  const bestContactMethod = getBestContactMethod({
    peopleDiscovery,
    bestOutreachEntry,
    fallbackEntry,
  });

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
          <div className="telegram-card">
            {formatTelegramCard(lead, {
              decisionMaker,
              peopleDiscovery,
              bestAvailableEntry,
              bestOutreachEntry,
              fallbackEntry,
              opportunity,
              personaSearchStatus: getPersonaSearchStatus(
                bestOutreachEntry ?? fallbackEntry ?? bestAvailableEntry,
              ),
            })}
            {"\n\nContact intelligence:"}
            {`\nBest method: ${bestContactMethod.label}`}
            {`\nValue: ${bestContactMethod.value ?? "not found"}`}
            {`\nConfidence: ${bestContactMethod.confidenceScore}/100`}
            {`\nSource: ${bestContactMethod.source}`}
            {opportunity ? (
              <>
                {"\n\nOpportunity explanation:"}
                {`\nOpportunity score: ${opportunity.opportunity_score}/100`}
                {`\nOpportunity type: ${opportunity.opportunity_type}`}
                {`\nBusiness reasoning: ${opportunity.business_reasoning}`}
                {`\nWhy this company: ${opportunity.why_this_company}`}
                {`\nWhy now: ${opportunity.why_now}`}
                {`\nPositive factors: ${
                  opportunity.positive_factors.length
                    ? opportunity.positive_factors.join(" ")
                    : "None recorded"
                }`}
                {`\nNegative factors: ${
                  opportunity.negative_factors.length
                    ? opportunity.negative_factors.join(" ")
                    : "None recorded"
                }`}
                {`\nMissing information: ${
                  opportunity.missing_information.length
                    ? opportunity.missing_information.join(" ")
                    : "None recorded"
                }`}
                {`\nRecommended action: ${opportunity.recommended_action}`}
              </>
            ) : null}
          </div>
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
          <p>Создайте лиды, затем откройте запись для проверки Telegram-карточки.</p>
        </div>
      )}
    </section>
  );
}
