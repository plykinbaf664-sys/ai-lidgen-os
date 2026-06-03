import { formatTelegramCard } from "@/lib/leadgen/telegram-card";
import type {
  LeadgenLead,
  TelegramNotification,
} from "@/lib/leadgen/types";

function createNotificationId(lead: LeadgenLead, createdAt: string): string {
  return `telegram-notification-${lead.id}-${createdAt}`;
}

export function prepareTelegramNotification(
  lead: LeadgenLead,
): TelegramNotification {
  const createdAt = new Date().toISOString();

  return {
    id: createNotificationId(lead, createdAt),
    pipeline_run_id: lead.pipeline_run_id,
    lead_id: lead.id,
    campaign_id: lead.campaign_id,
    telegram_card_text: formatTelegramCard(lead),
    status: "prepared",
    created_at: createdAt,
  };
}
