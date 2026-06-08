import type { SearchResult } from "@/lib/leadgen/search/search-provider";
import { extractCompanyFromSearchResult } from "@/lib/leadgen/signals/company-extractor";
import { classifySearchResultSource } from "@/lib/leadgen/signals/source-classifier";
import type { CompanyExtractionResult } from "@/lib/leadgen/signals/company-extractor";
import type { SourceType } from "@/lib/leadgen/signals/source-classifier";
import type { SignalType } from "@/lib/leadgen/types";

export type EvidenceDecision = "valid_signal" | "weak_signal" | "rejected";

export type EvidenceRejectionReason =
  | "no_signal_context"
  | "no_icp_context"
  | "too_generic"
  | "insufficient_evidence"
  | "irrelevant_intent"
  | "aggregator_without_company"
  | "company_not_extracted"
  | "invalid_company_candidate";

export type EvidenceResult = {
  is_valid_signal: boolean;
  decision: EvidenceDecision;
  signal_type: SignalType;
  signal_title: string;
  signal_detail: string;
  signal_source_label: string;
  source_url: string;
  confidence_score: number;
  found_at: string;
  source_type: SourceType;
  company_extraction: CompanyExtractionResult;
  matched_signal_phrases: string[];
  matched_icp_terms: string[];
  matched_source_hints: string[];
  decision_reason: string;
  rejection_reason?: EvidenceRejectionReason;
};

type SignalLanguage = "en" | "ru";

type LocalizedTerms = Record<SignalLanguage, readonly string[]>;

type EvidenceCollectorIcp = {
  industries: LocalizedTerms;
  companyTypes: LocalizedTerms;
  keywords: LocalizedTerms;
  signalSourceHints: Record<SignalType, LocalizedTerms>;
};

type CollectSignalEvidenceInput = {
  result: SearchResult;
  signalType: SignalType;
  icp: EvidenceCollectorIcp;
};

type SignalEvidenceProfile = {
  title: Record<SignalLanguage, string>;
  directPhrases: LocalizedTerms;
  contextPhrases: LocalizedTerms;
  genericPhrases: LocalizedTerms;
};

type ScoreBreakdown = {
  signalScore: number;
  icpScore: number;
  sourceScore: number;
  qualityScore: number;
};

const signalEvidenceProfiles: Record<SignalType, SignalEvidenceProfile> = {
  HIRING_SIGNAL: {
    title: {
      en: "Hiring activity detected",
      ru: "Обнаружен сигнал найма",
    },
    directPhrases: {
      en: [
        "we are hiring",
        "join our team",
        "open roles",
        "open positions",
        "hiring sales",
        "account executive",
        "business development",
        "revenue operations",
        "customer success",
      ],
      ru: [
        "ищем в команду",
        "открыта вакансия",
        "открытые вакансии",
        "расширяем команду",
        "набор сотрудников",
        "менеджер по продажам",
        "аккаунт-менеджер",
        "руководитель отдела продаж",
      ],
    },
    contextPhrases: {
      en: ["careers", "jobs", "recruitment", "job opening", "sales team"],
      ru: ["вакансии", "работа", "требуется", "найм", "отдел продаж"],
    },
    genericPhrases: {
      en: ["hiring", "job", "career"],
      ru: ["вакансия", "работа", "требуется"],
    },
  },
  GO_TO_MARKET_SIGNAL: {
    title: {
      en: "Go-to-market activity detected",
      ru: "Обнаружен go-to-market сигнал",
    },
    directPhrases: {
      en: [
        "new product",
        "product launch",
        "new service",
        "new solution",
        "new platform",
        "new integration",
        "announces",
        "rollout",
      ],
      ru: [
        "новый продукт",
        "запуск продукта",
        "новый сервис",
        "новая услуга",
        "новое решение",
        "новый тариф",
        "новая интеграция",
        "релиз",
      ],
    },
    contextPhrases: {
      en: ["launch", "release", "pricing", "integration", "platform"],
      ru: ["запуск", "продукт", "интеграция", "тариф", "платформа"],
    },
    genericPhrases: {
      en: ["new", "launch", "release"],
      ru: ["новый", "запуск", "релиз"],
    },
  },
  GROWTH_SIGNAL: {
    title: {
      en: "Growth activity detected",
      ru: "Обнаружен сигнал роста",
    },
    directPhrases: {
      en: [
        "expanding team",
        "growing team",
        "opens new office",
        "raises funding",
        "company expansion",
        "new market",
        "team growth",
      ],
      ru: [
        "расширение команды",
        "рост команды",
        "новый офис",
        "открытие филиала",
        "привлекли инвестиции",
        "масштабирование",
        "новый рынок",
      ],
    },
    contextPhrases: {
      en: ["growth", "expansion", "funding", "scaling", "office"],
      ru: ["рост", "расширение", "инвестиции", "масштабирование", "офис"],
    },
    genericPhrases: {
      en: ["growth", "expands", "funding"],
      ru: ["рост", "расширение", "инвестиции"],
    },
  },
  CONTENT_SIGNAL: {
    title: {
      en: "Content activity detected",
      ru: "Обнаружен контентный сигнал",
    },
    directPhrases: {
      en: [
        "company blog",
        "webinar",
        "case studies",
        "podcast",
        "newsletter",
        "resources",
        "youtube channel",
      ],
      ru: [
        "блог компании",
        "вебинар",
        "кейсы",
        "статьи",
        "подкаст",
        "telegram",
        "youtube",
      ],
    },
    contextPhrases: {
      en: ["content", "resources", "media", "marketing", "education"],
      ru: ["контент", "медиа", "маркетинг", "материалы", "обучение"],
    },
    genericPhrases: {
      en: ["blog", "webinar", "podcast"],
      ru: ["блог", "вебинар", "подкаст"],
    },
  },
  TRAFFIC_SIGNAL: {
    title: {
      en: "Traffic capture activity detected",
      ru: "Обнаружен сигнал привлечения трафика",
    },
    directPhrases: {
      en: [
        "book a demo",
        "free trial",
        "signup",
        "webinar registration",
        "lead magnet",
        "request a consultation",
      ],
      ru: [
        "оставить заявку",
        "записаться на демо",
        "бесплатный доступ",
        "пробный период",
        "регистрация на вебинар",
        "лид-магнит",
      ],
    },
    contextPhrases: {
      en: ["landing page", "demo", "trial", "conversion", "registration"],
      ru: ["лендинг", "демо", "заявка", "регистрация", "конверсия"],
    },
    genericPhrases: {
      en: ["demo", "trial", "signup"],
      ru: ["демо", "заявка", "регистрация"],
    },
  },
  TECH_SIGNAL: {
    title: {
      en: "Technology adoption activity detected",
      ru: "Обнаружен технологический сигнал",
    },
    directPhrases: {
      en: [
        "AI automation",
        "CRM integration",
        "new API",
        "workflow automation",
        "platform integration",
        "AI feature",
      ],
      ru: [
        "автоматизация процессов",
        "интеграция с CRM",
        "новый API",
        "искусственный интеллект",
        "ИИ",
        "цифровизация",
      ],
    },
    contextPhrases: {
      en: ["integration", "API", "automation", "AI", "workflow"],
      ru: ["интеграция", "API", "автоматизация", "ИИ", "CRM"],
    },
    genericPhrases: {
      en: ["AI", "API", "automation"],
      ru: ["ИИ", "API", "автоматизация"],
    },
  },
};

function normalizeText(value: string): string {
  return value.toLowerCase();
}

function getSearchText(result: SearchResult): string {
  return normalizeText(
    [
      result.title,
      result.snippet,
      result.url,
      result.source_label,
      result.raw_content ?? "",
    ].join(" "),
  );
}

function findMatches(text: string, terms: readonly string[]): string[] {
  return terms.filter((term) => text.includes(normalizeText(term)));
}

function findLocalizedMatches(
  text: string,
  localizedTerms: LocalizedTerms,
): string[] {
  return [
    ...findMatches(text, localizedTerms.en),
    ...findMatches(text, localizedTerms.ru),
  ];
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function clampScore(score: number): number {
  return Math.min(Math.max(Math.round(score), 0), 100);
}

function scoreEvidence({
  directSignalMatches,
  contextSignalMatches,
  genericSignalMatches,
  icpMatches,
  sourceHintMatches,
  result,
}: {
  directSignalMatches: string[];
  contextSignalMatches: string[];
  genericSignalMatches: string[];
  icpMatches: string[];
  sourceHintMatches: string[];
  result: SearchResult;
}): ScoreBreakdown {
  const titleText = normalizeText(result.title);
  const snippetText = normalizeText(result.snippet);
  const titleSignalMatches = directSignalMatches.filter((match) =>
    titleText.includes(normalizeText(match)),
  );
  const snippetSignalMatches = directSignalMatches.filter((match) =>
    snippetText.includes(normalizeText(match)),
  );

  return {
    signalScore: Math.min(
      directSignalMatches.length * 16 +
        contextSignalMatches.length * 8 +
        genericSignalMatches.length * 3,
      40,
    ),
    icpScore: Math.min(icpMatches.length * 7, 25),
    sourceScore: Math.min(sourceHintMatches.length * 5, 15),
    qualityScore: Math.min(
      titleSignalMatches.length * 10 +
        snippetSignalMatches.length * 5 +
        (result.snippet.length > 80 ? 5 : 0),
      20,
    ),
  };
}

function decideEvidence(score: number): EvidenceDecision {
  if (score >= 65) {
    return "valid_signal";
  }

  if (score >= 45) {
    return "weak_signal";
  }

  return "rejected";
}

function getSourceScoreAdjustment(
  sourceType: SourceType,
  signalType: SignalType,
  companyExtraction: CompanyExtractionResult,
): number {
  if (sourceType === "company_careers" && signalType === "HIRING_SIGNAL") {
    return 14;
  }

  if (
    sourceType === "job_board" &&
    signalType === "HIRING_SIGNAL" &&
    companyExtraction.company_name
  ) {
    return 10;
  }

  if (
    (sourceType === "news" || sourceType === "press_release") &&
    (signalType === "GO_TO_MARKET_SIGNAL" ||
      signalType === "GROWTH_SIGNAL" ||
      signalType === "TECH_SIGNAL")
  ) {
    return 10;
  }

  if (
    sourceType === "blog" &&
    (signalType === "CONTENT_SIGNAL" ||
      signalType === "GO_TO_MARKET_SIGNAL" ||
      signalType === "TECH_SIGNAL")
  ) {
    return 7;
  }

  if (sourceType === "directory") {
    return -8;
  }

  if (sourceType === "unknown") {
    return -4;
  }

  if (
    sourceType === "aggregator" &&
    companyExtraction.company_name &&
    signalType === "HIRING_SIGNAL"
  ) {
    return -4;
  }

  return 0;
}

function getRejectionReason({
  directSignalMatches,
  contextSignalMatches,
  icpMatches,
  score,
  sourceType,
  companyExtraction,
}: {
  directSignalMatches: string[];
  contextSignalMatches: string[];
  icpMatches: string[];
  score: number;
  sourceType: SourceType;
  companyExtraction: CompanyExtractionResult;
}): EvidenceRejectionReason {
  if (sourceType === "aggregator" && !companyExtraction.company_name) {
    return "aggregator_without_company";
  }

  if (!companyExtraction.is_candidate_company_valid) {
    return companyExtraction.company_name
      ? "invalid_company_candidate"
      : "company_not_extracted";
  }

  if (sourceType === "job_board" && !companyExtraction.company_name) {
    return "company_not_extracted";
  }

  if (directSignalMatches.length === 0 && contextSignalMatches.length === 0) {
    return "no_signal_context";
  }

  if (icpMatches.length === 0) {
    return "no_icp_context";
  }

  if (directSignalMatches.length === 0) {
    return "too_generic";
  }

  if (score < 30) {
    return "irrelevant_intent";
  }

  return "insufficient_evidence";
}

function buildDecisionReason({
  decision,
  directSignalMatches,
  contextSignalMatches,
  icpMatches,
  sourceHintMatches,
  sourceType,
  companyExtraction,
}: {
  decision: EvidenceDecision;
  directSignalMatches: string[];
  contextSignalMatches: string[];
  icpMatches: string[];
  sourceHintMatches: string[];
  sourceType: SourceType;
  companyExtraction: CompanyExtractionResult;
}): string {
  const parts = [
    `${directSignalMatches.length + contextSignalMatches.length} signal context matches`,
    `${icpMatches.length} ICP matches`,
    `${sourceHintMatches.length} source/context matches`,
    `source type: ${sourceType}`,
    companyExtraction.company_name
      ? `company extracted: ${companyExtraction.company_name}`
      : "company not extracted",
  ];

  if (decision === "valid_signal") {
    return `Valid signal: ${parts.join(", ")}.`;
  }

  if (decision === "weak_signal") {
    return `Weak signal: ${parts.join(", ")}. Needs further verification.`;
  }

  return `Rejected: ${parts.join(", ")}.`;
}

export function collectSignalEvidence({
  result,
  signalType,
  icp,
}: CollectSignalEvidenceInput): EvidenceResult {
  const profile = signalEvidenceProfiles[signalType];
  const sourceClassification = classifySearchResultSource(result);
  const companyExtraction = extractCompanyFromSearchResult(
    result,
    sourceClassification,
  );
  const searchText = getSearchText(result);
  const directSignalMatches = findLocalizedMatches(
    searchText,
    profile.directPhrases,
  );
  const contextSignalMatches = findLocalizedMatches(
    searchText,
    profile.contextPhrases,
  );
  const genericSignalMatches = findLocalizedMatches(
    searchText,
    profile.genericPhrases,
  );
  const matchedSignalPhrases = unique([
    ...directSignalMatches,
    ...contextSignalMatches,
    ...genericSignalMatches,
  ]);
  const matchedIcpTerms = unique([
    ...findLocalizedMatches(searchText, icp.industries),
    ...findLocalizedMatches(searchText, icp.companyTypes),
    ...findLocalizedMatches(searchText, icp.keywords),
  ]);
  const matchedSourceHints = unique(
    findLocalizedMatches(searchText, icp.signalSourceHints[signalType]),
  );
  const scoreBreakdown = scoreEvidence({
    directSignalMatches,
    contextSignalMatches,
    genericSignalMatches,
    icpMatches: matchedIcpTerms,
    sourceHintMatches: matchedSourceHints,
    result,
  });
  const confidenceScore = clampScore(
    scoreBreakdown.signalScore +
      scoreBreakdown.icpScore +
      scoreBreakdown.sourceScore +
      scoreBreakdown.qualityScore +
      getSourceScoreAdjustment(
        sourceClassification.source_type,
        signalType,
        companyExtraction,
      ),
  );
  const isAggregatorWithoutCompany =
    sourceClassification.source_type === "aggregator" &&
    !companyExtraction.company_name;
  const hasInvalidCompanyCandidate =
    Boolean(companyExtraction.company_name) &&
    !companyExtraction.is_candidate_company_valid;
  const decision = isAggregatorWithoutCompany || hasInvalidCompanyCandidate
    ? "rejected"
    : decideEvidence(confidenceScore);
  const rejectionReason =
    decision === "rejected"
      ? getRejectionReason({
          directSignalMatches,
          contextSignalMatches,
          icpMatches: matchedIcpTerms,
          score: confidenceScore,
          sourceType: sourceClassification.source_type,
          companyExtraction,
        })
      : undefined;

  return {
    is_valid_signal: decision === "valid_signal",
    decision,
    signal_type: signalType,
    signal_title: profile.title.en,
    signal_detail: result.snippet || result.title,
    signal_source_label: result.source_label,
    source_url: result.url,
    confidence_score: confidenceScore,
    found_at: result.published_at ?? new Date().toISOString(),
    source_type: sourceClassification.source_type,
    company_extraction: companyExtraction,
    matched_signal_phrases: matchedSignalPhrases,
    matched_icp_terms: matchedIcpTerms,
    matched_source_hints: matchedSourceHints,
    decision_reason: buildDecisionReason({
      decision,
      directSignalMatches,
      contextSignalMatches,
      icpMatches: matchedIcpTerms,
      sourceHintMatches: matchedSourceHints,
      sourceType: sourceClassification.source_type,
      companyExtraction,
    }),
    rejection_reason: rejectionReason,
  };
}
