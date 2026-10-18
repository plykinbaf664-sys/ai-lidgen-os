import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import "./register-ts-paths.mjs";

const isolated = await mkdtemp(path.join(tmpdir(), "leadgen-offer-"));
process.env.LEADGEN_LOCAL_DATA_DIR = isolated;
for (const key of Object.keys(process.env)) if (/SMTP|IMAP|TELEGRAM|SUPABASE/.test(key)) process.env[key] = "";
process.env.LEADGEN_RESEARCH_CACHE_ENABLED = "false";
process.env.LEADGEN_AI_PROVIDER = "openai";
process.env.OPENAI_API_KEY = "offline-fixture";
process.env.LEADGEN_AI_DAILY_BUDGET_USD = "100";
process.env.LEADGEN_AI_COMPANY_BUDGET_USD = "100";
process.env.OUTREACH_LLM_ENABLED = "true";
let reject = false;
let drafts = 0;
let reviews = 0;
let repaired = false;
globalThis.fetch = async (_url, init) => {
  const request = JSON.parse(init.body);
  const reviewing = request.text.format.name === "leadgen_offer_review_v3";
  if (reviewing) reviews++;
  else { drafts++; repaired ||= Boolean(JSON.parse(request.input).repair); }
  const output = reviewing ? {
    context_consistent: !reject, relevant_to_recipient: true,
    concrete_input_output: true, issues: reject ? ["Вакансия не подтверждает рост компании"] : [],
  } : {
    subject: "Разбор заявок отдела продаж",
    hypothesis: "можно ли сократить время подготовки ответов на похожие запросы клиентов с помощью черновиков, которые менеджер проверяет перед отправкой",
    pilotInput: "примеры обезличенных обращений и принятые правила подготовки ответов клиентам",
    pilotOutput: "черновики ответов и список недостающих данных для каждого обращения, подготовленные для проверки менеджером",

  };
  return new Response(JSON.stringify({ output_text: JSON.stringify(output), usage: { input_tokens: 100, output_tokens: 100 } }));
};
try {
  const { generateFirstEmailWithAi } = await import("../lib/leadgen/first-email-ai-generator.ts");
  const context = { companyName: "Альфа", decisionMakerName: "Анна Петрова", decisionMakerRole: "Руководитель отдела продаж",
    messageMode: "personal", signalType: "HIRING_SIGNAL", signalEvidence: "Альфа опубликовала вакансию менеджера по продажам.",
    signalSourceUrl: "https://alpha.example/jobs", publicPersonContext: "Анна Петрова — руководитель отдела продаж" };
  const accepted = await generateFirstEmailWithAi(context);
  assert.equal(accepted.generationSource, "ai", accepted.fallbackReason);
  assert.equal(accepted.qualityGatePassed, true);
  assert.equal(reviews, 1, "Review final core against source, not writer self-rating");
  assert.ok(accepted.body.includes("Есть смысл посмотреть этот участок на вашей компании?"));
  assert.ok(!accepted.body.includes("wrong model CTA"));
  reject = true;
  const rejected = await generateFirstEmailWithAi(context);
  assert.equal(rejected.qualityGatePassed, false);
  assert.equal(rejected.reviewStatus, "needs_manual_copy_review");
  assert.match(rejected.fallbackReason, /context_consistent/);
  assert.equal(drafts, 3, "Only one bounded repair per copy");
  assert.ok(repaired, "Repair receives concrete evidence-review issues");
  process.env.OUTREACH_LLM_ENABLED = "false";
  const disabled = await generateFirstEmailWithAi(context);
  assert.equal(disabled.qualityGatePassed, false, "Provider fallback is not personalized quality acceptance");
  const { mutateLocalTable, readLocalTable } = await import("../lib/leadgen/local-database.ts");
  const { regenerateLatestUnsentOutreach } = await import("../lib/leadgen/outreach-storage.ts");
  await mutateLocalTable("leadgen_outreach_queue", rows => rows.push({ id: "offer-regenerate", campaign_id: "offer-campaign",
    company_name: "Альфа", recipient_name: "Анна Петрова", recipient_role: context.decisionMakerRole,
    recipient_email: "anna@alpha.example", normalized_recipient_email: "anna@alpha.example", message_mode: "personal",
    message_version: 1, status: "approved", approved_at: new Date().toISOString(), sent_at: null,
    created_at: new Date().toISOString(), subject: accepted.subject, body: accepted.body,
    metadata: { quality_gate_passed: true, signal: { type: context.signalType, detail: context.signalEvidence, source_url: context.signalSourceUrl } } }));
  const callsBeforePreview = drafts;
  const preview = await regenerateLatestUnsentOutreach(false);
  assert.equal(preview.eligible_count, 1);
  assert.equal(drafts, callsBeforePreview, "Preview never spends model budget");
  const regenerated = await regenerateLatestUnsentOutreach(true);
  assert.equal(regenerated.manual_review, 1);
  const row = (await readLocalTable("leadgen_outreach_queue"))[0];
  assert.equal(row.message_version, 2);
  assert.equal(row.approved_at, null);
  assert.equal(row.metadata.quality_gate_passed, false, "Regeneration cannot bypass evidence review via template copy");
  console.log("PASS offer grounding, code-owned CTA, bounded repair, rejected/offline copy and regeneration review");
} finally { await rm(isolated, { recursive: true, force: true }); }
