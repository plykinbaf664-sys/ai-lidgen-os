import { readFile, writeFile, mkdir } from "node:fs/promises";
import { AsyncLocalStorage } from "node:async_hooks";
import "./register-ts-paths.mjs";

const phase = process.argv[2] ?? "before";
const cacheEnabled = process.env.RESEARCH_BENCHMARK_USE_CACHE === "true";
for (const key of Object.keys(process.env)) if (/SMTP|IMAP|TELEGRAM|SUPABASE/.test(key)) process.env[key] = "";
process.env.EMAIL_TEST_MODE = "true";
const { researchCompany } = await import("../lib/leadgen/company-research-agent.ts");
const { createLeadgenSearchProvider } = await import("../lib/leadgen/search/leadgen-search-provider.ts");
const { getActiveAbortableOperationCount } = await import("../lib/network/abortable-operation.ts");
const { llmAvailabilityError } = await import("../lib/leadgen/llm-availability.ts");
const all = [];
for (const mode of ["business", "direct", "person"]) {
  const report = JSON.parse(await readFile(`.ai/final-live-${mode}.json`, "utf8"));
  all.push(...report.companies.map(company => ({ mode, name: company.company_name,
    website: `https://${company.company_domain}`, before: company.metadata.company_research,
    signal: company.metadata.company_research.signal })));
}
const selected = process.env.RESEARCH_SAMPLE_INDICES ? process.env.RESEARCH_SAMPLE_INDICES.split(",").map(index => all[Number(index)])
  : phase === "before" ? [all[1], all[4], all[13], all[15]] : all;
const context = new AsyncLocalStorage();
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const trace = context.getStore();
  const url = String(typeof input === "string" ? input : input.url ?? input);
  const started = Date.now();
  const request = init?.body && (url.includes("api.openai.com") || url.endsWith("/chat/completions")) ? JSON.parse(init.body) : null;
  try {
    const response = await originalFetch(input, init);
    if (trace) {
      const item = { stage: request ? "model" : "fetch", url, status: response.status, elapsedMs: Date.now() - started };
      if (request) {
        item.schema = request.text?.format?.name ?? request.response_format?.json_schema?.name;
        item.model = request.model;
        item.input = JSON.parse(request.input ?? request.messages?.find(message => message.role === "user")?.content ?? "null");
        const data = await response.clone().json();
        item.usage = data.usage?.prompt_tokens !== undefined ? { input_tokens: data.usage.prompt_tokens, output_tokens: data.usage.completion_tokens,
          input_tokens_details: data.usage.prompt_tokens_details } : data.usage;
        item.webSearchCalls = data.output?.filter(item => item.type === "web_search_call").length ?? 0;
        if (!response.ok) item.error = { type: data.error?.type, code: data.error?.code, message: data.error?.message };
        const text = data.output_text ?? data.choices?.[0]?.message?.content ?? data.output?.flatMap(item => item.content ?? []).find(item => item.text)?.text;
        try { item.output = JSON.parse(text); } catch { item.output = text ?? null; }
      }
      trace.push(item);
    }
    return response;
  } catch (error) { trace?.push({ stage: "fetch", url, error: error.name, elapsedMs: Date.now() - started }); throw error; }
};
await mkdir(".ai/research-traces", { recursive: true });
const records = [];
// Two companies in flight; no production storage or outbound integrations.
let cursor = 0;
await Promise.all(Array.from({ length: 2 }, async () => {
  while (cursor < selected.length) {
    const index = cursor++;
    const company = selected[index];
    const trace = [];
    const provider = createLeadgenSearchProvider();
    const started = Date.now();
    const record = { ...company, index, trace, startedAt: new Date().toISOString() };
    if (llmAvailabilityError()) {
      records.push({ ...record, blocked: llmAvailabilityError(), runtimeMs: 0 });
      continue;
    }
    try {
      const result = await context.run(trace, () => researchCompany(company.name, company.website, company.signal, {
        bypassCache: !cacheEnabled, signal: AbortSignal.timeout(90_000),
        searchProvider: { async search(input) {
          const results = await provider.search(input);
          trace.push({ stage: "search", query: input.query, results: results.map(result => ({ ...result, raw_content: null, snippet: result.snippet.slice(0, 1600) })) });
          return results;
        } },
        onTrace: event => trace.push(event),
      }));
      record.bundle = result.bundle;
      record.people = result.peopleDiscovery;
      record.contacts = result.contactDiscovery.contacts.map(contact => ({ name: contact.full_name, role: contact.role_title,
        email: contact.email, type: contact.contact_type, source: contact.source_url,
        selected: contact.metadata.outreach_selected, classification: contact.metadata.normalized_email_classification,
        intelligence: contact.metadata.contact_intelligence, ready: contact.metadata.email_quality_gate_passed,
        generationSource: contact.metadata.email_generation_source, fallbackReason: contact.metadata.email_generation_fallback_reason,
        copy: contact.metadata.outreach_selected ? contact.metadata.email_body : undefined }));
    } catch (error) { record.error = String(error); }
    record.runtimeMs = Date.now() - started;
    records.push(record);
    await writeFile(`.ai/research-traces/${phase}-${index}.json`, JSON.stringify(record, null, 2));
    console.log(JSON.stringify({ phase, index, name: company.name, people: record.bundle?.people.length,
      best: record.bundle?.bestOutreachContact, runtimeMs: record.runtimeMs, error: record.error }));
  }
}));
const report = { phase, cacheEnabled, records: records.sort((a,b) => a.index-b.index),
  benchmarkBlocked: llmAvailabilityError(), requestedCompanies: selected.length,
  orphanRequests: getActiveAbortableOperationCount(), productionSmtpCalls: 0 };
await writeFile(`.ai/research-${phase}.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ phase, completed: records.filter(record => record.bundle).length,
  blocked: records.filter(record => record.blocked).length, orphanRequests: report.orphanRequests, productionSmtpCalls: 0 }));
