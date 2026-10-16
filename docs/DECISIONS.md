# Durable Engineering Decisions

These decisions reflect supplied project context; verify current implementation before treating them as enforced.

## One downstream across three sources
**Context:** Different discovery origins must produce consistent outreach. **Decision:** Normalize company and evidence, then reuse `researchCompany` and outreach lifecycle. **Revisit when:** Proven source-specific requirements cannot be represented in shared contracts.

## Deterministic workflow, contextual AI
**Context:** Semantic research needs flexible interpretation while transactions need reliability. **Decision:** AI selects research actions and interprets evidence; code owns state, budgets, validation and side effects. **Revisit when:** Traces show a specific boundary prevents quality.

## Evidence-backed contact confidence
**Context:** Guessed addresses and nearby text can create false person/email attribution. **Decision:** Separate VERIFIED, HIGH_CONFIDENCE, PREDICTED and REJECTED; predicted is not automatic recipient. General/department mail is fallback, not proof of personal discovery. **Revisit when:** Stronger reliable evidence sources become available.

## Human-controlled sending
**Context:** Incorrect outreach has external consequences. **Decision:** Manual approval before queue/sending; dry-run for tests; deduplication and idempotency. **Revisit when:** A separately approved policy changes.

## Local-first and bounded cost
**Context:** Research requires external providers and can be expensive. **Decision:** Local-first state, TTL caching, request coalescing, bounded research and explicit provider/budget errors; no hidden paid fallback. **Revisit when:** Measured production load or economics justify changes.

## Current limitations are not design decisions
Poor non-HH conversion, OpenAI quota exhaustion and unmeasured Qwen quality are **open validation issues**, not accepted permanent product behavior.

## Revisable facts and evidence-aware refinement (2026-10-16)
**Evidence:** METIZ research trace retained a person after explicit current-role withdrawal; Direct refinement replaced source evidence with rejection prose and sometimes bypassed shared routing. **Decision:** preserve omitted facts but retract explicit negative updates; choose email targets by semantic relevance; retain source excerpts separately from assessments and retain model-selected provider routes. Refinement may stop without filling a query quota. **Validation:** focused state/context/routing regressions; live quality comparison still requires an available semantic provider. No weaker verification or expanded budget.
