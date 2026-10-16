import assert from "node:assert/strict";
import fs from "node:fs/promises";
import "./register-ts-paths.mjs";
// This suite checks routing under changing mock providers, not cache reuse.
process.env.LEADGEN_RESEARCH_CACHE_ENABLED = "false";

const { buildSignalQueries } = await import("../lib/leadgen/signals/query-builder.ts");
const { getVerticalIcp } = await import("../lib/leadgen/verticals.ts");

const signalTypes = [
  "HIRING_SIGNAL",
  "GO_TO_MARKET_SIGNAL",
  "GROWTH_SIGNAL",
  "CONTENT_SIGNAL",
  "TRAFFIC_SIGNAL",
  "TECH_SIGNAL",
];
const icp = getVerticalIcp("manufacturing");
const queries = signalTypes.flatMap((signalType) =>
  buildSignalQueries({ icp, signalType, maxQueries: 8, market: "ru" }),
);

assert.equal(new Set(queries.map((query) => query.signal_type)).size, 6);
assert.ok(queries.some((query) => query.query.includes("site:hh.ru/vacancy")));
assert.ok(queries.some((query) => /отраслевой каталог предприятий|официальный сайт компании/.test(query.query)));
assert.ok(queries.every((query) => /производ|завод|дистрибьютор|промышлен/.test(query.query)));
assert.ok(queries.every((query) => !/клиник|стоматолог|онлайн-школ|логистик/.test(query.query)));

const providerSource = await fs.readFile("lib/leadgen/search/leadgen-search-provider.ts", "utf8");
assert.doesNotMatch(providerSource, /YandexSearchProvider/);
assert.match(providerSource, /PublicWebSearchProvider/);
const { MarketAwareSearchProvider } = await import("../lib/leadgen/search/leadgen-search-provider.ts");
const calls = [];
const hit = { title: "Public source", url: "https://example.org", snippet: "evidence" };
const fallback = new MarketAwareSearchProvider({ slots: [
  { name: "browser", provider: { async search() { calls.push("free"); return []; } } },
  { name: "tavily", provider: { async search() { calls.push("fallback"); return [hit]; } } },
] });
assert.equal((await fallback.search({ query: "company person" })).length, 1);
assert.deepEqual(calls, ["free", "fallback"]);
calls.length = 0;
const successfulFree = new MarketAwareSearchProvider({ slots: [
  { name: "browser", provider: { async search() { calls.push("free"); return [hit]; } } },
  { name: "tavily", provider: { async search() { throw new Error("Paid fallback should not run"); } } },
] });
await successfulFree.search({ query: "company person" });
assert.deepEqual(calls, ["free"]);

const engineSource = await fs.readFile("lib/leadgen/lead-discovery-engine.ts", "utf8");
assert.match(engineSource, /MAX_SIGNALS_PER_RUN = 6/);
assert.match(engineSource, /previousStrategyMetrics/);
assert.match(engineSource, /previousSignalMetrics\.attempts >= 6/);

console.log("MULTISOURCE_DISCOVERY_OK free_first=pass bounded_fallback=pass segment_guard=pass");
