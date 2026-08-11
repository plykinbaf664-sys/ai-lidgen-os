import assert from "node:assert/strict";
import {
  compactCompanyForStorage,
  compactContactForStorage,
  compactContactsForStorage,
} from "../lib/leadgen/storage-compaction.ts";

const baseContact = {
  id: "contact-1",
  pipeline_run_id: "run-1",
  campaign_id: "campaign-1",
  company_id: "company-1",
  lead_id: "lead-1",
  contact_type: "generic_email",
  full_name: null,
  role_title: null,
  department: null,
  email: "info@company.ru",
  linkedin_url: null,
  telegram_url: null,
  contact_url: null,
  source_url: "https://company.ru/contacts",
  source_label: "official website",
  confidence_score: 90,
  is_primary: true,
  metadata: {
    entry_role: "best_outreach_entry",
    identity_profile: { raw: "large" },
    alternative_channels: [{ id: "other" }],
    alternative_channel_ids: ["other"],
    email_type: "general",
  },
  created_at: "2026-08-04T00:00:00.000Z",
};

const compactedContact = compactContactForStorage(baseContact);
assert.equal(compactedContact.metadata.identity_profile, undefined);
assert.equal(compactedContact.metadata.alternative_channels, undefined);
assert.equal(compactedContact.metadata.alternative_channel_ids, undefined);
assert.equal(compactedContact.metadata.email_type, "general");

const technicalContacts = [
  { ...baseContact, id: "form-low", email: null, is_primary: false, contact_type: "website_form", confidence_score: 30 },
  { ...baseContact, id: "form-best", email: null, contact_type: "website_form", confidence_score: 80 },
  { ...baseContact, id: "missing", email: null, contact_type: "no_contact_found" },
];
const compactedContacts = compactContactsForStorage(technicalContacts);
assert.deepEqual(compactedContacts.map((item) => item.id), ["form-best"]);

const company = compactCompanyForStorage({
  id: "company-1",
  pipeline_run_id: "run-1",
  campaign_id: "campaign-1",
  company_name: "Company",
  company_domain: "company.ru",
  company_segment: "B2B",
  source: "signal_pipeline",
  source_url: "https://company.ru",
  source_label: "official website",
  signal_type: "GROWTH_SIGNAL",
  discovery_query: null,
  matched_signal_count: 1,
  lead_score: 80,
  icp_fit_score: 80,
  confidence_score: 90,
  country: "RU",
  industry: "services",
  company_size: null,
  linkedin_url: null,
  metadata: {
    identity_profile: { raw: "large" },
    lead_ready_candidate: { raw: "large" },
    people_discovery: { all_candidates: Array.from({ length: 50 }, () => ({ snippet: "large" })) },
    contact_intelligence: { confidence: "HIGH", readiness: "contact_ready" },
    official_website: "https://company.ru",
    contact_discovery: {
      urls_inspected: Array.from(
        { length: 20 },
        (_, index) => `https://company.ru/${index}`,
      ),
    },
  },
  created_at: "2026-08-04T00:00:00.000Z",
  updated_at: "2026-08-04T00:00:00.000Z",
});
assert.equal(company.metadata.identity_profile, undefined);
assert.equal(company.metadata.lead_ready_candidate, undefined);
assert.equal(company.metadata.people_discovery, undefined);
assert.equal(company.metadata.contact_intelligence.confidence, "HIGH");
assert.equal(company.metadata.official_website, "https://company.ru");
assert.equal(company.metadata.contact_discovery.urls_inspected.length, 5);
assert.equal(company.metadata.contact_discovery.urls_inspected_count, 20);

console.log(JSON.stringify({ status: "OK", storage_compaction: "OK" }));
