import {
  INITIAL_OUTREACH_SIGNATURE,
  generateFirstEmailV3,
  passesFirstEmailQualityGate,
  validateFirstEmailV3,
  type FirstEmailContext,
  type FirstEmailCopy,
} from "@/lib/leadgen/first-email-generator";

type StructuredOutreach = {
  subject: string;
  body: string;
  cta: string;
  quality: {
    reason_now: boolean;
    grounded_hypothesis: boolean;
    russian_only: boolean;
    personal_cta: boolean;
    gifts_mentioned: boolean;
  };
};

type ResponsesApiResult = {
  output_text?: string;
  output?: Array<{
    content?: Array<{ type?: string; text?: string }>;
  }>;
};

function compact(value: string | null | undefined, max = 600): string | null {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, max) : null;
}

export function buildOutreachGenerationInput(context: FirstEmailContext) {
  return {
    company: compact(context.companyName, 120),
    segment: context.verticalId ?? null,
    industry: compact(context.industry, 120),
    signal: {
      type: compact(String(context.signalType ?? ""), 80),
      evidence: compact(context.signalEvidence || context.growthSignal, 700),
      source: compact(context.signalSourceUrl, 300),
    },
    company_specifics: compact(context.companyDescription, 500),
    lpr: {
      name: compact(context.decisionMakerName, 120),
      role: compact(context.decisionMakerRole, 180),
      why_this_person: compact(context.whyThisPerson, 300),
    },
    business_context: {
      problem_hypothesis: compact(context.businessProblemHypothesis, 400),
      target_responsibility: compact(context.targetResponsibility, 200),
      selection_reason: compact(context.selectionReason, 300),
    },
    contact_type: context.messageMode === "personal" ? "PERSONAL" : "GENERAL",
  };
}

export const OUTREACH_GENERATOR_INSTRUCTIONS = `
Ты пишешь первое холодное B2B-письмо от Александра Плыкина, AI-архитектора.

Задача: на основании ТОЛЬКО переданного компактного контекста показать связь «реальный сигнал → возможное узкое место → деловое последствие → полезная мысль → конкретное применение AI → простой ответ».

Правила:
- Только естественный русский язык. Не копируй английские формулировки из research-контекста; переводи их по смыслу.
- 120–200 слов без подписи. Короткие абзацы и предложения.
- Не выдумывай факты, цифры, потери, людей и проблемы компании. Предположения обозначай словами «часто», «может», «в такой ситуации».
- Первый смысловой абзац сразу объясняет, почему письмо отправлено сейчас, и называет компанию.
- Дай одну небанальную полезную мысль, связанную с сигналом.
- Главный эксперт — Александр Плыкин: «Я AI-архитектор». Опиши только релевантные этому участку действия AI.
- Бизнес-аналитик — один короткий дополнительный слой: сначала разобраться в процессе, затем автоматизировать осмысленное.
- Естественно укажи: обычная стоимость разбора 9 900 ₽; при ответе в течение 24 часов после отправки письма разбор бесплатный.
- Обязательно упомяни два вложения: «диагностика отдела продаж» и «шаблон бизнес-процессов»; их можно использовать независимо от разговора.
- PERSONAL: CTA на обсуждение участка. GENERAL: CTA с просьбой направить к ответственному.
- Ровно один вопросительный знак. Не используй кликбейт, канцелярит и маркеры нейросетевого текста.
- Не добавляй подпись: транспортный слой добавит её отдельно.
`.trim();

const OUTREACH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    subject: { type: "string" },
    body: { type: "string" },
    cta: { type: "string" },
    quality: {
      type: "object",
      additionalProperties: false,
      properties: {
        reason_now: { type: "boolean" },
        grounded_hypothesis: { type: "boolean" },
        russian_only: { type: "boolean" },
        personal_cta: { type: "boolean" },
        gifts_mentioned: { type: "boolean" },
      },
      required: ["reason_now", "grounded_hypothesis", "russian_only", "personal_cta", "gifts_mentioned"],
    },
  },
  required: ["subject", "body", "cta", "quality"],
} as const;

function outputText(result: ResponsesApiResult): string | null {
  if (typeof result.output_text === "string") return result.output_text;
  for (const item of result.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return null;
}

function isStructuredOutreach(value: unknown): value is StructuredOutreach {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<StructuredOutreach>;
  return typeof data.subject === "string" && typeof data.body === "string" && typeof data.cta === "string" && Boolean(data.quality);
}

export async function generateFirstEmailWithAi(context: FirstEmailContext): Promise<FirstEmailCopy> {
  const fallback = generateFirstEmailV3(context);
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || process.env.OUTREACH_LLM_ENABLED?.trim().toLowerCase() === "false") return fallback;

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OUTREACH_OPENAI_MODEL?.trim() || "gpt-5-mini",
        store: false,
        instructions: OUTREACH_GENERATOR_INSTRUCTIONS,
        input: JSON.stringify(buildOutreachGenerationInput(context)),
        text: {
          verbosity: "low",
          format: {
            type: "json_schema",
            name: "leadgen_outreach_v4",
            strict: true,
            schema: OUTREACH_SCHEMA,
          },
        },
        max_output_tokens: 1200,
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) throw new Error(`Outreach LLM returned HTTP ${response.status}`);
    const result = (await response.json()) as ResponsesApiResult;
    const text = outputText(result);
    if (!text) throw new Error("Outreach LLM returned no structured text");
    const parsed = JSON.parse(text) as unknown;
    if (!isStructuredOutreach(parsed)) throw new Error("Outreach LLM returned an invalid schema");
    const bodyWithoutSignature = parsed.body.trim().endsWith(parsed.cta.trim())
      ? parsed.body.trim()
      : `${parsed.body.trim()}\n\n${parsed.cta.trim()}`;
    const body = `${bodyWithoutSignature}\n\n${INITIAL_OUTREACH_SIGNATURE}`;
    const validation = validateFirstEmailV3({ subject: parsed.subject.trim(), body }, context);
    const selfCheckPassed = Object.values(parsed.quality).every(Boolean);
    if (!validation.valid || !selfCheckPassed || !passesFirstEmailQualityGate(fallback.quality)) return fallback;
    return {
      ...fallback,
      subject: parsed.subject.trim(),
      body,
      blocks: { ...fallback.blocks, observation: bodyWithoutSignature, cta: parsed.cta.trim() },
      qualityGatePassed: true,
      generationAttempts: 1,
      reviewStatus: "ready",
    };
  } catch {
    // Research and queue creation must remain functional when the optional
    // copy provider is unavailable. The deterministic copy is still gated.
    return fallback;
  }
}
