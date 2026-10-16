import assert from "node:assert/strict";
import "./register-ts-paths.mjs";
const { buildPersonalEmailCandidates, assessPersonalEmailCandidate } = await import("../lib/leadgen/personal-email-research.ts");
const { isConfirmedOutreachEmail, evaluateAdaptiveContactIntelligence } = await import("../lib/leadgen/adaptive-contact-intelligence.ts");
const person = (given, family, email = null) => ({ full_name: `${family} ${given}`, role_title: "Director", work_email: email,
  confidence_score: 90, evidence: [], metadata: { name_parts: { given, family }, current_role_confirmed: true,
    company_verified: true, public_contact_verified: Boolean(email) } });
const target = person("Иван", "Петров");
const peers = [person("Ольга", "Соколова", "olga.sokolova@fixture.example"), person("Анна", "Иванова", "anna.ivanova@fixture.example")];
const candidates = buildPersonalEmailCandidates(target, "fixture.example", peers);
assert.equal(candidates[0].email, "ivan.petrov@fixture.example", "Name order comes from structured semantic evidence");
assert.equal(candidates[0].patternSupport, 2);
assert.ok(candidates.length <= 5);
assert.ok(buildPersonalEmailCandidates(target, "fixture.example", []).length > 0, "Pattern is optional for hypotheses");
assert.equal(buildPersonalEmailCandidates({ ...target, metadata: { ...target.metadata, current_role_confirmed: false } }, "fixture.example", []).length, 0);
assert.equal(buildPersonalEmailCandidates({ ...target, metadata: { ...target.metadata, name_parts: { given: "Invented", family: "Name" } } }, "fixture.example", []).length, 0);
assert.equal(buildPersonalEmailCandidates(target, "fixture.example", [peers[0], peers[0]])[0].patternSupport, 1, "Duplicate evidence is not independent pattern support");
assert.ok(!buildPersonalEmailCandidates(target, "fixture.example", [person("Игорь", "Петров", "i.petrov@fixture.example")])
  .some(candidate => candidate.email === "i.petrov@fixture.example"), "Do not propose a mailbox explicitly owned by a different employee");
assert.equal(assessPersonalEmailCandidate(candidates[0], [], "present").status, "PREDICTED", "MX+pattern is not mailbox ownership");
assert.equal(assessPersonalEmailCandidate(candidates[0], [], "missing").status, "REJECTED");
const doc = { kind: "page", url: "https://fixture.example/contacts", text: "Published ivan.petrov@fixture.example", links: [] };
assert.equal(assessPersonalEmailCandidate(candidates[0], [doc], "present").status, "HIGH_CONFIDENCE");
assert.equal(assessPersonalEmailCandidate(candidates[0], [{ ...doc, kind: "search" }], "present").status, "PREDICTED");
assert.equal(assessPersonalEmailCandidate(candidates[0], [{ ...doc, url: "https://unrelated.example" }], "present").status, "PREDICTED");
assert.equal(assessPersonalEmailCandidate(candidates[0], [{ ...doc, text: "not.ivan.petrov@fixture.example" }], "present").status, "PREDICTED");
assert.equal(assessPersonalEmailCandidate(candidates[0], [doc], "unavailable").status, "PREDICTED");
assert.equal(assessPersonalEmailCandidate(candidates[0], [doc], "present").catchAll, "unknown");
assert.equal(assessPersonalEmailCandidate(candidates[0], [doc], "present").status === "VERIFIED", false);
const contact = { email: candidates[0].email, contact_type: "work_email", full_name: target.full_name, role_title: target.role_title,
  source_url: doc.url, confidence_score: 95, metadata: { email_status: "personal_email_ready", email_mx_verified: true,
    email_domain_match_reason: "official_domain", normalized_email_classification: "INFERRED_PERSONAL" } };
assert.equal(isConfirmedOutreachEmail(contact), false, "Predicted mailbox cannot be promoted by stale ready metadata");
const result = await evaluateAdaptiveContactIntelligence({ company: { company_name: "Fixture", company_domain: "fixture.example" },
  decisionMaker: { alternative_personas: [] }, peopleDiscovery: { primary_person: target, alternative_people: [] },
  contactDiscovery: { contacts: [contact], official_website: "https://fixture.example", fallback_entry: null }, verifyMx: async () => true });
assert.notEqual(result.email_classification, "VERIFIED_PERSONAL", "Name/address spelling is not ownership evidence");
console.log("PERSONAL_EMAIL_RESEARCH_OK: bounded hypotheses, name order, evidence, MX, catch-all unknown, no false verified or queue promotion");
