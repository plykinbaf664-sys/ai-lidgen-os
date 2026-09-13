import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import "./register-ts-paths.mjs";

delete process.env.OPENAI_API_KEY;

const { planDirectAiNeedSearch, normalizeDirectAiConfidence } = await import("../lib/leadgen/direct-ai-need-agent.ts");
const { evaluateAiAutomationHiring } = await import("../lib/leadgen/ai-hiring-intent.ts");
const { generateFirstEmailV3 } = await import("../lib/leadgen/first-email-generator.ts");

const unavailable = await planDirectAiNeedSearch();
assert.equal(unavailable.status, "UNAVAILABLE");
assert.equal(unavailable.reason, "missing_openai_api_key");
assert.deepEqual(unavailable.queries, [], "missing AI config must not masquerade as an AI plan");
assert.equal(normalizeDirectAiConfidence(0.95), 95);
assert.equal(normalizeDirectAiConfidence(88), 88);

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
