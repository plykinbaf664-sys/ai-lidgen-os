# LeadGen OS — Agent Entry Point

LeadGen OS is a local-first Next.js/React/TypeScript system for finding B2B companies with actionable AI/automation opportunities and preparing human-approved outreach.

## Read progressively
Do **not** load all documents for every task. Start with the affected code path and read only relevant context:
- Product, outcomes, vocabulary → `docs/PROJECT_CONTEXT.md`
- Architecture and providers → `docs/ARCHITECTURE.md`
- Runtime flows → `docs/SYSTEM_MAP.md`
- Verification → `docs/VERIFICATION.md`
- Durable decisions → `docs/DECISIONS.md`
- Working approach → `docs/AGENT_WORK_STYLE.md`
- Significant changes → `.agent/PLANS.md`
- Human guide → `README_CONTEXT_ENGINEERING.md`

## Source of truth
Current code, tests, configs and runtime traces outrank these documents. Research, provider and storage boundaries were checked against the repository on 2026-10-16; this is not full product acceptance. Read `.ai/current-task.md`, relevant reports, `docs/research-economy.md` and git diff before changing affected paths. Preserve valid existing guidance and uncommitted work.

## Core operating principles
- **CODE CONTROLS THE PROCESS. AI UNDERSTANDS THE CONTEXT.** Keep workflow/state/validation deterministic; use AI for semantic planning and interpretation.
- Three lead origins converge on shared company research and outreach. Avoid duplicating downstream pipelines.
- Evidence must substantiate company, intent, person, role and email claims. `PREDICTED` email is not a verified recipient. General corporate email is a fallback, not proof of person discovery.
- No real SMTP sends, pushes, deploys or secret exposure during research/testing without explicit authorization.
- Preserve user changes, local-first history and approval/queue/follow-up invariants.

## Finish with evidence
For changed flows, run focused checks and appropriate end-to-end tests. Report actual passes, failures, provider/budget blockers and unverified claims; never infer production readiness from build success alone.
