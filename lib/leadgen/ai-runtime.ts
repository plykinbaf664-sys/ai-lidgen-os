import { cachedResearch, researchCacheKey } from "@/lib/leadgen/research-cache";
import { reserveAiSpend } from "@/lib/leadgen/ai-spend-budget";

export function aiProvider(): "openai" | "qwen" {
  const provider = process.env.LEADGEN_AI_PROVIDER?.trim() || "auto";
  if (!["auto", "openai", "qwen"].includes(provider)) throw new Error("ai_provider_invalid");
  return provider === "qwen" || (provider === "auto" && Boolean(process.env.QWEN_API_KEY?.trim())) ? "qwen" : "openai";
}
export function semanticApiKey(): string | undefined {
  return (aiProvider() === "qwen" ? process.env.QWEN_API_KEY : process.env.OPENAI_API_KEY)?.trim() || undefined;
}
export function semanticModelIdentity() {
  return { provider: aiProvider(), model: aiProvider() === "qwen" ? process.env.QWEN_MODEL || "qwen3.7-plus" : process.env.LEADGEN_RESEARCH_OPENAI_MODEL || "gpt-4.1",
    endpoint: aiProvider() === "qwen" ? process.env.QWEN_BASE_URL : "openai" };
}
type Schema = { type?: string | string[]; properties?: Record<string, Schema>; required?: string[];
  items?: Schema; enum?: unknown[]; additionalProperties?: boolean; minItems?: number; maxItems?: number; minimum?: number; maximum?: number };
function matches(value: unknown, schema: Schema): boolean {
  const type = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
  if (schema.type && ![schema.type].flat().some(expected => expected === type || (expected === "integer" && Number.isInteger(value)))) return false;
  if (schema.enum && !schema.enum.includes(value)) return false;
  if (typeof value === "number" && (!Number.isFinite(value) || value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity))) return false;
  if (Array.isArray(value)) return value.length >= (schema.minItems ?? 0) && value.length <= (schema.maxItems ?? Infinity) && (!schema.items || value.every(item => matches(item, schema.items!)));
  if (value && typeof value === "object") {
    const data = value as Record<string, unknown>;
    return !(schema.required ?? []).some(key => !(key in data)) && Object.entries(data).every(([key, item]) =>
      schema.properties?.[key] ? matches(item, schema.properties[key]) : schema.additionalProperties !== false);
  }
  return true;
}
type ModelBody = { model: string; instructions?: string; input?: string; max_output_tokens?: number;
  text?: { format?: { name?: string; schema?: Schema; type?: string } }; tools?: { type: string }[]; [key: string]: unknown };
type ModelData = { output_text?: string; status?: string; error?: unknown;
  output?: { type?: string; content?: { text?: string }[] }[];
  usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } } };
function modelText(data: ModelData) { return data.output_text ?? data.output?.flatMap(item => item.content ?? []).find(item => item.text)?.text; }
function price(model: string, provider: string) {
  if (provider === "qwen") {
    if (!/^qwen3\.7-plus(?:-2026-05-26)?$/.test(model) &&
      (!process.env.QWEN_INPUT_USD_PER_MILLION || !process.env.QWEN_OUTPUT_USD_PER_MILLION)) throw new Error("ai_model_price_not_configured");
    // Conservative region-independent defaults; override with the chosen endpoint's tariff.
    return { input: Number(process.env.QWEN_INPUT_USD_PER_MILLION || "0.4"), cached: Number(process.env.QWEN_INPUT_USD_PER_MILLION || "0.4"), output: Number(process.env.QWEN_OUTPUT_USD_PER_MILLION || "1.6") };
  }
  if (model === "gpt-4.1" || model.startsWith("gpt-4.1-2025")) return { input: 2, cached: 0.5, output: 8 };
  if (model === "gpt-4.1-mini" || model.startsWith("gpt-4.1-mini-")) return { input: 0.4, cached: 0.1, output: 1.6 };
  throw new Error("ai_model_price_not_configured");
}

/** Compatibility boundary: callers keep their structured Responses contract. */
export async function fetchLeadgenModel(_url: string, init: RequestInit): Promise<Response> {
  const body = JSON.parse(String(init.body)) as ModelBody;
  const web = body.tools?.some(tool => tool.type === "web_search") === true;
  const provider = web ? "openai" : aiProvider();
  const key = (provider === "qwen" ? process.env.QWEN_API_KEY : process.env.OPENAI_API_KEY)?.trim();
  if (!key) throw new Error("ai_api_key_missing");
  let endpoint = "https://api.openai.com/v1/responses";
  let request: unknown = body;
  let model = body.model;
  if (provider === "qwen") {
    const base = process.env.QWEN_BASE_URL?.trim();
    if (!base) throw new Error("qwen_base_url_missing");
    const parsed = new URL(base);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error("qwen_base_url_invalid");
    endpoint = `${base.replace(/\/+$/, "")}/chat/completions`;
    model = process.env.QWEN_MODEL?.trim() || "qwen3.7-plus";
    const format = body.text?.format;
    request = { model, messages: [{ role: "system", content: body.instructions ?? "Return structured JSON." }, { role: "user", content: body.input ?? "" }],
      response_format: format?.schema ? { type: "json_schema", json_schema: { name: format.name, strict: true, schema: format.schema } } : { type: "json_object" },
      max_tokens: body.max_output_tokens ?? 1200, enable_thinking: false };
  } else if (!web) {
    request = { ...body, prompt_cache_key: `leadgen-${researchCacheKey([body.instructions, body.text?.format]).slice(0,32)}` };
  }
  const serialized = JSON.stringify(request);
  const rates = price(model, provider);
  if (provider === "qwen" && Buffer.byteLength(serialized) > 256_000) {
    rates.input *= 3; rates.cached *= 3; rates.output *= 3;
  }
  if (Object.values(rates).some(rate => !Number.isFinite(rate) || rate < 0)) throw new Error("ai_model_price_invalid");
  const maxOutput = body.max_output_tokens ?? 1200;
  // UTF-8 bytes conservatively bound text tokens. Reserve search content too;
  // usage-free/aborted requests retain the reservation instead of claiming $0.
  const reservation = (Buffer.byteLength(serialized) + (web ? 32_000 : 0)) * rates.input / 1e6 + maxOutput * rates.output / 1e6 + (web ? 0.01 : 0);
  const cacheKey = researchCacheKey({ version: 1, endpoint, account: researchCacheKey(key), request });
  const cached = await cachedResearch("model", cacheKey, web ? 6*60*60_000 : 24*60*60_000, async signal => {
    signal.throwIfAborted();
    let settle;
    try { settle = await reserveAiSpend(reservation); }
    catch (error) {
      if (error instanceof Error && /^ai_(?:daily|company|budget)/.test(error.message)) return {
        status: 429, data: { error: { code: "local_budget_exceeded", message: error.message } } as ModelData, valid: false,
      };
      throw error;
    }
    if (signal.aborted) { await settle(0); signal.throwIfAborted(); }
    const response = await fetch(endpoint, { ...init, body: serialized, redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" } });
    let data = await response.json();
    if (provider === "qwen" && response.ok) {
      const usage = data.usage;
      const choice = data.choices?.[0];
      data = { output_text: choice?.message?.content, status: choice?.finish_reason === "stop" ? "completed" : "incomplete",
        usage: usage ? { input_tokens: usage.prompt_tokens, output_tokens: usage.completion_tokens,
          input_tokens_details: { cached_tokens: usage.prompt_tokens_details?.cached_tokens ?? 0 } } : undefined };
    }
    const usage = data.usage;
    if (response.ok && Number.isFinite(usage?.input_tokens) && Number.isFinite(usage?.output_tokens)) {
      const input = usage.input_tokens as number;
      const cache = Math.min(input, usage.input_tokens_details?.cached_tokens ?? 0);
      const searchCalls = web ? Math.max(1, data.output?.filter((item: { type: string }) => item.type === "web_search_call").length ?? 0) : 0;
      await settle(((input-cache)*rates.input + cache*rates.cached + usage.output_tokens*rates.output)/1e6 + searchCalls*.01);
    } else if ([400,401,403,429].includes(response.status)) await settle(0);
    let valid = response.ok && data.status !== "incomplete";
    if (valid && !web) {
      try { const value = JSON.parse(modelText(data) ?? ""); valid = Boolean(body.text?.format?.schema && matches(value, body.text.format.schema)); }
      catch { valid = false; }
    }
    if (provider === "qwen" && response.ok && !valid) return {
      status: 502, data: { error: { code: "model_invalid_schema" } } as ModelData, valid: false,
    };
    return { status: response.status, data: data as ModelData, valid };
  }, init.signal, result => result.valid);
  return Response.json(cached.data, { status: cached.status, headers: { "x-leadgen-provider": provider } });
}
