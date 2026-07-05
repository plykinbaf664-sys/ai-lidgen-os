import type { SignalType } from "@/lib/leadgen/types";

export type SignalQueryLanguage = "en" | "ru";
export type SignalSearchMarket = "global" | "ru" | "mixed";

export type SignalQueryAngle =
  | "company_careers"
  | "ats"
  | "job_board"
  | "ru_job_board"
  | "company_blog"
  | "market_news";

export type SignalQuery = {
  signal_type: SignalType;
  query: string;
  intent: string;
  priority: number;
  market: Exclude<SignalSearchMarket, "mixed">;
  language: SignalQueryLanguage;
  query_language: SignalQueryLanguage;
  angle: SignalQueryAngle;
  query_angle: SignalQueryAngle;
  source_country_hint: string | null;
  why_market_selected: string;
};

type LocalizedTerms = Record<SignalQueryLanguage, readonly string[]>;

type SignalQueryIcp = {
  industries: LocalizedTerms;
  companyTypes: LocalizedTerms;
  keywords: LocalizedTerms;
  signalPriorities: Record<SignalType, number>;
  signalSourceHints: Record<SignalType, LocalizedTerms>;
};

type BuildSignalQueriesInput = {
  icp: SignalQueryIcp;
  signalType: SignalType;
  maxQueries?: number;
  market?: SignalSearchMarket;
};

type SignalSemanticProfile = {
  intent: Record<SignalQueryLanguage, string>;
  eventPhrases: LocalizedTerms;
  contextPhrases: LocalizedTerms;
};

type SignalQueryAngleProfile = {
  angle: SignalQueryAngle;
  language: SignalQueryLanguage;
  intent: string;
  eventPhrase: string;
  contextPhrase: string;
  sourceHint: string;
  priorityOffset: number;
  termIndex: number;
  customQuery?: string;
};

const hiringQueryAngles: SignalQueryAngleProfile[] = [
  {
    angle: "company_careers",
    language: "en",
    intent: "Find company-owned careers pages with hiring activity",
    eventPhrase: "we are hiring",
    contextPhrase: "recruitment",
    sourceHint: "company careers page",
    priorityOffset: 4,
    termIndex: 0,
  },
  {
    angle: "ats",
    language: "en",
    intent: "Find hosted ATS pages that expose employer-owned openings",
    eventPhrase: "open positions",
    contextPhrase: "sales hiring",
    sourceHint: "Greenhouse Lever Ashby Workday",
    priorityOffset: 5,
    termIndex: 1,
  },
  {
    angle: "job_board",
    language: "en",
    intent: "Find job board postings where the employer is explicit",
    eventPhrase: "join our team",
    contextPhrase: "sales hiring",
    sourceHint: "job board",
    priorityOffset: 6,
    termIndex: 1,
  },
  {
    angle: "ru_job_board",
    language: "ru",
    intent: "Find Russian-language job postings with an explicit employer",
    eventPhrase: "\u0438\u0449\u0435\u043c \u0432 \u043a\u043e\u043c\u0430\u043d\u0434\u0443",
    contextPhrase:
      "\u0440\u0430\u0431\u043e\u0442\u0430 \u0432 \u043a\u043e\u043c\u043f\u0430\u043d\u0438\u0438",
    sourceHint:
      "HH \u0432\u0430\u043a\u0430\u043d\u0441\u0438\u044f \u043a\u043e\u043c\u043f\u0430\u043d\u0438\u044f",
    priorityOffset: 0,
    termIndex: 0,
    customQuery:
      '"\u0440\u0430\u0441\u0448\u0438\u0440\u044f\u0435\u043c \u043e\u0442\u0434\u0435\u043b \u043f\u0440\u043e\u0434\u0430\u0436" "\u043a\u043e\u043c\u043f\u0430\u043d\u0438\u044f" -avito -hh -headhunter -superjob',
  },
  {
    angle: "ru_job_board",
    language: "ru",
    intent:
      "Find Russian-language sales hiring and ROP openings with explicit company names",
    eventPhrase:
      "\u043e\u0442\u043a\u0440\u044b\u0442\u0430 \u0432\u0430\u043a\u0430\u043d\u0441\u0438\u044f \u0440\u0443\u043a\u043e\u0432\u043e\u0434\u0438\u0442\u0435\u043b\u044c \u043f\u0440\u043e\u0434\u0430\u0436",
    contextPhrase:
      "\u043e\u0442\u0434\u0435\u043b \u043f\u0440\u043e\u0434\u0430\u0436",
    sourceHint:
      "hh \u0432\u0430\u043a\u0430\u043d\u0441\u0438\u0438 \u043a\u043e\u043c\u043f\u0430\u043d\u0438\u044f \u0420\u041e\u041f",
    priorityOffset: 0,
    termIndex: 1,
    customQuery:
      '"\u0438\u0449\u0435\u043c \u0432 \u043a\u043e\u043c\u0430\u043d\u0434\u0443" "\u043e\u0442\u0434\u0435\u043b \u043f\u0440\u043e\u0434\u0430\u0436" "\u043e\u043e\u043e" -avito -hh -headhunter -superjob',
  },
  {
    angle: "ru_job_board",
    language: "ru",
    intent:
      "Find Russian-language customer support or client service team expansion",
    eventPhrase:
      "\u0438\u0449\u0435\u043c \u0432 \u043a\u043e\u043c\u0430\u043d\u0434\u0443 \u043f\u043e\u0434\u0434\u0435\u0440\u0436\u043a\u0438 \u043a\u043b\u0438\u0435\u043d\u0442\u043e\u0432",
    contextPhrase:
      "\u043a\u043b\u0438\u0435\u043d\u0442\u0441\u043a\u0438\u0439 \u0441\u0435\u0440\u0432\u0438\u0441",
    sourceHint:
      "\u0432\u0430\u043a\u0430\u043d\u0441\u0438\u0438 \u043f\u043e\u0434\u0434\u0435\u0440\u0436\u043a\u0430 \u043a\u043b\u0438\u0435\u043d\u0442\u043e\u0432 \u043a\u043e\u043c\u043f\u0430\u043d\u0438\u044f",
    priorityOffset: 1,
    termIndex: 2,
    customQuery:
      '"\u0440\u0430\u0441\u0448\u0438\u0440\u044f\u0435\u043c \u0441\u043b\u0443\u0436\u0431\u0443 \u043f\u043e\u0434\u0434\u0435\u0440\u0436\u043a\u0438" "\u043a\u043b\u0438\u0435\u043d\u0442\u0441\u043a\u0438\u0439 \u0441\u0435\u0440\u0432\u0438\u0441" "\u043a\u043e\u043c\u043f\u0430\u043d\u0438\u044f" -avito -hh -headhunter',
  },
  {
    angle: "ru_job_board",
    language: "ru",
    intent: "Find Russian-language CRM or sales automation hiring context",
    eventPhrase:
      "\u0442\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044f \u043c\u0435\u043d\u0435\u0434\u0436\u0435\u0440 \u043f\u043e \u043f\u0440\u043e\u0434\u0430\u0436\u0430\u043c",
    contextPhrase:
      "\u0430\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0437\u0430\u0446\u0438\u044f \u043f\u0440\u043e\u0434\u0430\u0436 CRM",
    sourceHint:
      "\u0440\u0430\u0431\u043e\u0442\u0430 \u0432 \u043a\u043e\u043c\u043f\u0430\u043d\u0438\u0438 \u0432\u0430\u043a\u0430\u043d\u0441\u0438\u0438 CRM",
    priorityOffset: 2,
    termIndex: 3,
    customQuery:
      '"\u0443\u0432\u0435\u043b\u0438\u0447\u0438\u0432\u0430\u0435\u043c \u043e\u0442\u0434\u0435\u043b \u043f\u0440\u043e\u0434\u0430\u0436" "\u0438\u043d\u0442\u0435\u0440\u043d\u0435\u0442-\u043c\u0430\u0433\u0430\u0437\u0438\u043d" "\u043a\u043e\u043c\u043f\u0430\u043d\u0438\u044f" -avito -hh -headhunter',
  },
  {
    angle: "company_blog",
    language: "en",
    intent: "Find company blog posts about team growth and hiring",
    eventPhrase: "growing our team",
    contextPhrase: "company blog",
    sourceHint: "team growth blog",
    priorityOffset: 7,
    termIndex: 2,
  },
  {
    angle: "market_news",
    language: "en",
    intent: "Find market news or announcements about team expansion",
    eventPhrase: "expanding team",
    contextPhrase: "hiring announcement",
    sourceHint: "company news",
    priorityOffset: 8,
    termIndex: 3,
  },
];

const ruMarketHints: Record<SignalType, readonly string[]> = {
  HIRING_SIGNAL: [
    "hh \u0432\u0430\u043a\u0430\u043d\u0441\u0438\u0438 \u043a\u043e\u043c\u043f\u0430\u043d\u0438\u044f",
    "\u043a\u0430\u0440\u044c\u0435\u0440\u043d\u0430\u044f \u0441\u0442\u0440\u0430\u043d\u0438\u0446\u0430 \u0432\u0430\u043a\u0430\u043d\u0441\u0438\u0438",
    "\u043e\u0442\u043a\u0440\u044b\u0442\u0430 \u0432\u0430\u043a\u0430\u043d\u0441\u0438\u044f \u0440\u0443\u043a\u043e\u0432\u043e\u0434\u0438\u0442\u0435\u043b\u044c \u043f\u0440\u043e\u0434\u0430\u0436",
    "\u0438\u0449\u0435\u043c \u0420\u041e\u041f \u043e\u0442\u0434\u0435\u043b \u043f\u0440\u043e\u0434\u0430\u0436",
    "\u043f\u043e\u0434\u0434\u0435\u0440\u0436\u043a\u0430 \u043a\u043b\u0438\u0435\u043d\u0442\u043e\u0432 \u0432\u0430\u043a\u0430\u043d\u0441\u0438\u044f",
  ],
  GO_TO_MARKET_SIGNAL: [
    "\u0437\u0430\u043f\u0443\u0441\u043a \u043f\u0440\u043e\u0434\u0443\u043a\u0442\u0430",
    "\u0432\u044b\u0448\u043b\u0438 \u043d\u0430 \u0440\u044b\u043d\u043e\u043a",
    "\u0437\u0430\u043f\u0443\u0441\u0442\u0438\u043b\u0438 \u043d\u043e\u0432\u043e\u0435 \u043d\u0430\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u0435",
    "\u043d\u043e\u0432\u043e\u0441\u0442\u0438 \u043a\u043e\u043c\u043f\u0430\u043d\u0438\u0438",
    "\u043f\u0440\u0435\u0441\u0441-\u0440\u0435\u043b\u0438\u0437",
  ],
  GROWTH_SIGNAL: [
    "\u0440\u0430\u0441\u0448\u0438\u0440\u044f\u0435\u043c\u0441\u044f",
    "\u043e\u0442\u043a\u0440\u044b\u043b\u0438 \u0444\u0438\u043b\u0438\u0430\u043b",
    "\u043c\u0430\u0441\u0448\u0442\u0430\u0431\u0438\u0440\u0443\u0435\u043c \u043f\u0440\u043e\u0434\u0430\u0436\u0438",
    "\u0440\u043e\u0441\u0442 \u043a\u043b\u0438\u0435\u043d\u0442\u0441\u043a\u043e\u0439 \u0431\u0430\u0437\u044b",
    "\u0440\u0430\u0437\u0432\u0438\u0442\u0438\u0435 \u0431\u0438\u0437\u043d\u0435\u0441\u0430",
  ],
  CONTENT_SIGNAL: [
    "\u0431\u043b\u043e\u0433 \u043a\u043e\u043c\u043f\u0430\u043d\u0438\u0438",
    "\u043a\u0435\u0439\u0441 \u043a\u043b\u0438\u0435\u043d\u0442\u0430",
    "\u0432\u0435\u0431\u0438\u043d\u0430\u0440 \u043a\u043e\u043c\u043f\u0430\u043d\u0438\u044f",
    "vc \u0441\u0442\u0430\u0442\u044c\u044f \u043a\u043e\u043c\u043f\u0430\u043d\u0438\u044f",
    "habr \u0431\u043b\u043e\u0433 \u043a\u043e\u043c\u043f\u0430\u043d\u0438\u0438",
  ],
  TRAFFIC_SIGNAL: [
    "\u043e\u0441\u0442\u0430\u0432\u0438\u0442\u044c \u0437\u0430\u044f\u0432\u043a\u0443",
    "\u0437\u0430\u043f\u0438\u0441\u0430\u0442\u044c\u0441\u044f \u043d\u0430 \u0434\u0435\u043c\u043e",
    "\u043f\u0440\u0438\u0432\u043b\u0435\u043a\u0430\u0435\u043c \u043a\u043b\u0438\u0435\u043d\u0442\u043e\u0432",
    "\u043b\u0435\u043d\u0434\u0438\u043d\u0433",
    "\u043f\u0440\u043e\u0431\u043d\u044b\u0439 \u043f\u0435\u0440\u0438\u043e\u0434",
  ],
  TECH_SIGNAL: [
    "\u0430\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0437\u0430\u0446\u0438\u044f \u043f\u0440\u043e\u0446\u0435\u0441\u0441\u043e\u0432",
    "\u0432\u043d\u0435\u0434\u0440\u0435\u043d\u0438\u0435 \u0418\u0418",
    "\u0438\u043d\u0442\u0435\u0433\u0440\u0430\u0446\u0438\u0438 CRM",
    "amoCRM Bitrix24",
    "\u043e\u0431\u0440\u0430\u0431\u043e\u0442\u043a\u0430 \u043e\u0431\u0440\u0430\u0449\u0435\u043d\u0438\u0439",
  ],
};

const signalSemanticProfiles: Record<SignalType, SignalSemanticProfile> = {
  HIRING_SIGNAL: {
    intent: {
      en: "Find hiring activity as evidence of team growth",
      ru: "\u041d\u0430\u0439\u0442\u0438 \u043d\u0430\u0439\u043c \u043a\u0430\u043a \u0434\u043e\u043a\u0430\u0437\u0430\u0442\u0435\u043b\u044c\u0441\u0442\u0432\u043e \u0440\u0430\u0441\u0448\u0438\u0440\u0435\u043d\u0438\u044f \u043a\u043e\u043c\u0430\u043d\u0434\u044b",
    },
    eventPhrases: {
      en: [
        "we are hiring",
        "join our team",
        "open positions",
        "hiring sales team",
        "revenue operations hiring",
        "customer success hiring",
      ],
      ru: [
        "\u0438\u0449\u0435\u043c \u0432 \u043a\u043e\u043c\u0430\u043d\u0434\u0443",
        "\u043e\u0442\u043a\u0440\u044b\u0442\u0430 \u0432\u0430\u043a\u0430\u043d\u0441\u0438\u044f",
        "\u0440\u0430\u0441\u0448\u0438\u0440\u044f\u0435\u043c \u043a\u043e\u043c\u0430\u043d\u0434\u0443",
        "\u043d\u0430\u0431\u043e\u0440 \u0441\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a\u043e\u0432",
        "\u043e\u0442\u0434\u0435\u043b \u043f\u0440\u043e\u0434\u0430\u0436 \u0432\u0430\u043a\u0430\u043d\u0441\u0438\u0438",
        "\u0442\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044f \u043c\u0435\u043d\u0435\u0434\u0436\u0435\u0440 \u043f\u043e \u043f\u0440\u043e\u0434\u0430\u0436\u0430\u043c",
      ],
    },
    contextPhrases: {
      en: ["careers", "recruitment", "sales hiring", "growth team"],
      ru: [
        "\u0432\u0430\u043a\u0430\u043d\u0441\u0438\u0438",
        "\u0440\u0430\u0431\u043e\u0442\u0430 \u0432 \u043a\u043e\u043c\u043f\u0430\u043d\u0438\u0438",
        "\u043d\u0430\u0439\u043c",
        "\u0440\u043e\u0441\u0442 \u043a\u043e\u043c\u0430\u043d\u0434\u044b",
      ],
    },
  },
  GO_TO_MARKET_SIGNAL: {
    intent: {
      en: "Find launches of new commercial assets",
      ru: "\u041d\u0430\u0439\u0442\u0438 \u0437\u0430\u043f\u0443\u0441\u043a \u043d\u043e\u0432\u043e\u0433\u043e \u043a\u043e\u043c\u043c\u0435\u0440\u0447\u0435\u0441\u043a\u043e\u0433\u043e \u0430\u043a\u0442\u0438\u0432\u0430",
    },
    eventPhrases: {
      en: [
        "new product",
        "product launch",
        "new service",
        "new solution",
        "announces new integration",
        "platform release",
      ],
      ru: [
        "\u043d\u043e\u0432\u044b\u0439 \u043f\u0440\u043e\u0434\u0443\u043a\u0442",
        "\u0437\u0430\u043f\u0443\u0441\u043a \u043f\u0440\u043e\u0434\u0443\u043a\u0442\u0430",
        "\u043d\u043e\u0432\u0430\u044f \u0443\u0441\u043b\u0443\u0433\u0430",
        "\u043d\u043e\u0432\u043e\u0435 \u0440\u0435\u0448\u0435\u043d\u0438\u0435",
        "\u043d\u043e\u0432\u044b\u0439 \u0442\u0430\u0440\u0438\u0444",
        "\u0437\u0430\u043f\u0443\u0441\u0442\u0438\u043b\u0438 \u0438\u043d\u0442\u0435\u0433\u0440\u0430\u0446\u0438\u044e",
      ],
    },
    contextPhrases: {
      en: ["launch", "rollout", "release", "go to market"],
      ru: [
        "\u0437\u0430\u043f\u0443\u0441\u043a",
        "\u0440\u0435\u043b\u0438\u0437",
        "\u0432\u044b\u0445\u043e\u0434 \u043d\u0430 \u0440\u044b\u043d\u043e\u043a",
        "\u043d\u043e\u0432\u043e\u0435 \u043d\u0430\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u0435",
      ],
    },
  },
  GROWTH_SIGNAL: {
    intent: {
      en: "Find growth and expansion events",
      ru: "\u041d\u0430\u0439\u0442\u0438 \u0441\u043e\u0431\u044b\u0442\u0438\u044f \u0440\u043e\u0441\u0442\u0430 \u0438 \u043c\u0430\u0441\u0448\u0442\u0430\u0431\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u044f \u043a\u043e\u043c\u043f\u0430\u043d\u0438\u0438",
    },
    eventPhrases: {
      en: [
        "expanding team",
        "opens new office",
        "raises funding",
        "company expansion",
        "scaling sales team",
        "growing customer success team",
      ],
      ru: [
        "\u0440\u0430\u0441\u0448\u0438\u0440\u0435\u043d\u0438\u0435 \u043a\u043e\u043c\u0430\u043d\u0434\u044b",
        "\u043d\u043e\u0432\u044b\u0439 \u043e\u0444\u0438\u0441",
        "\u043f\u0440\u0438\u0432\u043b\u0435\u043a\u043b\u0438 \u0438\u043d\u0432\u0435\u0441\u0442\u0438\u0446\u0438\u0438",
        "\u043c\u0430\u0441\u0448\u0442\u0430\u0431\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435 \u043a\u043e\u043c\u043f\u0430\u043d\u0438\u0438",
        "\u043e\u0442\u043a\u0440\u044b\u0442\u0438\u0435 \u0444\u0438\u043b\u0438\u0430\u043b\u0430",
        "\u0440\u043e\u0441\u0442 \u043e\u0442\u0434\u0435\u043b\u0430 \u043f\u0440\u043e\u0434\u0430\u0436",
      ],
    },
    contextPhrases: {
      en: ["growth", "expansion", "funding", "new market"],
      ru: [
        "\u0440\u043e\u0441\u0442",
        "\u0440\u0430\u0441\u0448\u0438\u0440\u0435\u043d\u0438\u0435",
        "\u0438\u043d\u0432\u0435\u0441\u0442\u0438\u0446\u0438\u0438",
        "\u043d\u043e\u0432\u044b\u0439 \u0440\u044b\u043d\u043e\u043a",
      ],
    },
  },
  CONTENT_SIGNAL: {
    intent: {
      en: "Find investment in content and marketing activity",
      ru: "\u041d\u0430\u0439\u0442\u0438 \u0438\u043d\u0432\u0435\u0441\u0442\u0438\u0446\u0438\u0438 \u043a\u043e\u043c\u043f\u0430\u043d\u0438\u0438 \u0432 \u043a\u043e\u043d\u0442\u0435\u043d\u0442 \u0438 \u043c\u0430\u0440\u043a\u0435\u0442\u0438\u043d\u0433",
    },
    eventPhrases: {
      en: [
        "company blog",
        "webinar series",
        "case studies",
        "podcast",
        "resources hub",
        "YouTube channel",
      ],
      ru: [
        "\u0431\u043b\u043e\u0433 \u043a\u043e\u043c\u043f\u0430\u043d\u0438\u0438",
        "\u0441\u0435\u0440\u0438\u044f \u0432\u0435\u0431\u0438\u043d\u0430\u0440\u043e\u0432",
        "\u043a\u0435\u0439\u0441\u044b \u043a\u043b\u0438\u0435\u043d\u0442\u043e\u0432",
        "\u043f\u043e\u0434\u043a\u0430\u0441\u0442",
        "\u0441\u0442\u0430\u0442\u044c\u0438 \u043a\u043e\u043c\u043f\u0430\u043d\u0438\u0438",
        "YouTube \u043a\u0430\u043d\u0430\u043b",
      ],
    },
    contextPhrases: {
      en: ["content marketing", "resources", "webinars", "newsletter"],
      ru: [
        "\u043a\u043e\u043d\u0442\u0435\u043d\u0442",
        "\u043c\u0435\u0434\u0438\u0430",
        "\u0432\u0435\u0431\u0438\u043d\u0430\u0440\u044b",
        "\u0440\u0430\u0441\u0441\u044b\u043b\u043a\u0430",
      ],
    },
  },
  TRAFFIC_SIGNAL: {
    intent: {
      en: "Find active demand capture and traffic conversion assets",
      ru: "\u041d\u0430\u0439\u0442\u0438 \u0430\u043a\u0442\u0438\u0432\u044b \u0434\u043b\u044f \u043f\u0440\u0438\u0432\u043b\u0435\u0447\u0435\u043d\u0438\u044f \u0438 \u043a\u043e\u043d\u0432\u0435\u0440\u0441\u0438\u0438 \u0432\u0445\u043e\u0434\u044f\u0449\u0435\u0433\u043e \u0441\u043f\u0440\u043e\u0441\u0430",
    },
    eventPhrases: {
      en: [
        "book a demo",
        "free trial",
        "signup",
        "webinar registration",
        "lead magnet",
        "request a consultation",
      ],
      ru: [
        "\u043e\u0441\u0442\u0430\u0432\u0438\u0442\u044c \u0437\u0430\u044f\u0432\u043a\u0443",
        "\u0437\u0430\u043f\u0438\u0441\u0430\u0442\u044c\u0441\u044f \u043d\u0430 \u0434\u0435\u043c\u043e",
        "\u0431\u0435\u0441\u043f\u043b\u0430\u0442\u043d\u044b\u0439 \u0434\u043e\u0441\u0442\u0443\u043f",
        "\u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u044f \u043d\u0430 \u0432\u0435\u0431\u0438\u043d\u0430\u0440",
        "\u043b\u0438\u0434-\u043c\u0430\u0433\u043d\u0438\u0442",
        "\u043f\u0440\u043e\u0431\u043d\u044b\u0439 \u043f\u0435\u0440\u0438\u043e\u0434",
      ],
    },
    contextPhrases: {
      en: ["landing page", "demo page", "trial", "conversion"],
      ru: [
        "\u043b\u0435\u043d\u0434\u0438\u043d\u0433",
        "\u0434\u0435\u043c\u043e",
        "\u0437\u0430\u044f\u0432\u043a\u0430",
        "\u043a\u043e\u043d\u0432\u0435\u0440\u0441\u0438\u044f",
      ],
    },
  },
  TECH_SIGNAL: {
    intent: {
      en: "Find technology adoption and automation signals",
      ru: "\u041d\u0430\u0439\u0442\u0438 \u043f\u0440\u0438\u0437\u043d\u0430\u043a\u0438 \u0432\u043d\u0435\u0434\u0440\u0435\u043d\u0438\u044f \u0442\u0435\u0445\u043d\u043e\u043b\u043e\u0433\u0438\u0439 \u0438 \u0430\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0437\u0430\u0446\u0438\u0438",
    },
    eventPhrases: {
      en: [
        "AI automation",
        "CRM integration",
        "new API",
        "workflow automation",
        "platform integration",
        "AI feature",
      ],
      ru: [
        "\u0430\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0437\u0430\u0446\u0438\u044f \u043f\u0440\u043e\u0446\u0435\u0441\u0441\u043e\u0432",
        "\u0438\u043d\u0442\u0435\u0433\u0440\u0430\u0446\u0438\u044f \u0441 CRM",
        "\u043d\u043e\u0432\u044b\u0439 API",
        "\u0438\u0441\u043a\u0443\u0441\u0441\u0442\u0432\u0435\u043d\u043d\u044b\u0439 \u0438\u043d\u0442\u0435\u043b\u043b\u0435\u043a\u0442",
        "\u0446\u0438\u0444\u0440\u043e\u0432\u0438\u0437\u0430\u0446\u0438\u044f",
        "\u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u0438\u044f \u043f\u0440\u043e\u0434\u0443\u043a\u0442\u0430",
      ],
    },
    contextPhrases: {
      en: ["integration", "API", "automation", "AI"],
      ru: [
        "\u0438\u043d\u0442\u0435\u0433\u0440\u0430\u0446\u0438\u044f",
        "API",
        "\u0430\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0437\u0430\u0446\u0438\u044f",
        "\u0418\u0418",
      ],
    },
  },
};

function quote(term: string): string {
  return `"${term}"`;
}

function pickByIndex(terms: readonly string[], index: number): string {
  return terms[index % terms.length];
}

function getQueryMarket(
  language: SignalQueryLanguage,
): Exclude<SignalSearchMarket, "mixed"> {
  return language === "ru" ? "ru" : "global";
}

function getSourceCountryHint(
  market: Exclude<SignalSearchMarket, "mixed">,
): string | null {
  return market === "ru" ? "ru_cis" : "global";
}

function getWhyMarketSelected(
  market: Exclude<SignalSearchMarket, "mixed">,
): string {
  return market === "ru"
    ? "RU/CIS market query generated from Russian business lexicon and source hints"
    : "Global market query generated from English ICP and signal vocabulary";
}

function buildQueryParts(
  profile: SignalSemanticProfile,
  icp: SignalQueryIcp,
  signalType: SignalType,
  language: SignalQueryLanguage,
  index: number,
  angleProfile?: SignalQueryAngleProfile,
): string[] {
  const eventPhrase =
    angleProfile?.eventPhrase ?? pickByIndex(profile.eventPhrases[language], index);
  const contextPhrase =
    angleProfile?.contextPhrase ??
    pickByIndex(profile.contextPhrases[language], index + 1);
  const industry = pickByIndex(icp.industries[language], index);
  const companyType = pickByIndex(icp.companyTypes[language], index + 1);
  const keyword = pickByIndex(icp.keywords[language], index + 2);
  const sourceHint =
    angleProfile?.sourceHint ??
    pickByIndex(icp.signalSourceHints[signalType][language], index);
  const marketHint =
    language === "ru" ? pickByIndex(ruMarketHints[signalType], index) : null;

  return [
    quote(eventPhrase),
    quote(contextPhrase),
    quote(industry),
    quote(companyType),
    quote(keyword),
    quote(sourceHint),
    marketHint ? quote(marketHint) : null,
  ].filter((part): part is string => Boolean(part));
}

function createSignalQuery({
  signalType,
  query,
  intent,
  priority,
  language,
  angle,
}: {
  signalType: SignalType;
  query: string;
  intent: string;
  priority: number;
  language: SignalQueryLanguage;
  angle: SignalQueryAngle;
}): SignalQuery {
  const market = getQueryMarket(language);

  return {
    signal_type: signalType,
    query,
    intent,
    priority,
    market,
    language,
    query_language: language,
    angle,
    query_angle: angle,
    source_country_hint: getSourceCountryHint(market),
    why_market_selected: getWhyMarketSelected(market),
  };
}

function applyMarketMode(
  queries: SignalQuery[],
  market: SignalSearchMarket,
  maxQueries: number,
): SignalQuery[] {
  if (market !== "mixed") {
    return queries
      .filter((query) => query.market === market)
      .sort((left, right) => right.priority - left.priority)
      .slice(0, maxQueries);
  }

  const globalQueries = queries
    .filter((query) => query.market === "global")
    .sort((left, right) => right.priority - left.priority);
  const ruQueries = queries
    .filter((query) => query.market === "ru")
    .sort((left, right) => right.priority - left.priority);
  const mixedQueries: SignalQuery[] = [];
  const maxLength = Math.max(globalQueries.length, ruQueries.length);

  for (let index = 0; index < maxLength; index += 1) {
    if (ruQueries[index]) {
      mixedQueries.push(ruQueries[index]);
    }

    if (globalQueries[index]) {
      mixedQueries.push(globalQueries[index]);
    }
  }

  return mixedQueries.slice(0, maxQueries);
}

function buildHiringSignalQueries({
  icp,
  signalType,
  maxQueries,
  market,
}: {
  icp: SignalQueryIcp;
  signalType: SignalType;
  maxQueries: number;
  market: SignalSearchMarket;
}): SignalQuery[] {
  const profile = signalSemanticProfiles[signalType];
  const basePriority = icp.signalPriorities[signalType];
  const queries = hiringQueryAngles.map((angleProfile) =>
    createSignalQuery({
      signalType,
      query:
        angleProfile.customQuery ??
        buildQueryParts(
          profile,
          icp,
          signalType,
          angleProfile.language,
          angleProfile.termIndex,
          angleProfile,
        ).join(" "),
      intent: angleProfile.intent,
      priority: Math.max(basePriority - angleProfile.priorityOffset, 1),
      language: angleProfile.language,
      angle: angleProfile.angle,
    }),
  );

  return applyMarketMode(queries, market, maxQueries);
}

export function buildSignalQueries({
  icp,
  signalType,
  maxQueries = 8,
  market = "mixed",
}: BuildSignalQueriesInput): SignalQuery[] {
  const profile = signalSemanticProfiles[signalType];
  const basePriority = icp.signalPriorities[signalType];
  const queries: SignalQuery[] = [];

  if (signalType === "HIRING_SIGNAL") {
    return buildHiringSignalQueries({
      icp,
      signalType,
      maxQueries,
      market,
    });
  }

  for (const language of ["en", "ru"] satisfies SignalQueryLanguage[]) {
    const perLanguageLimit = Math.ceil(maxQueries / 2);

    for (let index = 0; index < perLanguageLimit; index += 1) {
      queries.push(
        createSignalQuery({
          signalType,
          query: buildQueryParts(
            profile,
            icp,
            signalType,
            language,
            index,
          ).join(" "),
          intent: profile.intent[language],
          priority: Math.max(basePriority - index, 1),
          language,
          angle: language === "ru" ? "ru_job_board" : "market_news",
        }),
      );
    }
  }

  return applyMarketMode(queries, market, maxQueries);
}
