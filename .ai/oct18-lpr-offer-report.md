# LPR and offer acceptance — 2026-10-18

## Outcome
Repaired and demonstrated the shared research → attributed person/contact → relevant reviewed offer path on three real companies. Four distinct historical company/signal inputs were examined: three have verified public personal contacts and accepted final AI offers; Prometey remains a general-address routing fallback, not a successful LPR discovery. This small cached/replayed cohort does not establish broad fresh-search yield or commercial conversion.

User authorized a NEW $0.50 maximum. October 18 shared ledger started at $0 and finished at **$0.2404064**, 70 requests/70 settled (configured-rate accounting, not provider invoice). Paid test processes used a $0.50 daily ceiling and retained the $0.20 company ceiling. Final cached integration made no model requests and left the ledger unchanged; its attempted zero-increment override failed PowerShell decimal formatting, so it used the ordinary default ceiling. Persistent limits and credentials were not changed.

## Final evidence
| Company | Publicly attributed recipient | Proposed pilot |
| --- | --- | --- |
| Императорский фарфоровый завод | Александр Николаев, заместитель коммерческого директора по работе с ключевыми клиентами; nik_aa@ipm.ru; https://www.ipm.ru/contacts/ | Evaluate custom B2B requests using example customer letters/specifications; deliver a classified request table for human review. |
| Спецмаш-Снг | Казанцев Пётр Юрьевич, генеральный директор; 600856@ooospecmash.ru; https://smsng.ru/contact-us/ | Process rare spare-part requests using incoming requests and supplier catalogs; deliver draft replies with alternatives/prices for specialist verification. |
| Производственная Компания Контур | Данила Никитич Котельников, исполнительный директор; kotelnikov-dn@pk-kontur.ru; https://xn--j1agcjjg.xn--p1ai/contacts/ | Test technological-change coordination using technical assignments/specifications; deliver a parameter table with manual compliance checks. |
| Прометей | No verified personal route; registry candidate remains LIKELY; info@prometheusenergy.ru is GENERAL | Routing-only battery request classification offer; excluded from personal-contact success. |

Final offers: oct18-offers-accepted.json and oct18-control-offer.json, all accepted on first generation attempt using final v7 writer/v3 review. Full production researchCompany integration: research-oct18-integrated-cached.json confirms all three selected personal routes, AI generation and Ready=true; cache reuse, 299–389 ms/company, no model calls, orphan requests=0, production SMTP=0. Earlier preflight/cohort/copy artifacts retain failed intermediate versions and are not final acceptance.

Four HH signal refresh attempts returned HTTP 403 (oct18-signal-freshness.json). Existing signals were used; current vacancy status is not independently revalidated. Fresh non-HH discovery and a larger matched benchmark were not run. Public email attribution/MX validation does not prove mailbox deliverability; no SMTP probing or real delivery occurred.

## Proven causes and changes
- A writer self-rating rejected copy although code appended the correct CTA. Code now owns greeting, CTA, source quotation and testable proposal framing. The writer supplies only subject, hypothesis, pilot input and output; hypotheses must start with “можно ли”. Free-form observations can no longer invent existing company problems.
- Independent bounded review checks context consistency, relevance to the actual recipient and useful input/output. It rejects unsupported systems, metrics and guaranteed gains without demanding evidence that the proposed test's problem already exists. CEO sponsorship and recipient roles different from the advertised vacancy are allowed. Actual person citations and official-page context enter both writer and reviewer.
- At most one repair, total 25s copy deadline, shared adapter/cache/budgets. Rejected/unavailable copy remains manual-review with quality=false. Builder readiness follows the gate. Regeneration shares this generator and invalidates approval; preview costs zero model calls. Existing production drafts are not retroactively rewritten.
- Search actions require exact company/domain/known-person identity. Misspellings and repeated failed opens return corrective feedback before spending provider requests, including resumed history.
- Fetched company-only citations cannot verify snippet-only people. Explicit provisional flags outrank numeric confidence downstream. The shared confirmed-person predicate protects contact mapping and selection; generic addresses remain fallback routes. People cache version 6 isolates previous semantics.

## Verification and operating state
- Final regression **35/35 PASS**, lint PASS, production build including TypeScript PASS (37 pages), diff check PASS. Focused fixtures cover mixed fetched/snippet evidence, misspelled queries, provisional high scores, accepted/rejected/repaired offers and regeneration/approval behavior.
- Isolated production HTTP/browser lifecycle checks all three origins, single/bulk/approve-all, nine simulated sends, duplicate prevention and follow-up/thread/idempotency. Model responses and SMTP are mocked in this lifecycle test; it is not live commercial evidence.
- Original October 17 changes and local history preserved. No production CRM writes, real SMTP sends, push or deploy. Local application uses process-only test mode, disabled follow-up automation and whitespace SMTP overrides; .env.local remains unchanged. Final process/HTTP result is recorded in .ai/current-task.md.

The evidence supports the three named outcomes above. Prometey, historical METIZ, source freshness and broader acquisition performance remain explicit limitations.

