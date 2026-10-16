# Funded research investigation — 2026-10-08

## Verdict: NOT READY

OpenAI was restored and real semantic runs executed. A new published personal address passed the complete researchCompany path. A later HTTP 429 / credit_balance_exhausted stopped further runs. This is a new exhaustion after successful paid work, not the old billing failure reused as an explanation.

## Comparable measurements

The historical input cohort has 16 companies (13 Business Signals, 2 Direct AI, 1 Kontur). All company/domain/signal inputs were reused unchanged. Input domains were not independently rediscovered in this research benchmark. research-oct08-final.json is a completed 16-company live run after initial repairs. After inspecting its traces, navigation memory, corporate cross-links, tracking URL normalization and direct search routing were repaired.

The final confirmation cohort was selected before its execution: indices 0,1,4,5,6,9,12,15, covering earlier successes and failures. All eight finished without model errors. The remaining disjoint eight were attempted separately; two started and six were skipped after credit exhaustion. Do not combine successful rows into an artificial 16-company final PASS. The final registry-domain safety restriction was added during the confirmation run and is covered by regression tests; the three observed personal email results use direct corporate-page evidence, not that rejected registry route.

| Metric | Historical 16 | Broad funded 16 | Matched BEFORE 8 | Latest AFTER 8 |
|---|---:|---:|---:|---:|
| companiesResearched | 16 | 16 | 8 | 8 |
| personCandidates | 12 | 12 | 7 | 9 |
| confirmedPeople | 3 | 5 | 3 | 6 |
| companiesWithPersonalEmail | 2 | 2 | 2 | 3 |
| VERIFIED | 2 | 2 | 2 | 3 |
| HIGH_CONFIDENCE | 0 | 0 | 0 | 0 |
| PREDICTED | 0 | 30 | 0 | 15 |
| departmentEmails | 0 | 1 | 0 | 0 |
| generalFallbackOnly | 4 | 6 | 2 | 2 |
| publicProfiles | 2 | 1 | 1 | 1 |
| usableEmailContacts | 6 | 9 | 4 | 5 |
| Ready | 5 | 9 | 4 | 5 |
| avgActions | 6.31 | 8.56 | 5.38 | 8 |
| avgRuntimeSeconds | 32.48 | 42.77 | 30.14 | 42.66 |
| falsePersonAttribution | not independently measured across all people | not independently measured across all people | not independently measured across all people | not independently measured across all people |
| falseVerifiedEmail | 0 observed in reviewed published personal addresses; not a delivery guarantee | 0 observed in reviewed published personal addresses; not a delivery guarantee | 0 observed in reviewed published personal addresses; not a delivery guarantee | 0 observed in reviewed published personal addresses; not a delivery guarantee |

Ready counts the existing contact/copy gate and includes general fallbacks. ConfirmedPeople requires the fetched VERIFIED tier; SERP candidates are separate. Public profile URLs are not automatically usable messaging endpoints. Predicted addresses are hypotheses, not usable contacts or verified emails. False attribution is not exhaustively measured; blanket zero is not claimed.

## Root causes established from traces

- Provider failures were hidden by successful empty fallback responses. Tavily returned HTTP 432 plan usage limit; free search often returned empty/irrelevant results. Quota cooldown and explicit incomplete-search errors now preserve the real failure. A bounded OpenAI web_search fallback returns cited search hints, which still require source fetches for email proof.
- Direct AI non-HH bypassed the shared search chain and called exhausted Tavily directly. It now uses the same resilient general-web router. Latest non-HH results still predominantly contain suppliers and generic procurement pages, not current named buyers; they remain rejected.
- Evidence was retrieved but lost between semantic rounds: origin navigation disappeared, secondary corporate domains were absent from model state, and aliases were unconfirmed downstream. Persistent navigation/domain context and mutual corporate root links now preserve that path. In broad run index 4, dm.polkin@ooospecmash.ru was extracted but rejected downstream; confirmation index 2 correctly reaches VERIFIED_PERSONAL and Ready.
- A canonical role did not literally match its inflected source text. roleSourceText preserves the exact role evidence. Current department pages no longer require an additional current-year news story to establish the role, while old news alone remains insufficient.
- Search citation tracking parameters disagreed with clean model-generated open URLs. Canonicalization removes only utm_* and preserves functional parameters. Contact claims trigger source opening; failed quotes get one bounded repair. New documents count as progress before person extraction.
- Earlier initial/address matching could imply ownership. Ranked email hypotheses now require a confirmed current person and domain, are capped at five, and have separate VERIFIED/HIGH_CONFIDENCE/PREDICTED/REJECTED states. MX or catch-all acceptance alone cannot establish ownership. No SMTP probing is performed.

## Latest confirmed company outcomes

| Company | Signal | Best LPR | Role | Person confidence | Best contact | Contact type | Evidence | Research outcome |
|---|---|---|---|---|---|---|---|---|
| АСД-электрик | Работодатель: Завод АСД-электрик; открыта вакансия: Менеджер по продажам. | — | — | — | — | — | —; [trace](research-traces/oct08-confirmation-0.json) | Unresolved; not Ready |
| Императорский фарфоровый завод | Работодатель: Императорский фарфоровый завод; открыта вакансия: Заместитель коммерческого директора по развитию новых направлений. | Николаев Александр Анатольевич | Заместитель коммерческого директора по работе с ключевыми клиентами | VERIFIED | nik_aa@ipm.ru | VERIFIED_PERSONAL | [source](https://www.ipm.ru/contacts/); [trace](research-traces/oct08-confirmation-1.json) | Published personal email; Ready |
| Спецмаш-Снг | Работодатель: Спецмаш-Снг; открыта вакансия: Менеджер по продажам. | Полькин Дмитрий Геннадьевич | Коммерческий директор | VERIFIED | dm.polkin@ooospecmash.ru | VERIFIED_PERSONAL | [source](https://smsng.ru/otdel-prodazh/); [trace](research-traces/oct08-confirmation-2.json) | Published personal email; Ready |
| МЕТИЗ ИМПЭКС | Работодатель: МЕТИЗ ИМПЭКС; открыта вакансия: Коммерческий директор (CCO/Chief Commercial Officer). | Яна Ермалюк | генеральный директор компании «МЕТИЗ ИМПЭКС» | HIGH_CONFIDENCE | info@metiz-ltd.ru | GENERAL | [source](https://metiz-ltd.ru); [trace](research-traces/oct08-confirmation-3.json) | Corporate fallback only; Ready |
| КИРПИЧ GROUP | Работодатель: КИРПИЧ GROUP; открыта вакансия: Менеджер по продажам. | Аркадий Аванесян | Аркадий Аванесян Дилеры, сбытовая сеть | VERIFIED | https://xn----ftbnai5adade7a7b.xn--p1ai/sotrudniki/ | — | [source](https://xn----ftbnai5adade7a7b.xn--p1ai/sotrudniki/); [trace](research-traces/oct08-confirmation-4.json) | Person without usable email; not Ready |
| Сибалюкс | Работодатель: Сибалюкс; открыта вакансия: Директор по развитию сервисных центров (фрезеровка композитных панелей, сборка готовых кассет). | Красношапка Владимир Андреевич | Генеральным директором с момента регистрации является Красношапка Владимир Андреевич. | HIGH_CONFIDENCE | ved@sibalux.ru | GENERAL | [source](https://sibalux.ru); [trace](research-traces/oct08-confirmation-5.json) | Corporate fallback only; Ready |
| МирБир | Работодатель: Компания МирБир; открыта вакансия: Руководитель отдела оптовых продаж. | — | — | — | — | — | —; [trace](research-traces/oct08-confirmation-6.json) | Unresolved; not Ready |
| Производственная Компания Контур | искать и внедрять современные решения в бизнес-процессы и ИИ-технологии | Котельников Данила Никитич | Исполнительный директор | VERIFIED | kotelnikov-dn@pk-kontur.ru | VERIFIED_PERSONAL | [source](https://xn--j1agcjjg.xn--p1ai/contacts/); [trace](research-traces/oct08-confirmation-7.json) | Published personal email; Ready |

## Completed broad run before final trace repairs

| Company | Signal | Best LPR | Role | Person confidence | Best contact | Contact type | Evidence | Research outcome |
|---|---|---|---|---|---|---|---|---|
| АСД-электрик | Работодатель: Завод АСД-электрик; открыта вакансия: Менеджер по продажам. | Никита Сергеевич Лихачев | генеральным директором ООО «Завод АСД-Электрик» является Никита Сергеевич Лихачев. | HIGH_CONFIDENCE | — | — | [source](https://www.tek-all.ru/companies/1852-zavod-asd-elektrik/?utm_source=openai); [trace](research-traces/oct08-final-0.json) | Person without usable email; not Ready |
| Императорский фарфоровый завод | Работодатель: Императорский фарфоровый завод; открыта вакансия: Заместитель коммерческого директора по развитию новых направлений. | Николаев Александр Анатольевич | Заместитель коммерческого директора по работе с ключевыми клиентами Николаев Александр Анатольевич | VERIFIED | nik_aa@ipm.ru | VERIFIED_PERSONAL | [source](https://www.ipm.ru/contacts/); [trace](research-traces/oct08-final-1.json) | Published personal email; Ready |
| АКВАСТОК | Работодатель: АКВАСТОК; открыта вакансия: Руководитель (отдел продаж, строительная сфера, B2B). | — | — | — | hr@aquastok.ru | DEPARTMENT | [source](https://www.aquastok.ru/vakansii/); [trace](research-traces/oct08-final-2.json) | Corporate fallback only; Ready |
| БКК Коломенский | Работодатель: БКК Коломенский; открыта вакансия: Старший бизнес-партнер по работе с персоналом (департамент логистики). | — | — | — | — | — | —; [trace](research-traces/oct08-final-3.json) | Unresolved; not Ready |
| Спецмаш-Снг | Работодатель: Спецмаш-Снг; открыта вакансия: Менеджер по продажам. | Полькин Дмитрий Геннадьевич | Коммерческий директор | VERIFIED | — | — | [source](https://smsng.ru/otdel-prodazh/?utm_source=openai); [trace](research-traces/oct08-final-4.json) | Person without usable email; not Ready |
| МЕТИЗ ИМПЭКС | Работодатель: МЕТИЗ ИМПЭКС; открыта вакансия: Коммерческий директор (CCO/Chief Commercial Officer). | Яна Ермалюк | генеральный директор ООО «МЕТИЗ ИМПЭКС» | HIGH_CONFIDENCE | info@metiz-ltd.ru | GENERAL | [source](https://metiz-ltd.ru); [trace](research-traces/oct08-final-5.json) | Corporate fallback only; Ready |
| КИРПИЧ GROUP | Работодатель: КИРПИЧ GROUP; открыта вакансия: Менеджер по продажам. | Аркадий Аванесян | Аркадий Аванесян Дилеры, сбытовая сеть | VERIFIED | https://xn----ftbnai5adade7a7b.xn--p1ai/sotrudniki/ | — | [source](https://xn----ftbnai5adade7a7b.xn--p1ai/sotrudniki/); [trace](research-traces/oct08-final-6.json) | Person without usable email; not Ready |
| PolyOn | Работодатель: PolyOn; открыта вакансия: Менеджер по продажам. | — | — | — | info@polyon.us | GENERAL | [source](https://www.polyon.us/); [trace](research-traces/oct08-final-7.json) | Corporate fallback only; Ready |
| Бригейд Фитнес | Работодатель: Бригейд Фитнес; открыта вакансия: Директор по развитию бизнеса в странах СНГ. | Василий Анатольевич Соломатин | директором компании является Соломатин Василий Анатольевич | HIGH_CONFIDENCE | — | — | [source](https://companies.rbc.ru/id/1126685028337-ooo-brigejd-fitnes/?utm_source=openai); [trace](research-traces/oct08-final-8.json) | Person without usable email; not Ready |
| Сибалюкс | Работодатель: Сибалюкс; открыта вакансия: Директор по развитию сервисных центров (фрезеровка композитных панелей, сборка готовых кассет). | Красношапка Владимир Андреевич | генеральным директором | HIGH_CONFIDENCE | ved@sibalux.ru | GENERAL | [source](https://sibalux.ru); [trace](research-traces/oct08-final-9.json) | Corporate fallback only; Ready |
| АРКОН ТРЕЙД | Работодатель: АРКОН ТРЕЙД; открыта вакансия: Менеджер по развитию бизнеса в России (алкоголь; дистрибьюторы и локальные сети). | — | — | — | info@arcontrade.am | GENERAL | [source](https://arcontrade.am); [trace](research-traces/oct08-final-10.json) | Corporate fallback only; Ready |
| ГРУЗВИНПРОМ | Работодатель: ГРУЗВИНПРОМ; открыта вакансия: Коммерческий директор (CCO). | Паата Давидович Гудадзе | Генеральным директором ООО «ГРУЗВИНПРОМ» является Гудадзе Паата Давидович. | HIGH_CONFIDENCE | mail@gruzvinprom.com | GENERAL | [source](https://gruzvinprom.com); [trace](research-traces/oct08-final-11.json) | Corporate fallback only; Ready |
| МирБир | Работодатель: Компания МирБир; открыта вакансия: Руководитель отдела оптовых продаж. | Игорь Владимирович Лехнович | генеральным директором которого с 13 марта 2019 года является Игорь Владимирович Лехнович | HIGH_CONFIDENCE | — | — | [source](https://www.tbank.ru/business/contractor/legal/1167847486982/?utm_source=openai); [trace](research-traces/oct08-final-12.json) | Person without usable email; not Ready |
| Прометей | • искать возможности применения ИИ в продажах, закупках, логистике, маркетинге, документообороте, аналитике и других направлениях; • тестировать ИИ-сервисы и выбирать решения, которые дают измеримый результат для бизнеса; • проектировать и внедрять ИИ-ассистентов, автоматические сценарии обработки информации и внутренние базы знаний; | Климов Владимир Сергеевич | генеральным директором и учредителем | HIGH_CONFIDENCE | info@prometheusenergy.ru | GENERAL | [source](https://prometheusenergy.ru); [trace](research-traces/oct08-final-13.json) | Corporate fallback only; Ready |
| Сбер. IT | создание AI-агентов: разработка и внедрение AI-моделей и агентов для автоматической генерации UI/API-тестов их оптимизации и self-healing'а | — | — | — | — | — | —; [trace](research-traces/oct08-final-14.json) | Unresolved; not Ready |
| Производственная Компания Контур | искать и внедрять современные решения в бизнес-процессы и ИИ-технологии | Котельников Данила Никитич | Исполнительный директор | VERIFIED | kotelnikov-dn@pk-kontur.ru | VERIFIED_PERSONAL | [source](https://xn--j1agcjjg.xn--p1ai/contacts/); [trace](research-traces/oct08-final-15.json) | Published personal email; Ready |

## Direct AI non-HH

BEFORE: 15 non-HH assessed, 0 non-HH companies. AFTER shared-router repair: 42 results, 24 assessed, 15 non-HH assessed, 0 accepted non-HH companies. 3 accepted HH companies entered downstream, 0 personal emails, 0 downstream Ready. Discovery-ready is not downstream Ready.

The latest 15 non-HH materials did not establish current buyer demand. Examples include AI solution vendor homepages and generic tender platforms, which correctly failed direct_intent_not_relevant. This remains a retrieval-quality failure, not proof that non-HH company resolution is solved. Latest full artifact: oct08-shared-search-direct.json. Its downstream modelCalls include the fresh credit_balance_exhausted response.

## Verification and limitations

npx tsc --noEmit PASS; npm run lint PASS; npm run build PASS (37 routes/pages); release regressions 33/33 PASS; git diff --check PASS. Build regenerated its artifacts normally; cleanup was not needed. No SMTP, real messages, secret/package/dependency changes, push, deploy or commit.

Approval/queue/dry-run/follow-up remain covered by regressions. oct08-final-direct.json additionally exercised one single approval, one queued item, one dry-run delivery sink and one simulated-time follow-up during this funded iteration. Latest shared-router Direct run has zero Ready and is not an additional lifecycle PASS. Fresh Business discovery and Imported Base were not rerun after final research repairs; the shared production research path was exercised on the fixed cohort.

Three personal addresses were reviewed against stored fetched-page citations: nik_aa@ipm.ru, dm.polkin@ooospecmash.ru, kotelnikov-dn@pk-kontur.ru. No false VERIFIED ownership observed among these three; no delivery/inbox guarantee is implied. Some other people have only SERP affiliation, phone channels are not extracted by this loop, and personal-contact coverage remains limited.

External stop: OpenAI 429 credit_balance_exhausted in research-oct08-confirmation-rest.json and oct08-shared-search-direct.json. Six remaining cohort companies were skipped. No further paid requests after detecting that failure. Recorded usage estimates across funded Oct08 runs total about $5.50, excluding unrecorded early usage/aborted requests and any extra search-content billing; this is not an account billing statement.

## Changed files in this funded continuation

Research: iterative-people-research.ts, research-evidence.ts, lead-discovery-engine.ts, source-campaign-runner.ts. Search: search/leadgen-search-provider.ts, search/tavily-provider.ts, new search/openai-web-search-provider.ts; Direct routing: ai-hiring-live-canary.ts. Verification/harness: check-iterative-research.mjs, check-public-web-search.mjs, benchmark-research-loop.mjs, check-final-live.mjs, build-funded-research-report.mjs. Documentation: AGENTS.md, .ai/current-task.md, this report and metrics. Earlier uncommitted project changes were preserved.

Reproduce offline: node scripts/check-release-regression.mjs; npx tsc --noEmit; npm run lint; npm run build. Live requires available provider capacity: node --experimental-transform-types --env-file=.env.local scripts/benchmark-research-loop.mjs <new-phase>; use LIVE_REPORT_PREFIX with check-final-live.mjs direct for isolated discovery. Suggested commit message: Fix research evidence retention and shared search fallback. No commit made.
