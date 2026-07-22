"use client";

import { formatTelegramCard } from "@/lib/leadgen/telegram-card";
import { Button, type ButtonVariant } from "@/components/ui/button";
import type {
  DecisionMakerProfile,
  IdentityProfile,
  LeadgenContact,
  LeadgenLead,
  LeadStatus,
  OpportunityAssessment,
  PeopleDiscoveryResult,
  PersonaSearchStatus,
} from "@/lib/leadgen/types";

const statuses: LeadStatus[] = ["approved", "rejected", "paused", "new"];

const statusVariants: Record<LeadStatus, ButtonVariant> = {
  approved: "success",
  rejected: "danger",
  paused: "secondary",
  new: "ghost",
};

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
  return (
    <section className="panel preview-panel">
      <div className="preview-heading">
        <div>
          <p className="eyebrow">Готово для Телеграм</p>
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
          </div>
          <div className="status-actions">
            {statuses.map((status) => (
              <Button
                key={status}
                onClick={() => onStatusChange(lead.id, status)}
                variant={lead.status === status ? statusVariants[status] : "ghost"}
              >
                {statusLabels[status]}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <h3>Карточка не выбрана</h3>
          <p>Создайте лиды, затем откройте запись для проверки карточки.</p>
        </div>
      )}
    </section>
  );
}
