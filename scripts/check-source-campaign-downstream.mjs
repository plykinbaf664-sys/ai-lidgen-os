import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  classifyEvidenceBackedEmail,
  getContactLevel,
} from "../lib/leadgen/contact-quality.ts";

const runner = await readFile(
  new URL("../lib/leadgen/source-campaign-runner.ts", import.meta.url),
  "utf8",
);
const emailDiscovery = await readFile(
  new URL("../lib/leadgen/email-discovery-engine.ts", import.meta.url),
  "utf8",
);
const discovery = await readFile(
  new URL("../lib/leadgen/lead-discovery-engine.ts", import.meta.url),
  "utf8",
);
const researchAgent = await readFile(
  new URL("../lib/leadgen/company-research-agent.ts", import.meta.url),
  "utf8",
);

const researchIndex = runner.indexOf("researchCompany(");
const persistenceIndex = runner.indexOf("savePipelineResult({");

assert.ok(researchIndex >= 0, "AI_HIRING and IMPORTED must execute shared company research");
assert.ok(
  persistenceIndex > researchIndex,
  "source campaign must persist only after downstream contact processing",
);
assert.match(discovery, /researchCompany\(/, "DISCOVERY must execute shared company research");
assert.match(researchAgent, /new PeopleDiscoveryEngine/, "shared research must execute LPR discovery");
assert.match(researchAgent, /new ContactEnrichmentEngine/, "shared research must execute contact discovery");
assert.match(researchAgent, /evaluateAdaptiveContactIntelligence/, "shared research must execute evidence/readiness evaluation");
assert.match(
  runner,
  /const confirmedEmail = uniqueContacts[\s\S]+\.filter\(isConfirmedOutreachEmail\)/,
  "source runner must select one evidence-confirmed email before queue sync",
);

const fallbackClassification = classifyEvidenceBackedEmail({
  email: "info@company.ru",
  officialDomain: "company.ru",
  confirmedPerson: false,
  directPersonEvidence: false,
});
assert.equal(fallbackClassification, "GENERAL");
assert.deepEqual(
  getContactLevel({
    confirmedPerson: false,
    classification: fallbackClassification,
  }),
  { level: "E", ready: true },
  "qualified company with a real general mailbox must stay Ready without an LPR",
);

assert.match(emailDiscovery, /resolveMxOverHttps/);
assert.match(emailDiscovery, /code === "ENODATA" \|\| code === "ENOTFOUND"/);
assert.match(emailDiscovery, /"mx_unavailable"/);
assert.doesNotMatch(
  emailDiscovery,
  /resolveMx\(domain\)[\s\S]{0,120}\.catch\(\(\) => false\)/,
  "DNS transport failures must not be classified as missing MX",
);

console.log(JSON.stringify({
  status: "PASS",
  source_runner_downstream: true,
  lpr_is_not_hard_gate: true,
  level_e_ready: true,
  dns_transport_failure_is_not_mx_missing: true,
}));
