import type { CommercialSignalType, OutreachMessageMode } from "@/lib/leadgen/types";
import { inferVerticalId, type LeadgenVerticalId } from "@/lib/leadgen/verticals";

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
    insight: string;
    experts: string;
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

export type FirstEmailValidation = { valid: boolean; errors: string[] };

type EmailIntent =
  | "sales"
  | "support"
  | "launch"
  | "technology"
  | "expansion"
  | "inbound"
  | "general";

export const INITIAL_OUTREACH_SIGNATURE =
  "Александр Плыкин, AI-архитектор\n+79629910514";

export const OUTREACH_GIFTS_NOTE =
  "К письму приложил два рабочих материала: диагностику отдела продаж и шаблон бизнес-процессов. Их можно забрать и использовать независимо от нашего разговора.";

const FORBIDDEN_PHRASES: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /operations leadership/i, label: "operations leadership" },
  { pattern: /growth(?:\s+and)?\s+cross-functional execution/i, label: "growth and cross-functional execution" },
  { pattern: /manual handoffs?/i, label: "manual handoffs" },
  { pattern: /process fragmentation/i, label: "process fragmentation" },
  { pattern: /operational bottlenecks?/i, label: "operational bottlenecks" },
  { pattern: /коммерческ(?:ое|ого) предложен/i, label: "коммерческое предложение" },
  { pattern: /предложение о сотрудничестве/i, label: "предложение о сотрудничестве" },
  { pattern: /инновационн(?:ое|ые) решен/i, label: "инновационное решение" },
  { pattern: /моя гипотеза:/i, label: "нейросетевой маркер «моя гипотеза»" },
];

const ALLOWED_LATIN_WORDS = new Set([
  "ai",
  "b2b",
  "crm",
  "erp",
  "api",
  "it",
  "hr",
  "pro",
]);

function cleanText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function compactCompanyName(value: string): string {
  return cleanText(value).replace(/[«»"]/g, "").split(" ").filter(Boolean).slice(0, 3).join(" ").slice(0, 48) || "компании";
}

function getFirstName(value: string | null | undefined): string | null {
  const normalized = cleanText(value);
  const parts = normalized.split(" ").map((part) => part.replace(/[^\p{L}-]/gu, "")).filter(Boolean);
  if (parts.length < 2 || parts.some((part) => part.length < 2)) return null;
  if (/директор|руководитель|менеджер|отдел|компан|контакт|ваканс/i.test(normalized)) return null;
  return parts[0];
}

function hasVerifiedSignal(context: FirstEmailContext): boolean {
  const type = cleanText(context.signalType).toLowerCase();
  return Boolean(cleanText(context.signalEvidence || context.growthSignal) && cleanText(context.signalSourceUrl) && type && type !== "none");
}

function getIntent(context: FirstEmailContext): EmailIntent {
  const text = [context.signalType, context.signalEvidence, context.growthSignal, context.industry]
    .map(cleanText)
    .join(" ")
    .toLowerCase();
  if (/ваканс|набир|найм|hiring|продаж|sales|sdr|лид|заявк/.test(text)) return "sales";
  if (/поддерж|клиент|обращен|customer service|контакт.?центр/.test(text)) return "support";
  if (/запуск|новое направление|новый продукт|новая услуг|new_product|new_service/.test(text)) return "launch";
  if (/цифров|crm|интеграц|автоматизац|technology|infrastructure/.test(text)) return "technology";
  if (/расшир|филиал|регион|expansion|new_location|market_entry/.test(text)) return "expansion";
  if (/входящ|форма|inbound/.test(text)) return "inbound";
  return "general";
}

const COPY_BY_INTENT: Record<EmailIntent, {
  subject: (company: string) => string;
  observation: (company: string) => string;
  hypothesis: string;
  insight: string;
  aiSolution: string;
  items: string[];
}> = {
  sales: {
    subject: (company) => `${company}: что проверить до найма`,
    observation: (company) => `Увидел, что ${company} усиливает коммерческую команду.`,
    hypothesis: "В такой точке узкое место часто уже не в количестве менеджеров. Они тратят время на первичный разбор заявок, одинаковые вопросы и ручную передачу информации. В итоге фонд оплаты труда может расти быстрее пропускной способности отдела.",
    insight: "Полезно автоматизировать не людей, а участок до менеджера — чтобы сотрудник подключался к уже понятной задаче, а не работал диспетчером входящего потока.",
    aiSolution: "Я AI-архитектор. Разбираю такие участки и собираю системы, которые первично отвечают, квалифицируют обращение, собирают нужные данные и передают менеджеру подготовленную заявку.",
    items: ["первичная квалификация", "сбор контекста", "передача подготовленной заявки"],
  },
  support: {
    subject: (company) => `${company}: скорость первого ответа`,
    observation: (company) => `Увидел, что ${company} развивает клиентское направление.`,
    hypothesis: "При росте обращений специалисты часто всё больше времени тратят на одинаковые вопросы и ручную маршрутизацию. Сложные случаи из-за этого могут ждать дольше, хотя именно там сильнее всего нужен человек.",
    insight: "Первую линию полезно строить так, чтобы система снимала повторяющиеся действия, но вовремя передавала сотруднику обращение с уже собранным контекстом.",
    aiSolution: "Я AI-архитектор. Настраиваю такие контуры: система отвечает на типовые вопросы, определяет тему, уточняет данные и подключает специалиста там, где его решение действительно необходимо.",
    items: ["первый ответ", "определение темы", "передача сложного обращения"],
  },
  launch: {
    subject: (company) => `${company}: путь первого запроса`,
    observation: (company) => `Обратил внимание на запуск нового направления в ${company}.`,
    hypothesis: "На старте спрос часто появляется быстрее, чем устойчивый процесс его обработки. Запросы приходится вручную уточнять и передавать между людьми, поэтому часть потенциальных клиентов может не получить содержательный ответ вовремя.",
    insight: "До масштабирования трафика стоит сначала собрать единый путь первого обращения — от вопроса клиента до конкретного владельца внутри команды.",
    aiSolution: "Я AI-архитектор. Собираю системы, которые встречают новый спрос, уточняют задачу, фиксируют обязательные данные и передают обращение нужному сотруднику без лишних ручных шагов.",
    items: ["единый первый ответ", "сбор обязательных данных", "назначение владельца"],
  },
  technology: {
    subject: (company) => `${company}: ручной участок процесса`,
    observation: (company) => `Увидел изменения в цифровых процессах ${company}.`,
    hypothesis: "Даже после внедрения новой системы между данными и следующим действием часто остаются ручная проверка, уточнения и перенос информации. Такой стык может незаметно съедать скорость, ради которой всё внедрение и затевалось.",
    insight: "Автоматизация даёт результат только тогда, когда заканчивается конкретным действием, а не ещё одной задачей для сотрудника.",
    aiSolution: "Я AI-архитектор. Разбираю такие стыки и собираю решения, которые проверяют данные, запрашивают недостающее и запускают следующий шаг без ручной диспетчеризации.",
    items: ["проверка данных", "сбор недостающего", "запуск следующего шага"],
  },
  expansion: {
    subject: (company) => `${company}: процесс до масштабирования`,
    observation: (company) => `Увидел, что ${company} расширяет присутствие.`,
    hypothesis: "При таком росте обращения и задачи начинают проходить через большее число людей. Если маршрут не закреплён, скорость может снижаться, а руководителю становится сложнее увидеть, где запрос потерял владельца.",
    insight: "До расширения команды полезно зафиксировать единый путь обращения и убрать ручные передачи, которые при масштабе становятся дороже.",
    aiSolution: "Я AI-архитектор. Собираю системы, которые распознают задачу, назначают ответственного, собирают контекст и контролируют, чтобы обращение не осталось между командами.",
    items: ["распознавание задачи", "назначение ответственного", "контроль передачи"],
  },
  inbound: {
    subject: (company) => `${company}: путь входящей заявки`,
    observation: (company) => `Посмотрел, как устроен входящий контур ${company}.`,
    hypothesis: "Одна из типичных потерь здесь возникает ещё до менеджера: заявку нужно прочитать, уточнить и вручную направить нужному человеку. Клиент в это время может уже получить содержательный ответ в другом месте.",
    insight: "Скорость стоит увеличивать до менеджера — человек должен получать не сырой запрос, а понятную задачу с приоритетом и контекстом.",
    aiSolution: "Я AI-архитектор. Настраиваю системы, которые сразу разбирают обращение, задают нужные вопросы и передают менеджеру подготовленную заявку.",
    items: ["разбор обращения", "уточняющие вопросы", "приоритет и контекст"],
  },
  general: {
    subject: (company) => `${company}: где теряется скорость`,
    observation: (company) => `Изучил открытые материалы ${company} и обратил внимание на текущую активность компании.`,
    hypothesis: "В такой ситуации одна из типичных проблем — ручной разбор повторяющихся запросов и передача информации между сотрудниками. Это может замедлять ответ и забирать время у людей, которые должны решать более сложные задачи.",
    insight: "Начинать стоит не с выбора нейросети, а с одного измеримого участка, где ручное действие повторяется и ограничивает скорость.",
    aiSolution: "Я AI-архитектор. Нахожу такие участки и собираю решения, которые забирают повторяющиеся шаги, собирают данные и вовремя подключают человека.",
    items: ["повторяющийся шаг", "сбор данных", "подключение сотрудника"],
  },
};

function getCta(mode: OutreachMessageMode | null | undefined): string {
  return mode === "personal"
    ? "Есть смысл посмотреть этот участок на вашей компании?"
    : "Подскажете, кто у вас отвечает за этот участок?";
}

function getFirstEmailContent(body: string): string {
  const trimmed = body.trimEnd();
  return trimmed.endsWith(INITIAL_OUTREACH_SIGNATURE)
    ? trimmed.slice(0, -INITIAL_OUTREACH_SIGNATURE.length).trimEnd()
    : trimmed;
}

export function countFirstEmailContentWords(body: string): number {
  return getFirstEmailContent(body).match(/[\p{L}\p{N}-]+/gu)?.length ?? 0;
}

function contentWords(value: string): Set<string> {
  return new Set((value.toLowerCase().match(/[\p{L}\p{N}-]+/gu) ?? []).filter((word) => word.length >= 5));
}

export function getTemplateSimilarityScore(body: string, peers: string[] = []): number {
  const words = contentWords(body);
  if (!peers.length || !words.size) return 0;
  const max = peers.reduce((current, peer) => {
    const peerWords = contentWords(peer);
    const intersection = [...words].filter((word) => peerWords.has(word)).length;
    const union = new Set([...words, ...peerWords]).size;
    return Math.max(current, union ? intersection / union : 0);
  }, 0);
  return Math.min(10, Math.round(max * 10));
}

function unexplainedEnglishWords(content: string, companyName = ""): string[] {
  const companyWords = new Set((companyName.toLowerCase().match(/[a-z][a-z-]*/g) ?? []));
  return [...new Set(content.match(/\b[A-Za-z][A-Za-z-]{2,}\b/g) ?? [])]
    .filter((word) => !ALLOWED_LATIN_WORDS.has(word.toLowerCase()) && !companyWords.has(word.toLowerCase()));
}

function scoreCopy(context: FirstEmailContext, body: string, microValue: OutreachMicroValue): OutreachQualityScore {
  const grounded = hasVerifiedSignal(context);
  const containsCompany = body.toLowerCase().includes(compactCompanyName(context.companyName).toLowerCase());
  return {
    hook_strength: grounded ? 9 : 5,
    company_specificity: grounded && containsCompany ? 9 : 5,
    business_relevance: 9,
    curiosity: 8,
    credibility: 9,
    micro_value: microValue.items.length === 3 ? 9 : 5,
    cta_ease: 10,
    human_tone: unexplainedEnglishWords(body, context.companyName).length ? 4 : 9,
    truthfulness: grounded ? 10 : 6,
    call_relevance: /разбор|посмотреть этот участок/i.test(body) ? 10 : 6,
    template_similarity: getTemplateSimilarityScore(body, context.batchBodies),
  };
}

export function passesFirstEmailQualityGate(score: OutreachQualityScore): boolean {
  return score.hook_strength >= 8 && score.company_specificity >= 8 && score.business_relevance >= 8 && score.credibility >= 8 && score.cta_ease >= 9 && score.human_tone >= 8 && score.truthfulness >= 9 && score.call_relevance >= 9 && score.template_similarity <= 7;
}

export function validateFirstEmailV3(copy: Pick<FirstEmailCopy, "subject" | "body">, context?: FirstEmailContext): FirstEmailValidation {
  const errors: string[] = [];
  const content = `${copy.subject}\n${copy.body}`;
  const subjectWords = copy.subject.match(/[\p{L}\p{N}-]+/gu)?.length ?? 0;
  const words = countFirstEmailContentWords(copy.body);
  if (subjectWords < 3 || subjectWords > 7) errors.push("Тема должна содержать 3–7 слов.");
  if (words < 120 || words > 200) errors.push("Письмо должно содержать 120–200 слов без подписи.");
  for (const item of FORBIDDEN_PHRASES) if (item.pattern.test(content)) errors.push(`Запрещённая формулировка: ${item.label}.`);
  const english = unexplainedEnglishWords(content, context?.companyName);
  if (english.length) errors.push(`Необоснованные английские слова: ${english.join(", ")}.`);
  if (!/Я AI-архитектор/i.test(copy.body)) errors.push("Александр Плыкин должен быть представлен главным AI-экспертом.");
  if (!/бизнес-аналитик/i.test(copy.body)) errors.push("Отсутствует дополнительный слой бизнес-аналитика.");
  if (!/9\s*900\s*₽/.test(copy.body)) errors.push("Отсутствует стоимость 9 900 ₽.");
  if (!/24\s+час/i.test(copy.body) || !/бесплат/i.test(copy.body)) errors.push("Некорректно указано условие бесплатного разбора в течение 24 часов.");
  if (!/диагностик[ау] отдела продаж/i.test(copy.body) || !/шаблон бизнес-процессов/i.test(copy.body)) errors.push("Не обозначены оба подарочных материала.");
  if ((copy.body.match(/\?/g) ?? []).length !== 1) errors.push("В письме должен быть один простой CTA.");
  if (context) {
    const company = compactCompanyName(context.companyName);
    if (!content.toLowerCase().includes(company.toLowerCase())) errors.push("В письме отсутствует название компании.");
    if (!hasVerifiedSignal(context)) errors.push("Нет подтверждённого сигнала с источником.");
    const expectedGreeting = getFirstName(context.decisionMakerName);
    if (expectedGreeting && !copy.body.startsWith(`${expectedGreeting}, добрый день.`)) errors.push("Подтверждённый ЛПР не использован в приветствии.");
    if (!expectedGreeting && !copy.body.startsWith("Добрый день.")) errors.push("Использовано неподтверждённое имя.");
    const expectedCta = getCta(context.messageMode);
    if (!copy.body.includes(expectedCta)) errors.push("CTA не соответствует типу контакта.");
  }
  return { valid: errors.length === 0, errors };
}

export function getPersonalizedOutboundSubject({ companyName }: { companyName: string; uniquenessKey?: string | null }): string {
  return COPY_BY_INTENT.general.subject(compactCompanyName(companyName)).split(/\s+/).slice(0, 7).join(" ");
}

export function generateFirstEmailV3(context: FirstEmailContext): FirstEmailCopy {
  if (!cleanText(context.companyName)) throw new Error("Для генерации первого письма требуется название компании.");
  const intent = getIntent(context);
  const source = COPY_BY_INTENT[intent];
  const company = compactCompanyName(context.companyName);
  const greeting = getFirstName(context.decisionMakerName)
    ? `${getFirstName(context.decisionMakerName)}, добрый день.`
    : "Добрый день.";
  const experts = `${source.aiSolution}\n\nЕсли причина лежит глубже самой автоматизации, подключаем бизнес-аналитика: сначала разбираем сам процесс, затем автоматизируем только то, что действительно имеет смысл.`;
  const value = "Могу коротко разобрать этот участок именно на вашей компании и показать, что здесь имеет смысл автоматизировать. Обычно такой разбор стоит 9 900 ₽. Если ответите в течение 24 часов после отправки письма, проведу его бесплатно.";
  const cta = getCta(context.messageMode);
  const blocks = {
    greeting,
    observation: source.observation(company),
    hypothesis: source.hypothesis,
    insight: source.insight,
    experts,
    value: `${value}\n\n${OUTREACH_GIFTS_NOTE}`,
    cta,
    signature: INITIAL_OUTREACH_SIGNATURE,
  };
  const body = [blocks.greeting, blocks.observation, blocks.hypothesis, blocks.insight, blocks.experts, blocks.value, blocks.cta, blocks.signature].join("\n\n");
  const subject = source.subject(company).split(/\s+/).slice(0, 7).join(" ");
  const microValue: OutreachMicroValue = { type: "processes", items: source.items, summary: source.items.join("; ") };
  const quality = scoreCopy(context, body, microValue);
  const validation = validateFirstEmailV3({ subject, body }, context);
  const qualityGatePassed = validation.valid && passesFirstEmailQualityGate(quality);
  return {
    subject,
    body,
    blocks,
    microValue,
    quality,
    qualityGatePassed,
    generationAttempts: 1,
    reviewStatus: qualityGatePassed ? "ready" : "needs_manual_copy_review",
  };
}

// Backward-compatible exports for queue/history call sites.
export const generateFirstEmailV2 = generateFirstEmailV3;
export const validateFirstEmailV2 = validateFirstEmailV3;

// Retained as an explicit signal that the generator uses the already resolved
// segment context without starting new research.
export function getFirstEmailVertical(context: FirstEmailContext): LeadgenVerticalId {
  return context.verticalId ?? inferVerticalId(context.industry);
}
