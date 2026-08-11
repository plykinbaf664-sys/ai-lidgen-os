import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  getBulkApprovalBaseReason,
  getConfirmedOfficialWebsite,
  getOutreachSkipReason,
  isCanonicalOutreachWorkItem,
} from "../lib/leadgen/outreach-working-set.ts";

const company = (overrides = {}) => ({
  id: "company-1",
  pipeline_run_id: "run-1",
  campaign_id: "campaign-1",
  company_name: "Компания",
  company_domain: "company.ru",
  company_segment: "target",
  source: "web",
  source_url: "https://company.ru/",
  source_label: "Official",
  signal_type: "hiring",
  discovery_query: null,
  matched_signal_count: 1,
  lead_score: 80,
  icp_fit_score: 80,
  confidence_score: 90,
  country: "RU",
  industry: null,
  company_size: null,
  linkedin_url: null,
  metadata: {
    official_website: "https://company.ru",
    official_website_status: "confirmed",
  },
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

const entry = (overrides = {}) => ({
  id: "outreach-1",
  contact_id: "contact-1",
  lead_id: "lead-1",
  campaign_id: "campaign-1",
  company_id: "company-1",
  company_name: "Компания",
  company_website: "https://company.ru/",
  recipient_name: null,
  recipient_role: null,
  email: "sales@company.ru",
  normalized_recipient_email: "sales@company.ru",
  email_type: "generic_email",
  email_source_url: "https://company.ru/contacts",
  email_source_label: "Контакты",
  readiness: "email_ready",
  signal: {},
  subject: "Идея для компании",
  body: "Короткое корректное письмо.",
  message_mode: "generic_email",
  message_version: 1,
  status: "needs_review",
  idempotency_key: "key",
  send_attempts: 0,
  last_error: null,
  provider: null,
  provider_message_id: null,
  smtp_response: null,
  sent_copy_saved_at: null,
  sent_copy_error: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  approved_at: null,
  queued_at: null,
  scheduled_at: null,
  next_attempt_at: null,
  sending_started_at: null,
  sent_at: null,
  failed_at: null,
  approval_invalidated_reason: null,
  copy_quality: {},
  quality_gate_passed: true,
  copy_review_status: "ready",
  generation_attempts: 1,
  micro_value: null,
  queue_position: null,
  follow_up_due_at: null,
  follow_up_status: null,
  history: [],
  message_kind: "initial",
  parent_outreach_id: null,
  followup_number: null,
  parent_smtp_message_id: null,
  reply_check_status: "pending",
  reply_checked_at: null,
  reply_detected_at: null,
  reply_message_id: null,
  reply_from: null,
  reply_subject: null,
  reply_detection_method: null,
  generation_reason: null,
  skip_reason: null,
  ...overrides,
});

assert.equal(getConfirmedOfficialWebsite(company())?.startsWith("https://company.ru"), true);
assert.equal(
  getConfirmedOfficialWebsite(
    company({
      company_domain: null,
      source_url: "https://hh.ru/vacancy/1",
      metadata: { official_website_status: "not_found" },
    }),
  ),
  null,
);
assert.equal(isCanonicalOutreachWorkItem(entry()), true);
assert.equal(isCanonicalOutreachWorkItem(entry({ company_website: null })), false);
assert.equal(isCanonicalOutreachWorkItem(entry({ email: "" })), false);
assert.equal(
  isCanonicalOutreachWorkItem(entry({ email: "fonts.gst@ic.com" })),
  false,
);
assert.equal(
  isCanonicalOutreachWorkItem(
    entry({ email: "api.wh@sapp.com", status: "sent" }),
  ),
  true,
);
assert.equal(isCanonicalOutreachWorkItem(entry({ body: "" })), false);
assert.equal(isCanonicalOutreachWorkItem(entry({ message_kind: "follow_up" })), false);
assert.equal(getBulkApprovalBaseReason(entry()), null);
assert.equal(getBulkApprovalBaseReason(entry({ status: "approved" })), "already_approved");
assert.equal(getBulkApprovalBaseReason(entry({ status: "queued" })), "already_queued");
assert.equal(getBulkApprovalBaseReason(entry({ status: "sent" })), "already_sent");
assert.equal(getBulkApprovalBaseReason(entry({ status: "failed" })), "failed_requires_retry");
assert.equal(
  getBulkApprovalBaseReason(entry({ email: "api.wh@sapp.com" })),
  "technical_email_artifact",
);
assert.equal(
  getBulkApprovalBaseReason(entry({ quality_gate_passed: false })),
  "quality_gate_failed",
);
assert.equal(
  getBulkApprovalBaseReason(entry({ copy_review_status: "needs_manual_copy_review" })),
  "manual_review_required",
);
assert.equal(
  getOutreachSkipReason(
    company({ metadata: { official_website_status: "not_found" }, company_domain: null, source_url: null }),
    false,
    false,
  ),
  "official_site_missing",
);
assert.equal(getOutreachSkipReason(company(), false, false), "email_not_found");
assert.equal(getOutreachSkipReason(company(), false, true), null);
assert.equal(getOutreachSkipReason(company(), true, false), "outreach_not_created");
assert.equal(getOutreachSkipReason(company(), true, true), null);

const mixedEntries = [
  entry(),
  entry({ id: "invalid-site", company_website: null }),
  entry({ id: "follow-up", message_kind: "follow_up" }),
  entry({ id: "sent", status: "sent" }),
];
assert.deepEqual(
  mixedEntries.filter(isCanonicalOutreachWorkItem).map((item) => item.id),
  ["outreach-1", "sent"],
);
assert.equal(
  mixedEntries
    .filter(isCanonicalOutreachWorkItem)
    .filter((item) => getBulkApprovalBaseReason(item) === null).length,
  1,
);

const componentSource = readFileSync(
  new URL("../components/leadgen/email-outreach-queue.tsx", import.meta.url),
  "utf8",
);
const outreachRouteSource = readFileSync(
  new URL("../app/api/leadgen/outreach/route.ts", import.meta.url),
  "utf8",
);
const runRouteSource = readFileSync(
  new URL("../app/api/leadgen/run/route.ts", import.meta.url),
  "utf8",
);

assert.match(componentSource, /function PrimaryOutreachToolbar/);
assert.match(componentSource, /eligibleCount === 0/);
assert.match(
  componentSource,
  /outreachSummary\?\.initial\.eligibleForBulkApproval/,
);
assert.match(componentSource, /await load\(\);\s+setMessage\("Письмо одобрено/);
assert.match(componentSource, /<details className="outreach-missing-contacts">/);
assert.match(outreachRouteSource, /await syncOutreachQueue\(campaignId\)/);
assert.match(runRouteSource, /await syncOutreachQueue\(enrichedResult\.campaign\.id\)/);
assert.match(componentSource, /className="daily-dispatch-panels"/);
assert.match(componentSource, /setOutreachSummary\(data\.summary\)/);
assert.match(componentSource, /Одобрено, но не в очереди/);
assert.match(componentSource, />Новые компании</);
assert.match(componentSource, />Дожимы</);
assert.match(componentSource, />Сегодня</);
assert.match(componentSource, /Не входит в лимит 100 первичных писем/);
assert.match(componentSource, /Одобрено всего:/);
assert.match(componentSource, /Можно отправить сегодня/);
assert.match(componentSource, /Останется\s+одобренными на следующий день/);
assert.match(componentSource, /Запустить первичные/);
assert.match(componentSource, /Запустить дожимы|Отправить одобренные дожимы/);

console.log("Outreach working-set regression checks: OK (41 assertions)");
