import type { EvidenceResult } from "@/lib/leadgen/signals/evidence-collector";

export type IcpFitBreakdown = {
  business_fit: number;
  commercial_fit: number;
  pain_fit: number;
  exclusion_risk: number;
  matched_business_terms: string[];
  matched_commercial_terms: string[];
  matched_pain_terms: string[];
  matched_exclusion_terms: string[];
};

export type IcpFitResult = {
  icp_fit_score: number;
  breakdown: IcpFitBreakdown;
};

const businessFitTerms = [
  "retail",
  "ecommerce",
  "e-commerce",
  "clinic",
  "medical center",
  "dental",
  "education",
  "online school",
  "logistics",
  "supply chain",
  "delivery",
  "warehouse",
  "manufacturing",
  "distribution",
  "dealer",
  "real estate",
  "developer",
  "construction",
  "franchise",
  "service network",
  "service operations",
  "call center",
  "contact center",
  "розница",
  "интернет-магазин",
  "e-commerce",
  "клиника",
  "медицинский центр",
  "стоматология",
  "образование",
  "онлайн-школа",
  "учебный центр",
  "логистика",
  "доставка",
  "склад",
  "производство",
  "дистрибуция",
  "дилер",
  "недвижимость",
  "застройщик",
  "девелопер",
  "строительство",
  "франшиза",
  "сервисная сеть",
  "колл-центр",
  "контактный центр",
];

const commercialFitTerms = [
  "sales",
  "marketing",
  "customer success",
  "support",
  "revenue",
  "go-to-market",
  "gtm",
  "demand generation",
  "account executive",
  "sales development",
  "customer operations",
  "onboarding",
  "operations",
  "commercial department",
  "branch network",
  "operators",
  "requests",
  "inquiries",
  "order processing",
  "отдел продаж",
  "продажи",
  "маркетинг",
  "клиентский сервис",
  "поддержка клиентов",
  "сопровождение клиентов",
  "операторы",
  "операционный отдел",
  "операции",
  "заявки",
  "обращения",
  "обработка заказов",
  "сеть филиалов",
  "отдел качества",
];

const painFitTerms = [
  "hiring",
  "growing",
  "growth",
  "expansion",
  "scaling",
  "launch",
  "released",
  "announced",
  "manual",
  "workflow",
  "support volume",
  "customer requests",
  "pipeline",
  "operations",
  "manual processing",
  "manual work",
  "back office",
  "crm implementation",
  "bitrix24",
  "amocrm",
  "amo crm",
  "call volume",
  "opening branch",
  "new branch",
  "service requests",
  "supply chain automation",
  "logistics automation",
  "automation deployments",
  "warehouse automation",
  "document workflow",
  "ищем",
  "вакансия",
  "найм",
  "расширяем команду",
  "масштабируем продажи",
  "рост обращений",
  "рост заявок",
  "ручная обработка",
  "ручной труд",
  "автоматизация процессов",
  "внедрение CRM",
  "Битрикс24",
  "amoCRM",
  "количество заявок",
  "открыли филиал",
  "новое направление",
  "документооборот",
  "складской учет",
  "логистика",
];

const exclusionRiskTerms = [
  "b2b saas",
  "saas",
  "software company",
  "software vendor",
  "enterprise software",
  "technology company",
  "tech company",
  "developer tools",
  "api platform",
  "cloud platform",
  "ai platform",
  "crm software",
  "sales automation software",
  "marketing automation software",
  "software development agency",
  "development agency",
  "dev agency",
  "ai agency",
  "automation agency",
  "consulting agency",
  "recruiting agency",
  "recruitment agency",
  "staffing agency",
  "job board",
  "marketplace",
  "directory",
  "outsourcing",
  "custom software development",
  "web development services",
  "mobile app development",
  "hire developers",
  "ai consulting services",
  "systems integrator",
  "it consulting",
  "digital agency",
  "web studio",
  "software engineer",
  "developer",
  "engineering",
  "github",
  "reddit",
  "job board",
  "it-компания",
  "ит-компания",
  "saas-компания",
  "разработчик по",
  "разработка по",
  "разработка software",
  "разработка сайтов",
  "разработка приложений",
  "веб-студия",
  "digital-агентство",
  "маркетинговое агентство",
  "рекламное агентство",
  "ai агентство",
  "ии агентство",
  "интегратор",
  "crm интегратор",
  "внедрение битрикс24",
  "внедрение amocrm",
  "кадровое агентство",
  "рекрутинговое агентство",
  "работный сайт",
  "джоб-борд",
  "hh.ru",
  "reddit.com",
];

function normalizeText(value: string): string {
  return value.toLowerCase();
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function clampScore(score: number): number {
  return Math.min(Math.max(Math.round(score), 0), 100);
}

function findMatches(text: string, terms: readonly string[]): string[] {
  return terms.filter((term) => text.includes(normalizeText(term)));
}

function getEvidenceText(evidence: EvidenceResult[]): string {
  return normalizeText(
    evidence
      .flatMap((item) => [
        item.signal_title,
        item.signal_detail,
        item.signal_source_label,
        item.source_url,
        item.company_extraction.company_name ?? "",
        item.company_extraction.company_domain ?? "",
        ...item.matched_icp_terms,
        ...item.matched_signal_phrases,
        ...item.matched_source_hints,
      ])
      .join(" "),
  );
}

function calculateTermScore(matches: string[], pointsPerMatch: number, cap: number) {
  return Math.min(matches.length * pointsPerMatch, cap);
}

export function scoreIcpFit(evidence: EvidenceResult[]): IcpFitResult {
  if (evidence.length === 0) {
    return {
      icp_fit_score: 0,
      breakdown: {
        business_fit: 0,
        commercial_fit: 0,
        pain_fit: 0,
        exclusion_risk: 0,
        matched_business_terms: [],
        matched_commercial_terms: [],
        matched_pain_terms: [],
        matched_exclusion_terms: [],
      },
    };
  }

  const text = getEvidenceText(evidence);
  const matchedBusinessTerms = unique(findMatches(text, businessFitTerms));
  const matchedCommercialTerms = unique(findMatches(text, commercialFitTerms));
  const matchedPainTerms = unique(findMatches(text, painFitTerms));
  const matchedExclusionTerms = unique(findMatches(text, exclusionRiskTerms));
  const businessFit = calculateTermScore(matchedBusinessTerms, 9, 36);
  const commercialFit = calculateTermScore(matchedCommercialTerms, 7, 28);
  const painFit = calculateTermScore(matchedPainTerms, 7, 35);
  const exclusionRisk = calculateTermScore(matchedExclusionTerms, 14, 70);

  return {
    icp_fit_score: clampScore(
      businessFit + commercialFit + painFit - exclusionRisk,
    ),
    breakdown: {
      business_fit: businessFit,
      commercial_fit: commercialFit,
      pain_fit: painFit,
      exclusion_risk: exclusionRisk,
      matched_business_terms: matchedBusinessTerms,
      matched_commercial_terms: matchedCommercialTerms,
      matched_pain_terms: matchedPainTerms,
      matched_exclusion_terms: matchedExclusionTerms,
    },
  };
}
