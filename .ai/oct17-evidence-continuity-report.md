# Evidence continuity validation — 2026-10-17

## Scope and findings
User approved a NEW maximum $0.50, spending only when necessary. Existing uncommitted work retained; no SMTP, secrets, production CRM mutations, push or deploy. Two real companies, seven company executions (including cached verification), not a broad new benchmark.

Trace-proven losses and repairs:
- Old METIZ traces returned five search hits but only the first three reached semantic interpretation. Discarded hits included a corporate article naming a marketing director. Retain all hits from the last three batches within the unchanged 24k text budget.
- Page extraction kept only three links per path group. News/team index pages lost deeper sources. Preserve navigation diversity first, fill unused slots with remaining links; keep 100 extracted / 60 model-visible link caps.
- Search summaries and actual pages disagreed about current roles. Once fetched, the publication supersedes its summary. Unsupported quotes are rejected; provisional people without surviving evidence are retracted. This does not promote old interviews to current-role proof.
- Live Specmash found the CEO and directly attributed email, stopped as personal_contact_evidenced, then downstream downgraded the email because Пётр did not match Петр. Reuse Unicode/Е-Ё normalization with full tokens (not substrings); fixture rejects Соколовский as evidence for Соколов.
- Six-hour partial-state checkpoints (previously offline only) resumed 13 sources and nine completed actions in real production research. No automatic retry loop or increased per-call research budget.

## Actual runs
| Artifact | Companies / outcome | Notes |
|---|---|---|
| research-oct17-resume-metiz.json | METIZ: 0 people, general only, 52.0s | Initial SERP repair; four search attempts |
| research-oct17-metiz-continued.json | METIZ: 1 LIKELY person, no personal email, 75.5s | Real checkpoint resume; contradictions led to fetched-source precedence repair |
| research-oct17-evidence-final.json | Specmash: 1 VERIFIED person, found email rejected downstream; METIZ: 0 confirmed people, general only | Fresh people-cache v5 pair; source/page caches retained; 54.6s / 66.0s |
| research-oct17-attribution-confirmed.json | Specmash: 1 VERIFIED person and personal email, Ready, 6.3s | Same cached evidence, repaired downstream attribution; not a fresh discovery |
| research-oct17-final-cohort.json | Specmash: VERIFIED personal route; METIZ: LIKELY candidate/general only | 0.4s cached / 75.3s resumed; final model |

## Historical matched pair → final pair
| Metric | BEFORE (funded-before) | AFTER (final-cohort) |
|---|---:|---:|
| Companies | 2 | 2 |
| Confirmed VERIFIED people | 1 | 1 |
| VERIFIED personal email routes | 1 | 1 |
| HIGH_CONFIDENCE personal email routes | 0 | 0 |
| Predicted email routes | 0 | 0 |
| General-only companies | 1 | 1 |
| Usable email routes including general | 2 | 2 |
| Mechanically Ready | 2 | 2 |
| AI-written final messages | 1 | 0 |
| Avg actions / final invocation (includes homepage) | 9.5 | 5.0 |
| Avg runtime / final invocation | 62.9s | 37.8s |

AFTER speed/actions include successful cache reuse and a partial-state continuation: they are NOT comparable cold-research efficiency gains. Final-version METIZ required 21 actions and 141.3s across two calls and still lacked a verified personal route. Growth in confirmed people/contacts was NOT demonstrated. No falsely VERIFIED email found in this small reviewed sample; not a population-level error estimate. A LIKELY registry candidate is not counted as confirmed.

## Lead examples and limitations
- Спецмаш-Снг, sales-manager hiring signal (historical fixture input): Казанцев Пётр Юрьевич, генеральный директор, VERIFIED person; `600856@ooospecmash.ru`, VERIFIED_PERSONAL. Direct publication: https://smsng.ru/contact-us/ ; corporate role: https://dorzap.ru/reqvizity/ . Email quote explicitly binds the name, role and address. Signal freshness was not independently refreshed this iteration.
- МЕТИЗ ИМПЭКС, CCO hiring signal (historical fixture input): Александр Николаевич Орлов, LIKELY candidate from search summary of https://www.tbank.ru/business/contractor/legal/1105029013693 . No fetched primary citation confirming this candidate in the final run; no personal email. Best fallback `info@metiz-ltd.ru`, https://metiz-ltd.ru/contacts . General Ready is not research-quality success.
- Both final messages used an explicitly recorded template fallback after copy-quality rejection. Do not claim high-quality personalized end-to-end acceptance.
- Direct AI Need non-HH not rerun: remaining budget insufficient for a meaningful discovery benchmark; previous zero-confirmed non-HH result remains unresolved.
- Concrete remaining technical failure: METIZ planner repeats vacant-title/closed-profile searches (including misspelled company aliases), consumes the 10-action / 75s budget without verifying a person, instead of productively exploiting alternative corporate sources. Traces also show Tavily 432 quota, Brave 429 and RBC 401; these restrict retrieval but do not explain away the planner failure.

## Cost and safety
October 17 pre-live ledger: $0.977176 / 21 requests / zero settled, created accidentally by a fully mocked standalone regression (no external requests). Test now always isolates cache/ledger in a temporary directory. Preserve the original ledger; no silent reset.

Paid-test process ceiling: $1.477176 (= mock baseline + authorized $0.50), persistent config unchanged. Final ledger: $1.4502224 / 76 requests / 50 settled. New-iteration charged/reserved estimate **$0.4730464**, including conservative reservations for aborted/unknown requests; not provider invoice reconciliation. **$0.0269536 unspent**. No further paid calls. Every artifact reports zero orphan operations and production SMTP=0.

## Verification and verdict
34/34 final regressions PASS, TypeScript PASS, lint PASS, production build PASS (37 pages), diff check PASS, application HTTP 200. Existing isolated bulk-approval/queue/sender/follow-up verification remains documented in oct17-research-and-bulk-report.md; those flows were not rerun against production or rewritten here.

**NOT READY** for reliable quality leads. Evidence retention and a real downstream contact loss are repaired, but the fixed-pair quality benchmark did not improve and personalized copy did not pass. Budget remaining is intentionally not spent on another equivalent METIZ retry.

Changed implementation: `lib/leadgen/iterative-people-research.ts`, `lib/leadgen/research-evidence.ts`, `lib/leadgen/adaptive-contact-intelligence.ts`; fixtures: `scripts/check-iterative-research.mjs`, `scripts/check-adaptive-contact-intelligence.mjs`; architecture/current-task/plan/report updated. Reproduce offline: `node scripts/check-release-regression.mjs`, `npx tsc --noEmit`, `npm run lint`, `npm run build`. Suggested commit: `Preserve research evidence and confirmed person attribution across pipeline stages`. No commit made.
