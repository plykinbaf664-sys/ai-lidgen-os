import assert from "node:assert/strict";

const baseUrl = process.env.LEADGEN_SMOKE_BASE_URL ?? "http://localhost:3000";
const campaignsResponse = await fetch(`${baseUrl}/api/leadgen/campaigns`);
assert.equal(campaignsResponse.ok, true);
const campaignsBody = await campaignsResponse.json();
const latest = campaignsBody.campaigns[0];
assert.ok(latest);
const detailsResponse = await fetch(
  `${baseUrl}/api/leadgen/campaigns/details?pipelineRunId=${encodeURIComponent(latest.pipeline_run_id)}`,
);
assert.equal(detailsResponse.ok, true);
const detailsBody = await detailsResponse.json();
const details = detailsBody.details;
console.log(JSON.stringify({
  mode: "read_only_no_search_no_send",
  latest_campaign: {
    id_length: latest.id.length,
    created_at: latest.created_at,
    stored_status: latest.status,
    operational_status: latest.operational_status,
    companies_count: latest.companies_count,
    leads_count: latest.leads_count,
    contacts_count: latest.contacts_count,
    email_count: latest.email_count,
    discovery: details.campaign.production_discovery_stats ?? null,
    detail_counts: details.stats,
    event_types: details.events.map((event) => event.event_type),
  },
}, null, 2));
