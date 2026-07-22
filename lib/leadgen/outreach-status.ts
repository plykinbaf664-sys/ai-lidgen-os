import type { OutreachEmailStatus } from "@/lib/leadgen/types";

export const outreachStatusLabels: Record<OutreachEmailStatus, string> = {
  draft: "Черновик",
  needs_review: "Требует проверки",
  approved: "Одобрено",
  queued: "В очереди",
  sending: "Отправляется",
  sent: "Отправлено",
  failed: "Ошибка отправки",
  paused: "На паузе",
  rejected: "Отклонено",
  replied: "Получен ответ",
  follow_up_due: "Нужен follow-up",
  completed: "Завершено",
  eligible: "Готов к генерации",
  generating: "Генерируется",
  skipped: "Пропущено",
  cancelled: "Отменено",
};

export function canSendStatus(status: OutreachEmailStatus): boolean {
  return status === "queued";
}

export function isTerminalOutreachStatus(status: OutreachEmailStatus): boolean {
  return ["sent", "completed", "rejected", "skipped", "cancelled"].includes(status);
}
