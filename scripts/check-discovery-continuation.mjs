import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  canContinueDiscovery,
  DISCOVERY_EMPTY_PASS_LIMIT,
  DISCOVERY_MAX_PASSES,
  DISCOVERY_PAGES_PER_QUERY_PER_PASS,
  DISCOVERY_PASS_BUDGET_MS,
  getDiscoveryPageOffset,
  mergeDiscoveryPassStats,
} from "../lib/leadgen/discovery-continuation.ts";

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

assert.equal(DISCOVERY_PASS_BUDGET_MS, 160_000);
assert.equal(DISCOVERY_MAX_PASSES, 30);
assert.equal(DISCOVERY_EMPTY_PASS_LIMIT, 3);
assert.equal(DISCOVERY_PAGES_PER_QUERY_PER_PASS, 1);

const first = mergeDiscoveryPassStats({
  pass: pass(8),
  target: 50,
  pagesPerPass: 10,
});
assert.equal(first.email_ready_companies, 8);
assert.equal(first.contact_ready_people, 3);
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
assert.equal(completedPageEmptyTwice.search_exhausted, false);
assert.equal(completedPageEmptyTwice.continuation_available, true);
const completedPageEmptyThrice = mergeDiscoveryPassStats({
  previous: completedPageEmptyTwice,
  pass: { ...pass(0, 30), enrichment_budget_exhausted: false },
  target: 50,
  pagesPerPass: 10,
});
assert.equal(completedPageEmptyThrice.search_exhausted, true);
assert.equal(completedPageEmptyThrice.continuation_available, false);

const completed = mergeDiscoveryPassStats({
  previous: first,
  pass: pass(42, 10),
  target: 50,
  pagesPerPass: 10,
});
assert.equal(completed.new_unique_emails, 50);
assert.equal(completed.email_ready_companies, 50);
assert.equal(completed.contact_ready_people, 6);
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
const legacyWithoutBudgetFlag = {
  ...brokenLegacyCheckpoint,
  enrichment_budget_exhausted: false,
};
assert.equal(getDiscoveryPageOffset(legacyWithoutBudgetFlag, 10), 0);
assert.equal(canContinueDiscovery(legacyWithoutBudgetFlag), true);

const route = await fs.readFile("app/api/leadgen/run/route.ts", "utf8");
const dashboard = await fs.readFile("components/leadgen/leadgen-dashboard.tsx", "utf8");
const signalPipeline = await fs.readFile("lib/leadgen/signals/signal-pipeline.ts", "utf8");
assert.match(route, /appendPipelineResult/);
assert.match(route, /emailReadyTarget/);
assert.match(route, /DISCOVERY_PAGES_PER_QUERY_PER_PASS/);
assert.match(signalPipeline, /deadlineAt/);
assert.match(signalPipeline, /deadline_reached/);
assert.match(route, /knownPersonKeys/);
assert.match(dashboard, /Продолжить поиск до 50 компаний/);
assert.match(dashboard, /Готовые компании/);
assert.match(dashboard, /discovery\.email_ready_companies \?\? discovery\.new_unique_emails/);
assert.match(dashboard, /discovery\.email_ready_target \?\? discovery\.email_target \?\? 50/);
assert.match(dashboard, /setDiscovery\(null\)/);
assert.match(dashboard, /completedTarget/);
assert.match(dashboard, /discoveryIncomplete/);
assert.match(dashboard, /Прромежуточные карточки|Промежуточные/);
assert.match(dashboard, /campaignDetails\?\.leads\.length/);

console.log("DISCOVERY_CONTINUATION_OK checkpoint=persistent email_ready_target=50 personal_lpr_is_quality_metric empty_pass_guard=3 max_passes=30");
