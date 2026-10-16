# Goal and observable acceptance
Improve confirmed relevant people and attributed contacts through the existing downstream. Live quality, not Ready count, is acceptance.

## Baseline evidence
October 8 matched eight: confirmed people 3→6, personal verified emails 2→3, usable email/Ready 4→5. Non-HH: 15 assessed, zero accepted.
October 16 preflight (`.ai/research-oct16-preflight.json`): one production model request returned 429 credit_balance_exhausted. Qwen unconfigured. No further paid calls while blocked.
METIZ trace `oct08-confirmation-3.json`, round 3: current_role_not_confirmed for a previously accepted person, but acceptedPeople still retains her. Direct refinement replaces source excerpts with rejection prose; initial refinement routes through public-only provider and reclassifies model query angles heuristically.

## Scope and approach
- `iterative-people-research.ts`: retract explicitly unconfirmed current roles, preserve validated contact facts on partial updates, prioritize relevant confirmed people for email hypotheses.
- `direct-ai-need-agent.ts`, `ai-hiring-live-canary.ts`: retain evidence plus assessment separately; bounded non-HH refinement can stop; honor semantic routes through shared provider.
- Existing focused tests: reproduce state/routing/context loss without external calls.
- Context documents/current task: actual commands, evidence, limits and results.

## Invariants and budget
No verification relaxation, invented facts, real SMTP, secret changes, push/deploy, new dependencies or storage/UI/lifecycle redesign. Preserve existing diff. Current default estimated budget $1/day, $0.20/company; do not raise it. Cached evidence keeps provenance. Invalidate changed people-cache version.

## Verification
Focused regressions → TypeScript/lint/build → full regression suite. Live comparison/new companies/non-HH only when semantic provider available. Offline replay must never be reported as live improvement.

## Progress
Investigation, scoped implementation and offline verification complete. External blocker: current configured OpenAI account credit exhaustion, no Qwen key/base URL; Tavily also returned 432. Source/trace report: `.ai/oct16-research-context-report.md`. New live quality acceptance remains blocked, NOT complete. Generated dev types repaired; 34/34 regressions, TypeScript/lint/build PASS. No paid retries or budget increase.
