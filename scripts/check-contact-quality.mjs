import assert from "node:assert/strict";
import {
  classifyEvidenceBackedEmail,
  getContactLevel,
  isSyntacticallyUsableEmail,
} from "../lib/leadgen/contact-quality.ts";
import { emailLocalMatchesPerson } from "../lib/leadgen/person-email-evidence.ts";

const classify = (email, overrides = {}) => classifyEvidenceBackedEmail({
  email,
  officialDomain: "company.ru",
  confirmedPerson: false,
  ...overrides,
});

assert.equal(classify("app.support@company.ru"), "GENERAL");
assert.equal(classify("sales.team@company.ru"), "DEPARTMENT");
assert.equal(classify("name.surname@company.ru"), "GENERAL");
assert.equal(classify("otzyv@company.ru", {
  confirmedPerson: true,
  directPersonEvidence: true,
}), "GENERAL");
assert.equal(classify("feedback@company.ru", {
  confirmedPerson: true,
  directPersonEvidence: true,
}), "GENERAL");
assert.equal(classify("name.surname@company.ru", {
  confirmedPerson: true,
  directPersonEvidence: true,
}), "VERIFIED_PERSONAL");
assert.equal(classify("name.surname@company.ru", {
  confirmedPerson: true,
  generatedFromPattern: true,
  patternSupport: 2,
  mxVerified: true,
}), "HIGH_CONFIDENCE_PERSONAL");
assert.equal(classify("name.surname@company.ru", {
  confirmedPerson: true,
  generatedFromPattern: true,
  patternSupport: 1,
}), "INFERRED_PERSONAL");
assert.equal(classify("%20name.surname@company.ru"), "INVALID");
assert.equal(isSyntacticallyUsableEmail("%20name@company.ru"), false);
assert.equal(emailLocalMatchesPerson("m.petrov@company.ru", "Мария Петрова"), true);
assert.equal(emailLocalMatchesPerson("otzyv@company.ru", "Мария Петрова"), false);

assert.deepEqual(getContactLevel({
  confirmedPerson: true,
  classification: "VERIFIED_PERSONAL",
}), { level: "A", ready: true });
assert.deepEqual(getContactLevel({
  confirmedPerson: true,
  classification: "HIGH_CONFIDENCE_PERSONAL",
}), { level: "B", ready: true });
assert.deepEqual(getContactLevel({
  confirmedPerson: true,
  classification: "INFERRED_PERSONAL",
}), { level: null, ready: false });
assert.deepEqual(getContactLevel({
  confirmedPerson: true,
  classification: "DEPARTMENT",
  relevantDepartment: false,
}), { level: "D", ready: true });
assert.deepEqual(getContactLevel({
  confirmedPerson: false,
  classification: "GENERAL",
}), { level: "E", ready: true });

console.log(JSON.stringify({ status: "PASS", fallback_level_ready: true }));
