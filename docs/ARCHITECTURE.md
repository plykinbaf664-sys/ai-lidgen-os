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

Research state is structured evidence/actions, not hidden reasoning. The loop is bounded to 75 seconds; one semantic decision uses the adapter's 30-second deadline. Each selected source receives space in the 24k-character evidence budget, with per-document focus. Search-only people remain candidates until primary-page verification; weaker later snippets cannot overwrite stronger confirmed facts. Repeated failed or fully read short pages are rejected with feedback. No company/person-specific queries or recipient verification exceptions.
Bounded adaptive loop: known facts → gaps → search/open → evidence → validation → updated structured state → next useful action/stop. AI plans and interprets; deterministic code executes, budgets, deduplicates, validates, caches, times out, persists and gates side effects. Do not persist model chain-of-thought.

Facts omitted from a later round persist; explicit `currentRole=false` or non-person reclassification retracts a candidate from active memory. Original evidence remains in the trace. Email hypotheses target the most relevant confirmed current person without an email, not insertion order. People cache version changes when these semantics change.

Incomplete research also writes a six-hour `people-progress` checkpoint through the existing cache. It retains accepted people, source documents, recent search batches, document focus and completed actions, scoped to company/domain/signal/role/model. A later explicit research call resumes those facts under fresh per-call limits and the same shared spending ledger; it does not cache a partial contact as a completed result. Repeated resumes do not extend the original checkpoint lifetime. Explicit retractions persist, and bypass/context changes prevent reuse. This is a resume mechanism, not an automatic background retry loop.

Recent search batches retain all returned hits within the existing text cap. Page link selection reserves navigation diversity, then fills remaining slots with deeper article/team links. Fetched publications supersede summaries for the same URL; unsupported search claims are rejected, and provisional people with no remaining citation are retracted. Both person research and downstream contact attribution use the same Unicode/Е-Ё normalization and complete name tokens. These rules preserve evidence; they do not establish a current role or email from MX/search summaries alone.

Direct AI refinement carries source excerpts and assessment fields separately. Initial and refinement queries retain model-selected routes: jobs use the public job provider, other demand uses the shared web router. Follow-up planning may return zero queries (diminishing returns); non-HH refinement explicitly requests non-HH hypotheses. Neither changes the intent/domain acceptance gates.

Search actions must retain the exact company name, a confirmed domain, or the full name of a known person. Missing identity anchors and duplicate actions return correction feedback without spending search budget. Failed opens retained in checkpoints are also excluded on resume. Fetched verification requires name and role in fetched quotes; an unrelated fetched company citation cannot promote a search-only person. `isConfirmedResearchPerson` carries explicit provisional/retracted flags through contact construction and intelligence; candidate listings remain available for research.

## Provider/economy boundaries

Reported persistent TTLs: search 6h, pages 12h, structured model output 24h; coalesced identical in-flight calls; default local estimated limits $1/day and $0.20/company research. Verify runtime config. Tavily spend is not covered by local dollar counter. Do not silently fall back from Qwen to paid GPT. Provider quota errors must remain visible, not disguised as empty search results. No key values in logs or docs.

## Email discovery
For confirmed person/company/domain, generate a small ranked set (reported maximum 5) of plausible corporate emails, including `firstname.lastname` even without published company pattern. Public evidence and safe validation may raise confidence. MX only confirms mail routing, not mailbox/person ownership. Reported implementation has **no SMTP recipient probing or mass brute force**. `PREDICTED` must not be silently promoted or auto-sent.

## Offer acceptance
The shared AI copy generator receives signal evidence, official-page excerpt and person-role evidence. Code quotes the supplied source excerpt and frames a proposed test; the v7 writer supplies only subject, hypothesis beginning with “можно ли”, pilot input and pilot output. Code validates greeting, CTA, wording and length. A separate bounded v3 semantic review evaluates context consistency, responsibility fit and concrete input/output without treating a proposed test as proof of an existing company problem. Writer self-ratings do not override code-owned CTA validation. At most one repair follows actionable review failures, with a 25s total copy deadline and existing model/daily/company budget enforcement. Review/provider failure returns a draft requiring manual copy review, not a passing quality flag. This is an acceptance mechanism, not independent proof of commercial effectiveness.

Unsent-message regeneration uses this same generator under the company spend scope and preserves version/approval invalidation. Preview enumerates current rows without model calls. No retroactive rewrite of existing production drafts or approvals happens merely by loading new code.
