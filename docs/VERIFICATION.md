# Verification Guide

## Evidence hierarchy
1. Targeted deterministic tests for the changed code.
2. Integration checks across module boundaries.
3. Controlled live search/research using the actual production execution path, with bounded spend.
4. Isolated end-to-end approval → queue → sender dry-run → follow-up.
5. Production readiness review (not equivalent to build PASS).

## Known commands (confirm in package scripts)
```bash
npx tsc --noEmit
npm run lint
npm run build
git diff --check
```
Repository commands checked on 2026-10-16:

```bash
node scripts/check-release-regression.mjs
node --experimental-transform-types --env-file=.env.local scripts/benchmark-research-loop.mjs <unique-phase>
node --experimental-transform-types --env-file=.env.local scripts/check-final-live.mjs direct
```

Regression runner masks real credentials and uses temporary storage. Live commands spend API/search budget: run one preflight company first (`RESEARCH_SAMPLE_INDICES=1`), inspect provider errors, then expand only when available. `RESEARCH_BENCHMARK_USE_CACHE=true` explicitly tests warm production behavior; default benchmark bypasses cache, not monetary limits. Use `LIVE_REPORT_PREFIX` with the Direct harness to avoid overwriting previous artifacts. Do not rerun paid requests after a quota failure. Qwen configuration names: `QWEN_API_KEY`, `QWEN_BASE_URL`, `QWEN_MODEL`; never print key values.

If `tsc` fails inside generated `.next/dev/types`, validate the absolute workspace path, remove only that generated directory, run `npx next typegen`, and repeat checks. Do not discard source changes or clear the spending ledger.

## Research benchmark
Use a fixed, reproducible company cohort plus fresh non-HH Direct AI Need samples. Record cache hits and provider failures. Before/after: researched companies, relevant confirmed people, personal VERIFIED/HIGH_CONFIDENCE/PREDICTED, public profiles, fallback-only, usable contacts, Ready, evidence quality, actions/company, runtime, spend, false person/email attribution and abort/orphan requests. Compare equivalent samples and execution settings; do not optimize against hardcoded companies.

## Direct AI non-HH
Show assessed source classes, actual buyer intent evidence, company/domain confirmation, rejected reasons, and how many reach shared research. Last reported 15 assessed → 0 confirmed buyers. This is an unresolved quality gap, not a passing benchmark.

## Transactional regression
For each origin test review/approval eligibility and safe queueing. Include single, bulk, approve-all, repeated approvals, queue uniqueness, simulated send and follow-up. **Production SMTP calls must be zero** during tests.

## Provider/cost checks
Check model adapter, Qwen connectivity with one bounded request if authorized/configured, actual quota/error classification, search provider quality, caching and budget counters. Do not print credentials. OpenAI 429 credit exhaustion is a reported historical blocker, not assumed current state.

## Reporting
Separate `PASS`, `FAIL`, `NOT RUN`, `BLOCKED`. State what was actually exercised. A clean build or synthetic regression alone does not establish real lead quality.
