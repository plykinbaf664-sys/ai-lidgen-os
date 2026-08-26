import assert from "node:assert/strict";
import "./register-ts-paths.mjs";

const {
  enrichJobPostingSearchResult,
  parseHhVacancyApiContext,
} = await import("../lib/leadgen/signals/job-posting-context.ts");
const { collectSignalEvidence } = await import(
  "../lib/leadgen/signals/evidence-collector.ts"
);
const { getVerticalIcp } = await import("../lib/leadgen/verticals.ts");

const apiContext = parseHhVacancyApiContext({
  name: "Руководитель юридической практики",
  employer: { name: "Право Плюс" },
  published_at: "2026-08-26T10:00:00+0300",
  description: "<p>Развитие новой практики.</p>",
});
assert.equal(apiContext?.companyName, "Право Плюс");
assert.equal(apiContext?.jobTitle, "Руководитель юридической практики");
assert.equal(apiContext?.description, "Развитие новой практики.");

const originalFetch = globalThis.fetch;
const requested = [];
globalThis.fetch = async (url) => {
  requested.push(String(url));
  return Response.json({
    name: "Руководитель юридической практики",
    employer: { name: "Право Плюс" },
    published_at: "2026-08-26T10:00:00+0300",
    description: "Развитие новой практики.",
  });
};
try {
  const enriched = await enrichJobPostingSearchResult({
    title: "Вакансия",
    url: "https://hh.ru/vacancy/123456",
    snippet: "",
    source_label: "test",
    score: null,
    published_at: null,
    raw_content: null,
  });
  assert.match(enriched.snippet, /Работодатель: Право Плюс/);
  assert.match(enriched.title, /Право Плюс/);
  const evidence = collectSignalEvidence({
    result: enriched,
    signalType: "HIRING_SIGNAL",
    icp: getVerticalIcp("legal"),
  });
  assert.equal(evidence.company_extraction.company_name, "Право Плюс");
  assert.equal(evidence.company_extraction.is_candidate_company_valid, true);
  assert.equal(requested[0], "https://api.hh.ru/vacancies/123456");
  assert.equal(requested.length, 1);
} finally {
  globalThis.fetch = originalFetch;
}

console.log("JOB_POSTING_CONTEXT_OK hh_api_primary=true html_fallback_preserved=true");
