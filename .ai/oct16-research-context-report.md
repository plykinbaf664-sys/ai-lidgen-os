# Research context investigation — 2026-10-16

## Verdict: NOT READY
Current configured semantic provider is unavailable. One production `researchCompany` preflight returned OpenAI HTTP 429 `insufficient_quota / credit_balance_exhausted`; Qwen key/base URL absent. No additional paid model requests after detection. Search fallback also returned Tavily HTTP 432. Sources: `research-oct16-preflight.json`, `research-traces/oct16-preflight-0.json`.

## Actual losses and changes
| Transition | Evidence | Change / limit |
|---|---|---|
| Interpretation → persistent person state | `research-traces/oct08-confirmation-3.json` round 3: Яна Ермалюк explicitly currentRole=false, still in acceptedPeople | Explicit negative current-person updates retract active candidates; omission preserves facts. Sources stay in trace. |
| Person ranking → email hypotheses | Code chose first inserted known person | Choose highest semantic relevance among current confirmed people without email; still at most five hypotheses for one person. |
| Evidence → next Direct plan | Replanning caller replaced original excerpt with classification/reason text | Source excerpt and structured assessment now travel separately. |
| Semantic query → provider | Initial refinement used public-only provider and guessed angle from words | Shared dispatch honors model angle for both initial/refined queries, with existing web router handling fallback. |
| Refinement → stop | Planner required at least four queries even when only two were consumed | Refinement can return zero to three queries, explicitly scope non-HH, and stop without repeating exhausted hypotheses. Initial broad planning remains separate. |
| Candidate email → verified recipient (latest live) | IPM fallback found a person and `aga_ap@ipm.ru`; metadata public_contact_verified=false, no email_person_evidence | No promotion by proximity/initials. Selected info@ipm.ru is general fallback, not personal-contact research success. Semantic provider needed for live test of adaptive research. |

No stable UI/storage/queue/sender modules changed in this iteration. No company/person/email/query hardcoding added. Confidence gates unchanged. People-cache version bumped; financial ledger retained.

## Measurements: do not combine incompatible runs
Historical matched eight (Oct08): confirmed people 3→6; VERIFIED personal addresses 2→3; usable email contacts 4→5; Ready 4→5; general-only 2→2; actions/company 5.38→8.

New preflight (one historical input, warm production cache enabled): 10.505 seconds, one deterministic person candidate, zero VERIFIED/HIGH_CONFIDENCE personal addresses in ContactBundle, one selected general fallback Ready. One attempted model call failed before semantic research. Orphan requests 0; SMTP 0. This is NOT an AFTER quality benchmark.

After changes, offline production-loop fixtures confirm two explicit role retractions remove both candidates and their hypotheses; omitted known facts survive; hypotheses target the relevant owner; source evidence survives refinement; job/web semantic routing survives misleading keywords; empty web results do not repeat the router fallback; refinement can stop. These are invariant checks, NOT new leads.

Full matched live AFTER, new-company generalization, non-HH semantic benchmark and fresh personalization quality: BLOCKED, not measured. Latest historical non-HH: 15 assessed, 0 accepted. No delivery or full false-attribution audit claimed.

## Historical examples only (not refreshed buyer intent)
- Спецмаш-СНГ: hiring sales staff; hypothesis of sales-process automation, not proven AI demand. Дмитрий Полькин, commercial director, `dm.polkin@ooospecmash.ru`; official source https://smsng.ru/otdel-prodazh/. Published-personal-email success in Oct08 confirmation.
- ПК Контур: source vacancy explicitly called for implementing AI in business processes. Данила Котельников, executive director, `kotelnikov-dn@pk-kontur.ru`; official source https://xn--j1agcjjg.xn--p1ai/contacts/. Historical confirmation only; signal freshness needs a new run.

## Cost and side effects
Local UTC ledger 2026-10-16 after preflight: requests=1, settled=1, chargedUsd=0. No successful billed model completion. Tavily returned 432; its billing is outside this ledger, so no claim of independently verified total provider spend. No budget increase, secrets/dependency changes, real email, push, deploy or commit. Cache and prior uncommitted changes retained.

## Verification
34/34 regression suite PASS including new state/context/routing cases. TypeScript and production build PASS (37 generated pages); lint PASS. Initial tsc failure came from corrupted generated `.next/dev/types/routes.d.ts`; only that generated directory was removed after absolute-path validation and types regenerated. Final checks repeated after final changes; see current task.

Lifecycle evidence this iteration is offline regression coverage (approval/queue/dry-run/follow-up), not a fresh live full funnel. Context pack reconciled with inspected runtime paths, real verification commands and this limitation.

## Resume
When existing configured provider capacity becomes available, run one canary at unchanged budgets, then equivalent fixed before/after sample and new-company/non-HH checks. Preserve cache mode and failure records. Do not treat API availability, regression PASS or general-email Ready as commercial acceptance.
