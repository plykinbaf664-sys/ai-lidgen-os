import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import "./register-ts-paths.mjs";

// Real public search/research, isolated operational storage, no delivery provider.
const isolated = await mkdtemp(path.join(tmpdir(), "leadgen-direct-ai-live-"));
process.env.LEADGEN_LOCAL_DATA_DIR = isolated;
process.env.EMAIL_TEST_MODE = "true";
for (const key of Object.keys(process.env)) {
  if (/SMTP|IMAP|TELEGRAM|SUPABASE/.test(key)) delete process.env[key];
}
try {
  const { runAiHiringLiveCanary } = await import("../lib/leadgen/ai-hiring-live-canary.ts");
  const { buildSourceRecords } = await import("../lib/leadgen/source-campaign-runner.ts");
  const { savePipelineResult } = await import("../lib/leadgen/storage.ts");
  const { syncOutreachQueue } = await import("../lib/leadgen/outreach-storage.ts");
  const { getActiveAbortableOperationCount } = await import("../lib/network/abortable-operation.ts");
  const live = await runAiHiringLiveCanary({});
  console.log(JSON.stringify({ stage: "search", planner: live.planner.status, metrics: live.metrics,
    accepted: live.accepted, sourceClasses: live.sourceClasses, rejected: live.rejected.map(r => ({ company: r.company, source: r.sourceUrl, reason: r.reason })) }));
  assert.equal(live.verticalId, null);
  const campaign = {
    id: `live-direct-${Date.now()}`, pipeline_run_id: `live-direct-${Date.now()}`,
    name: "Direct AI live final", requested_by: "isolated-live-benchmark",
    status: "completed", icp_label: "Прямой спрос на AI", offer_label: "Аудит / MVP",
    created_at: new Date().toISOString(),
  };
  const records = [];
  for (const item of live.accepted) {
    assert.ok(["VERIFIED", "HIGH_CONFIDENCE"].includes(item.companyIdentityConfidence));
    const record = await buildSourceRecords(campaign, {
      origin: "AI_HIRING", companyName: item.company,
      domain: new URL(item.officialWebsite).hostname, website: item.officialWebsite,
      segmentVerification: null, signalType: "AI_AUTOMATION_HIRING_SIGNAL",
      signalTitle: item.vacancyTitle, signalDetail: item.evidence ?? item.whyRelevant,
      signalSourceUrl: item.sourceUrl, signalConfidence: 85,
      email: item.contactEmail, emailKind: item.contactKind, emailSourceUrl: item.contactSourceUrl,
      terminology: live.planner.terminology,
    }, records.length);
    records.push(record);
    const research = record.company.metadata.company_research;
    console.log(JSON.stringify({ stage: "research", company: item.company,
      people: research?.people, bestContact: research?.bestOutreachContact, metrics: research?.metrics,
      contacts: record.contacts.map(c => ({ email: c.email, source: c.source_url,
        mx: c.metadata.email_mx_verified, classification: c.metadata.normalized_email_classification,
        quality: c.metadata.email_quality_gate_passed, body: c.metadata.email_body })) }));
  }
  const result = { campaign, companies: records.map(r => r.company), leads: records.map(r => r.lead),
    signals: records.map(r => r.signal), contacts: records.flatMap(r => r.contacts), events: [] };
  await savePipelineResult({ result, notifications: [] });
  const queue = await syncOutreachQueue(campaign.id);
  const aggregate = {
    results: live.metrics.jobsScanned, assessed: live.metrics.assessed,
    directIntent: live.metrics.semanticDirect, hhCompanies: live.metrics.hhCompanies,
    nonHhCompanies: live.metrics.nonHhCompanies, officialDomains: live.metrics.officialDomainsConfirmed,
    lpr: records.reduce((n, r) => n + (r.company.metadata.company_research?.people?.length ?? 0), 0),
    usableContacts: records.filter(r => r.company.metadata.company_research?.bestOutreachContact).length,
    ready: queue.filter(entry => entry.quality_gate_passed === true).length,
    manualCopyReview: queue.filter(entry => entry.quality_gate_passed !== true).length,
    orphanRequests: getActiveAbortableOperationCount(), productionSmtpCalls: 0,
    falseVerifiedEmails: result.contacts.filter(c => c.metadata.email_mx_verified === true && !c.source_url).length,
  };
  assert.equal(aggregate.orphanRequests, 0);
  assert.equal(aggregate.falseVerifiedEmails, 0);
  console.log(JSON.stringify({ stage: "final", aggregate }));
} finally {
  // Only the directory created by mkdtemp above; never business storage.
  await rm(isolated, { recursive: true, force: true });
}
