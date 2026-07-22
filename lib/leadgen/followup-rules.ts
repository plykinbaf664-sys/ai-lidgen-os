import { normalizeRecipientEmail } from "@/lib/leadgen/company-identity";
import type { OutreachMessageMode, ReplyDetectionMethod } from "@/lib/leadgen/types";

export type IncomingHeader = {
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  from: string | null;
  subject: string | null;
  date: string | null;
};

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
