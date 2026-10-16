import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import "./register-ts-paths.mjs";
const { cachedResearch, readResearchCache, writeResearchCache, withResearchCachePolicy, researchDataDirectory } = await import("../lib/leadgen/research-cache.ts");
const { fetchLeadgenModel } = await import("../lib/leadgen/ai-runtime.ts");
const { reserveAiSpend, withAiSpendScope } = await import("../lib/leadgen/ai-spend-budget.ts");
const isolated = await mkdtemp(path.join(tmpdir(), "leadgen-economy-"));
const previousEnv = { ...process.env };
const originalFetch = globalThis.fetch;
process.env.LEADGEN_LOCAL_DATA_DIR = isolated;
process.env.LEADGEN_RESEARCH_CACHE_ENABLED = "true";
process.env.LEADGEN_AI_PROVIDER = "openai";
process.env.OPENAI_API_KEY = "fake-key-no-network";
process.env.LEADGEN_AI_DAILY_BUDGET_USD = "100";
process.env.LEADGEN_AI_COMPANY_BUDGET_USD = "100";
const schema = { type: "object", additionalProperties: false, properties: { name: { type: "string" } }, required: ["name"] };
const body = { model: "gpt-4.1-mini", instructions: "Extract JSON, do not invent facts", input: "fixture company",
  max_output_tokens: 100, text: { format: { type: "json_schema", name: "fixture", strict: true, schema } } };
const call = (change = {}, signal) => fetchLeadgenModel("https://api.openai.com/v1/responses", { method: "POST", body: JSON.stringify({ ...body, ...change }), signal });
let calls = 0;
const response = () => Response.json({ status: "completed", output_text: '{"name":"Fixture"}', usage: { input_tokens: 100, output_tokens: 10 } });
globalThis.fetch = async (_url, init) => { calls++; assert.ok(JSON.parse(init.body).prompt_cache_key); return response(); };
try {
  const cold = await call(); assert.equal(cold.status, 200);
  for (let index = 0; index < 9; index++) assert.equal((await call()).status, 200);
  assert.equal(calls, 1, "Ten identical model requests use one network call");
  const ledgerFile = path.join(researchDataDirectory(), "spend", `${new Date().toISOString().slice(0,10)}.json`);
  assert.equal(JSON.parse(await readFile(ledgerFile, "utf8")).requests, 1, "Cache hits spend no budget");
  await call({ input: "changed evidence" }); assert.equal(calls, 2);
  await call({ instructions: "changed instructions" }); assert.equal(calls, 3);
  await withResearchCachePolicy(true, () => call()); assert.equal(calls, 4, "Explicit bypass forces refresh");

  // Persistence, not just a process-local map. Child is forbidden from networking.
  await writeResearchCache("fixture", "persisted", { fact: "published" }, 60_000);
  const child = spawnSync(process.execPath, ["--experimental-transform-types", "--import", "./scripts/register-ts-paths.mjs", "--input-type=module", "-e",
    'import {readResearchCache} from "./lib/leadgen/research-cache.ts"; import {fetchLeadgenModel} from "./lib/leadgen/ai-runtime.ts"; globalThis.fetch=()=>{throw Error("network forbidden")}; if((await readResearchCache("fixture","persisted"))?.fact!=="published")process.exit(1); const response=await fetchLeadgenModel("https://api.openai.com/v1/responses", {body:JSON.stringify('+JSON.stringify(body)+')}); if(response.status!==200)process.exit(2);'],
  { env: process.env, windowsHide: true, encoding: "utf8" });
  assert.equal(child.status, 0, child.stderr);
  await writeResearchCache("fixture", "expired", { fact: "old" }, -1);
  assert.equal(await readResearchCache("fixture", "expired"), null);

  let release; let sharedCalls = 0; let underlyingAborted = false;
  const wait = new Promise(resolve => { release = resolve; });
  const operation = async signal => { sharedCalls++; signal.addEventListener("abort", () => { underlyingAborted = true; }); await wait; return { ok: true }; };
  const abort = new AbortController();
  const first = cachedResearch("fixture", "parallel", 60_000, operation, abort.signal);
  const firstError = assert.rejects(first);
  const second = cachedResearch("fixture", "parallel", 60_000, operation);
  await new Promise(resolve => setTimeout(resolve, 50));
  abort.abort(); await firstError;
  assert.equal(underlyingAborted, false, "Cancelling one consumer must not abort shared work");
  release(); assert.deepEqual(await second, { ok: true }); assert.equal(sharedCalls, 1);

  let invalidCalls = 0;
  globalThis.fetch = async () => { invalidCalls++; return Response.json({ output_text: '{"wrong":"schema"}' }); };
  await call({ input: "invalid response" }); await call({ input: "invalid response" });
  assert.equal(invalidCalls, 2, "Invalid structured output is never cached");
  globalThis.fetch = async () => { invalidCalls++; return Response.json({ error: { code: "insufficient_quota" } }, { status: 429 }); };
  await call({ input: "provider failure" }); await call({ input: "provider failure" });
  assert.equal(invalidCalls, 4, "Provider errors are not evidence cache entries");

  process.env.LEADGEN_AI_PROVIDER = "qwen";
  process.env.QWEN_API_KEY = "fake-qwen-key";
  process.env.QWEN_BASE_URL = "https://qwen-fixture.example/compatible-mode/v1";
  delete process.env.QWEN_MODEL;
  let qwenCalls = 0;
  globalThis.fetch = async (url, init) => {
    qwenCalls++; assert.equal(url, "https://qwen-fixture.example/compatible-mode/v1/chat/completions");
    const request = JSON.parse(init.body);
    assert.equal(request.model, "qwen3.7-plus"); assert.equal(request.enable_thinking, false);
    assert.deepEqual(request.response_format.json_schema.schema, schema);
    assert.equal(request.messages[1].content, body.input);
    assert.equal(init.headers.Authorization, "Bearer fake-qwen-key");
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"name":"Qwen Fixture"}' } }], usage: { prompt_tokens: 100, completion_tokens: 10 } });
  };
  const qwen = await (await call()).json(); assert.equal(JSON.parse(qwen.output_text).name, "Qwen Fixture");
  assert.equal(qwen.usage.input_tokens, 100); await call(); assert.equal(qwenCalls, 1);
  globalThis.fetch = async () => Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"wrong":"field"}' } }], usage: { prompt_tokens: 100, completion_tokens: 10 } });
  assert.equal((await call({ input: "invalid Qwen schema" })).status, 502, "Qwen must satisfy the exact schema before downstream sees facts");
  delete process.env.QWEN_BASE_URL;
  await assert.rejects(call(), /qwen_base_url_missing/, "Missing Qwen configuration must not silently spend OpenAI credit");

  // Reservations are atomic across concurrent requests, not checked after spending.
  process.env.LEADGEN_LOCAL_DATA_DIR = path.join(isolated, "budget");
  process.env.LEADGEN_AI_DAILY_BUDGET_USD = "0.1";
  const reservations = await Promise.allSettled([reserveAiSpend(0.08), reserveAiSpend(0.08)]);
  assert.equal(reservations.filter(result => result.status === "fulfilled").length, 1);
  const settlement = reservations.find(result => result.status === "fulfilled").value;
  await settlement(0.02); await (await reserveAiSpend(0.07))(0);
  process.env.LEADGEN_AI_COMPANY_BUDGET_USD = "0.04";
  await withAiSpendScope(async () => {
    const first = await reserveAiSpend(0.03);
    await assert.rejects(reserveAiSpend(0.02), /ai_company_budget_exceeded/);
    await first(0.01); await (await reserveAiSpend(0.02))(0);
  });
  process.env.LEADGEN_AI_PROVIDER = "openai";
  process.env.LEADGEN_AI_DAILY_BUDGET_USD = "0";
  globalThis.fetch = async () => assert.fail("Zero budget must prevent the network request");
  const blocked = await call({ input: "zero budget" });
  assert.equal(blocked.status, 429); assert.equal((await blocked.json()).error.code, "local_budget_exceeded");
  const files = await readdir(researchDataDirectory()); assert.ok(files.includes("spend"));
  console.log("RESEARCH_ECONOMY_OK: 10 repeated model calls -> 1 network call; disk persistence, TTL, invalidation, bypass, cancellation, Qwen schema/usage mapping, atomic budgets; live API calls=0");
} finally {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) if (!(key in previousEnv)) delete process.env[key];
  Object.assign(process.env, previousEnv);
  if (path.dirname(path.resolve(isolated)) !== path.resolve(tmpdir())) throw new Error("Unexpected cleanup path");
  await rm(isolated, { recursive: true, force: true });
}
