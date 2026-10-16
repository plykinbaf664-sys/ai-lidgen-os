// Offline: summarize separate runs without cherry-picking their successful rows.
import { readFile, writeFile } from "node:fs/promises";
const read = async name => JSON.parse(await readFile(`.ai/${name}.json`, "utf8"));
const before = await read("research-final");
const broad = await read("research-oct08-final");
const confirmation = await read("research-oct08-confirmation");
const interrupted = await read("research-oct08-confirmation-rest");
const directBefore = await read("research-live2-direct");
const direct = await read("oct08-shared-search-direct");
const names = new Set(confirmation.records.map(row => row.name));
const matchedBefore = before.records.filter(row => names.has(row.name));
const count = (rows, select) => rows.reduce((sum, row) => sum + select(row), 0);
function metrics(rows) {
  const statuses = rows.flatMap(row => [...(row.bundle?.emails.personal ?? []), ...(row.bundle?.emails.inferred ?? [])]);
  return {
    companiesResearched: rows.filter(row => row.bundle).length,
    personCandidates: count(rows, row => row.bundle?.people.length ?? 0),
    confirmedPeople: count(rows, row => row.bundle?.people.filter(person => person.confidence === "VERIFIED").length ?? 0),
    companiesWithPersonalEmail: rows.filter(row => row.bundle?.bestOutreachContact?.classification === "VERIFIED_PERSONAL").length,
    VERIFIED: statuses.filter(email => email.classification === "VERIFIED_PERSONAL").length,
    HIGH_CONFIDENCE: statuses.filter(email => email.classification === "HIGH_CONFIDENCE_PERSONAL" || email.verification?.status === "HIGH_CONFIDENCE").length,
    PREDICTED: statuses.filter(email => email.verification?.status === "PREDICTED").length,
    departmentEmails: rows.filter(row => row.bundle?.bestOutreachContact?.classification === "DEPARTMENT").length,
    generalFallbackOnly: rows.filter(row => row.bundle?.bestOutreachContact?.classification === "GENERAL").length,
    publicProfiles: count(rows, row => row.bundle?.people.filter(person => Object.values(person.profiles).flat().some(Boolean)).length ?? 0),
    usableEmailContacts: rows.filter(row => row.bundle?.bestOutreachContact).length,
    Ready: rows.filter(row => row.contacts?.some(contact => contact.selected && contact.ready)).length,
    avgActions: +(count(rows, row => row.trace?.find(event => event.stage === "research_complete")?.actions ?? 0) / rows.length).toFixed(2),
    avgRuntimeSeconds: +(count(rows, row => row.runtimeMs) / rows.length / 1000).toFixed(2),
    falsePersonAttribution: "not independently measured across all people",
    falseVerifiedEmail: "0 observed in reviewed published personal addresses; not a delivery guarantee",
  };
}
const result = { historical16: metrics(before.records), fundedBroad16: metrics(broad.records),
  matchedBefore8: metrics(matchedBefore), confirmation8: metrics(confirmation.records),
  interruptedRemainder: { requested: interrupted.requestedCompanies, completed: interrupted.records.filter(row => row.bundle).length,
    skipped: interrupted.records.filter(row => row.blocked).length, reason: interrupted.benchmarkBlocked },
  directBefore: directBefore.discovery.metrics, directAfter: direct.discovery.metrics, directDownstream: direct.metrics,
  productionSmtpCalls: 0, orphanRequests: 0, verdict: "NOT READY" };
const cell = value => String(value ?? "—").replace(/\|/g, "/").replace(/\s+/g, " ");
const lines = ["# Funded research investigation — 2026-10-08", "", "## Verdict: NOT READY", "",
  "OpenAI was restored and real semantic runs executed. A new published personal address passed the complete researchCompany path. A later HTTP 429 / credit_balance_exhausted stopped further runs. This is a new exhaustion after successful paid work, not the old billing failure reused as an explanation.", "",
  "## Comparable measurements", "",
  "The historical input cohort has 16 companies (13 Business Signals, 2 Direct AI, 1 Kontur). All company/domain/signal inputs were reused unchanged. Input domains were not independently rediscovered in this research benchmark. research-oct08-final.json is a completed 16-company live run after initial repairs. After inspecting its traces, navigation memory, corporate cross-links, tracking URL normalization and direct search routing were repaired.", "",
  "The final confirmation cohort was selected before its execution: indices 0,1,4,5,6,9,12,15, covering earlier successes and failures. All eight finished without model errors. The remaining disjoint eight were attempted separately; two started and six were skipped after credit exhaustion. Do not combine successful rows into an artificial 16-company final PASS. The final registry-domain safety restriction was added during the confirmation run and is covered by regression tests; the three observed personal email results use direct corporate-page evidence, not that rejected registry route.", "",
  "| Metric | Historical 16 | Broad funded 16 | Matched BEFORE 8 | Latest AFTER 8 |",
  "|---|---:|---:|---:|---:|",
  ...Object.keys(result.historical16).map(key => `| ${key} | ${cell(result.historical16[key])} | ${cell(result.fundedBroad16[key])} | ${cell(result.matchedBefore8[key])} | ${cell(result.confirmation8[key])} |`), "",
  "Ready counts the existing contact/copy gate and includes general fallbacks. ConfirmedPeople requires the fetched VERIFIED tier; SERP candidates are separate. Public profile URLs are not automatically usable messaging endpoints. Predicted addresses are hypotheses, not usable contacts or verified emails. False attribution is not exhaustively measured; blanket zero is not claimed.", "",
  "## Root causes established from traces", "",
  "- Provider failures were hidden by successful empty fallback responses. Tavily returned HTTP 432 plan usage limit; free search often returned empty/irrelevant results. Quota cooldown and explicit incomplete-search errors now preserve the real failure. A bounded OpenAI web_search fallback returns cited search hints, which still require source fetches for email proof.",
  "- Direct AI non-HH bypassed the shared search chain and called exhausted Tavily directly. It now uses the same resilient general-web router. Latest non-HH results still predominantly contain suppliers and generic procurement pages, not current named buyers; they remain rejected.",
  "- Evidence was retrieved but lost between semantic rounds: origin navigation disappeared, secondary corporate domains were absent from model state, and aliases were unconfirmed downstream. Persistent navigation/domain context and mutual corporate root links now preserve that path. In broad run index 4, dm.polkin@ooospecmash.ru was extracted but rejected downstream; confirmation index 2 correctly reaches VERIFIED_PERSONAL and Ready.",
  "- A canonical role did not literally match its inflected source text. roleSourceText preserves the exact role evidence. Current department pages no longer require an additional current-year news story to establish the role, while old news alone remains insufficient.",
  "- Search citation tracking parameters disagreed with clean model-generated open URLs. Canonicalization removes only utm_* and preserves functional parameters. Contact claims trigger source opening; failed quotes get one bounded repair. New documents count as progress before person extraction.",
  "- Earlier initial/address matching could imply ownership. Ranked email hypotheses now require a confirmed current person and domain, are capped at five, and have separate VERIFIED/HIGH_CONFIDENCE/PREDICTED/REJECTED states. MX or catch-all acceptance alone cannot establish ownership. No SMTP probing is performed.", "",
  "## Latest confirmed company outcomes", "",
  "| Company | Signal | Best LPR | Role | Person confidence | Best contact | Contact type | Evidence | Research outcome |",
  "|---|---|---|---|---|---|---|---|---|"];
function companyRows(run) {
  return run.records.filter(row => row.bundle).map(row => {
    const best = row.bundle.bestOutreachContact;
    const person = row.bundle.people.find(person => person.fullName === best?.personName) ?? row.bundle.people[0];
    const profile = person && Object.values(person.profiles).flat().find(Boolean);
    const source = best?.sourceUrl ?? person?.evidence?.[0]?.sourceUrl;
    return `| ${cell(row.name)} | ${cell(row.signal.detail)} | ${cell(person?.fullName)} | ${cell(person?.role)} | ${cell(person?.confidence)} | ${cell(best?.email ?? profile)} | ${cell(best?.classification)} | ${source ? `[source](${source})` : "—"}; [trace](research-traces/${run.phase}-${row.index}.json) | ${best?.personName ? "Published personal email" : best ? "Corporate fallback only" : person ? "Person without usable email" : "Unresolved"}; ${row.contacts.some(contact => contact.selected && contact.ready) ? "Ready" : "not Ready"} |`;
  });
}
lines.push(...companyRows(confirmation), "", "## Completed broad run before final trace repairs", "",
  "| Company | Signal | Best LPR | Role | Person confidence | Best contact | Contact type | Evidence | Research outcome |",
  "|---|---|---|---|---|---|---|---|---|", ...companyRows(broad), "",
  "## Direct AI non-HH", "",
  `BEFORE: ${directBefore.discovery.metrics.nonHhAssessed} non-HH assessed, ${directBefore.discovery.metrics.nonHhCompanies} non-HH companies. AFTER shared-router repair: ${direct.discovery.metrics.jobsScanned} results, ${direct.discovery.metrics.assessed} assessed, ${direct.discovery.metrics.nonHhAssessed} non-HH assessed, ${direct.discovery.metrics.nonHhCompanies} accepted non-HH companies. ${direct.metrics.companies} accepted HH companies entered downstream, ${direct.metrics.personalEmails} personal emails, ${direct.metrics.ready} downstream Ready. Discovery-ready is not downstream Ready.`, "",
  "The latest 15 non-HH materials did not establish current buyer demand. Examples include AI solution vendor homepages and generic tender platforms, which correctly failed direct_intent_not_relevant. This remains a retrieval-quality failure, not proof that non-HH company resolution is solved. Latest full artifact: oct08-shared-search-direct.json. Its downstream modelCalls include the fresh credit_balance_exhausted response.", "",
  "## Verification and limitations", "",
  "npx tsc --noEmit PASS; npm run lint PASS; npm run build PASS (37 routes/pages); release regressions 33/33 PASS; git diff --check PASS. Build regenerated its artifacts normally; cleanup was not needed. No SMTP, real messages, secret/package/dependency changes, push, deploy or commit.", "",
  "Approval/queue/dry-run/follow-up remain covered by regressions. oct08-final-direct.json additionally exercised one single approval, one queued item, one dry-run delivery sink and one simulated-time follow-up during this funded iteration. Latest shared-router Direct run has zero Ready and is not an additional lifecycle PASS. Fresh Business discovery and Imported Base were not rerun after final research repairs; the shared production research path was exercised on the fixed cohort.", "",
  "Three personal addresses were reviewed against stored fetched-page citations: nik_aa@ipm.ru, dm.polkin@ooospecmash.ru, kotelnikov-dn@pk-kontur.ru. No false VERIFIED ownership observed among these three; no delivery/inbox guarantee is implied. Some other people have only SERP affiliation, phone channels are not extracted by this loop, and personal-contact coverage remains limited.", "",
  "External stop: OpenAI 429 credit_balance_exhausted in research-oct08-confirmation-rest.json and oct08-shared-search-direct.json. Six remaining cohort companies were skipped. No further paid requests after detecting that failure. Recorded usage estimates across funded Oct08 runs total about $5.50, excluding unrecorded early usage/aborted requests and any extra search-content billing; this is not an account billing statement.", "",
  "## Changed files in this funded continuation", "",
  "Research: iterative-people-research.ts, research-evidence.ts, lead-discovery-engine.ts, source-campaign-runner.ts. Search: search/leadgen-search-provider.ts, search/tavily-provider.ts, new search/openai-web-search-provider.ts; Direct routing: ai-hiring-live-canary.ts. Verification/harness: check-iterative-research.mjs, check-public-web-search.mjs, benchmark-research-loop.mjs, check-final-live.mjs, build-funded-research-report.mjs. Documentation: AGENTS.md, .ai/current-task.md, this report and metrics. Earlier uncommitted project changes were preserved.", "",
  "Reproduce offline: node scripts/check-release-regression.mjs; npx tsc --noEmit; npm run lint; npm run build. Live requires available provider capacity: node --experimental-transform-types --env-file=.env.local scripts/benchmark-research-loop.mjs <new-phase>; use LIVE_REPORT_PREFIX with check-final-live.mjs direct for isolated discovery. Suggested commit message: Fix research evidence retention and shared search fallback. No commit made.");
await writeFile(".ai/oct08-research-report.md", lines.join("\n") + "\n");
await writeFile(".ai/oct08-research-metrics.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify({ matchedBefore8: result.matchedBefore8, confirmation8: result.confirmation8, interrupted: result.interruptedRemainder }));
