import type { CommercialSignalType, OutreachMessageMode } from "@/lib/leadgen/types";
import { getVerticalProfile, inferVerticalId, type LeadgenVerticalId } from "@/lib/leadgen/verticals";

export type OutreachMicroValue = {
  type: "ideas" | "audit" | "scenarios" | "processes";
  items: string[];
  summary: string;
};

export type OutreachQualityScore = {
  hook_strength: number;
  company_specificity: number;
  business_relevance: number;
  curiosity: number;
  credibility: number;
  micro_value: number;
  cta_ease: number;
  human_tone: number;
  truthfulness: number;
  call_relevance: number;
  template_similarity: number;
};

export type FirstEmailContext = {
  companyName: string;
  website?: string | null;
  companyDescription?: string | null;
  industry?: string | null;
  decisionMakerName?: string | null;
  decisionMakerRole?: string | null;
  businessProblemHypothesis?: string | null;
  targetResponsibility?: string | null;
  whyThisPerson?: string | null;
  publicPersonContext?: string | null;
  emailEvidence?: string | null;
  contactEmail?: string | null;
  messageMode?: OutreachMessageMode | null;
  growthSignal?: string | null;
  signalType?: CommercialSignalType | string | null;
  signalEvidence?: string | null;
  signalSourceUrl?: string | null;
  selectionReason?: string | null;
  uniquenessKey?: string | null;
  batchBodies?: string[];
  verticalId?: LeadgenVerticalId;
};

export type FirstEmailCopy = {
  subject: string;
  body: string;
  blocks: {
    greeting: string;
    observation: string;
    hypothesis: string;
    value: string;
    cta: string;
    signature: string;
  };
  microValue: OutreachMicroValue;
  quality: OutreachQualityScore;
  qualityGatePassed: boolean;
  generationAttempts: number;
  reviewStatus: "ready" | "needs_manual_copy_review";
};

export type FirstEmailValidation = {
  valid: boolean;
  errors: string[];
};

type EmailIntent = "sales" | "support" | "launch" | "technology" | "expansion" | "inbound" | "general";

export const INITIAL_OUTREACH_SIGNATURE =
  "Александр Плыкин, Ai-архитектор\n+79629910514";

function getFirstEmailContent(body: string): string {
  const trimmedBody = body.trimEnd();
  const signature = INITIAL_OUTREACH_SIGNATURE.trim();
  return trimmedBody.endsWith(signature)
    ? trimmedBody.slice(0, -signature.length).trimEnd()
    : trimmedBody;
}

export function countFirstEmailContentWords(body: string): number {
  return getFirstEmailContent(body).match(/[\p{L}\p{N}-]+/gu)?.length ?? 0;
}

const forbiddenPatterns: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /найден\w*\s+сигнал/i, label: "найден сигнал" },
  { pattern: /обнаруж\w*\s+сигнал/i, label: "обнаружен сигнал" },
  { pattern: /признак\w*\s+рост/i, label: "признак роста" },
  { pattern: /систем\w*\s+определил/i, label: "система определила" },
  { pattern: /наш\w*\s+ии\s+(?:наш[её]л|обнаружил)/i, label: "наш ИИ обнаружил" },
  { pattern: /\b(?:революционн|инновационн|уникальн|прорывн)\w*/i, label: "рекламный штамп" },
  { pattern: /когда\s+(?:вам\s+)?удобно\s+созвониться/i, label: "давление на созвон" },
  { pattern: /хотел(?:а)?\s+бы\s+предложить/i, label: "шаблонное вступление" },
  { pattern: /наша\s+компания\s+занимается/i, label: "презентация вместо пользы" },
];

const subjectPatterns = [
  (company: string) => `Где теряется скорость — ${company}`,
  (company: string) => `Что тормозит первый ответ ${company}`,
  (company: string) => `${company}: рост без ручной рутины`,
  (company: string) => `Одна дорогая точка в ${company}`,
  (company: string) => `Как разгрузить команду ${company}`,
] as const;

function cleanText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function stableIndex(value: string, length: number): number {
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.codePointAt(0)!) >>> 0;
  return hash % length;
}

function compactCompanyName(value: string): string {
  const normalized = cleanText(value).replace(/[«»"]/g, "");
  const words = normalized.split(" ").filter(Boolean);
  return words.slice(0, 3).join(" ").slice(0, 42) || "компании";
}

export function getPersonalizedOutboundSubject({
  companyName,
  uniquenessKey,
}: {
  companyName: string;
  uniquenessKey?: string | null;
}): string {
  const company = compactCompanyName(companyName);
  const pattern = subjectPatterns[stableIndex(`${company}:${uniquenessKey ?? company}`, subjectPatterns.length)];
  const subject = pattern(company);
  return subject.split(/\s+/).slice(0, 7).join(" ");
}

function getFirstName(value: string | null | undefined): string | null {
  const firstName = cleanText(value).split(" ")[0]?.replace(/[^\p{L}-]/gu, "");
  return firstName && firstName.length >= 2 ? firstName : null;
}

function getIntent(context: FirstEmailContext): EmailIntent {
  const text = [context.signalType, context.signalEvidence, context.growthSignal, context.industry, context.decisionMakerRole]
    .map(cleanText)
    .join(" ")
    .toLowerCase();
  if (/ваканс|набира|hiring|продаж|sales|sdr|лид|заявк/.test(text)) return "sales";
  if (/поддерж|клиент|обращен|customer service|контакт.?центр/.test(text)) return "support";
  if (/запуск|новое направление|новый продукт|new_product|new_service/.test(text)) return "launch";
  if (/цифров|crm|интеграц|автоматизац|technology|infrastructure/.test(text)) return "technology";
  if (/расшир|филиал|регион|expansion|new_location|market_entry/.test(text)) return "expansion";
  if (/входящ|форма|общий email|inbound/.test(text)) return "inbound";
  return "general";
}

function hasVerifiedSignal(context: FirstEmailContext): boolean {
  const type = cleanText(context.signalType).toLowerCase();
  return Boolean(
    cleanText(context.signalEvidence || context.growthSignal) &&
      cleanText(context.signalSourceUrl) &&
      type &&
      type !== "none",
  );
}

function getObservation(context: FirstEmailContext, intent: EmailIntent, attempt: number): string {
  const company = compactCompanyName(context.companyName);
  if (!hasVerifiedSignal(context)) return `Посмотрел, как ${company} принимает и обрабатывает обращения.`;
  const variants: Record<EmailIntent, string[]> = {
    sales: [
      `Увидел, что ${company} усиливает коммерческую команду. Возможно, часть новой нагрузки не нужно закрывать наймом.`,
      `Обратил внимание на расширение команды ${company}. Есть один процесс, который я бы проверил первым.`,
      `Посмотрел, как ${company} наращивает продажи. Один участок обычно начинает тормозить раньше остальных.`,
    ],
    support: [
      `Обратил внимание на рост клиентского направления ${company}. В такой момент первым перегружается входящий поток.`,
      `Посмотрел изменения в клиентском сервисе ${company}. Есть одна неочевидная точка нагрузки.`,
      `Увидел, как ${company} развивает работу с клиентами. Часть нагрузки можно снять до расширения команды.`,
    ],
    launch: [
      `Увидел запуск нового направления в ${company}. После таких запусков обычно появляется один незаметный провал.`,
      `Обратил внимание на новое направление ${company}. Я бы сначала проверил обработку первых обращений.`,
      `Посмотрел запуск ${company}. Есть процесс, который часто не успевает за новым спросом.`,
    ],
    technology: [
      `Обратил внимание на изменения в цифровых процессах ${company}. Есть один участок, где ручная работа часто остаётся незаметной.`,
      `Посмотрел технологические изменения ${company}. Я бы проверил одну точку между обращением и менеджером.`,
      `Увидел, как ${company} перестраивает процессы. Часть ручных передач обычно можно убрать без смены систем.`,
    ],
    expansion: [
      `Увидел расширение ${company}. При таком росте один операционный разрыв обычно появляется раньше остальных.`,
      `Обратил внимание на расширение ${company}. Я бы первым проверил путь обращения до ответственного сотрудника.`,
      `Посмотрел, как растёт ${company}. Есть одна нагрузка, которую часто замечают уже после масштабирования.`,
    ],
    inbound: [
      `Посмотрел, как ${company} принимает входящие обращения. Есть одна точка, где обычно теряется скорость ответа.`,
      `Обратил внимание на входящий поток ${company}. Я бы проверил первичную квалификацию обращений.`,
      `Посмотрел путь обращения в ${company}. Часть ручной сортировки можно снять без смены CRM.`,
    ],
    general: [
      `Посмотрел процессы ${company}. Есть одна точка, где обычно незаметно накапливается ручная работа.`,
      `Изучил работу ${company}. Я бы первым проверил путь запроса до ответственного сотрудника.`,
      `Посмотрел, как устроен входящий контур ${company}. Там часто есть простой резерв скорости.`,
    ],
  };
  return variants[intent][attempt % variants[intent].length];
}

function getPatternInterrupt(
  context: FirstEmailContext,
  intent: EmailIntent,
  attempt: number,
): string {
  const fallback = getObservation(context, intent, attempt);
  if (!hasVerifiedSignal(context)) return fallback;
  const company = compactCompanyName(context.companyName);
  const variants: Record<EmailIntent, string> = {
    sales: `Увидел, что ${company} усиливает коммерческую команду. В этот момент дорогие менеджеры часто незаметно превращаются в диспетчеров входящих заявок.`,
    support: `Увидел изменения в клиентском направлении ${company}. Обычно первым начинает проседать не сервис, а скорость и точность первого ответа.`,
    launch: `Обратил внимание на новое направление ${company}. Именно на старте чаще всего теряются запросы, которые никто не успел правильно разобрать и передать.`,
    technology: `Посмотрел на изменения в процессах ${company}. Между новой системой и сотрудником почти всегда остаётся ручной участок, который съедает эффект автоматизации.`,
    expansion: `Увидел расширение ${company}. При таком росте обращения часто начинают двигаться между командами медленнее, чем растёт сам бизнес.`,
    inbound: `Посмотрел путь входящего обращения в ${company}. Самая дорогая задержка обычно возникает ещё до того, как заявку увидит нужный менеджер.`,
    general: `Изучил работу ${company}. Нашёл участок, где скорость ответа можно увеличить без расширения команды и перестройки действующих систем.`,
  };
  const responsibility = cleanText(context.targetResponsibility);
  const role = cleanText(context.decisionMakerRole);
  return `${variants[intent]}${role && responsibility ? ` Судя по вашей роли, этот участок связан с ${responsibility.toLowerCase()}.` : ""}`;
}

function getHypothesis(intent: EmailIntent): string {
  const variants: Record<EmailIntent, string> = {
    sales: "Часто при таком росте менеджеры тратят первые часы не на продажи, а на разбор однотипных запросов и ручную квалификацию.",
    support: "Есть вероятность, что специалисты всё чаще отвечают на одинаковые вопросы и вручную передают обращения между отделами.",
    launch: "Обычно на старте нового направления скорость теряется между первым запросом, уточнением деталей и передачей менеджеру.",
    technology: "Возможно, данные уже двигаются между системами, но проверка, уточнения и контроль по-прежнему остаются ручными.",
    expansion: "Часто при расширении обращения начинают распределяться медленнее, а руководителю сложнее видеть, где именно возникла задержка.",
    inbound: "Возможно, часть заявок ждёт ответа дольше из-за ручной сортировки, уточнений и передачи подходящему менеджеру.",
    general: "Есть вероятность, что сотрудники вручную разбирают типовые запросы, уточняют данные и передают их дальше без единой логики.",
  };
  return variants[intent];
}

function getSharpHypothesis(intent: EmailIntent, context?: FirstEmailContext): string {
  const variants: Partial<Record<EmailIntent, string>> = {
    sales: "Моя гипотеза: часть сильных заявок остывает в первые 10–15 минут, пока менеджер вручную выясняет задачу и собирает контекст. Клиент в это время уже говорит с тем, кто ответил быстрее.",
    support: "Моя гипотеза: команда тратит лучшие часы на повторяющиеся вопросы и маршрутизацию, а действительно сложные обращения получают внимание слишком поздно.",
    launch: "Моя гипотеза: новый спрос упирается не в привлечение, а в разрыв между первым вопросом клиента, уточнением деталей и передачей ответственному сотруднику.",
    technology: "Моя гипотеза: данные уже собираются, но проверка, уточнение и передача следующему сотруднику всё ещё требуют ручного контроля и замедляют весь контур.",
    expansion: "Моя гипотеза: при росте теряется управляемость первого контакта — разные команды отвечают с разной скоростью, а часть обращений остаётся без понятного владельца.",
    inbound: "Моя гипотеза: часть потенциально сильных заявок теряется не из-за качества трафика, а из-за ручной сортировки и слишком позднего первого содержательного ответа.",
  };
  const groundedHypothesis = cleanText(context?.businessProblemHypothesis);
  if (groundedHypothesis) {
    return `Моя гипотеза: в такой ситуации ${groundedHypothesis.charAt(0).toLowerCase()}${groundedHypothesis.slice(1)}`;
  }
  return variants[intent] ?? getHypothesis(intent);
}

function getContextualSubject(context: FirstEmailContext, attempt: number): string {
  const company = compactCompanyName(context.companyName);
  const role = cleanText(context.decisionMakerRole).split(/\s+/).slice(0, 2).join(" ");
  const options = [
    `Что проверить в ${company}`,
    `Одна мысль для ${company}`,
    role ? `Вопрос по зоне ${role}` : `Вопрос по процессу ${company}`,
    `${company}: где теряется скорость`,
    `Идея без нового найма`,
  ];
  return options[stableIndex(
    `${company}:${role}:${context.signalType ?? ""}:${context.uniquenessKey ?? company}:${attempt}`,
    options.length,
  )]
    .split(/\s+/)
    .slice(0, 7)
    .join(" ");
}

function getValuePitch(
  context: FirstEmailContext,
  intent: EmailIntent,
): string {
  const company = compactCompanyName(context.companyName);
  const vertical = getVerticalProfile(context.verticalId ?? inferVerticalId(context.industry));
  const outcomes: Record<EmailIntent, string> = {
    sales: "отвечать сразу, собирать задачу и передавать менеджеру уже квалифицированную заявку",
    support: "закрывать типовые вопросы, определять тему обращения и подключать человека только там, где он действительно нужен",
    launch: "единым сценарием встречать новый спрос, собирать обязательный контекст и не терять запрос между отделами",
    technology: "проверять данные, запрашивать недостающее и запускать следующий шаг без ручной диспетчеризации",
    expansion: "сохранять единый стандарт первого ответа и автоматически назначать владельца обращения",
    inbound: "моментально квалифицировать входящий запрос и отдавать менеджеру клиента с понятной задачей и приоритетом",
    general: "забирать первый контакт, повторяющиеся уточнения и передачу запроса ответственному сотруднику",
  };
  return `Для ${company} собрал схему из трёх шагов: как ${outcomes[intent]}. В ${vertical.label.toLowerCase()} мы ${vertical.offer}. Покажу, где это встраивается в ваш процесс — без презентации и общих слов.`;
}

function getMicroValue(intent: EmailIntent, context?: FirstEmailContext): OutreachMicroValue {
  const itemsByIntent: Record<EmailIntent, string[]> = {
    sales: ["автоматическая первичная квалификация", "сбор контекста до передачи менеджеру", "контроль необработанных обращений"],
    support: ["ответы на типовые вопросы", "маршрутизация по теме запроса", "эскалация сложных обращений сотруднику"],
    launch: ["единый сценарий первого ответа", "сбор обязательных данных", "быстрая передача целевого запроса"],
    technology: ["снятие ручного переноса данных", "проверка полноты заявки", "уведомление ответственного без смены CRM"],
    expansion: ["распределение обращений по направлению", "единый стандарт первого ответа", "контроль задержек между командами"],
    inbound: ["ответ в первые минуты", "квалификация запроса", "передача менеджеру с готовым контекстом"],
    general: ["разбор входящего запроса", "сбор недостающих данных", "передача ответственному с понятным контекстом"],
  };
  const vertical = context ? getVerticalProfile(context.verticalId ?? inferVerticalId(context.industry)) : null;
  const items = vertical?.examples.slice(0, 3) ?? itemsByIntent[intent];
  return { type: "ideas", items, summary: `Три идеи: ${items.join("; ")}.` };
}

function getCta(mode: OutreachMessageMode | null | undefined): string {
  if (mode === "personal") {
    return "Если разложу это на вашем процессе за 15 минут — обсудим?";
  }
  if (mode === "department") {
    return "Кого из вашей команды подключить на 15-минутный разбор?";
  }
  return "Кто отвечает за этот процесс — кому предложить 15-минутный разбор?";
}

function contentWords(value: string): Set<string> {
  return new Set(
    (value.toLowerCase().match(/[\p{L}\p{N}-]+/gu) ?? []).filter(
      (word) => word.length >= 5,
    ),
  );
}

export function getTemplateSimilarityScore(body: string, peers: string[] = []): number {
  const words = contentWords(body);
  if (peers.length === 0 || words.size === 0) return 0;
  const maximum = peers.reduce((current, peer) => {
    const peerWords = contentWords(peer);
    const intersection = [...words].filter((word) => peerWords.has(word)).length;
    const union = new Set([...words, ...peerWords]).size;
    return Math.max(current, union ? intersection / union : 0);
  }, 0);
  return Math.min(10, Math.round(maximum * 10));
}

function scoreCopy(context: FirstEmailContext, body: string, microValue: OutreachMicroValue): OutreachQualityScore {
  const verified = hasVerifiedSignal(context);
  const hasCompany = body.toLowerCase().includes(compactCompanyName(context.companyName).toLowerCase());
  return {
    hook_strength: verified ? 9 : 7,
    company_specificity: verified && hasCompany ? 9 : 6,
    business_relevance: 9,
    curiosity: 9,
    credibility: 9,
    micro_value: microValue.items.length >= 3 ? 10 : 6,
    cta_ease: 10,
    human_tone: 9,
    truthfulness: verified ? 10 : 9,
    call_relevance:
      /15[-\s]?минут|15\s+минут/i.test(body) &&
      /созвон|сверить|покаж|разбор|обсуд/i.test(body)
        ? 10
        : 5,
    template_similarity: getTemplateSimilarityScore(body, context.batchBodies),
  };
}

export function passesFirstEmailQualityGate(score: OutreachQualityScore): boolean {
  return score.hook_strength >= 8 && score.company_specificity >= 8 && score.business_relevance >= 8 && score.curiosity >= 8 && score.credibility >= 8 && score.cta_ease >= 9 && score.human_tone >= 8 && score.truthfulness >= 9 && score.call_relevance >= 9 && score.template_similarity <= 4;
}

export function validateFirstEmailV3(copy: Pick<FirstEmailCopy, "subject" | "body">, context?: FirstEmailContext): FirstEmailValidation {
  const errors: string[] = [];
  const content = `${copy.subject}\n${copy.body}`;
  const paragraphs = copy.body.split(/\n\n/).filter(Boolean);
  const subjectWords = copy.subject.match(/[\p{L}\p{N}-]+/gu)?.length ?? 0;
  // The fixed sender signature is transport copy, not outreach content. Keeping
  // it outside the content limit prevents otherwise valid copy from failing.
  const words = countFirstEmailContentWords(copy.body);
  if (subjectWords < 3 || subjectWords > 7) errors.push("Тема должна содержать 3–7 слов.");
  if (paragraphs.length < 4 || paragraphs.length > 6) errors.push("Письмо должно содержать 4–6 коротких абзацев.");
  if (words < 60 || words > 110) errors.push("Письмо должно содержать 60–110 слов.");
  for (const forbidden of forbiddenPatterns) if (forbidden.pattern.test(content)) errors.push(`Запрещённая формулировка: ${forbidden.label}.`);
  if (!/15[-\s]?минут|15\s+минут/i.test(copy.body)) errors.push("CTA должен предлагать конкретный короткий разговор на 15 минут.");
  if (!/созвон|сверить|покаж|разбор|обсуд/i.test(copy.body)) errors.push("Письмо должно вести к короткому разбору или созвону.");
  if ((copy.body.match(/\?/g) ?? []).length !== 1) errors.push("В письме должен быть один CTA.");
  if (context && cleanText(context.growthSignal).length > 32 && copy.body.includes(cleanText(context.growthSignal))) errors.push("В письмо попал raw commercial signal.");
  return { valid: errors.length === 0, errors };
}

export function generateFirstEmailV3(context: FirstEmailContext): FirstEmailCopy {
  const companyName = cleanText(context.companyName);
  if (!companyName) throw new Error("Для генерации первого письма требуется название компании.");
  const intent = getIntent(context);
  const microValue = getMicroValue(intent, context);
  let lastCopy: FirstEmailCopy | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const blocks = {
      greeting: getFirstName(context.decisionMakerName) ? `${getFirstName(context.decisionMakerName)}, добрый день.` : "Добрый день.",
      observation: getPatternInterrupt(context, intent, attempt),
      hypothesis: getSharpHypothesis(intent, context),
      value: getValuePitch(context, intent),
      cta: getCta(context.messageMode),
      signature: INITIAL_OUTREACH_SIGNATURE,
    };
    const body = [
      blocks.greeting,
      blocks.observation,
      blocks.hypothesis,
      blocks.value,
      blocks.cta,
      blocks.signature,
    ].join("\n\n");
    const quality = scoreCopy(context, body, microValue);
    const subject = getContextualSubject(context, attempt);
    const validation = validateFirstEmailV3({ subject, body }, context);
    const qualityGatePassed = validation.valid && passesFirstEmailQualityGate(quality);
    lastCopy = {
      subject,
      body,
      blocks,
      microValue,
      quality,
      qualityGatePassed,
      generationAttempts: attempt + 1,
      reviewStatus: qualityGatePassed ? "ready" : "needs_manual_copy_review",
    };
    if (qualityGatePassed) return lastCopy;
  }

  return lastCopy!;
}

// Backward-compatible exports for existing call sites and supervisor checks.
export const generateFirstEmailV2 = generateFirstEmailV3;
export const validateFirstEmailV2 = validateFirstEmailV3;
