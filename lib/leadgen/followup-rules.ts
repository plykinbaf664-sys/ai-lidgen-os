import { normalizeRecipientEmail } from "@/lib/leadgen/company-identity";
import type { OutreachMessageMode, ReplyDetectionMethod } from "@/lib/leadgen/types";

export type IncomingHeader = {
  uid?: string | null;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  from: string | null;
  subject: string | null;
  date: string | null;
  bodyText?: string | null;
};

export type ReplyIntent = "interested" | "neutral" | "negative" | "unsubscribe";

export type ExtractedReplyContact = {
  fullName: string | null;
  roleTitle: string | null;
  phone: string | null;
  phoneExtension: string | null;
  intent: ReplyIntent;
  confidence: number;
};

export function analyzeReplyText(text: string | null | undefined): ExtractedReplyContact {
  const value = (text ?? "").replace(/\r/g, "").trim();
  const unsubscribe = /(удалите|отпис|не присыл|не интерес|не актуаль|stop|unsubscribe)/i.test(value);
  const interested = /(вышлите|пришлите|документац|предложени|материал|изучени|интересно|готовы обсудить|давайте)/i.test(value);
  const negative = /(не интерес|не актуаль|откаж|удалите|отпис)/i.test(value);
  const phone = value.match(/(?:\+7|8)\s*\(?\d{3}\)?[\s-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/)?.[0] ?? null;
  const phoneExtension = value.match(/(?:доб\.?|добавочн\.?|ext\.?|extension)\s*[:.]?\s*(\d{2,6})/i)?.[1] ?? null;
  const name = value.match(/(?:С уважением|С уважением,|Best regards)[,\s]*\n\s*([А-ЯЁA-Z][А-ЯЁа-яёA-Za-z-]+\s+[А-ЯЁA-Z][А-ЯЁа-яёA-Za-z-]+)/i)?.[1] ?? null;
  const role = value.match(/(?:^|\n)\s*((?:директор|руководитель|начальник|заместитель|director|head|manager)[^,\n]{0,100})/i)?.[1]?.trim() ?? null;
  const intent: ReplyIntent = unsubscribe ? "unsubscribe" : interested ? "interested" : negative ? "negative" : "neutral";
  return { fullName: name, roleTitle: role, phone, phoneExtension, intent, confidence: interested || negative ? 0.92 : 0.6 };
}

export type ReplyCandidate = {
  id: string;
  smtpMessageId: string;
  recipientEmail: string;
  subject: string;
  sentAt: string;
};

export function normalizeMessageId(value: string | null | undefined) {
  const clean = value?.trim().replace(/^<|>$/g, "").trim();
  return clean ? `<${clean.toLowerCase()}>` : null;
}

export function parseReferences(value: string | null | undefined) {
  return (value?.match(/<[^>]+>/g) ?? [])
    .map(normalizeMessageId)
    .filter((item): item is string => Boolean(item));
}

export function normalizeReplySubject(value: string | null | undefined) {
  let subject = value?.trim() ?? "";
  while (/^(re|fwd?|ответ)\s*:/i.test(subject)) {
    subject = subject.replace(/^(re|fwd?|ответ)\s*:\s*/i, "");
  }
  return subject.trim().toLowerCase().replace(/\s+/g, " ");
}

export function extractEmail(value: string | null | undefined) {
  const match = value?.match(/<([^>\s]+@[^>\s]+)>|([^\s<>,;]+@[^\s<>,;]+)/);
  return normalizeRecipientEmail(match?.[1] ?? match?.[2] ?? "");
}

export function matchReply(
  incoming: IncomingHeader,
  candidates: ReplyCandidate[],
): { candidate: ReplyCandidate; method: ReplyDetectionMethod } | null {
  const inReplyTo = normalizeMessageId(incoming.inReplyTo);
  if (inReplyTo) {
    const candidate = candidates.find(
      (item) => normalizeMessageId(item.smtpMessageId) === inReplyTo,
    );
    if (candidate) return { candidate, method: "in_reply_to" };
  }
  const refs = new Set(incoming.references.map(normalizeMessageId));
  const byReference = candidates.find((item) =>
    refs.has(normalizeMessageId(item.smtpMessageId)),
  );
  if (byReference) return { candidate: byReference, method: "references" };

  const sender = extractEmail(incoming.from);
  const incomingAt = Date.parse(incoming.date ?? "");
  const bySender = candidates.find(
    (item) =>
      sender === normalizeRecipientEmail(item.recipientEmail) &&
      Number.isFinite(incomingAt) &&
      incomingAt >= Date.parse(item.sentAt),
  );
  if (bySender) return { candidate: bySender, method: "sender_email" };

  const subject = normalizeReplySubject(incoming.subject);
  const bySubject = candidates.find((item) => {
    const sentAt = Date.parse(item.sentAt);
    return subject && subject === normalizeReplySubject(item.subject) &&
      Number.isFinite(incomingAt) && incomingAt >= sentAt &&
      incomingAt - sentAt <= 30 * 86_400_000;
  });
  return bySubject ? { candidate: bySubject, method: "subject_time" } : null;
}

export function getFollowupCta(mode: OutreachMessageMode) {
  if (mode === "personal") return "Показать второй сценарий?";
  if (mode === "department") return "Кому лучше отправить эту схему?";
  return "Кто у вас отвечает за этот процесс?";
}

export function getFollowupIdempotencyKey(input: {
  email: string;
  parentOutreachId: string;
  followupNumber: number;
  messageVersion: number;
}) {
  return [
    normalizeRecipientEmail(input.email),
    input.parentOutreachId,
    `followup-${input.followupNumber}`,
    String(input.messageVersion),
  ].join(":");
}
