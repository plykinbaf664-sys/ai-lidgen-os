import assert from "node:assert/strict";
import fs from "node:fs/promises";
import "./register-ts-paths.mjs";

const {
  canContinueDiscovery,
  DISCOVERY_EMPTY_PASS_LIMIT,
  DISCOVERY_MAX_PASSES,
  DISCOVERY_MAX_SEARCH_CURSORS,
  DISCOVERY_PROVIDER_PAGE_WINDOW,
  DISCOVERY_PAGES_PER_QUERY_PER_PASS,
  DISCOVERY_PASS_BUDGET_MS,
  getDiscoveryPageOffset,
  getDiscoverySearchCursor,
  mergeDiscoveryPassStats,
} = await import("../lib/leadgen/discovery-continuation.ts");

const pass = (contacts, offset = 0) => ({
  results_received: 100,
  previously_discovered_skipped: 0,
  within_run_duplicates: 0,
  new_unique_companies: contacts,
  new_unique_emails: contacts,
  email_ready_companies: contacts,
  email_ready_target: 50,
  contact_ready_people: Math.min(contacts, 3),
  contact_ready_target: 20,
  qualified_candidates_found: 50,
  lead_target: 50,
  email_target: 50,
  enriched_candidates_checked: 10,
  official_sites_found: 8,
  enrichment_budget_exhausted: true,
  search_page_offset: offset,
  search_budget: 1200,
  skip_reasons: {},
});

assert.equal(DISCOVERY_PASS_BUDGET_MS, 240_000);
assert.equal(DISCOVERY_MAX_PASSES, 30);
assert.equal(DISCOVERY_MAX_SEARCH_CURSORS, 500);
assert.equal(DISCOVERY_PROVIDER_PAGE_WINDOW, 10);
assert.ok(DISCOVERY_EMPTY_PASS_LIMIT >= 1);
assert.equal(DISCOVERY_PAGES_PER_QUERY_PER_PASS, 1);

const first = mergeDiscoveryPassStats({ pass: pass(8), target: 50, pagesPerPass: 10 });
assert.equal(first.email_ready_companies, 8);
assert.equal(first.next_page_offset, 10);
assert.equal(first.continuation_available, true);

let lowYield = first;
for (let index = 0; index < DISCOVERY_EMPTY_PASS_LIMIT; index += 1) {
  lowYield = mergeDiscoveryPassStats({
    previous: lowYield,
    pass: pass(0, lowYield.next_page_offset ?? 0),
    target: 50,
    pagesPerPass: 10,
  });
}
assert.equal(lowYield.diminishing_return_passes, DISCOVERY_EMPTY_PASS_LIMIT);
assert.equal(lowYield.search_exhausted, true);
assert.equal(lowYield.continuation_available, false);
assert.equal(lowYield.stop_reason, "diminishing_returns");
assert.equal(canContinueDiscovery(lowYield), false);
assert.ok((lowYield.next_page_offset ?? 0) > (first.next_page_offset ?? 0));

const passBudgetExhausted = mergeDiscoveryPassStats({
  previous: {
    ...lowYield,
    passes_completed: DISCOVERY_MAX_PASSES - 1,
    consecutive_empty_passes: 0,
    stop_reason: null,
    search_exhausted: false,
  },
  pass: pass(1, lowYield.next_page_offset ?? 0),
  target: 50,
  pagesPerPass: 10,
});
assert.equal(passBudgetExhausted.search_exhausted, true);
assert.equal(passBudgetExhausted.continuation_available, false);
assert.equal(passBudgetExhausted.stop_reason, "pass_budget_exhausted");

const completed = mergeDiscoveryPassStats({
  previous: first,
  pass: pass(42, 10),
  target: 50,
  pagesPerPass: 10,
});
assert.equal(completed.email_ready_companies, 50);
assert.equal(completed.target_reached, true);
assert.equal(completed.continuation_available, false);
assert.equal(completed.stop_reason, "target_reached");

assert.deepEqual(getDiscoverySearchCursor(0), {
  cursor: 0,
  providerPage: 0,
  queryExpansion: "",
  wave: 0,
});
assert.equal(getDiscoverySearchCursor(10).providerPage, 0);
assert.equal(getDiscoverySearchCursor(499).providerPage, 9);
assert.equal(getDiscoveryPageOffset(pass(8), 10), 10);

const brokenLegacyCheckpoint = {
  ...pass(3, 20),
  passes_completed: 3,
  next_page_offset: 30,
  search_exhausted: true,
  continuation_available: false,
  qualified_candidates_found: 173,
  enriched_candidates_checked: 10,
};
assert.equal(getDiscoveryPageOffset(brokenLegacyCheckpoint, 10), 0);
assert.equal(canContinueDiscovery(brokenLegacyCheckpoint), true);

const route = await fs.readFile("app/api/leadgen/run/route.ts", "utf8");
const dashboard = await fs.readFile("components/leadgen/leadgen-dashboard.tsx", "utf8");
const engine = await fs.readFile("lib/leadgen/lead-discovery-engine.ts", "utf8");
const signalPipeline = await fs.readFile("lib/leadgen/signals/signal-pipeline.ts", "utf8");
assert.match(route, /aggregateStats\.target_reached === true/);
assert.match(route, /raw_candidates/);
assert.match(signalPipeline, /discoverySearchConcurrency/);
assert.match(signalPipeline, /diminishing_return/);
assert.match(engine, /prefilterCandidate/);
assert.match(engine, /getCandidateResearchPriority/);
assert.match(engine, /discoveryResearchConcurrency/);
assert.match(dashboard, /discovery\.unique_candidates/);
assert.match(dashboard, /discovery\.prefiltered_candidates/);
assert.match(dashboard, /campaignDetails=\{campaignDetails\}/);

console.log(
  "DISCOVERY_CONTINUATION_OK cursor_advances=true empty_pass_stops=true target_stop=true",
);
