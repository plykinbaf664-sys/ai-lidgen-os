# Research and bulk controls — 2026-10-17

## Causes and changes
- Last real campaign: 20 needs_review, one approved. Slider displayed 1 while button/handler rejected stored batch size 5. Use the same clamped count for display and submission.
- Approve-all confirmation rendered below long panels. Native modal focuses confirmation and displays errors. Corrected loading state and bounded queue request.
- Historical decision aborted at 18s despite adapter allowing 30s. Wrapper now matches adapter; whole loop remains 75s.
- Old pages crowded out new results in the 24k character budget; concurrent opens shared one focus. Allocate space per source and remember focus per page.
- oct17-after-0 found published director/email but rejected Пётр versus Петр. Normalize Е/Ё without inferring ownership.
- Search summaries formerly counted as HIGH_CONFIDENCE. Now LIKELY until a primary page is fetched; source verification precedes email hypotheses.
- Repeated opens of short/failed sources wasted actions. Reject with feedback; retain stronger page-backed facts across later snippets.

## Live results, including failures
Real production researchCompany, Qwen/search, cache enabled, original signal/company cohort, no production CRM writes. Cache affects timings; these are not cold randomized trials.

| Trial | Companies | Candidates | VERIFIED people | VERIFIED personal routes | Contact Ready | Actions/company |
|---|---:|---:|---:|---:|---:|---:|
| Funded BEFORE: Specmash + METIZ | 2 | 2 | 1 | 1 | 2 | 9.5 |
| Intermediate AFTER | 2 | 2 | 1 | 0 | 1 | 11 |
| Subsequent two-company retry | 2 | 0 | 0 | 0 | 1 | 10 |
| Final targeted Specmash confirmation | 1 | 2 | 2 | 1 | 1 | 11 |

Do not combine best runs into a fabricated matched AFTER. Final stronger-fact retention has deterministic coverage, not another paid run. METIZ and fresh non-HH were not rerun after final changes within the allowance. No aggregate improvement claimed.

Confirmed lead: Спецмаш-СНГ, hiring sales manager (input signal). Дмитрий Геннадьевич Полькин, commercial director; dm.polkin@ooospecmash.ru, VERIFIED_PERSONAL, [official sales page](https://smsng.ru/otdel-prodazh/). Also confirmed CEO Пётр Юрьевич Казанцев. Personal AI copy and Ready; 59.1s. Direct public attribution; mailbox delivery not tested. METIZ remains general info@metiz-ltd.ru, not personal-contact success. No false verified email observed in reviewed sources; not a comprehensive attribution audit.

## Cost
Initial preflight blocked by local UTC budget, not Qwen credentials. User approved $0.50 extra for test processes. Ledger $0.9967328 → $1.4499068: **$0.453174**, 69 additional reservations, configured-rate estimate including unknown outcomes, not invoice. No persistent override or secret change. SMTP=0, orphans=0. Default $1 daily resets at UTC midnight (03:00 Moscow).

## Verification and scope
Real browser: one-item button enabled → visible modal → approve two → queue three. Three-origin HTTP: nine Ready fixtures → single/bulk approval → unique queues → nine local SMTP-simulator deliveries. Follow-up/thread/idempotency PASS. TypeScript/lint/build/diff and 34 regressions checked.

Run `node --experimental-transform-types scripts/check-release-transactions.mjs --browser` after build. Optional LEADGEN_TEST_CHROME sets browser executable; no installed dependencies/user profile.

Changed UI: email-outreach-queue.tsx, globals.css. Research: iterative-people-research.ts, research-evidence.ts, company-research-agent.ts. Tests: check-iterative-research.mjs, check-approval-stability.mjs, check-release-transactions.mjs, check-bulk-browser.mjs. Context/current-task updated; generated traces and preexisting app log preserved.

Bulk controls PASS. Overall NOT READY: inconsistent source selection on repeated bounded runs and no confirmed METIZ person+contact outcome. Suggested commit: `Fix bulk outreach controls and preserve person research evidence`.
