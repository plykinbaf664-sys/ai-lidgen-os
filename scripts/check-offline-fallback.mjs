import assert from "node:assert/strict";
import "./register-ts-paths.mjs";

const originalFetch = globalThis.fetch;
const originalKey = process.env.OPENAI_API_KEY;
process.env.OPENAI_API_KEY = "fixture-key";
const calls = [];
globalThis.fetch = async (input) => {
  const url = String(input instanceof Request ? input.url : input);
  calls.push(url);
  if (url.includes("api.openai.com")) {
    return new Response(JSON.stringify({ error: { type: "insufficient_quota", code: "credit_balance_exhausted" } }), { status: 429 });
  }
  if (url.startsWith("https://microsoft.com")) {
    return new Response('<html><body><a href="/team">Команда</a><p>Компания Альфа. AI-автоматизация процессов.</p></body></html>', { status: 200, headers: { "content-type": "text/html" } });
  }
  if (url.startsWith("https://cloudflare-dns.com")) {
    return new Response(JSON.stringify({ Status: 0, Answer: [{ type: 15, data: "10 mx.microsoft.com." }] }), { headers: { "content-type": "application/dns-json" } });
  }
  return new Response("", { status: 404 });
};
const { researchCompany } = await import("../lib/leadgen/company-research-agent.ts");
const searchProvider = { async search() {
  return [{ title: "Иван Петров — генеральный директор компании Альфа", url: "https://microsoft.com/team",
    snippet: "Иван Петров — генеральный директор компании Альфа.", source_label: "fixture", score: 1, published_at: null, raw_content: null }];
} };
try {
  const result = await researchCompany("Компания Альфа", "https://microsoft.com", {
    type: "TECH_SIGNAL", title: "Автоматизация", detail: "Компания внедряет AI в процесс.", sourceUrl: "https://microsoft.com/news/ai", confidence: 90,
  }, { searchProvider, bypassCache: true });
  assert.ok(result.peopleDiscovery.providers_used.some(label => /RU public/i.test(label)), "deterministic provider must run after semantic outage");
  assert.ok(calls.filter(url => url.includes("api.openai.com")).length <= 1, "fallback must not retry the model repeatedly");
  console.log("OFFLINE_FALLBACK_OK", JSON.stringify({ people: result.peopleDiscovery.all_candidates.length, openaiCalls: calls.filter(url => url.includes("api.openai.com")).length }));
} finally {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey;
}
