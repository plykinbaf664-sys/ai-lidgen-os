import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [page, dashboard, modes, ingestion, analytics, styles] = await Promise.all([
  read("app/leadgen/page.tsx"),
  read("components/leadgen/leadgen-dashboard.tsx"),
  read("components/leadgen/campaign-mode-selector.tsx"),
  read("components/leadgen/lead-source-ingestion.tsx"),
  read("app/leadgen/analytics/page.tsx"),
  read("app/globals.css"),
]);

assert.match(page, /href="\/leadgen\/analytics"/);
assert.match(analytics, /href="\/leadgen"/);
assert.match(dashboard, /\/leadgen\?campaign=/);
assert.match(dashboard, /\/leadgen\/analytics\?campaign=/);
assert.match(dashboard, /addEventListener\("popstate"/);

for (const mode of ["DISCOVERY", "AI_HIRING", "IMPORTED"]) {
  assert.match(modes, new RegExp(`id: "${mode}"`));
}

assert.match(ingestion, /className="lead-source-file-input"/);
assert.match(ingestion, /className="lead-source-upload" htmlFor=\{fileInputId\}/);
assert.match(styles, /\.campaign-mode-card:has\(input:focus-visible\)/);
assert.match(styles, /\.campaign-mode-card input\s*\{[\s\S]*?opacity:\s*0/);
assert.match(styles, /\.lead-source-file-input\s*\{[\s\S]*?clip-path:\s*inset\(50%\)/);
assert.match(styles, /@media \(max-width: 1180px\)/);
assert.match(styles, /@media \(max-width: 980px\)/);
assert.match(styles, /@media \(max-width: 720px\)/);

for (const label of ["Период", "Источник", "Сегмент", "Кампания", "Тип сигнала"]) {
  assert.ok(analytics.includes(`<span>${label}</span>`), `missing analytics filter: ${label}`);
}

const userFacingSources = `${page}\n${dashboard}\n${modes}\n${ingestion}\n${analytics}`;
for (const forbidden of [
  ">Ready<",
  ">Review mode<",
  ">Production<",
  ">Preview<",
  ">Enrichment<",
  ">Web search<",
  ">Hiring Signal<",
]) {
  assert.ok(!userFacingSources.includes(forbidden), `technical UI copy remains: ${forbidden}`);
}

console.log(JSON.stringify({
  status: "LEADGEN_UI_NAVIGATION_OK",
  campaignModes: 3,
  analyticsFilters: 5,
  nativeRadioVisible: false,
  nativeFileInputVisible: false,
  navigation: ["campaigns", "analytics", "campaign deep link", "back/forward"],
}));
