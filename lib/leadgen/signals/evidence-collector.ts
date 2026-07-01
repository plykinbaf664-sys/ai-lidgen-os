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
  | "weak_event_strength"
  | "educational_event_content"
  | "too_generic"
  | "insufficient_evidence"
  | "non_opportunity_page"
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
  evidence_language: SignalLanguage | "mixed";
  source_type: SourceType;
  company_extraction: CompanyExtractionResult;
  event_strength_score: number;
  event_strength_breakdown: EventStrengthBreakdown;
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

export type EventStrengthBreakdown = {
  topic_match_score: number;
  event_evidence_score: number;
  educational_intent_score: number;
  gtm_signal_type: "topic_only" | "confirmed_event" | "mixed";
  topic_matches: string[];
  announcement_matches: string[];
  specificity_matches: string[];
  educational_matches: string[];
  source_bonus: number;
  educational_penalty: number;
};

type EventStrengthResult = {
  event_strength_score: number;
  breakdown: EventStrengthBreakdown;
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
        "join the team",
        "when you join",
        "members of our team",
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

function findSupplementalIcpMatches(text: string): string[] {
  const supplementalPatterns: Array<[string, RegExp]> = [
    ["software", /\bsoftware\b/i],
    ["technology", /\btechnolog(?:y|ies)\b/i],
    ["platform", /\bplatform\b/i],
    ["cloud", /\bcloud\b/i],
    ["automation", /\bautomation\b/i],
    ["CRM", /\bcrm\b/i],
    ["AI", /\bai\b/i],
  ];

  return supplementalPatterns
    .filter(([, pattern]) => pattern.test(text))
    .map(([term]) => term);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function clampScore(score: number): number {
  return Math.min(Math.max(Math.round(score), 0), 100);
}

const gtmAnnouncementTerms = [
  "announcing",
  "announces",
  "announced",
  "introducing",
  "introduced",
  "released",
  "now available",
  "general availability",
  "generally available",
  "beta launch",
  "beta",
  "expansion",
  "new market",
  "rollout",
  "анонсирует",
  "анонсировала",
  "анонсировал",
  "объявила",
  "объявил",
  "представила",
  "представил",
  "запустила",
  "запустил",
  "запускает",
  "выпустила",
  "выпустил",
  "релиз",
  "стал доступен",
  "стала доступна",
  "теперь доступен",
  "теперь доступна",
  "новый продукт",
  "новая функция",
  "новая интеграция",
  "бета",
  "выход на новый рынок",
];

const gtmConfirmedEventPatterns = [
  /\b(?:announces?|announced|introduc(?:es|ed|ing)|released|now available|general availability|generally available|beta launch|rollout)\b/i,
  /\b(?:launches|launched)\s+(?:a\s+|an\s+|the\s+)?(?:new\s+)?(?:product|platform|feature|integration|service|solution|market|offering)\b/i,
  /\b(?:new product|new feature|new integration|new platform|new service|new solution)\s+(?:is\s+)?(?:now\s+)?available\b/i,
  /\b(?:expands?|expanded|expansion)\s+(?:into|to|across)\s+(?:a\s+|the\s+)?(?:new\s+)?(?:market|region|country|segment|vertical)\b/i,
  /\b(?:\u0430\u043d\u043e\u043d\u0441\u0438\u0440\u0443\u0435\u0442|\u0430\u043d\u043e\u043d\u0441\u0438\u0440\u043e\u0432\u0430\u043b[au]?|\u043e\u0431\u044a\u044f\u0432\u0438\u043b[au]?|\u043f\u0440\u0435\u0434\u0441\u0442\u0430\u0432\u0438\u043b[au]?|\u0432\u044b\u043f\u0443\u0441\u0442\u0438\u043b[au]?|\u0440\u0435\u043b\u0438\u0437|general availability)\b/i,
  /\b(?:\u0437\u0430\u043f\u0443\u0441\u0442\u0438\u043b[au]?|\u0437\u0430\u043f\u0443\u0441\u043a\u0430\u0435\u0442)\s+(?:\u043d\u043e\u0432(?:\u044b\u0439|\u0443\u044e|oe)\s+)?(?:\u043f\u0440\u043e\u0434\u0443\u043a\u0442|\u043f\u043b\u0430\u0442\u0444\u043e\u0440\u043c\u0443|\u0444\u0443\u043d\u043a\u0446\u0438\u044e|\u0438\u043d\u0442\u0435\u0433\u0440\u0430\u0446\u0438\u044e|\u0443\u0441\u043b\u0443\u0433\u0443|\u0440\u0435\u0448\u0435\u043d\u0438\u0435)\b/i,
  /\b(?:\u043d\u043e\u0432(?:\u044b\u0439|\u0430\u044f|\u043e\u0435)\s+(?:\u043f\u0440\u043e\u0434\u0443\u043a\u0442|\u0444\u0443\u043d\u043a\u0446\u0438\u044f|\u0438\u043d\u0442\u0435\u0433\u0440\u0430\u0446\u0438\u044f|\u0441\u0435\u0440\u0432\u0438\u0441|\u0440\u0435\u0448\u0435\u043d\u0438\u0435))\s+(?:\u0442\u0435\u043f\u0435\u0440\u044c\s+)?\u0434\u043e\u0441\u0442\u0443\u043f/i,
];

const gtmTopicTerms = [
  "product launch",
  "go-to-market",
  "gtm",
  "release strategy",
  "product release",
  "customer success",
  "product marketing",
  "launch strategy",
  "launch checklist",
  "product launches",
  "запуск продукта",
  "go-to-market",
  "вывод продукта на рынок",
  "стратегия запуска",
  "релиз продукта",
  "клиентский успех",
  "customer success",
  "продуктовый маркетинг",
  "чеклист запуска",
];

const gtmSpecificityTerms = [
  "version",
  "release",
  "announcement",
  "available today",
  "available now",
  "customers can",
  "users can",
  "integration",
  "feature",
  "product",
  "platform",
  "market",
  "2024",
  "2025",
  "2026",
  "версия",
  "релиз",
  "анонс",
  "доступен сегодня",
  "доступна сегодня",
  "доступен сейчас",
  "доступна сейчас",
  "клиенты могут",
  "пользователи могут",
  "интеграция",
  "функция",
  "продукт",
  "платформа",
  "рынок",
];

const gtmEducationalTerms = [
  "how to",
  "guide",
  "strategy",
  "checklist",
  "tips",
  "best practices",
  "playbook",
  "template",
  "what is",
  "learn how",
  "educational",
  "reasons",
  "secret sauce",
  "framework",
  "what goes into",
  "why customer success matters",
  "lessons learned",
  "как запустить",
  "как вывести",
  "руководство",
  "гайд",
  "стратегия",
  "чеклист",
  "советы",
  "лучшие практики",
  "плейбук",
  "шаблон",
  "что такое",
  "как работает",
  "причины",
  "секрет",
  "фреймворк",
  "уроки",
];

const nonOpportunityPageTerms = [
  "about us",
  "careers",
  "pricing",
  "blog",
  "company news",
  "product page",
  "features",
  "solutions",
  "technology",
  "crm",
  "workflow",
  "automation",
  "\u043e \u043a\u043e\u043c\u043f\u0430\u043d\u0438\u0438",
  "\u0446\u0435\u043d\u044b",
  "\u0431\u043b\u043e\u0433",
  "\u043d\u043e\u0432\u043e\u0441\u0442\u0438",
  "\u043f\u0440\u043e\u0434\u0443\u043a\u0442",
  "\u0442\u0435\u0445\u043d\u043e\u043b\u043e\u0433\u0438\u0438",
  "\u0430\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0437\u0430\u0446\u0438\u044f",
];

const hiringEventPatterns = [
  /\b(?:we are hiring|now hiring|join our team|join the team|open roles|open positions|job opening|hiring sales|hiring for|account executive|business development|customer success|revenue operations)\b/i,
  /\b(?:\u0438\u0449\u0435\u043c \u0432 \u043a\u043e\u043c\u0430\u043d\u0434\u0443|\u043e\u0442\u043a\u0440\u044b\u0442(?:\u0430|\u044b|\u044b\u0435) \u0432\u0430\u043a\u0430\u043d\u0441|\u043d\u0430\u0431\u043e\u0440 \u0441\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a\u043e\u0432|\u0440\u0430\u0441\u0448\u0438\u0440\u044f\u0435\u043c \u043a\u043e\u043c\u0430\u043d\u0434\u0443)\b/i,
];

const growthEventPatterns = [
  /\b(?:expanding|expanded|expansion|growth|scaling|raises funding|raised funding|funding round|series [a-z]|opens new office|new office|new branch|market expansion|new market|new region|new country)\b/i,
  /\b(?:\u0440\u0430\u0441\u0448\u0438\u0440|\u0440\u043e\u0441\u0442|\u043c\u0430\u0441\u0448\u0442\u0430\u0431|\u0438\u043d\u0432\u0435\u0441\u0442\u0438\u0446|\u0440\u0430\u0443\u043d\u0434|\u043d\u043e\u0432(?:\u044b\u0439|\u0430\u044f) (?:\u0440\u044b\u043d\u043e\u043a|\u0440\u0435\u0433\u0438\u043e\u043d|\u043e\u0444\u0438\u0441|\u0444\u0438\u043b\u0438\u0430\u043b))\b/i,
];

const operationalEventPatterns = [
  /\b(?:operational pressure|capacity pressure|manual handoffs|migration|migrating|implementation|implemented|new api|api rollout|integration rollout|integrates with|integrated with|platform migration)\b/i,
  /\b(?:\u043e\u043f\u0435\u0440\u0430\u0446\u0438\u043e\u043d\u043d|\u043d\u0430\u0433\u0440\u0443\u0437\u043a|\u0432\u043d\u0435\u0434\u0440|\u043c\u0438\u0433\u0440\u0430\u0446|\u0438\u043d\u0442\u0435\u0433\u0440\u0438\u0440)\b/i,
];

function detectEvidenceLanguage(text: string): SignalLanguage | "mixed" {
  const cyrillicMatches = text.match(/[а-яё]/gi)?.length ?? 0;
  const latinMatches = text.match(/[a-z]/gi)?.length ?? 0;

  if (cyrillicMatches > 20 && latinMatches > 20) {
    return "mixed";
  }

  if (cyrillicMatches > latinMatches) {
    return "ru";
  }

  return "en";
}

function hasAnyPattern(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function hasConcreteCommercialEvent({
  signalType,
  text,
  eventStrengthBreakdown,
}: {
  signalType: SignalType;
  text: string;
  eventStrengthBreakdown: EventStrengthBreakdown;
}): boolean {
  if (signalType === "HIRING_SIGNAL") {
    return hasAnyPattern(text, hiringEventPatterns);
  }

  if (signalType === "GO_TO_MARKET_SIGNAL") {
    return eventStrengthBreakdown.gtm_signal_type === "confirmed_event";
  }

  if (signalType === "GROWTH_SIGNAL") {
    return hasAnyPattern(text, growthEventPatterns);
  }

  if (signalType === "TECH_SIGNAL") {
    return (
      hasAnyPattern(text, operationalEventPatterns) ||
      eventStrengthBreakdown.gtm_signal_type === "confirmed_event"
    );
  }

  return false;
}

function hasNonOpportunityPageContext(text: string): boolean {
  return findMatches(text, nonOpportunityPageTerms).length > 0;
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

function scoreEventStrength({
  signalType,
  result,
  sourceType,
}: {
  signalType: SignalType;
  result: SearchResult;
  sourceType: SourceType;
}): EventStrengthResult {
  if (signalType !== "GO_TO_MARKET_SIGNAL") {
    return {
      event_strength_score: 0,
      breakdown: {
        topic_match_score: 0,
        event_evidence_score: 0,
        educational_intent_score: 0,
        gtm_signal_type: "topic_only",
        topic_matches: [],
        announcement_matches: [],
        specificity_matches: [],
        educational_matches: [],
        source_bonus: 0,
        educational_penalty: 0,
      },
    };
  }

  const text = getSearchText(result);
  const topicMatches = unique(findMatches(text, gtmTopicTerms));
  const announcementMatches = unique(findMatches(text, gtmAnnouncementTerms));
  const specificityMatches = unique(findMatches(text, gtmSpecificityTerms));
  const educationalMatches = unique(findMatches(text, gtmEducationalTerms));
  const hasConfirmedEventPattern = gtmConfirmedEventPatterns.some((pattern) =>
    pattern.test(text),
  );
  const sourceBonus =
    sourceType === "press_release" || sourceType === "news"
      ? 12
      : sourceType === "company_site"
        ? 10
        : sourceType === "blog"
          ? 4
          : 0;
  const topicMatchScore = clampScore(topicMatches.length * 12);
  const eventEvidenceScore = clampScore(
    (hasConfirmedEventPattern ? 28 : 0) +
      announcementMatches.length * 14 +
      specificityMatches.length * 8 +
      (hasConfirmedEventPattern ? sourceBonus : Math.min(sourceBonus, 4)),
  );
  const educationalIntentScore = clampScore(educationalMatches.length * 18);
  const hasEducationalDominance =
    educationalIntentScore > eventEvidenceScore ||
    (educationalIntentScore > 0 && !hasConfirmedEventPattern);
  const educationalPenalty = hasConfirmedEventPattern
    ? Math.min(educationalIntentScore, 35)
    : Math.min(educationalIntentScore, 65);
  const adjustedEventEvidenceScore = hasEducationalDominance
    ? Math.min(eventEvidenceScore, 34)
    : eventEvidenceScore;
  const gtmSignalType =
    hasConfirmedEventPattern &&
    adjustedEventEvidenceScore >= 55 &&
    !hasEducationalDominance
      ? "confirmed_event"
      : topicMatchScore > 0 && adjustedEventEvidenceScore >= 25
        ? "mixed"
        : "topic_only";

  return {
    event_strength_score: clampScore(
      adjustedEventEvidenceScore +
        Math.min(topicMatchScore, 12) -
        educationalPenalty,
    ),
    breakdown: {
      topic_match_score: topicMatchScore,
      event_evidence_score: adjustedEventEvidenceScore,
      educational_intent_score: educationalIntentScore,
      gtm_signal_type: gtmSignalType,
      topic_matches: topicMatches,
      announcement_matches: announcementMatches,
      specificity_matches: specificityMatches,
      educational_matches: educationalMatches,
      source_bonus: sourceBonus,
      educational_penalty: educationalPenalty,
    },
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
  signalType,
  eventStrengthBreakdown,
  sourceType,
  companyExtraction,
  hasNonOpportunityInfo,
}: {
  directSignalMatches: string[];
  contextSignalMatches: string[];
  icpMatches: string[];
  score: number;
  signalType: SignalType;
  eventStrengthBreakdown: EventStrengthBreakdown;
  sourceType: SourceType;
  companyExtraction: CompanyExtractionResult;
  hasNonOpportunityInfo: boolean;
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

  if (hasNonOpportunityInfo) {
    return "non_opportunity_page";
  }

  if (
    signalType === "GO_TO_MARKET_SIGNAL" &&
    eventStrengthBreakdown.educational_intent_score >
      eventStrengthBreakdown.event_evidence_score
  ) {
    return "educational_event_content";
  }

  if (
    signalType === "GO_TO_MARKET_SIGNAL" &&
    eventStrengthBreakdown.event_evidence_score < 35
  ) {
    return "weak_event_strength";
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
  eventStrengthScore,
  eventStrengthBreakdown,
  sourceType,
  companyExtraction,
}: {
  decision: EvidenceDecision;
  directSignalMatches: string[];
  contextSignalMatches: string[];
  icpMatches: string[];
  sourceHintMatches: string[];
  eventStrengthScore: number;
  eventStrengthBreakdown: EventStrengthBreakdown;
  sourceType: SourceType;
  companyExtraction: CompanyExtractionResult;
}): string {
  const parts = [
    `${directSignalMatches.length + contextSignalMatches.length} signal context matches`,
    `${icpMatches.length} ICP matches`,
    `${sourceHintMatches.length} source/context matches`,
    `event strength: ${eventStrengthScore}`,
    `topic match: ${eventStrengthBreakdown.topic_match_score}`,
    `event evidence: ${eventStrengthBreakdown.event_evidence_score}`,
    `educational intent: ${eventStrengthBreakdown.educational_intent_score}`,
    `gtm signal type: ${eventStrengthBreakdown.gtm_signal_type}`,
    `source type: ${sourceType}`,
    companyExtraction.company_name
      ? `company extracted: ${companyExtraction.company_name}`
      : "company not extracted",
  ];

  if (eventStrengthBreakdown.educational_matches.length > 0) {
    parts.push(
      `educational context: ${eventStrengthBreakdown.educational_matches.join(", ")}`,
    );
  }

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
  const evidenceLanguage = detectEvidenceLanguage(searchText);
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
    ...findSupplementalIcpMatches(searchText),
  ]);
  const matchedSourceHints = unique(
    findLocalizedMatches(searchText, icp.signalSourceHints[signalType]),
  );
  const eventStrength = scoreEventStrength({
    signalType,
    result,
    sourceType: sourceClassification.source_type,
  });
  const hasConcreteEvent = hasConcreteCommercialEvent({
    signalType,
    text: searchText,
    eventStrengthBreakdown: eventStrength.breakdown,
  });
  const hasNonOpportunityInfo =
    hasNonOpportunityPageContext(searchText) && !hasConcreteEvent;
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
  const baseDecision = decideEvidence(confidenceScore);
  const isGtmSignal = signalType === "GO_TO_MARKET_SIGNAL";
  const hasWeakGtmEventEvidence =
    signalType === "GO_TO_MARKET_SIGNAL" &&
    eventStrength.breakdown.event_evidence_score < 55;
  const hasEducationalGtmIntent =
    signalType === "GO_TO_MARKET_SIGNAL" &&
    eventStrength.breakdown.educational_intent_score >
      eventStrength.breakdown.event_evidence_score;
  const hasConfirmedGtmEvent =
    signalType === "GO_TO_MARKET_SIGNAL" &&
    eventStrength.breakdown.gtm_signal_type === "confirmed_event";
  const decision =
    isAggregatorWithoutCompany || hasInvalidCompanyCandidate
      ? "rejected"
      : hasNonOpportunityInfo
        ? "rejected"
      : isGtmSignal && !hasConfirmedGtmEvent
        ? confidenceScore >= 45 &&
          eventStrength.breakdown.topic_match_score > 0 &&
          !hasEducationalGtmIntent
          ? "weak_signal"
          : "rejected"
        : hasEducationalGtmIntent || hasWeakGtmEventEvidence
          ? confidenceScore >= 45 &&
            eventStrength.breakdown.event_evidence_score >= 35
          ? "weak_signal"
          : "rejected"
        : baseDecision;
  const rejectionReason =
    decision === "rejected"
      ? getRejectionReason({
          directSignalMatches,
          contextSignalMatches,
          icpMatches: matchedIcpTerms,
          score: confidenceScore,
          signalType,
          eventStrengthBreakdown: eventStrength.breakdown,
          sourceType: sourceClassification.source_type,
          companyExtraction,
          hasNonOpportunityInfo,
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
    evidence_language: evidenceLanguage,
    source_type: sourceClassification.source_type,
    company_extraction: companyExtraction,
    event_strength_score: eventStrength.event_strength_score,
    event_strength_breakdown: eventStrength.breakdown,
    matched_signal_phrases: matchedSignalPhrases,
    matched_icp_terms: matchedIcpTerms,
    matched_source_hints: matchedSourceHints,
    decision_reason: buildDecisionReason({
      decision,
      directSignalMatches,
      contextSignalMatches,
      icpMatches: matchedIcpTerms,
      sourceHintMatches: matchedSourceHints,
      eventStrengthScore: eventStrength.event_strength_score,
      eventStrengthBreakdown: eventStrength.breakdown,
      sourceType: sourceClassification.source_type,
      companyExtraction,
    }),
    rejection_reason: rejectionReason,
  };
}
