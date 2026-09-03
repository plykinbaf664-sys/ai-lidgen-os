import assert from "node:assert/strict";
import "./register-ts-paths.mjs";

process.env.LEADGEN_DISCOVERY_V2_ENABLED = "true";

const { collectSignalEvidence } = await import(
  "../lib/leadgen/signals/evidence-collector.ts"
);
const { buildLeadCandidates } = await import(
  "../lib/leadgen/signals/lead-candidate-builder.ts"
);
const { validateCommercialSignalCandidate } = await import(
  "../lib/leadgen/signals/commercial-signal-validator.ts"
);
const { verifyCompanySegment } = await import(
  "../lib/leadgen/segment-guard.ts"
);
const { getVerticalIcp } = await import("../lib/leadgen/verticals.ts");
const { isDiscoveryV2Enabled, normalizeDiscoverySourceKey } = await import(
  "../lib/leadgen/discovery-v2-config.ts"
);

assert.equal(normalizeDiscoverySourceKey("public-web:hh-web"), "hh-web");
assert.equal(normalizeDiscoverySourceKey("google-news"), "google-news");
delete process.env.LEADGEN_DISCOVERY_V2_ENABLED;
assert.equal(isDiscoveryV2Enabled(), true, "Discovery V2 must be enabled for new production runs");
process.env.LEADGEN_DISCOVERY_V2_ENABLED = "false";
assert.equal(isDiscoveryV2Enabled(), false, "Explicit false must remain a rollback switch");
process.env.LEADGEN_DISCOVERY_V2_ENABLED = "true";

const icp = getVerticalIcp("medicine");
const now = "2026-09-01T00:00:00.000Z";
const hhResult = {
  title: "Вакансия Руководитель отдела продаж — Медлайн",
  url: "https://hh.ru/vacancy/123",
  snippet:
    "Работодатель: Медлайн; открыта вакансия: Руководитель отдела продаж. Сеть медицинских центров.",
  source_label: "public-web:hh-api",
  source_key: "hh-api",
  score: 1,
  published_at: now,
  raw_content: null,
};
const hhEvidence = collectSignalEvidence({
  result: hhResult,
  signalType: "HIRING_SIGNAL",
  icp,
});
assert.equal(hhEvidence.company_extraction.company_name, "Медлайн");
assert.equal(hhEvidence.decision, "valid_signal");
assert.equal(hhEvidence.discovery_result_type, "company_with_signal");

const weakSnippet = collectSignalEvidence({
  result: {
    title: "Вакансия менеджера",
    url: "https://example-jobs.test/vacancy/42",
    snippet: "Работа в стабильной надежной компании федерального уровня.",
    source_label: "public-web:bing-rss",
    source_key: "bing-rss",
    score: 0.8,
    published_at: now,
    raw_content: null,
  },
  signalType: "HIRING_SIGNAL",
  icp,
});
assert.notEqual(
  weakSnippet.company_extraction.company_name,
  "Стабильной надежной компании федерального уровня",
);
assert.notEqual(weakSnippet.discovery_result_type, "company_with_signal");

const webResult = {
  title: "Клиника «Медлайн» открыла новый филиал в Казани",
  url: "https://rb.ru/news/medline-new-branch",
  snippet:
    "Клиника Медлайн открыла новый филиал. Медицинский центр расширил сеть в Казани.",
  source_label: "public-web:google-news",
  source_key: "google-news",
  score: 0.9,
  published_at: now,
  raw_content: null,
};
const webEvidence = collectSignalEvidence({
  result: webResult,
  signalType: "GROWTH_SIGNAL",
  icp,
});
assert.equal(webEvidence.company_extraction.company_name, "Медлайн");
assert.equal(webEvidence.company_extraction.matched_ru_pattern, "company_event_subject");
assert.equal(webEvidence.decision, "valid_signal");
assert.equal(webEvidence.commercial_signal?.type, "new_location");

const firstBranchEvidence = collectSignalEvidence({
  result: {
    title: "Клиника «Фомина» открыла первый филиал в Екатеринбурге",
    url: "https://news.example/clinic-fomina-branch",
    snippet: "Клиника «Фомина» открыла первый филиал в Екатеринбурге.",
    source_label: "public-web:google-news",
    source_key: "google-news",
    score: 0.9,
    published_at: now,
    raw_content: null,
  },
  signalType: "GROWTH_SIGNAL",
  icp,
});
assert.equal(firstBranchEvidence.company_extraction.company_name, "Фомина");
assert.equal(firstBranchEvidence.commercial_signal?.type, "new_location");
assert.equal(firstBranchEvidence.decision, "valid_signal");

const candidates = buildLeadCandidates([hhEvidence, webEvidence]).candidates;
assert.equal(candidates.length, 1, "HH + web evidence must resolve to one company");
assert.equal(candidates[0].company_name, "Медлайн");
assert.equal(candidates[0].signals.length, 2);

const contactSignal = validateCommercialSignalCandidate({
  text: "Контакты: info@example.ru, +7 900 000-00-00, адрес офиса.",
  sourceUrl: "https://example.ru/contacts",
  confidence: 90,
});
assert.equal(contactSignal, null, "contact page must not become a signal");

const mismatch = verifyCompanySegment({
  selectedSegment: "medicine",
  companyName: "СтройМонтаж",
  companySegment: "строительная компания",
  industry: "строительство промышленных объектов",
  officialWebsite: "https://stroymontazh.example",
  signalTitle: "Компания открыла новый производственный участок",
  signalSummary: "Строительная компания расширяет производство",
  signalEvidence: "СтройМонтаж строит промышленные объекты",
  discoveryQuery: "строительная компания",
});
assert.equal(mismatch.match, "MISMATCH");

process.stdout.write(
  "DISCOVERY_SOURCE_EXTRACTION_OK hh=preserved web=extracted dedup=passed segment=guarded\n",
);
