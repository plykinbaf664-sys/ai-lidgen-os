import { fetchLeadgenModel, semanticApiKey } from "@/lib/leadgen/ai-runtime";
import { runAbortableOperation } from "@/lib/network/abortable-operation";
import { llmAvailabilityError, recordLlmFailure } from "@/lib/leadgen/llm-availability";

export type DirectAiNeedPlanStatus = "AI" | "UNAVAILABLE" | "FAILED";

export type DirectAiNeedSearchPlan = {
  status: DirectAiNeedPlanStatus;
  reason: "configured" | "missing_openai_api_key" | "disabled" | "provider_failed";
  intentHypotheses: string[];
  terminology: string[];
  sourceHypotheses: string[];
  queries: string[];
  queryAngles?: Array<"ru_job_board" | "market_news">;
};

export type DirectAiNeedDocument = {
  id: string;
  title: string;
  excerpt: string;
  sourceUrl: string;
  publishedAt?: string | null;
  companyName?: string | null;
  activeJobPosting?: boolean;
};

export type DirectAiNeedAssessment = {
  id: string;
  classification: "DIRECT" | "LIKELY" | "NOT_RELEVANT";
  intentFamily: string;
  actionSummary: string;
  evidenceExcerpt: string;
  reason: string;
  confidence: number;
  freshness: "CURRENT" | "UNCERTAIN" | "STALE";
  companyName: string | null;
  officialWebsite: string | null;
  identityEvidence: string | null;
  organizationKind: "COMMERCIAL" | "PUBLIC_SECTOR" | "OTHER" | "UNKNOWN";
  demandSide?: "BUYER" | "SELLER" | "UNKNOWN";
};

type ResponsesApiResult = {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
};

const SEARCH_PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    intent_hypotheses: { type: "array", minItems: 3, maxItems: 8, items: { type: "string" } },
    terminology: { type: "array", minItems: 4, maxItems: 16, items: { type: "string" } },
    source_hypotheses: { type: "array", minItems: 3, maxItems: 10, items: { type: "string" } },
    queries: { type: "array", minItems: 4, maxItems: 10, items: { type: "string" } },
    query_angles: { type: "array", minItems: 4, maxItems: 10, items: { type: "string", enum: ["ru_job_board", "market_news"] } },
  },
  required: ["intent_hypotheses", "terminology", "source_hypotheses", "queries", "query_angles"],
} as const;

const ASSESSMENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    assessments: {
      type: "array",
      maxItems: 24,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          classification: { type: "string", enum: ["DIRECT", "LIKELY", "NOT_RELEVANT"] },
          intent_family: { type: "string" },
          action_summary: { type: "string" },
          evidence_excerpt: { type: "string" },
          reason: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 100 },
          freshness: { type: "string", enum: ["CURRENT", "UNCERTAIN", "STALE"] },
          freshness_evidence: { type: ["string", "null"] },
          company_name: { type: ["string", "null"] },
          official_website: { type: ["string", "null"] },
          identity_evidence: { type: ["string", "null"] },
          organization_kind: { type: "string", enum: ["COMMERCIAL", "PUBLIC_SECTOR", "OTHER", "UNKNOWN"] },
          demand_side: { type: "string", enum: ["BUYER", "SELLER", "UNKNOWN"] },
        },
        required: [
          "id",
          "classification",
          "intent_family",
          "action_summary",
          "evidence_excerpt",
          "reason",
          "confidence",
          "freshness",
          "freshness_evidence",
          "company_name",
          "official_website",
          "identity_evidence",
          "organization_kind",
          "demand_side",
        ],
      },
    },
  },
  required: ["assessments"],
} as const;

function compact(value: string, maximum = 500): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maximum);
}

function hasDirectTaskEvidence(document: DirectAiNeedDocument, evidence: unknown): boolean {
  if (typeof evidence !== "string") return false;
  const normalize = (value: string) => value.normalize("NFKC").toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const source = normalize(`${document.title} ${document.excerpt}`);
  const fragments = evidence.split(/…|\.{3}/).map(normalize).filter(Boolean);
  if (!fragments.length || !fragments.every(fragment => source.includes(fragment))) return false;
  // Technology must appear in the cited task, not be inferred from generic RPA.
  if (!/(?<![\p{L}\p{N}])(?:ai|ии|llm|rag|gpt\w*)(?![\p{L}\p{N}])|нейросет|искусственн.{0,20}интеллект|интеллектуальн.{0,30}(?:помощник|ассистент|агент)/iu.test(evidence)) return false;
  return !/(?:будет|будут).{0,35}плюс|(?:пет|pet)[-\s]?проект|(?:желателен|желательны|желательно).{0,30}(?:опыт|навык|знани)|nice[-\s]to[-\s]have/iu.test(evidence);
}

export function evidencedFreshness(
  document: DirectAiNeedDocument,
  reported: DirectAiNeedAssessment["freshness"],
  evidence: unknown,
): DirectAiNeedAssessment["freshness"] {
  if (reported !== "CURRENT" || document.activeJobPosting) return reported;
  const published = document.publishedAt ? Date.parse(document.publishedAt) : NaN;
  if (Number.isFinite(published) && Date.now() - published > 180 * 86_400_000) return "STALE";
  const quote = typeof evidence === "string" ? compact(evidence).toLowerCase() : "";
  const source = compact(`${document.title} ${document.excerpt}`, 4000).toLowerCase();
  // A recent publication cannot renew an old event described in it.
  let date = NaN;
  if (quote && source.includes(quote)) {
    const iso = quote.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
    const numeric = quote.match(/\b(\d{1,2})[./](\d{1,2})[./](20\d{2})\b/);
    const russian = quote.match(/\b(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+(20\d{2})\b/);
    const months = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
    const monthOnly = quote.match(/(?:^|\s)(январе|феврале|марте|апреле|мае|июне|июле|августе|сентябре|октябре|ноябре|декабре)\s+(20\d{2})(?:\s|$)/);
    const monthNames = ["январе", "феврале", "марте", "апреле", "мае", "июне", "июле", "августе", "сентябре", "октябре", "ноябре", "декабре"];
    const parts = iso ? [+iso[1], +iso[2], +iso[3]]
      : numeric ? [+numeric[3], +numeric[2], +numeric[1]]
        : russian ? [+russian[3], months.indexOf(russian[2]) + 1, +russian[1]]
          : monthOnly ? [+monthOnly[2], monthNames.indexOf(monthOnly[1]) + 1, 1] : null;
    if (parts) {
      const parsed = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
      if (parsed.getUTCFullYear() === parts[0] && parsed.getUTCMonth() === parts[1] - 1 && parsed.getUTCDate() === parts[2]) date = parsed.getTime();
    }
  }
  if (!Number.isFinite(date) || date > Date.now() + 86_400_000) return "UNCERTAIN";
  return Date.now() - date > 180 * 86_400_000 ? "STALE" : "CURRENT";
}

function strings(value: unknown, maximum: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((item): item is string => typeof item === "string")
    .map((item) => compact(item, 220))
    .filter(Boolean))]
    .slice(0, maximum);
}

function outputText(result: ResponsesApiResult): string | null {
  if (typeof result.output_text === "string") return result.output_text;
  for (const item of result.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return null;
}

export function normalizeDirectAiConfidence(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.min(100, numeric <= 1 ? numeric * 100 : numeric);
}

function availability(): Pick<DirectAiNeedSearchPlan, "status" | "reason"> {
  if (process.env.LEADGEN_DIRECT_AI_LLM_ENABLED?.trim().toLowerCase() === "false") {
    return { status: "UNAVAILABLE", reason: "disabled" };
  }
  if (!semanticApiKey()) {
    return { status: "UNAVAILABLE", reason: "missing_openai_api_key" };
  }
  return { status: "AI", reason: "configured" };
}

async function callStructured<T>({
  instructions,
  input,
  schema,
  schemaName,
  maxOutputTokens,
  signal,
}: {
  instructions: string;
  input: unknown;
  schema: object;
  schemaName: string;
  maxOutputTokens: number;
  signal?: AbortSignal;
}): Promise<T | null> {
  const apiKey = semanticApiKey();
  if (!apiKey || llmAvailabilityError()) return null;
  return runAbortableOperation<T | null>({
    timeoutMs: 28_000,
    parentSignal: signal,
    fallback: null,
    operation: async (requestSignal) => {
      const response = await fetchLeadgenModel("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.LEADGEN_DIRECT_AI_OPENAI_MODEL?.trim() ||
            (schemaName === "direct_ai_need_assessment" ? "gpt-4.1" : "gpt-4.1-mini"),
          store: false,
          instructions,
          input: JSON.stringify(input),
          text: {
            verbosity: "medium",
            format: { type: "json_schema", name: schemaName, strict: true, schema },
          },
          max_output_tokens: maxOutputTokens,
        }),
        signal: requestSignal,
      });
      if (!response.ok) { await recordLlmFailure(response); return null; }
      const text = outputText((await response.json()) as ResponsesApiResult);
      if (!text) return null;
      try {
        return JSON.parse(text) as T;
      } catch {
        return null;
      }
    },
  });
}

export async function planDirectAiNeedSearch({
  optionalIndustry,
  companyName,
  learnedContext,
  previousQueries = [],
  searchScope = "all",
  signal,
}: {
  optionalIndustry?: string | null;
  companyName?: string;
  learnedContext?: Array<Pick<DirectAiNeedDocument, "title" | "excerpt" | "sourceUrl"> & {
    assessment?: Pick<DirectAiNeedAssessment, "classification" | "reason" | "demandSide" | "freshness">;
  }>;
  previousQueries?: string[];
  searchScope?: "all" | "non_hh";
  signal?: AbortSignal;
} = {}): Promise<DirectAiNeedSearchPlan> {
  const configured = availability();
  if (configured.status !== "AI") {
    return { ...configured, intentHypotheses: [], terminology: [], sourceHypotheses: [], queries: [] };
  }
  const refining = previousQueries.length > 0;
  const planSchema = refining ? { ...SEARCH_PLAN_SCHEMA, properties: { ...SEARCH_PLAN_SCHEMA.properties,
    intent_hypotheses: { ...SEARCH_PLAN_SCHEMA.properties.intent_hypotheses, minItems: 0, maxItems: 3 },
    terminology: { ...SEARCH_PLAN_SCHEMA.properties.terminology, minItems: 0, maxItems: 6 },
    source_hypotheses: { ...SEARCH_PLAN_SCHEMA.properties.source_hypotheses, minItems: 0, maxItems: 3 },
    queries: { ...SEARCH_PLAN_SCHEMA.properties.queries, minItems: 0, maxItems: 3 },
    query_angles: { ...SEARCH_PLAN_SCHEMA.properties.query_angles, minItems: 0, maxItems: 3 },
  } } : SEARCH_PLAN_SCHEMA;
  const parsed = await callStructured<{
    intent_hypotheses?: unknown;
    terminology?: unknown;
    source_hypotheses?: unknown;
    queries?: unknown;
    query_angles?: unknown;
  }>({
    instructions: [
      "Ты планировщик поиска горячего B2B-спроса на AI для российского рынка.",
      "Цель — найти свежие публичные действия компаний: найм, поиск подрядчика, закупка, тендер, пилот, внедрение или иной прямой запрос на AI/ИИ/LLM/агентную автоматизацию бизнес-процессов.",
      "Самостоятельно определи смысловые классы спроса, рыночную терминологию, открытые источники и разные поисковые гипотезы на русском и английском.",
      refining
        ? "Это уточнение поиска по новым evidence и оценкам. Верни 0–3 наиболее полезных новых запроса. Если нет перспективной новой гипотезы, верни пустые массивы; не заполняй квоту перестановками слов. Не повторяй уже известные гипотезы/терминологию."
        : "Запросы должны искать действие конкретной организации над прикладной бизнес-задачей, а не общие статьи об AI. В первых шести запросах сбалансируй найм, закупки/поиск подрядчика и собственные сообщения компаний об активном пилоте. Формулировки придумай самостоятельно.",
      searchScope === "non_hh" ? "Текущий пробел — спрос вне HH. Все запросы направь в market_news; не возвращай поиск вакансий HH. Используй evidence и assessment отдельно: оценка не является цитатой источника." : "Используй подходящие типы источников.",
      "Для вакансий используй короткие фразы. Для веба формулируй конкретные действия заказчика в новостном стиле, указывай текущий год или период при необходимости. Голые категории услуг ведут к продавцам: формулировка должна искать объявление заказчика, а не каталог подрядчиков. Не используй OR и site:.ru.",
      "Для не-вакансий ищи публичное действие конкретной компании (объявила пилот, ищет подрядчика, опубликовала закупку), а не общие статьи, страницы продавцов AI-решений и категорию услуг. Запрос должен помогать найти самого заказчика.",
      "Не используй фиксированный whitelist должностей и не требуй конкретных слов. Industry — только дополнительное ограничение, если оно явно передано.",
      "Каждый запрос должен сохранять именно AI-смысл: обычная автоматизация, CRM или 1С сами по себе не подходят. query_angles — маршрут каждого запроса в том же порядке: ru_job_board для найма, market_news для остальных действий заказчика.",
      "Для ru_job_board строго 2–4 содержательных слова: название технологии и задачи. Не добавляй слово «вакансия», год или предложение целиком: источник уже ограничен действующими вакансиями.",
      "Не используй LinkedIn, Workspace, закрытые страницы, утечки или обход ограничений.",
      "Не повторяй previousQueries. Если передан learnedContext, используй только действительно новую терминологию и не выдумывай факты.",
      "Если передано companyName, исследуй только текущую собственную потребность этой компании; каждый запрос должен содержать её название. Не ищи других заказчиков.",
      "Верни компактный план, а не объяснение рассуждений.",
    ].join(" "),
    input: {
      goal: "Найти актуальные публичные проявления прямого намерения компаний внедрить AI/ИИ/LLM/агентную автоматизацию или привлечь человека/подрядчика для такой задачи.",
      optionalIndustry: optionalIndustry ?? null,
      companyName: companyName ?? null,
      learnedContext: (learnedContext ?? []).slice(0, 12).map((item) => ({
        title: compact(item.title, 180),
        excerpt: compact(item.excerpt, 500),
        sourceUrl: compact(item.sourceUrl, 400),
        assessment: item.assessment ? { classification: item.assessment.classification,
          reason: compact(item.assessment.reason, 220), demandSide: item.assessment.demandSide,
          freshness: item.assessment.freshness } : null,
      })),
      previousQueries: previousQueries.slice(0, 16),
      searchScope,
      currentDate: new Date().toISOString().slice(0, 10),
    },
    schema: planSchema,
    schemaName: "direct_ai_need_search_plan",
    maxOutputTokens: 1400,
    signal,
  });
  if (!parsed) {
    return { status: "FAILED", reason: "provider_failed", intentHypotheses: [], terminology: [], sourceHypotheses: [], queries: [] };
  }
  const queries = strings(parsed.queries, 10).filter((query) =>
    !previousQueries.some((previous) => previous.trim().toLowerCase() === query.toLowerCase()),
  );
  if ((!refining && queries.length < 4) || (refining && queries.length > 3)) {
    return { status: "FAILED", reason: "provider_failed", intentHypotheses: [], terminology: [], sourceHypotheses: [], queries: [] };
  }
  const plannedAngles = Array.isArray(parsed.query_angles) ? parsed.query_angles : [];
  return {
    status: "AI",
    reason: "configured",
    intentHypotheses: strings(parsed.intent_hypotheses, 8),
    terminology: strings(parsed.terminology, 16),
    sourceHypotheses: strings(parsed.source_hypotheses, 10),
    queries,
    queryAngles: plannedAngles.length > 0
      ? queries.map((query) => plannedAngles[strings(parsed.queries, 10).indexOf(query)] === "ru_job_board" ? "ru_job_board" : "market_news")
      : undefined,
  };
}

export async function assessDirectAiNeedDocuments({
  documents,
  signal,
}: {
  documents: DirectAiNeedDocument[];
  signal?: AbortSignal;
}): Promise<DirectAiNeedAssessment[] | null> {
  if (availability().status !== "AI" || documents.length === 0) return null;
  const parsed = await callStructured<{ assessments?: unknown }>({
    instructions: [
      "Ты проверяешь evidence прямого коммерческого спроса компании на AI/ИИ/LLM/AI-агентов и интеллектуальную автоматизацию бизнес-процессов.",
      "DIRECT — источник показывает актуальное действие компании: найм, тендер, закупку, поиск подрядчика, пилот, внедрение или явный запрос решения.",
      "LIKELY — смысл релевантен, но действие, компания или свежесть подтверждены недостаточно.",
      "NOT_RELEVANT — обучение/медиа без инициативы компании, generic ML/Data Science/research, computer vision без бизнес-автоматизации, промышленная автоматика без AI, чужой подрядчик или нерелевантная страница.",
      "Название роли или наличие слова AI само по себе недостаточно. Отделяй факты источника от вывода. Не придумывай компанию, действие и дату.",
      "Обычное внедрение CRM/ERP/IT-инфраструктуры и автоматизация без явного AI-сценария — NOT_RELEVANT. Нельзя выводить AI-потребность из обычной автоматизации. Для кадрового агентства отделяй собственную задачу от найма для анонимного клиента.",
      "Обязательно определи demand_side. BUYER: компания покупает, заказывает, нанимает для собственной AI-задачи или объявила собственный активный пилот. SELLER: описывает возможности своего AI-продукта/услуги или чужой завершённый кейс. Страница AI-продукта и фраза «наш продукт использует ИИ» НЕ доказывают спрос его продавца, даже если продукт решает бизнес-задачу. Для SELLER всегда NOT_RELEVANT. UNKNOWN: заказчик и его действие не доказаны, максимум LIKELY.",
      "CURRENT: действующая вакансия либо действие с явной датой не старше 180 дней. При отсутствии признаков актуальности — UNCERTAIN, завершённый старый кейс — STALE. Все текстовые выводы пиши по-русски. evidence_excerpt — дословный фрагмент источника, подтверждающий именно AI-задачу.",
      "freshness_evidence — дословная непрерывная цитата с датой самого действия; если даты нет, null. Дата публикации не обновляет старое действие. Завершённый кейс без нового открытого запроса — максимум LIKELY. Не используй даты копирайта, соседних статей и будущих планов как дату текущего действия. CURRENT без даты допустим только для activeJobPosting=true. Обзор о том, как проводить AI-пилоты, не является собственным пилотом автора: SELLER/NOT_RELEVANT, даже если автор — компания-интегратор.",
      "Верни ровно одну оценку для каждого переданного document id, включая NOT_RELEVANT; не пропускай документы.",
      "Экономь ответ: reason и action_summary не длиннее одного короткого предложения. Для NOT_RELEVANT evidence_excerpt пустой, identity_evidence null: не переписывай нерелевантную статью. Цитаты для BUYER сохрани дословно.",
      "company_name — только организация, которая совершает действие, а не издатель новости или подрядчик. official_website — только прямо видимый в документе сайт этой организации; не угадывай домен. identity_evidence — короткая цитата, связывающая организацию с действием. Если связи нет, верни null.",
      "Для не-вакансий identity_evidence ОБЯЗАТЕЛЬНО дословная цитата с названием заказчика и его действием. Она проверяется по исходному тексту. Нельзя соединять бренд из footer с общей статьёй о рынке и называть это потребностью бренда. Учебный курс/урок/вебинар по внедрению — предложение обучения, а не собственный запрос школы на внедрение.",
      "organization_kind: COMMERCIAL — коммерческая компания, PUBLIC_SECTOR — госорган/ведомство, OTHER — иная некоммерческая организация, UNKNOWN — тип не подтверждён. Госорган не является B2B-компанией даже при реальной AI-вакансии.",
      "Верни короткий evidence excerpt из переданного текста и decision summary; не возвращай chain-of-thought.",
    ].join(" "),
    input: {
      currentDate: new Date().toISOString().slice(0, 10),
      documents: documents.slice(0, 24).map((item) => ({
        id: item.id,
        title: compact(item.title, 200),
        excerpt: compact(item.excerpt, 3500),
        sourceUrl: compact(item.sourceUrl, 400),
        publishedAt: item.publishedAt ?? null,
        companyName: item.companyName ?? null,
        activeJobPosting: item.activeJobPosting === true,
      })),
    },
    schema: ASSESSMENT_SCHEMA,
    schemaName: "direct_ai_need_assessment",
    maxOutputTokens: 3200,
    signal,
  });
  if (!parsed || !Array.isArray(parsed.assessments)) return null;
  const allowedIds = new Set(documents.map((item) => item.id));
  return parsed.assessments.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const item = value as Record<string, unknown>;
    const id = typeof item.id === "string" ? item.id : "";
    const classification = item.classification;
    const reportedFreshness = item.freshness;
    if (!allowedIds.has(id) ||
      (classification !== "DIRECT" && classification !== "LIKELY" && classification !== "NOT_RELEVANT") ||
      (reportedFreshness !== "CURRENT" && reportedFreshness !== "UNCERTAIN" && reportedFreshness !== "STALE")) return [];
    const document = documents.find(document => document.id === id)!;
    const freshnessFromTask = evidencedFreshness(document, "CURRENT", item.evidence_excerpt);
    const freshness = freshnessFromTask === "STALE" ? "STALE"
      : evidencedFreshness(document, reportedFreshness, item.freshness_evidence);
    const demandSide = item.demand_side === "BUYER" || item.demand_side === "SELLER" ? item.demand_side : "UNKNOWN";
    const gatedClassification = demandSide === "SELLER" ? "NOT_RELEVANT"
      : classification === "DIRECT" && (demandSide !== "BUYER" || freshness !== "CURRENT" ||
        !hasDirectTaskEvidence(document, item.evidence_excerpt)) ? "LIKELY" : classification;
    return [{
      id,
      classification: gatedClassification,
      demandSide,
      intentFamily: compact(String(item.intent_family ?? "other"), 120),
      actionSummary: compact(String(item.action_summary ?? ""), 300),
      evidenceExcerpt: compact(String(item.evidence_excerpt ?? ""), 500),
      reason: compact(String(item.reason ?? ""), 300),
      confidence: normalizeDirectAiConfidence(item.confidence),
      freshness,
      companyName: typeof item.company_name === "string" ? compact(item.company_name, 180) : null,
      officialWebsite: typeof item.official_website === "string" ? compact(item.official_website, 300) : null,
      identityEvidence: typeof item.identity_evidence === "string" ? compact(item.identity_evidence, 400) : null,
      organizationKind: item.organization_kind === "COMMERCIAL" || item.organization_kind === "PUBLIC_SECTOR" || item.organization_kind === "OTHER"
        ? item.organization_kind
        : "UNKNOWN",
    } satisfies DirectAiNeedAssessment];
  });
}
