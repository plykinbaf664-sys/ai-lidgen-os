import type { LeadgenLead } from "@/lib/leadgen/types";

const statusLabels: Record<LeadgenLead["status"], string> = {
  new: "Новый",
  approved: "Одобрен",
  rejected: "Отклонен",
  paused: "На паузе",
};

export function formatTelegramCard(lead: LeadgenLead): string {
  const contact = lead.contact_label
    ? `${lead.contact_label}: ${lead.contact_value}`
    : "Подтвержденный контакт не найден";

  return [
    `НОВЫЙ ЛИД: ${lead.company_name}`,
    "",
    `Сегмент: ${lead.company_segment}`,
    `Сайт: ${lead.company_domain}`,
    `Лучший доступный вход: ${contact}`,
    "",
    `Сигнал: ${lead.signal_title}`,
    `${lead.signal_detail}`,
    `Источник: ${lead.signal_source_label}`,
    "",
    `Зацепка: ${lead.hook}`,
    "",
    `Сообщение: ${lead.message}`,
    "",
    `Повторное сообщение: ${lead.follow_up}`,
    "",
    `Статус: ${statusLabels[lead.status]}`,
  ].join("\n");
}
