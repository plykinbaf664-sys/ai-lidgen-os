# Goal
Repair person research and bulk approval/queue controls with no production sends.

## Evidence
- Latest stored campaign: 20 needs_review, one approved. Slider starts at 5 and displays 1 while queue button rejects 5 > maxBatch=1.
- Bulk confirmation renders below both dispatch panels, not at the clicked control; loading state uses a nonexistent bulk-execute value.
- Oct16 Specmash trace: second semantic decision aborted at 18 seconds, switched to deterministic fallback. METIZ consumes full 75-second loop.
- Oct17 preflight two fixed companies blocked by local UTC daily budget (charged $0.996733 / $1). Extra $0.50 requested; not authorized yet.

## Scope / invariants
UI bulk confirmation and batch selection; iterative research evidence/deadline handling; focused fixtures and isolated HTTP transactions. Preserve contact verification, daily budget, server approval authority, secrets and production records. No SMTP, push or deploy.

## Verification
Focused regressions, isolated multi-item HTTP and browser workflow if available, bounded matched live run when budget permits, TypeScript/lint/build/diff. Update current-task with measured results.

## Outcome
User authorized extra $0.50 for tests; ledger delta $0.453174. Bulk browser and three-origin nine-message simulated lifecycle PASS. Intermediate live regressions exposed Е/Ё rejection and repeated uninformative opens. Final Specmash confirmation: two VERIFIED people, one VERIFIED personal Ready route. METIZ unresolved; no broad quality claim. Stronger-fact retention covered offline. Report preserves failures and limits. Persistent budgets, secrets and production records unchanged.
