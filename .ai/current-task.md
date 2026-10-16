# LeadGen OS — actual research state, 2026-10-08

## Qwen live trials completed, 2026-10-16

Application restarted at http://localhost:3000 with current environment and test sending mode; HTTP 200. Qwen and OpenAI web search now succeeded: historical quota failure is not the current blocker. Report `.ai/qwen-oct16-report.md`; machine-readable `.ai/qwen-oct16-summary.json`.

Separate trials cover 3 fixed Business-origin downstream inputs, fresh Direct discovery (5 new HH companies, non-HH 0/15), and one Imported company, plus targeted warm reruns. Latest observations across 9 distinct companies: 10 people candidates, 8 system-labelled VERIFIED, 2 VERIFIED personal email routes, 0 HIGH_CONFIDENCE personal emails, 4 general-only, 1 department, 7 usable email routes, 4 mechanical Ready. These are not one matched AFTER cohort. Kontur import found a personal email but correctly stayed not Ready without a current signal. IPM personal email/Ready now uses AI copy and personal CTA; manual review still found unsupported expansion inference from a vacancy title. NOT READY.

Repaired proven transitions: rejected URL actions now return bounded feedback instead of silent stop; normalized VERIFIED_PERSONAL propagates to personal outreach; LLM/MVP allowed consistently by prompt and validator; title-only copy guidance tightened (insufficient by itself). Test harness shares cache/budget but isolates CRM; diagnostics record generation source/fallback. No contact verification relaxation.

Recorded successful-call estimate: Qwen ~$0.1023, OpenAI web search ~$0.6280; daily ledger ~$0.7979 including aborted-request reservations. Limit unchanged. SMTP=0/orphans=0. Direct lifecycle: one approval → queued → sender sink → simulated follow-up; multi-item bulk live not established. 34/34 regressions, TypeScript, lint, production build (37 generated pages), final diff check PASS. Final app HTTP 200 on port 3000. No push/deploy.

## Previous Qwen connection verified, 2026-10-16

User supplied Qwen credentials. Corrected only QWEN_BASE_URL path from workspace host root to `/compatible-mode/v1`; key unchanged. One live request through `fetchLeadgenModel` and the $0.01-capped connection probe: CONNECTION_PASS, provider=qwen, strict schema valid, 67 input + 14 output tokens, 2488 ms. Local configured-rate estimate $0.0000492 (not billing verification). `LEADGEN_AI_PROVIDER=auto` selects Qwen in a fresh process. Existing application processes must reload environment/restart. No research benchmark, SMTP, push or deploy. OpenAI web-search fallback is still configured separately; Qwen connectivity does not establish search capacity or lead quality. Current endpoint accepted this minimal JSON Schema despite the broad regional limitation noted in provider docs; full research schemas/quality still need a bounded run. Historical provider failures below predate this successful connection.

## Previous Qwen connection preparation, 2026-10-16

Added `scripts/check-qwen-connection.mjs`: configuration-only by default; optional `--live` makes one uncached strict-schema request through the production Qwen adapter, capped at min($0.01, company limit), with shared daily budget retained and no search/SMTP imports. Current config check: QWEN_API_KEY and QWEN_BASE_URL missing, zero API calls. Await user's provider, base URL and exact model ID; key should be filled in `.env.local`, not chat. No secrets/config changed. Existing model/rate placeholders do not prove selected endpoint compatibility. Official Alibaba docs show JSON Schema model/region restrictions, so check actual endpoint before research. Instructions in `docs/research-economy.md`. Connection PASS is not research quality PASS.

## Latest iteration: research context optimization, 2026-10-16

NOT READY. Current production preflight on IPM (`research-oct16-preflight.json`) made one OpenAI call and received HTTP 429 credit_balance_exhausted. Qwen is unconfigured; Tavily fallback returned 432. No further paid model calls. Local model ledger: one request, settled $0. One general-email Ready via deterministic fallback is not semantic research success. SMTP=0, orphan requests=0.

Diagnosed METIZ trace retaining a candidate after explicit currentRole=false; repaired active-state retraction and relevance-ranked email hypotheses. Direct refinement now keeps source excerpts separate from assessment, honors semantic query routes through shared dispatch, and can return zero to three useful queries scoped to non-HH. Verification gates unchanged. People cache version bumped; stable lifecycle/UI/storage preserved.

Context pack reconciled progressively with inspected code. Living plan: `.agent/plans/research-context-quality.md`; detailed evidence/cost/limits: `.ai/oct16-research-context-report.md`. New fixed-cohort AFTER, new companies, non-HH and fresh personalization live benchmarks are BLOCKED by provider availability; historical improvements below must not be presented as new results.

Validation: 34/34 regressions (including new retraction/ranking/context/routing checks), TypeScript, lint and production build PASS. Corrupted generated `.next/dev/types` was safely regenerated. No secrets/dependencies, real email, push or deploy. Existing uncommitted work retained.

## Previous requested live run: economy canary

Executed production researchCompany on IPM with cache enabled and unchanged default budgets. Artifact: `.ai/research-economy-live-canary.json`. Exactly one GPT-4.1 request returned HTTP 429 / insufficient_quota / credit_balance_exhausted. Qwen key/base URL are not configured. Stopped before expanding the cohort. Deterministic fallback produced one person, zero personal emails, general info@ipm.ru and one copy-gated Ready; this is not a semantic research quality PASS. Local spend ledger: one request, settled $0; production SMTP=0, orphan requests=0. Harness now supports explicit `RESEARCH_BENCHMARK_USE_CACHE=true` and records the mode; default broad live benchmark still bypasses cache.

## Previous task: economy and Qwen preparation — implemented offline

User authorized persistent caching and minimum token spending; Qwen credentials will be supplied later. No live model/search requests were made in this task. Earlier live-quality verdict below remains NOT READY; economy tests are not a new research-quality benchmark.

- Added `research-cache.ts`: disk TTL cache, atomic writes, bounded eviction, identical in-flight request sharing with independent consumer cancellation. Enabled by default; no existing economy overrides were found in local env files. Search TTL 6h; pages 12h; valid structured responses 24h; successful personal-contact research with source documents 24h. Original evidence timestamps preserved. Failures and unfinished person research are not cached as success.
- Added `ai-runtime.ts`: all seven model call sites use a common OpenAI/Qwen boundary. Qwen uses chat/completions, strict JSON Schema, bounded output and disabled thinking; no hidden fallback to GPT. OpenAI keeps current models and receives a stable prompt_cache_key. Cache keys include request/prompt/schema/model/endpoint/account; successful person research includes company/signal/role/model. No whole ContactBundle cache with reused storage IDs.
- Added `ai-spend-budget.ts`: reserve estimated cost before requests; settle from usage; retain conservative reservations on unknown/aborted outcomes. File-locked persistent UTC daily ledger, default $1/day and $0.20/researchCompany. Covers model calls and OpenAI web search, not Tavily billing. Cache hits are free. Invalid/locked budget storage fails closed. Estimates are not provider billing guarantees.
- Research retains navigation/evidence but removes duplicate links from model context. Cache hits report zero new research actions. `bypassCache` bypasses every local cache inside company research while retaining budget enforcement.
- Qwen credit cooldown is isolated from OpenAI. Offline credential masking and live usage harnesses now understand Qwen. No Qwen credentials added; Qwen live quality remains untested.
- Instructions and future configuration: `docs/research-economy.md`; actual module responsibilities updated in `AGENTS.md`.

Validation: economy fixtures PASS (10 identical model requests -> 1 mock API call; cached call after process restart -> zero network; TTL/context changes/bypass/cancellation/budget concurrency/Qwen schema tested). Repeated successful people research -> zero model/search calls with original evidence available downstream. Release regressions 34/34 PASS. TypeScript/lint/build and final diff checks rerun after integration. Production SMTP = 0; paid API calls in this task = 0. No env/secrets, dependencies, push/deploy/commit changes.

Changed integration files: `company-research-agent.ts`, `iterative-people-research.ts`, `research-evidence.ts`, `direct-ai-need-agent.ts`, `people-evidence-agent.ts`, `first-email-ai-generator.ts`, `analytics-snapshot.ts`, `llm-availability.ts`, search router/OpenAI search provider. Added `scripts/check-research-economy.mjs`; extended iterative research, routing and release tests. Suggested commit: `Cache research evidence and enforce AI spending budgets`.

## Historical live-quality verdict: NOT READY

The user restored OpenAI access. Funded production-path research now proves an incremental contact-quality improvement. A later new OpenAI 429 / credit_balance_exhausted stopped the remaining benchmark. Do not repeat the old claim that no successful funded run occurred.

## Completed stages

1. Inspected current code and actual funded execution traces, including IPM, Spetsmash-SNG, Sibalux and the fixed 16-company historical cohort. Preserved earlier uncommitted work.
2. Diagnosed provider and context losses: Tavily 432 was hidden by empty public fallbacks; Direct AI non-HH bypassed the common router; origin navigation disappeared between rounds; secondary corporate sites were not propagated; role inflection and tracking URL mismatches discarded useful evidence.
3. Repaired the existing bounded loop and shared search path. No stable lifecycle/UI/storage redesign. Semantic decisions remain structured; code validates citations, corporate cross-links, recipient safety, budgets and cancellation. Email hypotheses remain separate from verified publication.
4. Executed a full funded 16-company benchmark, analyzed it and repaired the next bottlenecks. Executed eight preselected confirmation companies and attempted the disjoint remaining eight. Stopped paid work after fresh exhausted-credit errors; six companies were skipped by the guard.
5. Repeated Direct AI non-HH through the shared search router, then ran local regression/type/lint/build checks. Updated actual architecture in AGENTS.md.

## Exact measurements and artifacts

Full funded broad run (.ai/research-oct08-final.json): 16 researched, 12 person candidates, 5 fetched VERIFIED people, 2 VERIFIED personal addresses, 9 usable email routes, 9 Ready. This preceded the final navigation/alias repairs.

Matched confirmation BEFORE -> AFTER, same eight company/domain/signal inputs:
- Confirmed people: 3 -> 6 (all candidates: 7 -> 9).
- VERIFIED personal emails: 2 -> 3; HIGH_CONFIDENCE emails: 0 -> 0.
- PREDICTED addresses: 0 -> 15; excluded from automatic recipients.
- General-only: 2 -> 2; department email: 0 -> 0.
- Usable email routes: 4 -> 5; Ready: 4 -> 5.
- Actions/company: 5.38 -> 8.00; runtime: 30.14 -> 42.66 seconds.
- No false VERIFIED ownership observed in the three inspected published emails. False person attribution across the entire cohort is not independently measured; do not claim a blanket zero.

New success: Spetsmash-SNG -> commercial director Dmitry Polkin -> dm.polkin@ooospecmash.ru -> VERIFIED_PERSONAL -> Ready. Direct source: https://smsng.ru/otdel-prodazh/; relationship to dorzap.ru established through reciprocal corporate root links plus company name. No company-specific production query or email hardcode.

Latest confirmation: .ai/research-oct08-confirmation.json (8 completed, no model errors). Remainder: .ai/research-oct08-confirmation-rest.json (2 quota-affected starts, 6 skipped). Never merge selected successful rows into an invented full final pass.

Direct AI latest: .ai/oct08-shared-search-direct.json. 42 materials, 24 assessed, 15 non-HH assessed, 0 accepted non-HH companies, 3 HH companies downstream, 0 personal emails, 0 downstream Ready. Supplier/generic procurement pages still dominate non-HH retrieval. The later research stage contains the fresh OpenAI credit_balance_exhausted error. Discovery-ready=3 is not downstream Ready.

Detailed company tables, metrics, sources, root causes and commands: .ai/oct08-research-report.md and .ai/oct08-research-metrics.json. Regenerate offline with node scripts/build-funded-research-report.mjs. Historical reports are retained as historical records, not current verdict evidence.

## Architecture and checks

AGENTS.md documents the actual modules, common researchCompany contract, bounded loop (75 seconds, 7 decisions, 10 follow-on actions, 8 searches), persistent navigation/domain context, shared search fallback, evidence and email-state boundaries. Parent company research allows at least 90 seconds subject to the campaign's outer deadline.

- npx tsc --noEmit: PASS.
- npm run lint: PASS.
- npm run build: PASS, 37 routes/pages; generated artifacts rebuilt normally.
- node scripts/check-release-regression.mjs: 33/33 PASS.
- git diff --check: PASS.
- No generated artifact cleanup was necessary.

Approval/single/bulk/approve-all, queue, dry-run and follow-up remain covered by regressions. This funded iteration additionally executed one approval/queue/dry-run/follow-up in .ai/oct08-final-direct.json. Fresh Business discovery and Imported Base were not rerun after the final research changes; historical input companies used the shared production research path.

Production SMTP calls = 0. Orphan requests = 0 in completed live reports. No real email, secrets/dependencies changes, push, deploy or commit. Recorded API usage estimates across Oct08 funded runs total approximately $5.50; incomplete early/aborted usage and any extra search-content billing are excluded, so this is not an authoritative billing total.

## Remaining stop and limitations

Concrete external stop: fresh HTTP 429 credit_balance_exhausted in the remaining cohort and Direct AI downstream. Tavily also returns 432 plan usage limit, partly mitigated by the funded OpenAI search fallback. No further paid work is authorized by elapsed time or repeated retries after that error.

The quality bar is not met just because APIs worked: final full-cohort confirmation is incomplete; non-HH has zero confirmed buyers; some people rely on SERP affiliation; phone routes are not extracted by the loop. Improvements in the matched eight are real, but they do not prove broad production readiness.

After provider capacity is available, continue with a fresh full fixed cohort and non-HH retrieval trace investigation. Keep source evidence and failure metrics; do not loosen ownership or replace people research with generic inbox collection.

Suggested commit message: Fix research evidence retention and shared search fallback. No commit made.
