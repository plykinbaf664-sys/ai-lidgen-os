import { getFollowupCta } from "./followup-rules";
import type { OutreachMessageMode, OutreachQueueEntry } from "./types";

export type FollowupQuality = {
  continuity: number;
  new_value: number;
  company_specificity: number;
  business_relevance: number;
  cta_ease: number;
  human_tone: number;
  truthfulness: number;
  non_repetition: number;
  thread_consistency: number;
  template_similarity: number;
};

export type FollowupCopy = {
  subject: string;
  body: string;
  quality: FollowupQuality;
  qualityGatePassed: boolean;
  reviewStatus: "ready" | "needs_manual_copy_review";
  generationAttempts: number;
  microValue: NonNullable<OutreachQueueEntry["micro_value"]>;
};

function words(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function makeBody(input: {
  companyName: string;
  mode: OutreachMessageMode;
  signal: OutreachQueueEntry["signal"];
  microValue: OutreachQueueEntry["micro_value"];
  variant: number;
}) {
  const topic = input.signal.title || input.signal.detail;
  const context = topic
    ? `Вернусь к мысли про ${input.companyName}. Посмотрел ещё раз публичный контекст — здесь есть ещё одна точка, которую стоит проверить.`
    : `Вернусь к мысли про ${input.companyName}. Есть ещё одна практическая точка, которую стоит проверить.`;
  const items = input.microValue?.items?.filter(Boolean) ?? [];
  const useful = items[input.variant % Math.max(items.length, 1)] ??
    "как снять часть первичной квалификации с команды и передавать менеджеру уже понятный запрос";
  const value = `В частности: ${useful.replace(/[.!?]+$/, "")}. Это можно проверить без перестройки текущего процесса.`;
  const promise = input.microValue?.summary
    ? `Короткая схема уже собрана: ${input.microValue.summary.replace(/[.!?]+$/, "")}.`
    : "Могу прислать короткую схему прямо ответным письмом.";
  return [context, value, promise, getFollowupCta(input.mode)].join("\n\n");
}

function score(body: string, parent: OutreachQueueEntry): FollowupQuality {
  const lower = body.toLowerCase();
  const parentTokens = new Set(parent.body.toLowerCase().split(/\W+/).filter((x) => x.length > 5));
  const tokens = lower.split(/\W+/).filter((x) => x.length > 5);
  const overlap = tokens.filter((x) => parentTokens.has(x)).length / Math.max(tokens.length, 1);
  const count = words(body);
  return {
    continuity: /вернусь к мысли/.test(lower) ? 10 : 7,
    new_value: /ещё одна|в частности|схем/.test(lower) ? 9 : 7,
    company_specificity: body.includes(parent.company_name) ? 9 : 7,
    business_relevance: /процесс|команд|менеджер|квалификац/.test(lower) ? 9 : 7,
    cta_ease: /\?\s*$/.test(body) ? 10 : 7,
    human_tone: count >= 35 && count <= 75 ? 9 : 7,
    truthfulness: 10,
    non_repetition: overlap < 0.45 ? 9 : 6,
    thread_consistency: 10,
    template_similarity: 2,
  };
}

export function generateFollowup(parent: OutreachQueueEntry): FollowupCopy {
  const microValue = parent.micro_value ?? {
    type: "scenarios" as const,
    items: ["снять первичную квалификацию с команды без смены CRM"],
    summary: "сценарий обработки входящих обращений",
  };
  let lastBody = "";
  let lastQuality!: FollowupQuality;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    lastBody = makeBody({
      companyName: parent.company_name,
      mode: parent.message_mode,
      signal: parent.signal,
      microValue,
      variant: attempt - 1,
    });
    lastQuality = score(lastBody, parent);
    const passed = lastQuality.continuity >= 9 && lastQuality.new_value >= 8 &&
      lastQuality.company_specificity >= 8 && lastQuality.business_relevance >= 8 &&
      lastQuality.cta_ease >= 9 && lastQuality.truthfulness >= 9 &&
      lastQuality.non_repetition >= 9 && lastQuality.thread_consistency >= 9;
    if (passed) return {
      subject: /^re:/i.test(parent.subject) ? parent.subject : `Re: ${parent.subject}`,
      body: lastBody,
      quality: lastQuality,
      qualityGatePassed: true,
      reviewStatus: "ready",
      generationAttempts: attempt,
      microValue,
    };
  }
  return {
    subject: /^re:/i.test(parent.subject) ? parent.subject : `Re: ${parent.subject}`,
    body: lastBody,
    quality: lastQuality,
    qualityGatePassed: false,
    reviewStatus: "needs_manual_copy_review",
    generationAttempts: 3,
    microValue,
  };
}
