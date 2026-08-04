# Supabase SQL application order

The project keeps SQL files as additive, idempotent migrations. Apply them once in
the following order (the application does not execute SQL automatically):

1. `schema.sql` — core campaign, company, lead, signal, contact and event tables.
2. `add_pipeline_run_id.sql` — backfills and indexes pipeline-run identity.
3. `add_leadgen_companies.sql` — canonical company links and nullable domains.
4. `add_leadgen_signals.sql` — persisted signal evidence.
5. `add_leadgen_contacts.sql` — contact candidates and sources.
6. `production_outreach_launch.sql` — discovery registry, stop-list and initial queue.
7. `update_leadgen_personal_contact_constraints.sql` — additive contact constraints.
8. `add_icp_fit_score.sql` — ICP score columns.
9. `followup_engine_v1.sql` — follow-up fields, constraints, scan lock and claim RPC.
10. `production_consistency_v1.sql` — optional recovery RPC (safe to re-run).
11. `reply_intelligence_v1.sql` — reply/interest lead statuses (safe to re-run only after dropping the same named constraint).

12. `compact_leadgen_storage_v1.sql` — removes duplicated discovery JSON from company/contact metadata without deleting rows.

Before and after applying SQL, run:

```bash
node scripts/check-supabase-schema.mjs
```

The audit is read-only. It checks the PostgREST contract used by the application,
message kind/status values, and required sent/follow-up fields. It never prints
environment values, changes rows, sends mail, or applies migrations.
