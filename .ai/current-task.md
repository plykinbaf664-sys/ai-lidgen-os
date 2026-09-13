# Current Task — close Direct AI Need iteration (2026-09-13)

Goal: finish the uncommitted September 12 iteration for controlled production deployment. No commit, push, deploy, real email, secrets/dependency changes or architecture/UI rewrite.

## Current system
- Business Signals / DISCOVERY: existing Discovery V2 finds evidence-backed business signals.
- Direct AI Need / AI_HIRING: semantic AI search across public sources; industry optional; confirmed company/domain required; LPR is enrichment, not a gate.
- Imported Base / IMPORTED: validated import and segment context feed the same downstream.
- All sources use researchCompany(), evidence-backed contacts, Russian outreach, Ready, manual approval, persistent queue and sequential sender.
- Operational storage is local-first; Supabase backup is explicit. Keep compact operational evidence and business history; expire only technical previews/caches.
- Flags: LEADGEN_DISCOVERY_V2_ENABLED defaults on; LEADGEN_AI_HIRING_ENABLED / LEADGEN_IMPORT_ENABLED default on, LEADGEN_NEW_SOURCE_CONTOURS_ENABLED=false disables both. LEADGEN_DIRECT_AI_LLM_ENABLED / LEADGEN_RESEARCH_LLM_ENABLED default on with configured OpenAI key. EMAIL_TEST_MODE defaults true; FOLLOWUP_AUTOMATION_ENABLED defaults false. Existing environment is unchanged.
- Limits: public-source coverage/access, evidence freshness, domain identity and published contacts constrain yield. Uncertain identity gets one bounded recheck. No invented company, person, email or signal.

### Stage 1 — clean build and targeted review
Scope: generated build cleanup; current git diff.
Acceptance: regenerate Next types; TypeScript, lint, build PASS; no secrets, generated files, debug/test artifacts in commit diff.
Status: clean regeneration, TypeScript, lint and production build PASS. Targeted review in progress.

### Stage 2 — Direct AI Need live completion
Scope: existing direct-ai modules, ai-hiring-live-canary, source-campaign-runner, company research and focused checks.
Acceptance: real no-industry live run reports results/assessed/direct intent/HH/non-HH/domains/LPR/contacts/Ready; source-class bottlenecks visible; VERIFIED/HIGH_CONFIDENCE only downstream; bounded requests and no orphan operations.
Status: in progress.

### Stage 3 — transactional regression
Scope: existing downstream/approval/queue/sender and isolated regression scripts.
Acceptance: all three origins; actual HTTP single/bulk/all approval, persistent queue, injected sender simulated Sent, no duplicate queue/send, updated counters, follow-up regression; SMTP calls zero.
Status: pending.

### Stage 4 — final release verification
Scope: focused repairs from stages 1–3 and this task state.
Acceptance: complete relevant regression suite, storage hygiene, git diff --check, tsc --noEmit, lint, build PASS; compact final evidence report; READY FOR COMMIT only after all required checks.
Status: pending.
