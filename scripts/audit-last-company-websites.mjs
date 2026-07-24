import assert from "node:assert/strict";

const baseUrl = process.env.LEADGEN_SMOKE_BASE_URL ?? "http://localhost:3000";
const campaignsResponse = await fetch(`${baseUrl}/api/leadgen/campaigns`);
assert.equal(campaignsResponse.ok, true, "Campaign list is unavailable");
const campaignsBody = await campaignsResponse.json();
const latest = campaignsBody.campaigns?.[0];
assert.ok(latest, "No saved campaign found");

const detailsResponse = await fetch(
  `${baseUrl}/api/leadgen/campaigns/details?pipelineRunId=${encodeURIComponent(latest.pipeline_run_id)}`,
);
assert.equal(detailsResponse.ok, true, "Latest campaign details are unavailable");
const detailsBody = await detailsResponse.json();
const details = detailsBody.details;

const blockedHosts = new Set([
  "hh.ru",
  "headhunter.ru",
  "avito.ru",
  "vc.ru",
  "spark-interfax.ru",
  "rusprofile.ru",
  "linkedin.com",
  "crunchbase.com",
]);

function hostname(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function isBlocked(value) {
  const host = hostname(value);
  return Boolean(
    host &&
      [...blockedHosts].some(
        (blocked) => host === blocked || host.endsWith(`.${blocked}`),
      ),
  );
}

const companies = details.companies.map((company) => {
  const signals = details.signals.filter(
    (signal) => signal.company_id === company.id,
  );
  const contacts = details.contacts.filter(
    (contact) => contact.company_id === company.id,
  );
  const emailContacts = contacts.filter((contact) => Boolean(contact.email));
  const officialWebsite =
    company.metadata?.official_website ??
    (company.company_domain ? `https://${company.company_domain}` : null);
  const contactSources = [
    ...new Set(contacts.map((contact) => contact.source_url).filter(Boolean)),
  ];
  const contactSearchUsedBlockedSource = contactSources.some(isBlocked);
  const reason = !officialWebsite
    ? contactSearchUsedBlockedSource
      ? "official_site_missing_contact_search_used_signal_source"
      : "official_site_not_found"
    : emailContacts.length === 0
      ? "email_not_found_on_official_site"
      : "email_found_on_official_site";

  return {
    company: company.company_name,
    commercial_signal_source: signals[0]?.source_url ?? null,
    official_website: officialWebsite,
    contact_source: emailContacts[0]?.source_url ?? contactSources[0] ?? null,
    email_found: emailContacts.length > 0,
    reason,
  };
});

const summary = {
  found: companies.length,
  discarded:
    details.campaign.production_discovery_stats?.results_received -
      details.campaign.production_discovery_stats?.new_unique_companies || 0,
  official_sites_found: companies.filter((item) => item.official_website).length,
  official_sites_not_found: companies.filter((item) => !item.official_website)
    .length,
  invalid_official_sites: companies.filter(
    (item) => item.official_website && isBlocked(item.official_website),
  ).length,
  emails_found: companies.filter((item) => item.email_found).length,
  emails_not_found: companies.filter((item) => !item.email_found).length,
};

console.log(
  JSON.stringify(
    {
      mode: "read_only_no_search_no_persistence_no_send",
      campaign_created_at: latest.created_at,
      summary,
      companies,
    },
    null,
    2,
  ),
);
