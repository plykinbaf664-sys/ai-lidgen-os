import assert from "node:assert/strict";
import "./register-ts-paths.mjs";

const { MarketAwareSearchProvider } = await import("../lib/leadgen/search/leadgen-search-provider.ts");
const { TavilySearchProvider } = await import("../lib/leadgen/search/tavily-provider.ts");
const { parseCitedSearchResults } = await import("../lib/leadgen/search/openai-web-search-provider.ts");
const summary = "Named person, Director of Example [1]";
const cited = parseCitedSearchResults([{ content: [{ type: "output_text", text: summary, annotations: [
  { type: "url_citation", url: "https://example.com/team", title: "Team", start_index: summary.indexOf("[1]"), end_index: summary.length },
] }] }], 5);
assert.equal(cited[0].url, "https://example.com/team");
assert.equal(cited[0].raw_content, null, "Search synthesis is not a fetched page");
assert.match(cited[0].snippet, /fetch source before confirming/);
assert.equal(parseCitedSearchResults([{ content: [{ type: "output_text", text: "Invented https://example.com/email", annotations: [] }] }], 5).length, 0);
assert.equal(parseCitedSearchResults([{ content: [{ type: "output_text", text: summary, annotations: [
  { type: "url_citation", url: "http://127.0.0.1/private", start_index: 0, end_index: 5 },
] }] }], 5).length, 0);
const originalFetch = globalThis.fetch;
let quotaCalls = 0;
globalThis.fetch = async () => { quotaCalls++; return new Response('{"detail":{"error":"plan usage limit"}}', { status: 432 }); };
try {
  const mixed = new MarketAwareSearchProvider({ slots: [
    { name: "browser", provider: { async search() { return []; } } },
    { name: "tavily", provider: new TavilySearchProvider("fixture-quota-only") },
  ] });
  await assert.rejects(mixed.search({ query: "First search" }), /Search incomplete.*432/);
  await assert.rejects(mixed.search({ query: "Second search" }), /Search incomplete.*cooldown/);
  assert.equal(quotaCalls, 1, "An empty fallback must not hide quota or repeatedly call the exhausted account");
} finally { globalThis.fetch = originalFetch; }
const generalOrder = [];
const generalProvider = new MarketAwareSearchProvider({ slots: [
  { name: "browser", provider: { async search() { assert.fail("General-web fallback should not stop on unrelated free-index results"); } } },
  { name: "tavily", provider: { async search() { generalOrder.push("tavily"); throw new Error("432 plan exhausted"); } } },
  { name: "openai-web", provider: { async search() { generalOrder.push("openai"); return cited; } } },
] });
assert.equal((await generalProvider.search({ query: "Company demand", searchTopic: "general" }))[0].url, cited[0].url);
assert.deepEqual(generalOrder, ["tavily", "openai"], "Direct AI uses the shared resilient web search chain");

process.env.LEADGEN_DISCOVERY_V2_ENABLED = "true";

const {
  PublicWebSearchProvider,
  parseBraveSearchHtml,
  parseHhSearchHtml,
  parseHhApiSearch,
  parseYahooSearchHtml,
} = await import("../lib/leadgen/search/public-web-search-provider.ts");

const yahooFixture = `
  <a href="https://r.search.yahoo.com/x/RU=https%3A%2F%2Fexample.com%2Fnews/RK=2/RS=x">
    <h3>Компания открыла новый филиал</h3>
  </a>
  <p>Новый офис компании начал работу в Москве.</p>
`;
const braveFixture = `
  <div class="snippet" data-type="web">
    <a href="https://example.org/jobs">
      <div class="title search-snippet-title">Компания расширяет отдел продаж</div>
    </a>
    <div class="generic-snippet">
      <div class="content">Открыты вакансии для 12 менеджеров.</div>
    </div>
  </div>
`;
const hhFixture = `
  <a data-qa="serp-item__title" href="https://hh.ru/vacancy/123?from=search">
    <span data-qa="serp-item__title-text">Менеджер по продажам</span>
  </a>
`;

assert.equal(parseYahooSearchHtml(yahooFixture)[0]?.url, "https://example.com/news");
assert.equal(parseBraveSearchHtml(braveFixture)[0]?.url, "https://example.org/jobs");
assert.equal(parseHhSearchHtml(hhFixture)[0]?.url, "https://hh.ru/vacancy/123");
assert.deepEqual(parseHhApiSearch({
  items: [{
    id: "456",
    name: "Руководитель отдела продаж",
    employer: { name: "Завод Тест" },
    alternate_url: "https://hh.ru/vacancy/456",
    snippet: { requirement: "B2B продажи" },
  }],
})[0], {
  title: "Вакансия Руководитель отдела продаж — Завод Тест",
  url: "https://hh.ru/vacancy/456",
  snippet: "Работодатель: Завод Тест; открыта вакансия: Руководитель отдела продаж. B2B продажи",
});

const requests = [];
const provider = new PublicWebSearchProvider({
  minRequestIntervalMs: 0,
  sources: ["yahoo", "brave"],
  fetchImpl: async (url) => {
    requests.push(String(url));
    if (String(url).includes("search.yahoo.com")) {
      return new Response("blocked", { status: 429 });
    }
    return new Response(braveFixture, { status: 200 });
  },
});

const input = {
  query: "компания расширяет продажи",
  maxResults: 5,
  page: 2,
  market: "ru",
  queryLanguage: "ru",
};
const first = await provider.search(input);
const second = await provider.search(input);

assert.equal(first.length, 1);
assert.equal(first[0].source_label, "public-web:brave");
assert.equal(first[0].source_key, "brave");
assert.deepEqual(second, first);
assert.equal(requests.length, 2, "identical searches must use the in-memory cache");
assert.ok(requests[0].includes("b=21"), "Yahoo pagination must advance");
assert.ok(requests[1].includes("offset=2"), "Brave pagination must advance");
assert.ok(
  requests.every((url) => !url.includes("api") && !url.includes("key=")),
  "browser mode must not call a search API",
);

const emptyProvider = new PublicWebSearchProvider({
  minRequestIntervalMs: 0,
  sources: ["yahoo"],
  fetchImpl: async () => new Response(yahooFixture, { status: 200 }),
});
assert.deepEqual(
  await emptyProvider.search({ query: "несвязанный запрос" }),
  [],
  "a valid empty result must not fail the whole discovery run",
);

const strictProvider = new PublicWebSearchProvider({
  minRequestIntervalMs: 0,
  sources: ["bing-rss"],
  fetchImpl: async () => new Response(`
    <rss><channel>
      <item><title>Новый канал — официальный сайт</title><link>https://novy.tv/</link><description>Новый сезон телешоу.</description></item>
      <item><title>Медлайн открыл новый офис медицинского центра</title><link>https://medline.example/news/office</link><description>Новый офис медицинского центра начал работу.</description></item>
    </channel></rss>
  `, { status: 200 }),
});
const strictResults = await strictProvider.search({
  query: '"новый офис" медицинский центр -википедия',
  queryLanguage: "ru",
});
assert.deepEqual(strictResults.map((result) => result.url), [
  "https://medline.example/news/office",
]);

console.log("Public web search checks: OK");
