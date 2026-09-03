import assert from "node:assert/strict";
import fs from "node:fs/promises";
import "./register-ts-paths.mjs";

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
assert.doesNotMatch(providerSource, /TavilySearchProvider|YandexSearchProvider/);
assert.match(providerSource, /PublicWebSearchProvider/);

const engineSource = await fs.readFile("lib/leadgen/lead-discovery-engine.ts", "utf8");
assert.match(engineSource, /MAX_SIGNALS_PER_RUN = 6/);
assert.match(engineSource, /previousStrategyMetrics/);
assert.match(engineSource, /previousSignalMetrics\.attempts >= 6/);

console.log("FREE_MULTISOURCE_DISCOVERY_OK signals=6 paid_providers=0 segment_guard=pass");
