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
  IdentityProfile,
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
  identityProfile?: IdentityProfile | null;
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

function getContactNextActionLabel(contact?: LeadgenContact | null): string {
  const rawAction = contact?.metadata.recommended_next_action;
  const labels: Record<string, string> = {
    send_outreach: "Send outreach",
    run_enrichment: "Run enrichment",
    use_fallback_channel: "Use fallback channel",
    manual_review: "Review manually",
    skip_until_contact_found: "Skip until contact is found",
    contact_primary_person: "Contact primary person",
    contact_alternative_person: "Contact alternative person",
    monitor_changes: "Monitor changes",
  };

  return typeof rawAction === "string"
    ? labels[rawAction] ?? rawAction
    : "Not calculated";
}

function getPrimaryDecisionMakerLines(
  peopleDiscovery?: PeopleDiscoveryResult | null,
): string[] {
  const primaryPerson = peopleDiscovery?.primary_person;
  const intelligence = peopleDiscovery?.primary_person_intelligence;

  if (!primaryPerson) {
    return ["Primary decision maker: not found"];
  }

  return [
    `Primary decision maker: ${primaryPerson.full_name}`,
    `Role: ${primaryPerson.role_title ?? "unknown"}`,
    `Selection reason: ${
      peopleDiscovery?.selection_reasoning ??
      intelligence?.selection_reason ??
      "Selection reason not available"
    }`,
    `Person score: ${
      intelligence?.person_score ?? primaryPerson.confidence_score
    }/100`,
    `Persona match score: ${
      intelligence?.persona_match_score ?? "not calculated"
    }`,
    `Business problem ownership: ${
      intelligence?.business_problem_ownership ?? "not calculated"
    }`,
    `Decision authority: ${
      intelligence?.decision_authority ?? "not calculated"
    }`,
    `Influence level: ${intelligence?.influence_level ?? "not calculated"}`,
    `Confidence score: ${
      intelligence?.confidence_score ?? primaryPerson.confidence_score
    }/100`,
    `Person next action: ${
      intelligence?.recommended_next_action ?? "not calculated"
    }`,
    `Strengths: ${
      intelligence?.strengths?.length
        ? intelligence.strengths.join(" ")
        : "not recorded"
    }`,
    `Risks: ${
      intelligence?.weaknesses?.length
        ? intelligence.weaknesses.join(" ")
        : "not recorded"
    }`,
  ];
}

export function TelegramCardPreview({
  lead,
  decisionMaker,
  peopleDiscovery,
  bestAvailableEntry,
  bestOutreachEntry,
  fallbackEntry,
  opportunity,
  identityProfile,
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
              identityProfile,
              personaSearchStatus: getPersonaSearchStatus(
                bestOutreachEntry ?? fallbackEntry ?? bestAvailableEntry,
              ),
            })}
            {"\n\nIdentity profile:"}
            {`\nSummary: ${
              identityProfile?.identity_summary ??
              "No confirmed personal contact found. Identity profile unavailable."
            }`}
            {`\nConfidence: ${
              typeof identityProfile?.identity_confidence === "number"
                ? `${identityProfile.identity_confidence}/100`
                : "not calculated"
            }`}
            {`\nBest identity channel: ${
              identityProfile?.primary_contact_channel?.label ?? "Not found yet"
            }`}
            {`\nFallback identity channel: ${
              identityProfile?.fallback_channel?.label ?? "Not found"
            }`}
            {`\nIdentity next action: ${
              identityProfile?.recommended_next_action ?? "run_enrichment"
            }`}
            {"\n\nPrimary decision maker:"}
            {getPrimaryDecisionMakerLines(peopleDiscovery).map((line) => (
              <span key={line}>{`\n${line}`}</span>
            ))}
            {"\n\nBest contact channel:"}
            {`\nChannel: ${bestContactMethod.label}`}
            {`\nValue: ${bestContactMethod.value ?? "not found"}`}
            {`\nConfidence: ${bestContactMethod.confidenceScore}/100`}
            {`\nSource: ${bestContactMethod.source}`}
            {`\nContact next action: ${getContactNextActionLabel(
              bestOutreachEntry ?? fallbackEntry ?? bestAvailableEntry,
            )}`}
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
