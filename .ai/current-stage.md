### Stage 5 — Quality audit and diagnostics

#### Goal

Validate the complete Production Outreach Launch without external sends.

#### Scope

- `.env.example`
- `supabase/production_outreach_launch.sql`
- `supabase/schema.sql`
- `lib/leadgen/`
- `app/api/leadgen/`
- `components/leadgen/`
- `app/globals.css`
- `scripts/production-outreach-check.mjs`

#### Acceptance Criteria

- Production discovery, persistent registry, duplicate diagnostics, queue persistence, quota reservation, idempotency, processor safety, SMTP modes, bulk actions and UI statuses are present.
- TypeScript, lint, build, deterministic checks, smoke check and project check pass.
- No real email is sent and `.env.local` is unchanged.

#### Routes To Check

- `/leadgen`

#### API To Check

- `GET /api/leadgen/campaigns`
