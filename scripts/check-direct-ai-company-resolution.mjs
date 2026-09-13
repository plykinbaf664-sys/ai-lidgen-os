import assert from "node:assert/strict";
import "./register-ts-paths.mjs";

const { resolveDirectAiCompany } = await import("../lib/leadgen/direct-ai-company-resolution.ts");

const result = (url, title, snippet) => ({
  url, title, snippet, source_label: "test", score: 1,
  published_at: null, raw_content: null,
});
const assessment = (companyName) => ({
  id: "test", classification: "DIRECT", intentFamily: "ai_project",
  actionSummary: "Компания запускает AI-проект.",
  evidenceExcerpt: "Компания запускает AI-проект.",
  reason: "Публичное действие.", confidence: 90,
  freshness: "CURRENT", companyName, officialWebsite: null,
  identityEvidence: companyName ? `${companyName} запускает AI-проект.` : null,
});
const fakeFetch = async (input) => {
  const url = String(input);
  return {
    ok: true,
    url,
    text: async () => url.includes("target.ru")
      ? "<html><head><title>Компания Таргет — официальный сайт</title></head><body>Компания Таргет</body></html>"
      : "<html><head><title>Другая организация</title></head></html>",
  };
};
const provider = {
  async search() {
    return [result("https://target.ru", "Компания Таргет — официальный сайт", "Компания Таргет")];
  },
};

const direct = await resolveDirectAiCompany({
  result: result("https://target.ru/news/ai", "Компания Таргет запускает AI-проект", "Компания Таргет внедряет AI"),
  assessment: assessment("Компания Таргет"),
  documentText: "Компания Таргет внедряет AI в обработку заявок.",
  sourceIdentityText: "Компания Таргет — официальный сайт",
  searchProvider: provider,
  fetchImpl: fakeFetch,
});
assert.equal(direct.confidence, "VERIFIED");
assert.equal(direct.domain, "target.ru");
assert.equal(direct.searchQueries, 0);

const published = await resolveDirectAiCompany({
  result: result("https://news.example.ru/story", "Компания Таргет запускает AI-проект", "Компания Таргет внедряет AI"),
  assessment: assessment("Компания Таргет"),
  documentText: "Компания Таргет внедряет AI в обработку заявок.",
  searchProvider: provider,
  fetchImpl: fakeFetch,
});
assert.equal(published.confidence, "HIGH_CONFIDENCE");
assert.equal(published.domain, "target.ru");
assert.equal(published.searchQueries, 1);

const linked = await resolveDirectAiCompany({
  result: result("https://news.example.ru/story", "Компания Таргет запускает AI-проект", "Компания Таргет внедряет AI"),
  assessment: assessment("Компания Таргет"),
  documentText: "Компания Таргет внедряет AI в обработку заявок. https://target.ru/about",
  sourceIdentityText: "Редакция новостей",
  sourceLinks: ["https://target.ru/about"],
  searchProvider: provider,
  fetchImpl: async (input) => ({ ok: false, url: String(input), text: async () => "" }),
});
assert.equal(linked.confidence, "HIGH_CONFIDENCE");
assert.equal(linked.reason, "intent_page_link_and_independent_search_match");

const inventedIdentity = await resolveDirectAiCompany({
  result: result("https://news.example.ru/story", "AI-проект", "Новая система"),
  assessment: assessment("Компания Таргет"),
  documentText: "Компания внедряет AI.",
  searchProvider: provider,
  fetchImpl: fakeFetch,
});
assert.equal(inventedIdentity.confidence, "REJECTED");

const unrelated = await resolveDirectAiCompany({
  result: result("https://news.example.ru/story", "Компания Таргет запускает AI-проект", "Компания Таргет внедряет AI"),
  assessment: assessment("Компания Таргет"),
  documentText: "Компания Таргет внедряет AI в обработку заявок.",
  searchProvider: { async search() { return [result("https://other.ru", "Компания Таргет", "Компания Таргет")]; } },
  fetchImpl: fakeFetch,
});
assert.equal(unrelated.confidence, "UNCERTAIN");
assert.equal(unrelated.domain, null);

const anonymous = await resolveDirectAiCompany({
  result: result("https://news.example.ru/story", "AI-проект", "Неназванная компания"),
  assessment: assessment(null),
  documentText: "Неназванная компания внедряет AI.",
  searchProvider: provider,
  fetchImpl: fakeFetch,
});
assert.equal(anonymous.confidence, "REJECTED");

const editorial = await resolveDirectAiCompany({
  result: result("https://target.ru/article", "Компания Таргет: рынок AI", "Рынок внедряет AI."),
  assessment: { ...assessment("Компания Таргет"), identityEvidence: "Компания Таргет внедряет AI в закупки." },
  documentText: "Компания Таргет. Обзор рынка: другие компании внедряют AI.",
  sourceIdentityText: "Компания Таргет", searchProvider: provider, fetchImpl: fakeFetch,
});
assert.equal(editorial.confidence, "REJECTED", "an editorial site's brand cannot become the buyer without a real action quote");
assert.equal(editorial.reason, "company_action_not_evidenced_on_intent_page");
console.log("DIRECT_AI_COMPANY_RESOLUTION_OK");
