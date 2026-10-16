# Architecture

## Stack and runtime
Checked against repository boundaries on 2026-10-16: Next.js, React, TypeScript; local-first persistence under `.leadgen-data/` (or `LEADGEN_LOCAL_DATA_DIR`) with a local Supabase-compatible client; remote sync separate from main runtime. Web/API in `app/leadgen/`, `app/api/leadgen/`, `components/leadgen/`.

```text
Business Signals ─┐
Direct AI Need ────┼→ normalized company + evidence → researchCompany()
Imported Base ────┘                                  ↓
                             people/profile/email research → ContactBundle
                                                     ↓
                                    outreach → Ready → approval → queue
                                                     ↓
                                          sender → follow-up / analytics
```

## Ownership (paths relative to `lib/leadgen/`)
- Business discovery: `lead-discovery-engine.ts`
- Direct AI: `direct-ai-need-agent.ts`, `ai-hiring-live-canary.ts`
- Import/orchestration: `contact-import.ts`, `source-campaign-runner.ts`
- Shared company research: `company-research-agent.ts` (`researchCompany(...)`)
- Iterative research: `iterative-people-research.ts`
- Evidence/pages/domains: `research-evidence.ts`
- People and contact quality: `people-discovery-engine.ts`, `person-scoring.ts`, `contact-discovery-service.ts`, `personal-email-research.ts`, `contact-quality.ts`
- Search router: `search/leadgen-search-provider.ts`
- LLM: `ai-runtime.ts` (OpenAI/Qwen)
- Caching/budget: `research-cache.ts`, `ai-spend-budget.ts`
- Outreach: `first-email-ai-generator.ts`, `email-outreach-builder.ts`
- Lifecycle: `outreach-queue.ts`, `outreach-processor.ts`, `outreach-policy.ts`, `followup-*.ts`
- Transport boundary: `email-provider.ts`, `smtp-client.ts`

## Research design
Bounded adaptive loop: known facts → gaps → search/open → evidence → validation → updated structured state → next useful action/stop. AI plans and interprets; deterministic code executes, budgets, deduplicates, validates, caches, times out, persists and gates side effects. Do not persist model chain-of-thought.

Facts omitted from a later round persist; explicit `currentRole=false` or non-person reclassification retracts a candidate from active memory. Original evidence remains in the trace. Email hypotheses target the most relevant confirmed current person without an email, not insertion order. People cache version changes when these semantics change.

Direct AI refinement carries source excerpts and assessment fields separately. Initial and refinement queries retain model-selected routes: jobs use the public job provider, other demand uses the shared web router. Follow-up planning may return zero queries (diminishing returns); non-HH refinement explicitly requests non-HH hypotheses. Neither changes the intent/domain acceptance gates.

## Provider/economy boundaries
Reported persistent TTLs: search 6h, pages 12h, structured model output 24h; coalesced identical in-flight calls; default local estimated limits $1/day and $0.20/company research. Verify runtime config. Tavily spend is not covered by local dollar counter. Do not silently fall back from Qwen to paid GPT. Provider quota errors must remain visible, not disguised as empty search results. No key values in logs or docs.

## Email discovery
For confirmed person/company/domain, generate a small ranked set (reported maximum 5) of plausible corporate emails, including `firstname.lastname` even without published company pattern. Public evidence and safe validation may raise confidence. MX only confirms mail routing, not mailbox/person ownership. Reported implementation has **no SMTP recipient probing or mass brute force**. `PREDICTED` must not be silently promoted or auto-sent.
