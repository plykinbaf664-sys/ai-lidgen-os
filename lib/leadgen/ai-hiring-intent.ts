import { normalizeDomain } from "@/lib/leadgen/company-identity";
import { createLeadOriginContext } from "@/lib/leadgen/lead-origin";
import type { DirectIntentSignalType, LeadOriginContext } from "@/lib/leadgen/types";

export type AiHiringVacancy = {
  id?: string | null;
  title: string;
  description: string;
  employerName?: string | null;
  employerWebsite?: string | null;
  sourceProvider: string;
  sourceUrl: string;
};

export type AiHiringIntentResult = {
  status: "SUCCESS" | "SKIPPED" | "INVALID";
  reason: string;
  roleMatched: boolean;
  automationIntentMatched: boolean;
  likelyServiceProvider: boolean;
  confidence: number;
  company: {
    name: string;
    domain: string | null;
    website: string | null;
  } | null;
  signal: {
    signalType: DirectIntentSignalType;
    signalSummary: string;
    evidence: string;
    sourceUrl: string;
    confidence: number;
    whyRelevant: string;
  } | null;
  originContext: LeadOriginContext;
  outreachAngle: string | null;
};

const aiRolePatterns = [
  /\b(?:ai|llm)\s+(?:automation\s+)?(?:engineer|integrator|solutions? engineer|agent developer|consultant)\b/iu,
  /\b(?:ai|llm)\s+(?:business|sales|marketing|process)\s+automation\b/iu,
  /(?:ai|ии)[-\s]?(?:инженер|интегратор)/iu,
  /инженер\s+по\s+автоматизации/iu,
  /(?:разработчик|инженер)\s+(?:ai|ии)[-\s]?(?:агент|агентов)/iu,
  /специалист\s+по\s+(?:внедрению\s+(?:ai|ии)|автоматизации\s+бизнес[-\s]?процессов)/iu,
  /llm[-\s]?(?:разработчик|инженер)/iu,
];

const automationUseCasePatterns = [
  /(?:автоматизац|automation).{0,70}(?:продаж|маркетинг|лид|crm|поддержк|докумен|процесс|операц|аналитик|workflow)/iu,
  /(?:продаж|маркетинг|лид|crm|поддержк|докумен|бизнес[-\s]?процесс|операц|аналитик).{0,70}(?:автоматизац|automation)/iu,
  /(?:ai|ии)[-\s]?(?:ассистент|агент|сотрудник)/iu,
  /(?:rag|knowledge automation|база знаний)/iu,
  /(?:internal|внутренн)[-\s]?(?:workflow|процесс)/iu,
  /(?:интеграц).{0,50}(?:llm|ai|ии).{0,50}(?:crm|erp|1с|bitrix|amo)/iu,
  /(?:квалификац|обработк).{0,40}(?:лид|заяв|обращен)/iu,
];

const researchOnlyPatterns = [
  /computer vision research/iu,
  /исследовани.{0,30}(?:компьютерного зрения|computer vision)/iu,
  /(?:обучение|training).{0,30}(?:нейросет|foundation model).{0,30}(?:с нуля|from scratch)/iu,
];

const serviceProviderPatterns = [
  /(?:для|под)\s+(?:наших\s+)?(?:клиент|заказчик)/iu,
  /клиентск(?:ие|их)\s+(?:проекты|решения|внедрения)/iu,
  /(?:аутсорс|заказная\s+разработка|консалтинг(?:овая)?\s+компания)/iu,
  /(?:digital|маркетинговое|it)[-\s]?(?:агентство|студия).{0,80}(?:ai|ии|llm)/iu,
  /(?:помогаем|помогает)\s+бизнесу.{0,160}(?:созда[её]м|внедряем|разрабатываем).{0,100}(?:решени|систем|платформ)/iu,
];

function compactEvidence(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 420);
}

function isProviderDomain(domain: string | null) {
  return Boolean(
    domain &&
      /(?:^|\.)(?:hh\.ru|linkedin\.com|indeed\.com|glassdoor\.com|superjob\.ru|habr\.com)$/i.test(
        domain,
      ),
  );
}

export function matchesAiHiringRole(value: string) {
  return aiRolePatterns.some((pattern) => pattern.test(value));
}

export function matchesBusinessAutomationIntent(value: string) {
  return automationUseCasePatterns.some((pattern) => pattern.test(value));
}

export function evaluateAiAutomationHiring(
  vacancy: AiHiringVacancy,
): AiHiringIntentResult {
  const title = compactEvidence(vacancy.title);
  const description = compactEvidence(vacancy.description);
  const combined = `${title}\n${description}`;
  const roleMatched = matchesAiHiringRole(combined);
  const automationIntentMatched = matchesBusinessAutomationIntent(combined);
  const likelyServiceProvider = serviceProviderPatterns.some((pattern) => pattern.test(combined));
  const originContext = createLeadOriginContext("AI_HIRING", {
    source_provider: vacancy.sourceProvider.slice(0, 80),
    source_url: vacancy.sourceUrl.slice(0, 500),
    source_metadata: vacancy.id ? { vacancy_id: vacancy.id.slice(0, 120) } : {},
  });
  if (!title || !description || !vacancy.sourceUrl) {
    return {
      status: "INVALID",
      reason: "missing_vacancy_evidence",
      roleMatched,
      automationIntentMatched,
      likelyServiceProvider,
      confidence: 0,
      company: null,
      signal: null,
      originContext,
      outreachAngle: null,
    };
  }
  if (!vacancy.employerName?.trim()) {
    return {
      status: "INVALID",
      reason: "missing_structured_employer",
      roleMatched,
      automationIntentMatched,
      likelyServiceProvider,
      confidence: 0,
      company: null,
      signal: null,
      originContext,
      outreachAngle: null,
    };
  }
  if (!roleMatched) {
    return {
      status: "SKIPPED",
      reason: "ai_role_not_confirmed",
      roleMatched,
      automationIntentMatched,
      likelyServiceProvider,
      confidence: 20,
      company: null,
      signal: null,
      originContext,
      outreachAngle: null,
    };
  }
  if (!automationIntentMatched || researchOnlyPatterns.some((pattern) => pattern.test(combined))) {
    return {
      status: "SKIPPED",
      reason: "business_automation_intent_not_confirmed",
      roleMatched,
      automationIntentMatched,
      likelyServiceProvider,
      confidence: 35,
      company: null,
      signal: null,
      originContext,
      outreachAngle: null,
    };
  }
  if (likelyServiceProvider) {
    return {
      status: "SKIPPED",
      reason: "service_provider_not_end_customer",
      roleMatched,
      automationIntentMatched,
      likelyServiceProvider,
      confidence: 45,
      company: null,
      signal: null,
      originContext,
      outreachAngle: null,
    };
  }
  const domain = normalizeDomain(vacancy.employerWebsite);
  const officialDomain = isProviderDomain(domain) ? null : domain;
  const confidence = officialDomain ? 95 : 82;
  return {
    status: "SUCCESS",
    reason: "direct_ai_automation_hiring_intent",
    roleMatched,
    automationIntentMatched,
    likelyServiceProvider,
    confidence,
    company: {
      name: vacancy.employerName.trim().slice(0, 180),
      domain: officialDomain,
      website: officialDomain ? `https://${officialDomain}` : null,
    },
    signal: {
      signalType: "AI_AUTOMATION_HIRING_SIGNAL",
      signalSummary: `${vacancy.employerName.trim()} ищет специалиста для задач AI-автоматизации бизнес-процессов.`,
      evidence: compactEvidence(`${title}. ${description}`),
      sourceUrl: vacancy.sourceUrl,
      confidence,
      whyRelevant:
        "Компания уже выделила практическую задачу AI-автоматизации и подтверждает намерение инвестировать в её решение.",
    },
    originContext,
    outreachAngle:
      "Компания уже развивает AI-направление через найм. Предложить параллельно проверить один конкретный процесс через аудит или ограниченный MVP, не противопоставляя это найму и не утверждая, что сотрудник не нужен.",
  };
}
