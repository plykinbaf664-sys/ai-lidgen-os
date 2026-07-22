import assert from "node:assert/strict";

const {
  PublicWebSearchProvider,
  parseBraveSearchHtml,
  parseHhSearchHtml,
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

console.log("Public web search checks: OK");
