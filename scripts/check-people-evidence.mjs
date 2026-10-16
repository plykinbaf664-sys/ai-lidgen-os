import assert from "node:assert/strict";
import "./register-ts-paths.mjs";
const { validatePeopleAssessment } = await import("../lib/leadgen/people-evidence-agent.ts");

const quote = "Компания Атлас: Ренат Ахметов — куратор цифровых процессов. Ренат Ахметов: renat@atlas.example.";
const documents = [{ url: "https://atlas.example/team", text: quote }];
const person = { name: "Ренат Ахметов", role: "куратор цифровых процессов", sourceUrl: documents[0].url,
  quote, email: "renat@atlas.example", emailSourceUrl: documents[0].url, emailQuote: quote,
  relevance: 91, reasoning: "Владеет исследуемым процессом." };
const check = person => validatePeopleAssessment({ people: [person], nextQueries: [] }, documents).people;
assert.equal(check(person).length, 1, "A role outside the title whitelist remains eligible");
assert.equal(check({ ...person, sourceUrl: `${person.sourceUrl}/`, emailSourceUrl: `${person.emailSourceUrl}/` })[0].email, person.email, "Trailing slash normalization preserves exact source evidence");
assert.equal(check({ ...person, name: "Иван Иванов" }).length, 0, "Invented person rejected");
assert.equal(check({ ...person, role: "генеральный директор" }).length, 0, "Invented role rejected");
assert.equal(check({ ...person, sourceUrl: "https://invented.example" }).length, 0, "Invented source rejected");
assert.equal(check({ ...person, quote: "Ренат Ахметов — куратор цифровых процессов в другой компании." }).length, 0);
assert.equal(check({ ...person, email: "r.akhmetov@atlas.example" })[0].email, null, "Generated email is not evidence");
assert.equal(check({ ...person, emailQuote: "renat@atlas.example" })[0].email, null, "Email alone does not prove ownership");
assert.equal(check({ ...person, relevance: 30 }).length, 0, "Irrelevant person rejected");
const hyphenQuote = quote.replaceAll("renat@", "r-akhmetov@");
assert.equal(validatePeopleAssessment({ people: [{ ...person, quote: hyphenQuote, emailQuote: hyphenQuote, email: "r-akhmetov@atlas.example" }] },
  [{ ...documents[0], text: hyphenQuote }]).people[0].email, "r-akhmetov@atlas.example", "Published hyphenated email survives quote normalization");
console.log("PASS semantic people: evidence, unfamiliar role, fabricated identity/contact/source rejection");
