import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import "./register-ts-paths.mjs";

delete process.env.OPENAI_API_KEY;

const { planDirectAiNeedSearch, normalizeDirectAiConfidence, assessDirectAiNeedDocuments } = await import("../lib/leadgen/direct-ai-need-agent.ts");
const { evaluateAiAutomationHiring } = await import("../lib/leadgen/ai-hiring-intent.ts");
const { generateFirstEmailV3 } = await import("../lib/leadgen/first-email-generator.ts");

const unavailable = await planDirectAiNeedSearch();
assert.equal(unavailable.status, "UNAVAILABLE");
assert.equal(unavailable.reason, "missing_openai_api_key");
assert.deepEqual(unavailable.queries, [], "missing AI config must not masquerade as an AI plan");
assert.equal(normalizeDirectAiConfidence(0.95), 95);
assert.equal(normalizeDirectAiConfidence(88), 88);

const originalFetch = globalThis.fetch;
const { searchDirectAiQuery } = await import("../lib/leadgen/ai-hiring-live-canary.ts");
const routes = [];
const jobProvider = { async search(input) { routes.push({ provider: "job", ...input }); return []; } };
const webProvider = { async search(input) { routes.push({ provider: "web", ...input }); return []; } };
const routedPlan = { status: "AI", queries: ["AI vacancy contractor procurement", "unseen process role"], queryAngles: ["market_news", "ru_job_board"] };
for (const query of routedPlan.queries) await searchDirectAiQuery(query, routedPlan, jobProvider, webProvider, new AbortController().signal);
assert.deepEqual(routes.map(route => route.provider), ["web", "job"], "Semantic route survives refinement even when query words suggest another route");
assert.equal(routes[0].searchTopic, "general");
assert.equal(routes.length, 2, "Empty shared-router results must not repeat its public fallback");
const currentDate = new Date().toISOString().slice(0, 10);
const documents = [
  { id: "old-article", excerpt: "07 Декабря 2023. Компания объяснила, как проводить пилот ИИ.", dateEvidence: "07 Декабря 2023" },
  { id: "missing-date", excerpt: "Компания внедряет ИИ.", dateEvidence: null },
  { id: "invented-date", excerpt: "Компания внедряет ИИ.", dateEvidence: currentDate },
  { id: "dated-buyer", excerpt: `${currentDate}. Компания запускает пилот ИИ.`, dateEvidence: currentDate },
  { id: "active-job", excerpt: "Компания нанимает AI-инженера.", dateEvidence: null, activeJobPosting: true },
  { id: "dated-seller", excerpt: `${currentDate}. Компания предлагает клиентам ИИ.`, dateEvidence: currentDate, demand: "SELLER" },
  { id: "old-metadata", excerpt: "Компания внедряет ИИ.", publishedAt: "2023-12-07", dateEvidence: null },
  { id: "republished-old-event", excerpt: "В январе 2023 года компания внедрила ИИ.", publishedAt: currentDate, dateEvidence: "В январе 2023 года" },
  { id: "future-date", excerpt: "2099-01-01. Компания внедряет ИИ.", dateEvidence: "2099-01-01" },
  { id: "ordinary-rpa", excerpt: "Обеспечивать работу программных роботов RPA и оптимизацию существующих решений.", activeJobPosting: true },
  { id: "optional-ai", excerpt: "Будет огромным плюсом: пет-проект с LLM и RAG.", activeJobPosting: true },
  { id: "invented-ai", excerpt: "Компания автоматизирует отчеты.", evidence: "Компания внедряет ИИ для отчетов.", activeJobPosting: true },
];
process.env.OPENAI_API_KEY = "isolated-fixture";
try {
  const planningInputs = [];
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(init.body);
    planningInputs.push(JSON.parse(request.input));
    assert.equal(request.text.format.schema.properties.queries.minItems, 0, "Refinement may stop without inventing queries");
    return Response.json({ output_text: JSON.stringify({ intent_hypotheses: [], terminology: [], source_hypotheses: [], queries: [], query_angles: [] }) });
  };
  const sourceExcerpt = "Компания предлагает заказчикам внедрение интеллектуальных помощников.";
  const stoppedPlan = await planDirectAiNeedSearch({ previousQueries: ["previous query"], searchScope: "non_hh",
    learnedContext: [{ title: "AI services", sourceUrl: "https://fixture.invalid/services", excerpt: sourceExcerpt,
      assessment: { classification: "NOT_RELEVANT", demandSide: "SELLER", freshness: "UNCERTAIN", reason: "Vendor, not a buyer" } }] });
  assert.equal(stoppedPlan.status, "AI");
  assert.deepEqual(stoppedPlan.queries, []);
  assert.equal(planningInputs[0].learnedContext[0].excerpt, sourceExcerpt, "Keep source evidence separate from rejection summaries");
  assert.equal(planningInputs[0].learnedContext[0].assessment.demandSide, "SELLER");
  assert.equal(planningInputs[0].searchScope, "non_hh");
  globalThis.fetch = async () => new Response(JSON.stringify({ output_text: JSON.stringify({
    assessments: documents.map(document => ({
      id: document.id, classification: "DIRECT", freshness: "CURRENT", confidence: 95,
      demand_side: document.demand ?? "BUYER", freshness_evidence: document.dateEvidence,
      organization_kind: "COMMERCIAL", company_name: "Компания", evidence_excerpt: document.evidence ?? document.excerpt,
    })),
  }) }));
  const assessed = await assessDirectAiNeedDocuments({ documents: documents.map(document => ({
    ...document, title: "AI-проект", sourceUrl: "https://fixture.invalid/news",
  })) });
  const byId = new Map(assessed.map(item => [item.id, item]));
  for (const id of ["old-article", "old-metadata", "republished-old-event"]) {
    assert.equal(byId.get(id).freshness, "STALE", `${id}: model cannot override old source dates`);
    assert.notEqual(byId.get(id).classification, "DIRECT");
  }
  for (const id of ["missing-date", "invented-date", "future-date"]) {
    assert.equal(byId.get(id).freshness, "UNCERTAIN");
    assert.equal(byId.get(id).classification, "LIKELY");
  }
  for (const id of ["dated-buyer", "active-job"]) assert.equal(byId.get(id).classification, "DIRECT");
  assert.equal(byId.get("dated-seller").classification, "NOT_RELEVANT");
  for (const id of ["ordinary-rpa", "optional-ai", "invented-ai"]) {
    assert.equal(byId.get(id).classification, "LIKELY", `${id}: no confirmed company AI task`);
  }
} finally {
  globalThis.fetch = originalFetch;
  delete process.env.OPENAI_API_KEY;
}

const novelVacancy = {
  id: "novel-role",
  title: "Архитектор цифровых сценариев",
  description: "Будет отвечать за внедрение интеллектуального помощника в обработку заявок.",
  employerName: "Тестовая компания",
  employerWebsite: "https://example.ru",
  sourceProvider: "public-web",
  sourceUrl: "https://example.ru/careers/novel-role",
};
const semanticDirect = evaluateAiAutomationHiring(novelVacancy, {
  id: "novel-role",
  classification: "DIRECT",
  intentFamily: "internal_ai_implementation",
  actionSummary: "Компания нанимает владельца внедрения интеллектуального помощника.",
  evidenceExcerpt: "Внедрение интеллектуального помощника в обработку заявок.",
  reason: "Публично подтверждено действие компании и прикладная задача.",
  confidence: 88,
  freshness: "CURRENT",
});
assert.equal(semanticDirect.status, "SUCCESS", "semantic intent must support unseen market terminology");

const researchOnly = evaluateAiAutomationHiring({
  ...novelVacancy, title: "Руководитель команды языковых моделей",
  description: "Полный цикл создания языковой модели: от фундаментальных исследований до вывода в продакшен.",
}, {
  id: "research", classification: "DIRECT", freshness: "CURRENT", confidence: 95,
  intentFamily: "llm", evidenceExcerpt: "Создание языковой модели.", actionSummary: "Разработка LLM", reason: "AI-вакансия",
});
assert.equal(researchOnly.status, "SKIPPED", "semantic classification must not bypass the research-only exclusion");
assert.equal(researchOnly.reason, "business_automation_intent_not_confirmed");

const likely = evaluateAiAutomationHiring(novelVacancy, {
  id: "novel-role",
  classification: "LIKELY",
  intentFamily: "unclear",
  actionSummary: "Недостаточно данных.",
  evidenceExcerpt: "Общее упоминание AI.",
  reason: "Нет подтверждённого действия компании.",
  confidence: 61,
  freshness: "UNCERTAIN",
});
assert.equal(likely.status, "SKIPPED");
assert.equal(likely.reason, "direct_intent_likely_not_confirmed");

const fallbackCopy = generateFirstEmailV3({
  companyName: "Тестовая компания",
  signalType: "AI_AUTOMATION_HIRING_SIGNAL",
  signalEvidence: "Компания ищет специалиста для внедрения AI-ассистента в обработку заявок.",
  signalSourceUrl: "https://example.ru/careers/novel-role",
  messageMode: "generic_routing",
});
assert.match(fallbackCopy.body, /не означает, что сотрудник не нужен/i);
assert.match(fallbackCopy.body, /ограниченный прототип/i);
assert.doesNotMatch(fallbackCopy.body, /узкое место часто уже не в количестве менеджеров/i);

const route = await readFile(new URL("../app/api/leadgen/ai-hiring/run/route.ts", import.meta.url), "utf8");
const ui = await readFile(new URL("../components/leadgen/lead-source-ingestion.tsx", import.meta.url), "utf8");
const runner = await readFile(new URL("../lib/leadgen/source-campaign-runner.ts", import.meta.url), "utf8");
assert.doesNotMatch(route, /if \(!isLeadgenVerticalId\(body\.verticalId\)\)/);
assert.match(ui, /Без отраслевого ограничения/);
assert.match(runner, /item\.icpResult === "NOT_APPLIED"/);
assert.match(runner, /buildEmailOutreachWithAi/);

console.log(JSON.stringify({
  status: "DIRECT_AI_REASONING_OK",
  missingPlannerIsExplicit: true,
  novelTerminologySupportedBySemanticAssessment: true,
  optionalIndustry: true,
  sharedOutreach: true,
  directNeedFallbackCopy: true,
}));
