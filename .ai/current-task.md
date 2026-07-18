# Current Task

## Goal

Production Outreach Launch: find up to 20 new globally unique companies, prepare and bulk-approve outreach, then persistently schedule safe sequential email delivery.

## Business Meaning

Turn the existing internal Leadgen OS prototype into a daily operational workflow without mock production results, duplicate companies, duplicate recipients, long-running HTTP requests, or accidental sends during development.

## Global Acceptance Criteria

- Production discovery uses only configured real search providers and never falls back to mock data.
- A single config source defines a campaign target of 20 new companies and a bounded search budget.
- Previously discovered companies and duplicate recipients are excluded using persistent Supabase data.
- Approval, scheduling, pause/resume/cancel/retry, daily quota, and SMTP IDs survive restarts.
- Batch scheduling is sequential with 5–10 minute randomized spacing; one processor invocation handles at most one due item.
- Test and production SMTP modes are both supported; tests never send real email.
- UI provides bulk actions, confirmation, Russian statuses, readiness, filters, immediate approval feedback, and production warnings.
- No `.env.local`, dependency, commit, push, deploy, real-email-send, destructive migration, reply handling, or follow-up engine changes.

## Stages

### Stage 1 — Discovery identity contract and production limits

#### Goal

Create one production configuration source, robust company/email normalization, pagination input, and deterministic duplicate diagnostics.

#### Scope

- `.env.example`
- `lib/leadgen/production-config.ts`
- `lib/leadgen/company-identity.ts`
- `lib/leadgen/types.ts`
- `lib/leadgen/search/search-provider.ts`
- `lib/leadgen/search/leadgen-search-provider.ts`
- `lib/leadgen/search/tavily-provider.ts`
- `lib/leadgen/search/yandex-provider.ts`
- `lib/leadgen/signals/signal-pipeline.ts`

#### Acceptance Criteria

- Company target defaults to 20 from a single config module.
- Normalization prioritizes legal ID, domain, website, then conservative name+region.
- Search input supports bounded page iteration and records query/page diagnostics.
- Production providers never synthesize results.

### Stage 2 — Global company registry and discovery integration

#### Goal

Persist company history and exclude known companies before they create leads or consume the campaign target.

#### Scope

- `supabase/production_outreach_launch.sql`
- `supabase/schema.sql`
- `lib/leadgen/company-registry.ts`
- `lib/leadgen/lead-discovery-engine.ts`
- `lib/leadgen/storage.ts`
- `app/api/leadgen/run/route.ts`
- `lib/leadgen/types.ts`

#### Acceptance Criteria

- Registry survives campaigns and restarts.
- Known-company and within-run duplicates have explicit reasons and metrics.
- Discovery continues within a bounded 100-candidate/page budget until 20 new valid companies or exhaustion.
- Registry updates occur only for real saved campaign results.

### Stage 3 — Persistent outreach queue, idempotency, quota, and processor

#### Goal

Replace metadata-only execution with a database queue and safe one-item processor.

#### Scope

- `supabase/production_outreach_launch.sql`
- `supabase/schema.sql`
- `lib/leadgen/outreach-queue.ts`
- `lib/leadgen/outreach-status.ts`
- `lib/leadgen/outreach-storage.ts`
- `lib/leadgen/email-provider.ts`
- `lib/leadgen/email-sending-engine.ts`
- `lib/leadgen/outreach-processor.ts`
- `lib/leadgen/types.ts`
- `app/api/leadgen/outreach/route.ts`
- `app/api/leadgen/outreach/queue/route.ts`
- `app/api/leadgen/outreach/[id]/route.ts`
- `app/api/leadgen/outreach/[id]/approve/route.ts`
- `app/api/leadgen/outreach/[id]/retry/route.ts`
- `app/api/leadgen/outreach/[id]/send/route.ts`
- `app/api/leadgen/outreach/bulk-approve/route.ts`
- `app/api/leadgen/outreach/batch/route.ts`
- `app/api/leadgen/outreach/control/route.ts`
- `app/api/leadgen/outreach/process/route.ts`
- `app/api/leadgen/outreach/readiness/route.ts`

#### Acceptance Criteria

- Queue rows contain scheduling, timestamps, attempts, error, SMTP ID, and idempotency fields.
- Partial unique indexes prevent duplicate active/sent recipients.
- Bulk scheduling observes database-derived daily quota and selected batch size.
- Processor atomically claims and handles one due item, with no sleep and no `Promise.all`.
- One failure does not affect other queued items.
- Production SMTP sends actual recipient only when `EMAIL_TEST_MODE=false`; no test executes a real send.

### Stage 4 — Bulk workflow and operational UI

#### Goal

Make review, approval, scheduling, and queue status immediately visible and safe.

#### Scope

- `components/leadgen/email-outreach-queue.tsx`
- `components/leadgen/leadgen-dashboard.tsx`
- `lib/leadgen/outreach-status.ts`
- `lib/leadgen/types.ts`
- `app/globals.css`

#### Acceptance Criteria

- Bulk approve and bulk schedule have confirmation summaries and disabled pending states.
- Batch options are 5/10/15/20 capped by availability.
- Individual approval is optimistic with rollback.
- Editing invalidates approval with reason.
- Production mode warning and readiness block are prominent.
- Dashboard counters, filters, cards, schedule position/time, errors, and Russian status labels update without reload.
- Queue pause/resume/cancel/retry controls are persisted.

### Stage 5 — Quality audit and diagnostics

#### Goal

Validate identity, deduplication, batch, quota, sequential scheduling, edit invalidation, mode safety, and build quality without external sends.

#### Scope

- `scripts/production-outreach-check.mjs`
- files from Stages 1–4 only for bounded repairs
- `.ai/final-report.md`

#### Acceptance Criteria

- Deterministic checks cover duplicate URLs/domains, similar names, missing domain/email, batch 5, delay bounds, duplicate request, sent recipient, retry/pause/edit behavior, and test/production recipient routing without SMTP delivery.
- `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `scripts/check-project.sh` pass.
- No real email is sent and `.env.local` is unchanged.

## What Must Not Change

- No dependencies or `package.json` changes.
- No commit, push, deploy, or environment mutation.
- No real email send during implementation.
- No destructive migration or deletion of existing rows.
- No mock fallback in production.
- No reply handling, follow-up engine, AI SDR, or automatic history cleanup.
