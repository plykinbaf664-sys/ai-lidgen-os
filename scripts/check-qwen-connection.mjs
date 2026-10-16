import "./register-ts-paths.mjs";

// Configuration-only by default. Never print keys, complete URLs, or provider bodies.
async function main() {
  const missing = ["QWEN_API_KEY", "QWEN_BASE_URL", "QWEN_MODEL"].filter(key => !process.env[key]?.trim());
  if (missing.length) {
    console.log(JSON.stringify({ status: "CONFIG_MISSING", missing, apiCalls: 0 }));
    process.exitCode = 1;
    return;
  }
  let endpoint;
  try { endpoint = new URL(process.env.QWEN_BASE_URL.trim()); } catch { throw new Error("qwen_base_url_invalid"); }
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash ||
    /\/chat\/completions\/?$/.test(endpoint.pathname)) throw new Error("qwen_base_url_invalid_use_base_without_chat_completions");
  for (const key of ["QWEN_INPUT_USD_PER_MILLION", "QWEN_OUTPUT_USD_PER_MILLION"]) {
    const value = process.env[key];
    if (!value?.trim() || !Number.isFinite(Number(value)) || Number(value) < 0) throw new Error("qwen_explicit_prices_required");
  }
  const configuredCap = Number(process.env.LEADGEN_AI_COMPANY_BUDGET_USD ?? "0.20");
  if (!Number.isFinite(configuredCap) || configuredCap < 0) throw new Error("ai_company_budget_invalid");
  const cap = Math.min(configuredCap, 0.01);
  console.log(JSON.stringify({ status: "CONFIG_OK", keyConfigured: true,
    applicationProvider: process.env.LEADGEN_AI_PROVIDER || "auto", probeProvider: "qwen",
    maxEstimatedUsd: cap, liveRequested: process.argv.includes("--live") }));
  if (!process.argv.includes("--live")) return;

  // Probe Qwen explicitly even if the running application's provider is still OpenAI.
  // Runtime adapter retains the shared daily ledger; no search, SMTP, or CRM imports.
  process.env.LEADGEN_AI_PROVIDER = "qwen";
  process.env.LEADGEN_AI_COMPANY_BUDGET_USD = String(cap);
  const { fetchLeadgenModel } = await import("../lib/leadgen/ai-runtime.ts");
  const { withAiSpendScope } = await import("../lib/leadgen/ai-spend-budget.ts");
  const { withResearchCachePolicy } = await import("../lib/leadgen/research-cache.ts");
  const schema = { type: "object", additionalProperties: false,
    properties: { demandSide: { type: "string", enum: ["BUYER", "SELLER", "UNKNOWN"] } }, required: ["demandSide"] };
  const started = Date.now();
  const response = await withResearchCachePolicy(true, () => withAiSpendScope(() => fetchLeadgenModel("", {
    method: "POST", signal: AbortSignal.timeout(30_000), body: JSON.stringify({
      model: process.env.QWEN_MODEL.trim(), max_output_tokens: 160,
      instructions: "Classify who expresses demand. Return JSON matching the schema. This is a fictional connectivity fixture, not a real lead.",
      input: JSON.stringify({ text: "Компания ищет подрядчика для внедрения AI-помощника в собственный отдел поддержки." }),
      text: { format: { type: "json_schema", name: "leadgen_qwen_connection", strict: true, schema } },
    }),
  })));
  const data = await response.json();
  const code = String(data.error?.code ?? "provider_error");
  if (!response.ok) {
    console.log(JSON.stringify({ status: "FAILED", httpStatus: response.status,
      errorCode: /^[a-zA-Z0-9_.-]{1,80}$/.test(code) ? code : "provider_error", elapsedMs: Date.now() - started }));
    process.exitCode = 1;
    return;
  }
  const answer = JSON.parse(data.output_text);
  const passed = answer.demandSide === "BUYER";
  console.log(JSON.stringify({ status: passed ? "CONNECTION_PASS" : "SMOKE_ANSWER_FAILED", provider: response.headers.get("x-leadgen-provider"),
    schemaValid: true, usage: data.usage, elapsedMs: Date.now() - started, researchQualityValidated: false }));
  if (!passed) process.exitCode = 1;
}

await main().catch(error => {
  const code = String(error?.message ?? "");
  console.log(JSON.stringify({ status: "FAILED", errorCode: /^(?:qwen|ai)_[a-z_]+$/.test(code) ? code : "connection_failed" }));
  process.exitCode = 1;
});
