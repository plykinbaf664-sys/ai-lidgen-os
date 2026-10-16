import { readFile, writeFile } from "node:fs/promises";
const read = async name => JSON.parse(await readFile(`.ai/${name}.json`, "utf8"));
const baseline = (await Promise.all(["business", "direct", "person"].map(mode => read(`final-live-${mode}`))));
const before = baseline.flatMap(r => r.companies.map(c => ({ name: c.company_name, bundle: c.metadata.company_research,
  runtimeMs: c.metadata.company_research.metrics.totalMs })));
const complete = await read("research-final");
const latest = await read("research-verified");
const direct = await read("research-live2-direct");
const cell = value => String(value ?? "—").replace(/\|/g, "/").replace(/\s+/g, " ");
const metrics = rows => ({
  companies: rows.length,
  people: rows.reduce((n, r) => n + (r.bundle?.people.length ?? 0), 0),
  fetchedVerifiedPeople: rows.reduce((n, r) => n + (r.bundle?.people.filter(p => p.confidence === "VERIFIED").length ?? 0), 0),
  personalCorporateEmails: rows.filter(r => r.bundle?.bestOutreachContact?.classification === "VERIFIED_PERSONAL").length,
  departmentEmails: rows.filter(r => r.bundle?.bestOutreachContact?.classification === "DEPARTMENT").length,
  generalOnly: rows.filter(r => r.bundle?.bestOutreachContact?.classification === "GENERAL").length,
  publicProfiles: rows.reduce((n, r) => n + (r.bundle?.people.filter(p => Object.values(p.profiles).flat().some(Boolean)).length ?? 0), 0),
  usableEmailContacts: rows.filter(r => r.bundle?.bestOutreachContact).length,
  readyCopyGate: rows.filter(r => r.contacts?.some(c => c.selected && c.ready)).length,
  avgActions: +(rows.reduce((n, r) => n + (r.trace?.find(t => t.stage === "research_complete")?.actions ?? 0), 0) / rows.length).toFixed(2),
  avgSeconds: +(rows.reduce((n, r) => n + r.runtimeMs, 0) / rows.length / 1000).toFixed(1),
  companiesWith429: rows.filter(r => r.trace?.some(t => t.stage === "model" && t.status === 429)).length,
});
const bm = metrics(before), cm = metrics(complete.records), lm = metrics(latest.records);
bm.readyCopyGate = baseline.reduce((n, r) => n + r.metrics.ready, 0);
bm.avgActions = null;
const lines = ["# Research quality: 2026-10-06", "", "## Verdict: NOT READY", "",
  "External stop: repeated HTTP 429 / insufficient_quota / credit_balance_exhausted on full research and outreach requests. Exact error is preserved in research-live2-direct.json:modelCalls. A tiny 11-token diagnostic request subsequently returned 200; this does not establish that full research is available. No further paid benchmark was started after inspecting the billing errors.", "",
  "## Comparable cohort", "",
  "16 fixed inputs: 13 previous Business Signals companies, 2 previous Direct AI companies, and the previously successful targeted Kontur case. Company, supplied official domain and signal were reused unchanged. This is a research benchmark, not 16 independently discovered new leads. The supplied domain is an input assumption; the benchmark does not re-prove discovery identity from scratch.", "",
  "Full pre-quota AFTER = research-final.json (16 results, no HTTP 429). Latest attempted AFTER = research-verified.json (16 results, 9 companies affected by 429). These are separate runs; successful rows are not cherry-picked into a synthetic result. The latest run finished before the final entity-type guard, evidence URL binding and credit cooldown were added. Those final changes have local regression coverage, not another live pass.", "",
  "| Metric | BEFORE (historical) | AFTER, full pre-quota | AFTER, latest quota-affected |",
  "|---|---:|---:|---:|",
  ...Object.keys(bm).map(key => `| ${key} | ${bm[key] ?? "not recorded"} | ${cm[key]} | ${lm[key]} |`), "",
  "Counts need interpretation: people includes HIGH_CONFIDENCE SERP candidates; it is not the count of confirmed current LPRs. fetchedVerifiedPeople is the stronger fetched-page tier. Earlier baseline Kontur had the wrong merged role. Latest people includes one erroneous department-as-person (BKK), so only 10 of its 11 candidates are named humans. Final entity-type validation now rejects teams. Two pre-quota public profile records include one registry page, which is not a usable messaging channel. usableEmailContacts counts company-level best verified email routes, including fallbacks; Ready is the copy gate, not a personal-contact quality pass.", "",
  "False person attribution: 1 explicit non-person accepted in the latest attempted run; other company/current-role ambiguity remains unmeasured, so a blanket zero is not claimed. False verified email: 0 observed for the 2 explicitly attributed personal emails in the full pre-quota run. An earlier after2 run upgraded ab@arcontrade.am using initials without a named publication; that result is not accepted as verified evidence. The final loop disables that upgrade. Orphan requests: 0 in all completed benchmark reports. Production SMTP calls: 0.", "",
  "## Company outcomes — full pre-quota AFTER", "",
  "Source references below are the citations returned in that run. The final serializer additionally binds each quote to its own source URL rather than zipping separate URL and quote arrays.", "",
  "| Company | Signal | Best LPR | Role | Person confidence | Best contact | Contact type | Evidence | Research outcome |",
  "|---|---|---|---|---|---|---|---|---|"];
for (const r of complete.records) {
  const best = r.bundle?.bestOutreachContact;
  const person = r.bundle?.people.find(p => p.fullName === best?.personName) ?? r.bundle?.people[0];
  const profile = person ? Object.values(person.profiles).flat().find(Boolean) : null;
  const source = best?.sourceUrl ?? person?.evidence?.[0]?.sourceUrl;
  const outcome = best?.personName ? "Published personal email" : best ? "Corporate fallback only" : profile ? "Public profile; email absent" : person ? "Person found; usable contact absent" : "No person/contact";
  lines.push(`| ${cell(r.name)} | ${cell(r.signal.title)} | ${cell(person?.fullName)} | ${cell(person?.role)} | ${cell(person?.confidence)} | ${cell(best?.email ?? profile)} | ${cell(best?.classification ?? (profile ? "public profile" : null))} | ${source ? `[source](${source})` : "—"}; [trace](research-traces/final-${r.index}.json) | ${outcome} |`);
}
lines.push("", "## Latest quota-affected attempt", "", "| Company | People | Best email | HTTP 429 | Stop |", "|---|---:|---|---|---|");
for (const r of latest.records) lines.push(`| ${cell(r.name)} | ${r.bundle?.people.length ?? 0} | ${cell(r.bundle?.bestOutreachContact?.email)} | ${r.trace.some(t => t.stage === "model" && t.status === 429)} | ${cell(r.trace.find(t => t.stage === "research_complete")?.stopReason)} |`);
lines.push("", "## Trace-supported root causes and changes", "",
  "- Semantic evidence discarded by score-scale mismatch (7–9 vs 0–100), paraphrased quotations, and subsequent empty assessments overwriting prior facts. The iterative loop validates exact cited facts, feeds rejection reasons back, and retains accepted facts.",
  "- Heuristic owner=CEO/founder contaminated the plan. On IPM the official contacts page already contained named commercial leaders with emails, while the model continued CEO searches. The loop now uses signal + offer to choose the process owner. Controlled diagnostics on identical IPM/Kontur inputs: full model selected both personal emails; mini selected only Kontur. No default-model readiness claim follows from those two cases.",
  "- Top SERP hits disappeared because only the tail of a combined result list reached the next round. Recent queries now each retain their top hits. Search hits can be opened; later queries use newly discovered people and validation feedback.",
  "- Product navigation crowded out useful links; canonical URL keys caused trailing-slash redirect loops; footer/mailto evidence was removed. Link diversity, exact redirect targets and footer/mailto preservation address these losses.",
  "- Contacts restarted a speculative crawler after research. Fetched official pages now feed the existing domain/MX validator. This also exposed incomplete page coverage: fallback reach fell in the pre-quota run; later footer preservation recovered part of it. No claim that fallback coverage is fully restored.",
  "- Initial matching could promote an unassigned email to VERIFIED_PERSONAL; blocked for iterative research. A department was returned as a person; final structured entity-type validation rejects it. Quote/source pairs are persisted together.",
  "- Full research requests eventually failed with exhausted-credit errors. Final code records the specific reason and shares a 5-minute process-local credit cooldown across research, Direct AI assessment and copy generation.", "",
  "## Direct AI Need non-HH", "",
  "Historical: 62 results / 22 assessments / 15 non-HH assessments / 2 accepted companies (HH) / 1 Ready / 0 personal email.",
  `Latest: ${direct.discovery.metrics.jobsScanned} results / ${direct.discovery.metrics.assessed} assessments / ${direct.discovery.metrics.nonHhAssessed} non-HH assessments / ${direct.discovery.metrics.companiesExtracted} accepted companies / ${direct.discovery.metrics.nonHhCompanies} accepted non-HH / ${direct.metrics.ready} downstream Ready / ${direct.metrics.personalEmails} personal email.`,
  "The first new run still lost several semantic assessments and searched non-HH procurement only in the news index. General-web routing and compact negative assessments were applied before the second run. The second run evaluated all 15 non-HH items, but they were seller pages, generic articles, stale or unconfirmed demand. Thus no non-HH identity-resolution success is proven live. Regression fixtures test resolution without structured employers, but cannot replace that missing live outcome.",
  "Latest Direct AI lifecycle: 1 single approval, bulk invocation with 0 additional eligible entries, 1 queued, 1 in-memory sender sink call, 1 follow-up with simulated elapsed time/no-reply. No SMTP or IMAP network calls. See research-live2-direct.json. Imported Base and fresh Business discovery were not rerun after the final research changes because of the quota blocker; the fixed-cohort benchmark exercised the shared production researchCompany path.", "",
  "## Validation and limitations", "",
  "Final TypeScript, lint, production build: PASS. Release regressions: 31/31 PASS. Additional cooldown test: PASS. Approval/single/bulk/approve-all, queue and follow-up regression checks remain passing. git diff --check: PASS. Build regenerated .next safely; no generated-artifact cleanup was needed to make checks pass. No secrets, package.json or dependencies changed; no push/deploy/commit.",
  "Remaining technical limits, in addition to credits: person-to-contact yield is low; some affiliations rely on SERP/old mentions rather than current fetched evidence; fallback site coverage is lower after removing speculative crawling; copy gates rejected some otherwise usable contact rows; phone channels are not extracted by the new loop; non-HH live discovery has zero accepted companies. These are not concealed as external failures. The account blocker prevents validating further semantic/retrieval repairs, not a claim that all remaining quality problems are external.", "",
  "Reproduce (paid, after restoring provider capacity): node --env-file=.env.local --experimental-transform-types scripts/benchmark-research-loop.mjs resumed; run check-final-live.mjs with LIVE_REPORT_PREFIX for direct/business/import in isolated storage. Local checks: node scripts/check-release-regression.mjs; npx tsc --noEmit; npm run lint; npm run build.", "",
  "Suggested commit message after renewed live validation: Improve evidence-driven company research and contact attribution. No commit created.");
await writeFile(".ai/research-quality-report.md", lines.join("\n") + "\n");
await writeFile(".ai/research-quality-metrics.json", JSON.stringify({ before: bm, afterComplete: cm, afterQuotaAffected: lm, direct: direct.metrics, directDiscovery: direct.discovery.metrics, productionSmtpCalls: 0, verdict: "NOT READY" }, null, 2));
console.log("Research report and aggregate metrics written without network calls");
