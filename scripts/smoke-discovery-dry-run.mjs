import assert from "node:assert/strict";

const baseUrl = process.env.LEADGEN_SMOKE_BASE_URL ?? "http://localhost:3000";
const campaignsResponse = await fetch(`${baseUrl}/api/leadgen/campaigns`);
assert.equal(campaignsResponse.ok, true);
const campaigns = await campaignsResponse.json();
const latest = campaigns.campaigns[0];
assert.ok(latest);

const response = await fetch(`${baseUrl}/api/leadgen/run`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    name: latest.name,
    requestedBy: "production-dry-run-audit",
    searchProvider: "browser",
    market: "ru",
    dryRun: true,
  }),
});
const body = await response.json();
assert.equal(response.ok, true, JSON.stringify(body.error ?? body));
assert.equal(body.dry_run, true);
assert.ok(body.companies.length <= 50);
assert.equal(body.companies.length, body.leads.length);
console.log(JSON.stringify({
  mode: "dry_run_no_persistence_no_send",
  companies: body.companies.length,
  leads: body.leads.length,
  emails: body.production_discovery_stats?.new_unique_emails ?? 0,
  qualified_candidates_found: body.production_discovery_stats?.qualified_candidates_found ?? 0,
  enriched_candidates_checked: body.production_discovery_stats?.enriched_candidates_checked ?? 0,
  official_sites_found: body.production_discovery_stats?.official_sites_found ?? 0,
  enrichment_budget_exhausted:
    body.production_discovery_stats?.enrichment_budget_exhausted ?? false,
  results_received: body.production_discovery_stats?.results_received ?? 0,
  previously_discovered_skipped: body.production_discovery_stats?.previously_discovered_skipped ?? 0,
  target: body.search_settings?.lead_target ?? null,
}));
