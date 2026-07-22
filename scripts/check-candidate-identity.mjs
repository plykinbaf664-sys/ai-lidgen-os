import assert from "node:assert/strict";

const { getCompanyIdentity, getDuplicateReason, getLeadCandidateIdentity } = await import(
  "../lib/leadgen/company-identity.ts"
);

const firstEmployer = getLeadCandidateIdentity({
  company_name: "Альфа Клиника",
  company_domain: null,
  region: "ru",
});
const secondEmployer = getLeadCandidateIdentity({
  company_name: "Бета Производство",
  company_domain: null,
  region: "ru",
});
const officialDomain = getLeadCandidateIdentity({
  company_name: "Альфа Клиника",
  company_domain: "alpha-clinic.ru",
  region: "ru",
});

assert.notEqual(firstEmployer.identityKey, secondEmployer.identityKey);
assert.equal(firstEmployer.normalizedDomain, null);
assert.equal(secondEmployer.normalizedDomain, null);
assert.ok(firstEmployer.identityKey.startsWith("name-region:"));
assert.equal(officialDomain.identityKey, "domain:alpha-clinic.ru");
assert.notEqual(firstEmployer.identityKey, "domain:hh.ru");

const historicalJobBoardIdentity = getCompanyIdentity({
  company_name: "Источник вакансий",
  company_domain: "hh.ru",
});
assert.equal(getDuplicateReason(firstEmployer, historicalJobBoardIdentity), null);
assert.equal(getDuplicateReason(secondEmployer, historicalJobBoardIdentity), null);

console.log("Candidate identity checks: OK");
