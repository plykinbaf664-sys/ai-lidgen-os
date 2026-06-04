import type { SignalType } from "@/lib/leadgen/types";

export type SignalQueryLanguage = "en" | "ru";

export type SignalQuery = {
  signal_type: SignalType;
  query: string;
  intent: string;
  priority: number;
  language: SignalQueryLanguage;
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
};

type SignalSemanticProfile = {
  intent: Record<SignalQueryLanguage, string>;
  eventPhrases: LocalizedTerms;
  contextPhrases: LocalizedTerms;
};

const signalSemanticProfiles: Record<SignalType, SignalSemanticProfile> = {
  HIRING_SIGNAL: {
    intent: {
      en: "Find hiring activity as evidence of team growth",
      ru: "Найти найм как доказательство расширения команды",
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
        "ищем в команду",
        "открыта вакансия",
        "расширяем команду",
        "набор сотрудников",
        "отдел продаж вакансии",
        "требуется менеджер по продажам",
      ],
    },
    contextPhrases: {
      en: ["careers", "recruitment", "sales hiring", "growth team"],
      ru: ["вакансии", "работа в компании", "найм", "рост команды"],
    },
  },
  GO_TO_MARKET_SIGNAL: {
    intent: {
      en: "Find launches of new commercial assets",
      ru: "Найти запуск нового коммерческого актива",
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
        "новый продукт",
        "запуск продукта",
        "новая услуга",
        "новое решение",
        "новый тариф",
        "запустили интеграцию",
      ],
    },
    contextPhrases: {
      en: ["launch", "rollout", "release", "go to market"],
      ru: ["запуск", "релиз", "выход на рынок", "новое направление"],
    },
  },
  GROWTH_SIGNAL: {
    intent: {
      en: "Find growth and expansion events",
      ru: "Найти события роста и масштабирования компании",
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
        "расширение команды",
        "новый офис",
        "привлекли инвестиции",
        "масштабирование компании",
        "открытие филиала",
        "рост отдела продаж",
      ],
    },
    contextPhrases: {
      en: ["growth", "expansion", "funding", "new market"],
      ru: ["рост", "расширение", "инвестиции", "новый рынок"],
    },
  },
  CONTENT_SIGNAL: {
    intent: {
      en: "Find investment in content and marketing activity",
      ru: "Найти инвестиции компании в контент и маркетинг",
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
        "блог компании",
        "серия вебинаров",
        "кейсы клиентов",
        "подкаст",
        "статьи компании",
        "YouTube канал",
      ],
    },
    contextPhrases: {
      en: ["content marketing", "resources", "webinars", "newsletter"],
      ru: ["контент", "медиа", "вебинары", "рассылка"],
    },
  },
  TRAFFIC_SIGNAL: {
    intent: {
      en: "Find active demand capture and traffic conversion assets",
      ru: "Найти активы для привлечения и конверсии входящего спроса",
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
        "оставить заявку",
        "записаться на демо",
        "бесплатный доступ",
        "регистрация на вебинар",
        "лид-магнит",
        "пробный период",
      ],
    },
    contextPhrases: {
      en: ["landing page", "demo page", "trial", "conversion"],
      ru: ["лендинг", "демо", "заявка", "конверсия"],
    },
  },
  TECH_SIGNAL: {
    intent: {
      en: "Find technology adoption and automation signals",
      ru: "Найти признаки внедрения технологий и автоматизации",
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
        "автоматизация процессов",
        "интеграция с CRM",
        "новый API",
        "искусственный интеллект",
        "цифровизация",
        "обновления продукта",
      ],
    },
    contextPhrases: {
      en: ["integration", "API", "automation", "AI"],
      ru: ["интеграция", "API", "автоматизация", "ИИ"],
    },
  },
};

function quote(term: string): string {
  return `"${term}"`;
}

function pickByIndex(terms: readonly string[], index: number): string {
  return terms[index % terms.length];
}

function buildQueryParts(
  profile: SignalSemanticProfile,
  icp: SignalQueryIcp,
  signalType: SignalType,
  language: SignalQueryLanguage,
  index: number,
): string[] {
  const eventPhrase = pickByIndex(profile.eventPhrases[language], index);
  const contextPhrase = pickByIndex(profile.contextPhrases[language], index + 1);
  const industry = pickByIndex(icp.industries[language], index);
  const companyType = pickByIndex(icp.companyTypes[language], index + 1);
  const keyword = pickByIndex(icp.keywords[language], index + 2);
  const sourceHint = pickByIndex(
    icp.signalSourceHints[signalType][language],
    index,
  );

  return [
    quote(eventPhrase),
    quote(contextPhrase),
    quote(industry),
    quote(companyType),
    quote(keyword),
    quote(sourceHint),
  ];
}

export function buildSignalQueries({
  icp,
  signalType,
  maxQueries = 8,
}: BuildSignalQueriesInput): SignalQuery[] {
  const profile = signalSemanticProfiles[signalType];
  const basePriority = icp.signalPriorities[signalType];
  const queries: SignalQuery[] = [];

  for (const language of ["en", "ru"] satisfies SignalQueryLanguage[]) {
    const perLanguageLimit = Math.ceil(maxQueries / 2);

    for (let index = 0; index < perLanguageLimit; index += 1) {
      queries.push({
        signal_type: signalType,
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
      });
    }
  }

  return queries
    .sort((left, right) => right.priority - left.priority)
    .slice(0, maxQueries);
}
