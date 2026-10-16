import assert from "node:assert/strict";
import "./register-ts-paths.mjs";
const { validateResearchDecision, researchPeopleIteratively } = await import("../lib/leadgen/iterative-people-research.ts");
const { extractResearchPage, readResearchPage, linkedCompanyDomains, researchUrl } = await import("../lib/leadgen/research-evidence.ts");
assert.equal(researchUrl("https://fixture.example/team/?utm_source=openai#person"), researchUrl("https://fixture.example/team/"));
assert.notEqual(researchUrl("https://fixture.example/person?id=1"), researchUrl("https://fixture.example/person?id=2"), "Functional URL parameters must survive canonicalization");
const { getActiveAbortableOperationCount } = await import("../lib/network/abortable-operation.ts");

const quote = "Мария Иванова — руководитель лаборатории нового процесса. Публичный рабочий контакт: mi@research-fixture.example";
const doc = { id: "e1", kind: "page", url: "https://research-fixture.example/team/", text: quote, links: [], fetchedAt: new Date().toISOString() };
const citation = { sourceId: "e1", quote };
const origin = { ...doc, url: "https://fixture.example", links: [{ url: "https://alias.example", label: "Equipment" }] };
const alias = { ...doc, url: "https://alias.example/team", text: "Fixture Company employees", links: [{ url: origin.url, label: "Parts" }] };
assert.ok(linkedCompanyDomains([origin, alias], ["fixture.example"], "Fixture Company").includes("alias.example"));
assert.equal(linkedCompanyDomains([origin, { ...alias, links: [] }], ["fixture.example"], "Fixture Company").length, 1, "One-way link is not corporate identity proof");
assert.equal(linkedCompanyDomains([origin, { ...alias, kind: "search" }], ["fixture.example"], "Fixture Company").length, 1, "Search summary cannot prove corporate alias");
assert.equal(linkedCompanyDomains([{ ...origin, links: [{ url: "https://alias.example/company-profile", label: "Profile" }] }, alias], ["fixture.example"], "Fixture Company").length, 1, "A link to a hosted profile is not ownership of the platform domain");
const person = { entityType: "PERSON", name: "Мария Иванова", role: "руководитель лаборатории нового процесса", relevance: 92, reason: "Владеет процессом из сигнала",
  nameParts: { given: "Мария", family: "Иванова" }, currentRole: true,
  citations: [citation], contacts: [{ type: "email", value: "mi@research-fixture.example", citation }] };
const decision = { companySummary: "Fixture", missing: [], people: [person], officialDomains: [], actions: [], sufficient: true, stopReason: "evidence" };
const validate = value => validateResearchDecision(value, [doc], "Fixture", ["research-fixture.example"]);
const registry = { ...doc, id: "registry", url: "https://registry.example/company", text: "Fixture company registration details" };
assert.deepEqual(validateResearchDecision({ ...decision, people: [], officialDomains: [{ domain: "registry.example", citation: { sourceId: registry.id, quote: registry.text } }] },
  [doc, registry], "Fixture", ["research-fixture.example"]).domains, ["research-fixture.example"], "Mention of a company does not make a registry domain corporate");
assert.equal(validate(decision).people[0].work_email, "mi@research-fixture.example", "explicitly attributed opaque email is valid");
assert.equal(validate({ ...decision, people: [{ ...person, name: "Мария Петрова" }] }).people.length, 0);
assert.equal(validate({ ...decision, people: [{ ...person, entityType: "TEAM" }] }).people.length, 0, "department is not a person");
assert.equal(validate({ ...decision, people: [{ ...person, role: "генеральный директор" }] }).people.length, 0);
const inflectedQuote = "Мария Иванова назначена руководителем лаборатории нового процесса.";
const inflected = validateResearchDecision({ ...decision, people: [{ ...person, role: "руководитель лаборатории нового процесса",
  roleSourceText: "руководителем лаборатории нового процесса", citations: [{ sourceId: "e1", quote: inflectedQuote }], contacts: [] }] },
  [{ ...doc, text: inflectedQuote }], "Fixture", ["research-fixture.example"]);
assert.equal(inflected.people[0].role_title, "руководителем лаборатории нового процесса", "Preserve attested role inflection instead of rejecting semantic normalization");
assert.equal(validate({ ...decision, people: [{ ...person, roleSourceText: "основатель" }] }).people.length, 0, "Role surface must be in the actual citation");
assert.equal(validate({ ...decision, people: [{ ...person, relevance: 9 }] }).people.length, 0);
assert.equal(validate({ ...decision, people: [{ ...person, currentRole: false }] }).people.length, 0, "historical role is not a current employee");
assert.equal(validate({ ...decision, people: [{ ...person, contacts: [{ ...person.contacts[0], value: "invented@research-fixture.example" }] }] }).people[0].work_email, null);
assert.equal(validateResearchDecision(decision, [{ ...doc, kind: "search" }], "Fixture", ["research-fixture.example"]).people[0].work_email, null, "SERP email is not a fetched publication");
assert.equal(validateResearchDecision(decision, [{ ...doc, url: "https://other.example/team" }], "Unrelated Company", ["research-fixture.example"]).people.length, 0, "unrelated company cannot establish affiliation");
const html = Array.from({ length: 110 }, (_, i) => `<a href="/catalog/item/${i}">Product ${i}</a>`).join("") + '<a href="/contacts/">Contacts</a>';
assert.ok(extractResearchPage(html, doc.url).links.some(link => link.url.endsWith("/contacts")), "catalog must not hide navigation");
assert.match(extractResearchPage('<main>Company</main><footer><a href="mailto:info@fixture.example">Email us</a></footer>', doc.url).text,
  /info@fixture.example/, "footer and mailto evidence must survive extraction");

const originalFetch = globalThis.fetch;
const previousKey = process.env.OPENAI_API_KEY;
process.env.OPENAI_API_KEY = "test-only";
const states = [];
const urls = [];
let round = 0;
globalThis.fetch = async (url, init) => {
  urls.push(String(url));
  if (String(url).includes("api.openai.com")) {
    const state = JSON.parse(JSON.parse(init.body).input);
    states.push(state);
    const found = state.documents.find(d => d.kind === "search");
    const page = state.documents.find(d => d.kind === "page" && d.url.endsWith("/team/"));
    const value = round++ === 0 ? { ...decision, people: [], sufficient: false, actions: [{ type: "search", value: "Fixture process owner", focus: "", purpose: "Find owner" }] }
      : round === 2 ? { ...decision, sufficient: false, people: [{ ...person, contacts: [], citations: [{ sourceId: found.id, quote }] }], actions: [{ type: "open", value: found.url, focus: person.name, purpose: "Verify published contact" }] }
        : { ...decision, people: [{ ...person, citations: [{ sourceId: page.id, quote }], contacts: [{ ...person.contacts[0], citation: { sourceId: page.id, quote } }] }] };
    return new Response(JSON.stringify({ output_text: JSON.stringify(value) }));
  }
  if (String(url).endsWith("/team")) return new Response(null, { status: 301, headers: { location: "/team/" } });
  return new Response(String(url).endsWith("/team/") ? `<p>${quote}</p>` : '<p>Fixture company</p>', { headers: { "content-type": "text/html" } });
};
try {
  const pages = [];
  const result = await researchPeopleIteratively({ company: { company_name: "Fixture", company_domain: "research-fixture.example", metadata: {} }, decisionMaker: {} },
    { async search() { return [{ url: doc.url, title: "Fixture", snippet: quote, source_label: "fixture" }]; } }, undefined, documents => pages.push(...documents));
  assert.equal(result.candidates[0].work_email, "mi@research-fixture.example");
  assert.equal(states[2].knownPeople[0].name, person.name, "confirmed facts survive subsequent actions");
  assert.equal(states[2].siteNavigation.url, "https://research-fixture.example", "Origin navigation survives changes to visible evidence");
  assert.ok(states[2].confirmedDomains.includes("research-fixture.example"));
  assert.ok(states[2].emailCandidates.some(candidate => candidate.email === "mariya.ivanova@research-fixture.example"), "next semantic action sees hypotheses after identifying a current person");
  assert.ok(urls.includes(doc.url), "trailing slash redirect must terminate on exact HTTP target");
  assert.equal(pages.length, 2, "contact verification reuses fetched pages");
  const callsBeforeCache = urls.length;
  const cachedPages = [];
  const cached = await researchPeopleIteratively({ company: { company_name: "Fixture", company_domain: "research-fixture.example", metadata: {} }, decisionMaker: {} },
    { async search() { assert.fail("Successful person research must be reused"); } }, undefined, pages => cachedPages.push(...pages));
  assert.equal(cached.candidates[0].work_email, result.candidates[0].work_email);
  assert.equal(urls.length, callsBeforeCache, "Warm research makes zero model or web calls");
  assert.equal(cachedPages.length, 2, "Cached people retain original evidence for downstream validation");
  // Reproduce the historical METIZ transition: a later explicit currentRole=false
  // must retract the earlier accepted fact, not leave a stale recipient in memory.
  const secondQuote = "Ирина Соколова — руководитель лаборатории нового процесса.";
  const second = { ...person, name: "Ирина Соколова", nameParts: { given: "Ирина", family: "Соколова" }, relevance: 98, contacts: [] };
  const revisionStates = [];
  const revisions = [];
  globalThis.fetch = async (url, init) => {
    if (!String(url).includes("api.openai.com")) return new Response(`<p>${quote} ${secondQuote}</p>`, { headers: { "content-type": "text/html" } });
    const state = JSON.parse(JSON.parse(init.body).input);
    revisionStates.push(state);
    const people = [{ ...person, relevance: 65, contacts: [], citations: [{ sourceId: "e1", quote }] },
      { ...second, citations: [{ sourceId: "e1", quote: secondQuote }] }];
    const value = revisionStates.length === 1 ? { ...decision, people, actions: [{ type: "search", value: "Fixture current process owners", focus: "", purpose: "Confirm current affiliation" }] }
      : revisionStates.length === 2 ? { ...decision, people: people.map(p => ({ ...p, currentRole: false })),
        actions: [{ type: "search", value: "Fixture replacement process owners", focus: "", purpose: "Find a current owner" }] }
        : { ...decision, people: [], actions: [], stopReason: "No confirmed current owner" };
    return Response.json({ output_text: JSON.stringify(value) });
  };
  const revised = await researchPeopleIteratively({ bypassCache: true,
    company: { company_name: "Fixture", company_domain: "research-fixture.example", metadata: {} }, decisionMaker: {} },
    { async search() { return []; } }, event => revisions.push(event));
  assert.ok(revisionStates[1].emailCandidates.some(candidate => candidate.email === "irina.sokolova@research-fixture.example"), "Email research targets the relevant owner, not insertion order");
  assert.deepEqual(revisionStates[2].knownPeople, [], "Explicitly unconfirmed roles leave active context");
  assert.deepEqual(revisionStates[2].emailCandidates, [], "Retracted people cannot generate recipient hypotheses");
  assert.equal(revisions.filter(event => event.stage === "person_retracted").length, 2);
  assert.equal(revised.candidates.length, 0);
  const recoveryStates = [];
  let recoverySearches = 0;
  globalThis.fetch = async (url, init) => {
    if (!String(url).includes("api.openai.com")) return new Response("Unavailable", { status: 503 });
    const state = JSON.parse(JSON.parse(init.body).input);
    recoveryStates.push(state);
    const actions = recoveryStates.length === 1
      ? [{ type: "open", value: "https://research-fixture.example/guessed-team", focus: "", purpose: "Find team" }]
      : recoveryStates.length === 2 ? [{ type: "search", value: "Fixture current team", focus: "", purpose: "Discover a source" }] : [];
    return Response.json({ output_text: JSON.stringify({ ...decision, people: [], actions, sufficient: false, stopReason: "" }) });
  };
  await researchPeopleIteratively({ bypassCache: true,
    company: { company_name: "Fixture", company_domain: "research-fixture.example", metadata: {} }, decisionMaker: {} },
    { async search() { recoverySearches++; return []; } });
  assert.ok(recoveryStates[1].validationErrors.some(error => error.startsWith("open_url_not_in_evidence:")));
  assert.equal(recoverySearches, 1, "Failed homepage and invalid open must allow a corrective search, not silently stop");
  assert.equal(await readResearchPage("http://127.0.0.1/secrets"), null);
  assert.equal(getActiveAbortableOperationCount(), 0);
  let rejectedCalls = 0;
  globalThis.fetch = async () => {
    rejectedCalls++;
    return new Response(JSON.stringify({ error: { type: "insufficient_quota", code: "credit_balance_exhausted" } }), { status: 429 });
  };
  for (let i = 0; i < 2; i++) {
    const blocked = await researchPeopleIteratively({ company: { company_name: "Fixture", company_domain: "research-fixture.example", metadata: { discovery_context: { signal: "different billing fixture" } } }, decisionMaker: {} },
      { async search() { assert.fail("No research actions after billing failure"); } });
    assert.equal(blocked.metrics.stop_reason, "provider_credit_exhausted");
  }
  assert.equal(rejectedCalls, 1, "billing cooldown prevents repeated model calls across companies");
  console.log("ITERATIVE_RESEARCH_OK: evidence, attribution, adaptive actions, memory, shared pages, redirects, URL safety");
} finally {
  globalThis.fetch = originalFetch;
  if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey;
}
