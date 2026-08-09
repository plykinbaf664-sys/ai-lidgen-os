import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  canContinueDiscovery,
  DISCOVERY_PASS_BUDGET_MS,
  getDiscoveryPageOffset,
  mergeDiscoveryPassStats,
} from "../lib/leadgen/discovery-continuation.ts";

const pass = (emails, offset = 0) => ({
  results_received: 100,
  previously_discovered_skipped: 0,
  within_run_duplicates: 0,
  new_unique_companies: emails,
  new_unique_emails: emails,
  qualified_candidates_found: 20,
  lead_target: 50,
  email_target: 50,
  enriched_candidates_checked: 10,
  official_sites_found: 8,
  enrichment_budget_exhausted: true,
  search_page_offset: offset,
  search_budget: 1200,
  skip_reasons: {},
});

assert.equal(DISCOVERY_PASS_BUDGET_MS, 200_000);

const first = mergeDiscoveryPassStats({
  pass: pass(8),
  target: 50,
  pagesPerPass: 10,
});
assert.equal(first.new_unique_emails, 8);
assert.equal(first.passes_completed, 1);
assert.equal(first.next_page_offset, 0);
assert.equal(first.continuation_available, true);

const emptyOnce = mergeDiscoveryPassStats({
  previous: first,
  pass: pass(0, 10),
  target: 50,
  pagesPerPass: 10,
});
assert.equal(emptyOnce.consecutive_empty_passes, 0);
assert.equal(emptyOnce.continuation_available, true);
assert.equal(emptyOnce.next_page_offset, 0);

const completedPageEmptyOnce = mergeDiscoveryPassStats({
  previous: emptyOnce,
  pass: { ...pass(0, 10), enrichment_budget_exhausted: false },
  target: 50,
  pagesPerPass: 10,
});
const completedPageEmptyTwice = mergeDiscoveryPassStats({
  previous: completedPageEmptyOnce,
  pass: { ...pass(0, 20), enrichment_budget_exhausted: false },
  target: 50,
  pagesPerPass: 10,
});
assert.equal(completedPageEmptyTwice.search_exhausted, true);
assert.equal(completedPageEmptyTwice.continuation_available, false);

const completed = mergeDiscoveryPassStats({
  previous: first,
  pass: pass(42, 10),
  target: 50,
  pagesPerPass: 10,
});
assert.equal(completed.new_unique_emails, 50);
assert.equal(completed.target_reached, true);
assert.equal(completed.continuation_available, false);

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
const dashboard = await fs.readFile(
  "components/leadgen/leadgen-dashboard.tsx",
  "utf8",
);
assert.match(route, /appendPipelineResult/);
assert.match(route, /searchPageOffset/);
assert.match(dashboard, /Продолжить поиск до 50/);

console.log(
  "DISCOVERY_CONTINUATION_OK checkpoint=persistent target=50 empty_pass_guard=2",
);
