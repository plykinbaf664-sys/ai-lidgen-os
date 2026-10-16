# Qwen production-path trials — 2026-10-16

## Verdict
Qwen connectivity and structured research work. Product research quality is NOT READY. No current provider-credit blocker: both Qwen semantic calls and OpenAI web-search calls succeeded during these runs. The failures below are observable quality/latency gaps, not historical quota errors.

Application restarted with current environment on http://localhost:3000; HTTP 200 confirmed. EMAIL_TEST_MODE=true and follow-up automation disabled for this launch. Live harness CRM mutations use temporary storage, email sender is an injected no-network sink. Production SMTP=0, orphan requests=0.

## Trials and results
- Fixed Business-origin research inputs: IPM, Spetsmash-SNG, METIZ (existing company/domain/signal). This is shared downstream research, not fresh Business discovery. Initial run: 3 companies, 3 person candidates, 1 VERIFIED personal address, 2 selected copy-gated Ready.
- Fresh Direct discovery: 42 results, 24 assessed (9 HH, 15 non-HH), 5 accepted HH companies with official domains; 0 accepted non-HH. Downstream: 3 people, 0 personal emails, 3 email routes, 1 queue Ready. New companies below provide generalization evidence, not improvement against a prior matched cohort.
- Imported Base: one company, no supplied person/contact/current signal. Kontur produced 3 people and a VERIFIED personal address, but queue Ready=0 because no current commercial signal was confirmed. Import summary's `ready=1` is contact-level readiness, not outreach readiness; do not report it as queue Ready.
- Matched targeted reruns after repairs: IPM keeps the same verified contact; role now reaches copy generator as PERSONAL and AI copy no longer falls back merely for saying LLM. METIZ recovers from an invalid open plan and reaches one HIGH_CONFIDENCE person/general email, but no verified personal contact. No full nine-company AFTER rerun claimed.
- Final IPM copy check removed the invented claim about vacancy responsibilities, but still inferred expansion plans from the title. Manual copy review FAIL despite mechanical Ready.

## Latest observation per company
This table combines separate origin runs and explicitly identified reruns; it is not one matched AFTER cohort.

| Company | Signal / input | Best person or research outcome | Best email | Type | Queue/copy gate |
|---|---|---|---|---|---|
| Императорский фарфоровый завод | Historical vacancy: deputy commercial director, new directions | Николаев Александр Анатольевич, deputy commercial director/key accounts | nik_aa@ipm.ru | VERIFIED_PERSONAL | Ready; AI copy needs factual revision |
| Спецмаш-СНГ | Historical sales hiring | Казанцев Пётр Юрьевич, director; adaptive model call aborted at 18s, fallback used | dorzap@list.ru | GENERAL | Ready through template fallback |
| МЕТИЗ ИМПЭКС | Historical CCO hiring | Татьяна Алёхина, HIGH_CONFIDENCE only after repair | info@metiz-ltd.ru | GENERAL | Ready through template fallback |
| Лига Цифровой Экономики | Fresh HH Direct AI | No person/contact | — | — | Not Ready |
| Детский мир. ДМ-тех | Fresh HH Direct AI | No person | job@detmir.ru | DEPARTMENT | Not Ready |
| Группа компаний TRAPEZA | Fresh HH Direct AI | No person | trapeza@trapeza.ru | GENERAL | Not Ready |
| Группа компаний Агротек | Fresh HH Direct AI | 3 system-VERIFIED leaders, no personal email | info@agrotek.com | GENERAL | Ready through fallback |
| ТРАНСКАПИТАЛБАНК | Fresh HH Direct AI | No person/contact | — | — | Not Ready |
| ПК Контур | Imported, current signal unconfirmed | Котельников Данила Никитич, executive director | kotelnikov-dn@pk-kontur.ru | VERIFIED_PERSONAL | Not Ready, correctly |

Distinct-company overview: 9 companies; 10 people candidates, 8 system-labelled VERIFIED (not an independent relevance/current-role audit); 2 companies with VERIFIED personal email, 0 HIGH_CONFIDENCE personal email, 4 general-only, 1 department, 7 email routes, 4 mechanical Ready. Only one company combines verified personal email and mechanical Ready; its copy still failed manual factual review. No delivery/inbox guarantee. No false email ownership observed in the two reviewed published personal contacts; all-person false attribution is not independently measured.

Evidence for personal contacts: https://www.ipm.ru/contacts/ and https://xn--j1agcjjg.xn--p1ai/contacts/ (including linked staff pages). Exact evidence is stored in the corresponding trace/ContactBundle; no company-specific production logic added.

## Traced repairs
1. METIZ homepage failed; model proposed guessed /contacts/ and /about/ URLs. Code correctly refused them but silently terminated. Now rejected open actions are explained to the model with bounded corrective opportunity; allowlist remains intact. Retry progressed through search (11 loop actions, 80.8s), but did not find a verified personal email.
2. `getMessageMode` understood legacy classification only. IPM's VERIFIED_PERSONAL contact became GENERAL, dropping role/target responsibility and using a routing CTA. It now consumes normalized/ContactBundle intelligence classification; predicted contacts cannot inherit personal mode.
3. Copy prompt permitted LLM/MVP, validator rejected them, producing template fallback. Aligned the validator with its documented allowed abbreviations; other unexplained English stays rejected.
4. Narrowed copy instructions to distinguish a vacancy title from actual supplied responsibilities. Live output still over-interprets commercial plans; prompt-only change is insufficient proof of factual copy quality.
5. Live harness now shares persistent research cache and spend ledger with the application via a junction while keeping CRM/lifecycle isolated. Initial/contact benchmark records AI/template source and fallback reason explicitly.

## Matched observations
IPM: verified personal contact unchanged; initial generic-routing/template copy → personal-mode AI copy. 34.9s initial → 8.5s warm rerun → 7.1s copy confirmation. Warm reruns reused the successful research, so this is cache reuse, not faster fresh discovery.
METIZ: no person/contact (11.9s, invalid actions silently dropped) → one unverified-current-role candidate/general route (80.8s, real research budget used). This is recovery from premature stop, not a personal-contact success.

## Cost
Recorded successful calls: Qwen 49 calls, 183127 input / 18129 output tokens (60800 input tokens marked cached), estimated $0.1022572 at configured rates. OpenAI gpt-4.1-mini web search 45 calls, estimated $0.628042 including 45 tool uses. Total successful-call estimate $0.7302992. Daily shared ledger after runs $0.7978796, including conservative reservations for aborted/unknown requests and the earlier tiny connection test. Limit remains $1/day and $0.20/company; no budget increase. Provider billing was not independently checked. Tavily remains separately billed and returned quota errors in observed paths.

## Lifecycle and verification
Fresh Direct lead: single approval, approve-all call (0 additional eligible rows), one queued item, one sender sink delivery, one generated follow-up. Follow-up elapsed time/no-reply state simulated; no IMAP and no real SMTP. This is not a multi-item bulk live proof.
34/34 regressions PASS, including new invalid-action recovery, normalized personal mode, predicted-mode and language-contract cases. TypeScript/lint/build PASS (37 generated pages), final diff check PASS and app HTTP 200 on port 3000 after build. No push, deploy, secret changes or unrelated lifecycle/UI/storage rewrite. Existing diff preserved.

## Remaining bottlenecks
Non-HH results are stale articles, sellers and insufficiently evidenced intent; 0/15 accepted. Qwen sometimes exceeds the 18s per-decision limit, after which deterministic fallback makes additional searches without equivalent semantic quality. People research found published personal email for 2/9 distinct companies. Mechanical copy gate does not detect all unsupported inferences. These require measured improvements; connection PASS and Ready count do not resolve them.

## Artifacts
`research-qwen-oct16-initial.json`, `research-qwen-oct16-confirmation.json`, `research-qwen-oct16-copy-confirmation.json`, `qwen-oct16-direct.json`, `qwen-oct16-import.json`, `qwen-oct16-summary.json`, `research-traces/qwen-oct16-*.json`.
