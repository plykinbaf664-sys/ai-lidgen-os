import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import "./register-ts-paths.mjs";
import { formatLiveReport } from "./live-report-format.mjs";

const mode = process.argv[2] ?? "business";
assert.ok(["business", "direct", "import", "person"].includes(mode));
const sharedCache = path.join(process.env.LEADGEN_LOCAL_DATA_DIR
  ? path.resolve(process.env.LEADGEN_LOCAL_DATA_DIR) : path.join(process.cwd(), ".leadgen-data"), "research-cache");
const isolated = await mkdtemp(path.join(tmpdir(), `leadgen-final-${mode}-`));
// Isolate CRM/lifecycle mutations, not the daily spend ceiling or fetched evidence.
await mkdir(sharedCache, { recursive: true });
await symlink(sharedCache, path.join(isolated, "research-cache"), "junction");
process.env.LEADGEN_LOCAL_DATA_DIR = isolated;
process.env.EMAIL_TEST_MODE = "true";
process.env.FOLLOWUP_AUTOMATION_ENABLED = "false";
for (const key of Object.keys(process.env)) if (/SMTP|IMAP|TELEGRAM|SUPABASE/.test(key)) process.env[key] = "";
const originalFetch = globalThis.fetch;
const requests = {};
const modelCalls = [];
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input.url ?? String(input));
  requests[url.hostname] = (requests[url.hostname] ?? 0) + 1;
  const response = await originalFetch(input, init);
  if (url.hostname === "api.openai.com" || (init?.body && url.pathname.endsWith("/chat/completions"))) {
    const body = JSON.parse(init.body);
    const item = { schema: body.text?.format?.name ?? body.response_format?.json_schema?.name, status: response.status };
    const modelResponse = await response.clone().json();
    item.model = body.model;
    item.usage = modelResponse.usage?.prompt_tokens !== undefined ? { input_tokens: modelResponse.usage.prompt_tokens,
      output_tokens: modelResponse.usage.completion_tokens, input_tokens_details: modelResponse.usage.prompt_tokens_details } : modelResponse.usage;
    item.webSearchCalls = modelResponse.output?.filter(item => item.type === "web_search_call").length ?? 0;
    if (mode === "person" && item.schema === "people_evidence") {
      item.evidence = JSON.parse(body.input).documents;
      item.assessment = await response.clone().json();
    }
    if (!response.ok) item.error = (await response.clone().text()).slice(0, 400);
    modelCalls.push(item);
  }
  return response;
};
const report = { mode, startedAt: new Date().toISOString(), isolated, productionSmtpCalls: 0 };
const artifact = `.ai/${process.env.LIVE_REPORT_PREFIX ?? "final-live"}-${mode}.json`;
const save = async () => writeFile(artifact, formatLiveReport(report));
try {
  const { savePipelineResult } = await import("../lib/leadgen/storage.ts");
  const storage = await import("../lib/leadgen/outreach-storage.ts");
  let result;
  if (mode === "business") {
    const { runLeadDiscoveryEngine } = await import("../lib/leadgen/lead-discovery-engine.ts");
    const { createLeadgenSearchProvider } = await import("../lib/leadgen/search/leadgen-search-provider.ts");
    result = await runLeadDiscoveryEngine({ campaignInput: { name: "Controlled Business Signals", requestedBy: "isolated-live", verticalId: "manufacturing" },
      searchProvider: createLeadgenSearchProvider(), leadTarget: 3, emailReadyTarget: 2, runBudgetMs: 180_000 });
    await savePipelineResult({ result, notifications: [] });
  } else if (mode === "direct") {
    const { runAiHiringCampaign } = await import("../lib/leadgen/source-campaign-runner.ts");
    const run = await runAiHiringCampaign({ input: { name: "Controlled Direct AI Need", requestedBy: "isolated-live" } });
    result = run.result;
    report.discovery = run.live;
  } else if (mode === "person") {
    const { buildSourceRecords } = await import("../lib/leadgen/source-campaign-runner.ts");
    const campaign = { id: `controlled-person-${Date.now()}`, pipeline_run_id: `controlled-person-${Date.now()}`,
      name: "Targeted live regression from discovered company", requested_by: "isolated-live", status: "completed",
      icp_label: "Direct AI Need", offer_label: "AI audit", created_at: new Date().toISOString() };
    const record = await buildSourceRecords(campaign, { origin: "AI_HIRING", companyName: "Производственная Компания Контур",
      domain: "xn--j1agcjjg.xn--p1ai", website: "https://xn--j1agcjjg.xn--p1ai", segmentVerification: null,
      signalType: "AI_AUTOMATION_HIRING_SIGNAL", signalTitle: "Инженер (Специалист) по автоматизации бизнес-процессов",
      signalDetail: "искать и внедрять современные решения в бизнес-процессы и ИИ-технологии",
      signalSourceUrl: "https://hh.ru/vacancy/137520507", signalConfidence: 85, email: null, emailKind: null, emailSourceUrl: null }, 0);
    result = { campaign, companies: [record.company], contacts: record.contacts, leads: [record.lead], signals: [record.signal], events: [] };
    await savePipelineResult({ result, notifications: [] });
    report.sampleNote = "Targeted regression: company/signal discovered in the initial live run, not an independent discovery run";
  } else {
    const { parseContactImport } = await import("../lib/leadgen/contact-import.ts");
    const { saveImportPreview, confirmImportPreview } = await import("../lib/leadgen/contact-import-store.ts");
    const { runImportedCampaign } = await import("../lib/leadgen/source-campaign-runner.ts");
    // Real company identified in the preceding live run; deliberately no supplied
    // person/email/signal: import must research it and must not invent why-now.
    const preview = parseContactImport({ filename: "controlled.csv", bytes: Buffer.from("company,website\nПроизводственная Компания Контур,https://xn--j1agcjjg.xn--p1ai\n") });
    const stored = await saveImportPreview(preview);
    const confirmed = await confirmImportPreview(stored.previewId);
    const run = await runImportedCampaign({ batchId: confirmed.batchId, input: { name: "Controlled Imported Base", requestedBy: "isolated-live", verticalId: "manufacturing" } });
    result = run.result;
    report.importSummary = run.importSummary;
  }
  report.campaign = result.campaign;
  report.companies = result.companies;
  report.contacts = result.contacts;
  report.signals = result.signals;
  const queue = await storage.syncOutreachQueue(result.campaign.id);
  report.queueBefore = queue;
  report.metrics = { companies: result.companies.length,
    people: result.companies.reduce((n,c) => n + (c.metadata.company_research?.people?.length ?? 0), 0),
    personalEmails: result.contacts.filter(c => c.email && c.contact_type === "work_email").length,
    emailContacts: result.contacts.filter(c => c.email).length,
    ready: queue.filter(e => e.quality_gate_passed).length, manualReview: queue.filter(e => !e.quality_gate_passed).length };
  await save();
  console.log(JSON.stringify({ stage: "research", ...report.metrics }));
  const ready = queue.filter(e => e.quality_gate_passed);
  if (ready.length) {
    const before = await storage.scheduleApprovedBatch({ campaignId: result.campaign.id, requestedCount: 20 });
    assert.equal(before.queued_count, 0, "No delivery before approval");
    const approved = await storage.approveOutreachEntry(ready[0].id);
    assert.equal(approved.status, "approved");
    const bulk = await storage.bulkApproveOutreach(result.campaign.id, true);
    const queued = await storage.scheduleApprovedBatch({ campaignId: result.campaign.id, requestedCount: 20, randomDelay: () => 1 });
    const { mutateLocalTable } = await import("../lib/leadgen/local-database.ts");
    await mutateLocalTable("leadgen_outreach_queue", rows => rows.forEach(row => {
      if (row.status === "queued") { row.scheduled_at = new Date(0).toISOString(); row.next_attempt_at = new Date(0).toISOString(); }
    }));
    const { processNextOutreachItem } = await import("../lib/leadgen/outreach-processor.ts");
    let sinkCalls = 0;
    const sink = { id: "isolated-dry-run", label: "No network delivery", async validateConnection() { return { ok: true, message: "dry-run" }; },
      async sendEmail(entry) { sinkCalls++; assert.ok(entry.approved_at); return { ok: true, provider: this.id,
        provider_message_id: `<dry-run-${entry.id}@example.invalid>`, subject: entry.subject,
        smtp_response: "NOT SENT: isolated dry-run", sent_copy_saved_at: null, sent_copy_error: null }; } };
    const sent = await processNextOutreachItem("initial", sink);
    assert.equal(sent.status, "sent");
    assert.equal(sinkCalls, 1);
    report.lifecycle = { single: approved.status, bulk: bulk.approved, queued: queued.queued_count, senderDryRun: sent.status, sinkCalls };
    await mutateLocalTable("leadgen_outreach_queue", rows => {
      const parent = rows.find(r => r.id === sent.entry.id);
      parent.sent_at = new Date(Date.now() - 72 * 3600_000).toISOString();
      parent.reply_check_status = "verified"; parent.reply_checked_at = new Date().toISOString();
    });
    const { generateEligibleFollowups } = await import("../lib/leadgen/followup-storage.ts");
    report.lifecycle.followup = await generateEligibleFollowups(result.campaign.id);
    report.lifecycle.followupNote = "Elapsed time and no-reply status simulated in isolated storage; no IMAP calls";
  }
} catch (error) {
  report.error = error instanceof Error ? error.stack : String(error);
  process.exitCode = 1;
} finally {
  const { getActiveAbortableOperationCount } = await import("../lib/network/abortable-operation.ts");
  report.orphanRequests = getActiveAbortableOperationCount();
  report.requests = requests; report.modelCalls = modelCalls;
  report.finishedAt = new Date().toISOString();
  await save();
  console.log(JSON.stringify({ mode, metrics: report.metrics, lifecycle: report.lifecycle, error: report.error, artifact }));
}
