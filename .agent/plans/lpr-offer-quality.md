# Goal and observable acceptance
Find a current, relevant decision maker with attributable public contact evidence and produce a factual, useful offer for that person's responsibility. General routing addresses and template fallback are not evidence of that outcome.

## Baseline evidence and reproducible failure
October 17 final pair: one verified personal route, one likely registry candidate/general address, both template messages. Copy trace `oct17-attribution-confirmed-0` rejects otherwise assembled copy because model `personal_cta=false`, although code supplies the correct CTA. Adaptive intelligence treats any name/role as confirmed. Template scores do not validate factual claims. Research repeats misspelled company queries and inaccessible sources.

## Affected flow and invariants
Shared researchCompany → iterative research → contact intelligence → AI copy → manual approval. Preserve all existing user edits, contact attribution, queues, history and budget ledger. No SMTP, push or deploy. No provider configuration changes.

## Implementation approach
Keep candidate confidence through downstream selection; give search explicit identity/failed-action feedback; correct code-owned CTA validation; review generated offer against supplied evidence and role, with bounded repair. Rejected/unavailable personalized copy must remain reviewable without a false quality pass. Carry actual person/company evidence into copy input.

## Budget and verification
Offline fixtures and regressions first. User authorized $0.50 (not requested $1). Live research/copy checks used the shared ledger and production cache; final cost $0.2404064. Inspect exact final copy/contact sources and report limitations. Run TypeScript, lint, build, isolated lifecycle. No further paid calls this iteration.

## Progress
- Recovered October 17 changes and traced real downstream/copy failures.
- Implemented source/identity continuity, confirmed-person propagation and separately reviewed offers with one bounded repair. Regeneration shares the quality gate; preview is free.
- Final structured offers prevent invented observations: code quotes evidence, AI proposes a test and concrete input/output, separate review checks responsibility and consistency. One bounded repair; rejected drafts remain manual.
- Four historical real-company inputs checked. IPM, Specmash and Kontur have verified personal contacts and accepted final offers; Prometey has only a general routing address. Final production integration of the three personal outcomes passed using cache with no model requests.
- Final 35/35 regressions, build including TypeScript (37 pages), lint and diff check PASS. Final browser/HTTP lifecycle passed all three origins, nine simulated sends, no duplicates, follow-up/thread/idempotency PASS. Production SMTP=0.
- Final app PID 9740, HTTP 200, process-only SMTP disabled. Findings/cost/limits in `.ai/oct18-lpr-offer-report.md`. HH freshness checks returned 403; broader fresh acquisition and non-HH remain unverified. No claim of universal LPR discovery or conversion.
