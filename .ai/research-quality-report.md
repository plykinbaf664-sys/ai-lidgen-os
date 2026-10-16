# Research quality: 2026-10-06

## Verdict: NOT READY

External stop: repeated HTTP 429 / insufficient_quota / credit_balance_exhausted on full research and outreach requests. Exact error is preserved in research-live2-direct.json:modelCalls. A tiny 11-token diagnostic request subsequently returned 200; this does not establish that full research is available. No further paid benchmark was started after inspecting the billing errors.

## Comparable cohort

16 fixed inputs: 13 previous Business Signals companies, 2 previous Direct AI companies, and the previously successful targeted Kontur case. Company, supplied official domain and signal were reused unchanged. This is a research benchmark, not 16 independently discovered new leads. The supplied domain is an input assumption; the benchmark does not re-prove discovery identity from scratch.

Full pre-quota AFTER = research-final.json (16 results, no HTTP 429). Latest attempted AFTER = research-verified.json (16 results, 9 companies affected by 429). These are separate runs; successful rows are not cherry-picked into a synthetic result. The latest run finished before the final entity-type guard, evidence URL binding and credit cooldown were added. Those final changes have local regression coverage, not another live pass.

| Metric | BEFORE (historical) | AFTER, full pre-quota | AFTER, latest quota-affected |
|---|---:|---:|---:|
| companies | 16 | 16 | 16 |
| people | 4 | 12 | 11 |
| fetchedVerifiedPeople | 3 | 3 | 3 |
| personalCorporateEmails | 1 | 2 | 1 |
| departmentEmails | 2 | 0 | 1 |
| generalOnly | 11 | 4 | 6 |
| publicProfiles | 0 | 2 | 0 |
| usableEmailContacts | 14 | 6 | 8 |
| readyCopyGate | 14 | 5 | 7 |
| avgActions | not recorded | 6.31 | 4.94 |
| avgSeconds | 33.7 | 32.5 | 24.8 |
| companiesWith429 | 0 | 0 | 9 |

Counts need interpretation: people includes HIGH_CONFIDENCE SERP candidates; it is not the count of confirmed current LPRs. fetchedVerifiedPeople is the stronger fetched-page tier. Earlier baseline Kontur had the wrong merged role. Latest people includes one erroneous department-as-person (BKK), so only 10 of its 11 candidates are named humans. Final entity-type validation now rejects teams. Two pre-quota public profile records include one registry page, which is not a usable messaging channel. usableEmailContacts counts company-level best verified email routes, including fallbacks; Ready is the copy gate, not a personal-contact quality pass.

False person attribution: 1 explicit non-person accepted in the latest attempted run; other company/current-role ambiguity remains unmeasured, so a blanket zero is not claimed. False verified email: 0 observed for the 2 explicitly attributed personal emails in the full pre-quota run. An earlier after2 run upgraded ab@arcontrade.am using initials without a named publication; that result is not accepted as verified evidence. The final loop disables that upgrade. Orphan requests: 0 in all completed benchmark reports. Production SMTP calls: 0.

## Company outcomes — full pre-quota AFTER

Source references below are the citations returned in that run. The final serializer additionally binds each quote to its own source URL rather than zipping separate URL and quote arrays.

| Company | Signal | Best LPR | Role | Person confidence | Best contact | Contact type | Evidence | Research outcome |
|---|---|---|---|---|---|---|---|---|
| АСД-электрик | Обнаружен сигнал найма | Лихачев Никита Сергеевич | генеральный директор | HIGH_CONFIDENCE | — | — | [source](https://saby.ru/profile/6671424295-665801001); [trace](research-traces/final-0.json) | Person found; usable contact absent |
| Императорский фарфоровый завод | Обнаружен сигнал найма | Николаев Александр Анатольевич | Заместитель коммерческого директора по работе с ключевыми клиентами | VERIFIED | nik_aa@ipm.ru | VERIFIED_PERSONAL | [source](https://www.ipm.ru/contacts/); [trace](research-traces/final-1.json) | Published personal email |
| АКВАСТОК | Обнаружен сигнал найма | Кравченко Евгений Олегович | директор | HIGH_CONFIDENCE | — | — | [source](https://www.list-org.com/company/8297844); [trace](research-traces/final-2.json) | Person found; usable contact absent |
| БКК Коломенский | Обнаружен сигнал найма | Алексей Куликов | Заместитель директора по персоналу ЗАО БКК «Коломенский» | HIGH_CONFIDENCE | https://setka.ru/users/abb42cc1-3445-45ab-b5eb-c091894780f3 | public profile | [source](https://setka.ru/users/abb42cc1-3445-45ab-b5eb-c091894780f3); [trace](research-traces/final-3.json) | Public profile; email absent |
| Спецмаш-Снг | Обнаружен сигнал найма | Казанцев Пётр Юрьевич | Генеральный директор | HIGH_CONFIDENCE | — | — | [source](https://dorzap.ru?p=12792); [trace](research-traces/final-4.json) | Person found; usable contact absent |
| МЕТИЗ ИМПЭКС | Обнаружен сигнал найма | — | — | — | info@metiz-ltd.ru | GENERAL | [source](https://metiz-ltd.ru); [trace](research-traces/final-5.json) | Corporate fallback only |
| КИРПИЧ GROUP | Обнаружен сигнал найма | Аркадий Аванесян | Дилеры, сбытовая сеть | VERIFIED | https://fedresurs.ru/persons/1de2f4da-bba5-11f0-aac9-00620be2fa80 | public profile | [source](https://xn----ftbnai5adade7a7b.xn--p1ai/sotrudniki/); [trace](research-traces/final-6.json) | Public profile; email absent |
| PolyOn | Обнаружен сигнал найма | — | — | — | — | — | —; [trace](research-traces/final-7.json) | No person/contact |
| Бригейд Фитнес | Обнаружен сигнал найма | Соломатин Василий Анатольевич | Директор | HIGH_CONFIDENCE | — | — | [source](https://saby.ru/profile/6685020912-668501001); [trace](research-traces/final-8.json) | Person found; usable contact absent |
| Сибалюкс | Обнаружен сигнал найма | Красношапка Владимир Андреевич | директор | HIGH_CONFIDENCE | panel@sibalux.ru | GENERAL | [source](https://sibalux.ru/kontakty); [trace](research-traces/final-9.json) | Corporate fallback only |
| АРКОН ТРЕЙД | Обнаружен сигнал найма | — | — | — | info@arcontrade.am | GENERAL | [source](https://arcontrade.am/contacts); [trace](research-traces/final-10.json) | Corporate fallback only |
| ГРУЗВИНПРОМ | Обнаружен сигнал найма | Гудадзе Паата Давидович | Генеральный директор | HIGH_CONFIDENCE | — | — | [source](https://www.rusprofile.ru/person/gudadze-pd-773610856803); [trace](research-traces/final-11.json) | Person found; usable contact absent |
| МирБир | Обнаружен сигнал найма | Игорь Лехнович | Генеральный директор | HIGH_CONFIDENCE | — | — | [source](https://saby.ru/profile/780226693090); [trace](research-traces/final-12.json) | Person found; usable contact absent |
| Прометей | Специалист по внедрению ИИ и оптимизации бизнес-процессов | Климов Владимир Сергеевич | Управляющий | HIGH_CONFIDENCE | info@prometheusenergy.ru | GENERAL | [source](https://prometheusenergy.ru/contacts/); [trace](research-traces/final-13.json) | Corporate fallback only |
| Сбер. IT | SDET / Разработчик AI решений (HR платформа) | — | — | — | — | — | —; [trace](research-traces/final-14.json) | No person/contact |
| Производственная Компания Контур | Инженер (Специалист) по автоматизации бизнес-процессов | Котельников Данила Никитич | Исполнительный директор | VERIFIED | kotelnikov-dn@pk-kontur.ru | VERIFIED_PERSONAL | [source](https://xn--j1agcjjg.xn--p1ai/contacts/); [trace](research-traces/final-15.json) | Published personal email |

## Latest quota-affected attempt

| Company | People | Best email | HTTP 429 | Stop |
|---|---:|---|---|---|
| АСД-электрик | 1 | — | false | research_budget |
| Императорский фарфоровый завод | 1 | nik_aa@ipm.ru | false | personal_contact_evidenced |
| АКВАСТОК | 1 | hr@aquastok.ru | false | research_deadline |
| БКК Коломенский | 2 | — | false | personal_contact_evidenced |
| Спецмаш-Снг | 2 | — | false | research_deadline |
| МЕТИЗ ИМПЭКС | 1 | info@metiz-ltd.ru | false | research_budget |
| КИРПИЧ GROUP | 1 | — | false | research_budget |
| PolyOn | 0 | info@polyon.us | true | model_unavailable |
| Бригейд Фитнес | 0 | — | true | model_unavailable |
| Сибалюкс | 0 | ved@sibalux.ru | true | model_unavailable |
| АРКОН ТРЕЙД | 1 | info@arcontrade.am | true | model_unavailable |
| ГРУЗВИНПРОМ | 0 | mail@gruzvinprom.com | true | model_unavailable |
| МирБир | 0 | — | true | model_unavailable |
| Прометей | 1 | info@prometheusenergy.ru | true | model_unavailable |
| Сбер. IT | 0 | — | true | model_unavailable |
| Производственная Компания Контур | 0 | — | true | model_unavailable |

## Trace-supported root causes and changes

- Semantic evidence discarded by score-scale mismatch (7–9 vs 0–100), paraphrased quotations, and subsequent empty assessments overwriting prior facts. The iterative loop validates exact cited facts, feeds rejection reasons back, and retains accepted facts.
- Heuristic owner=CEO/founder contaminated the plan. On IPM the official contacts page already contained named commercial leaders with emails, while the model continued CEO searches. The loop now uses signal + offer to choose the process owner. Controlled diagnostics on identical IPM/Kontur inputs: full model selected both personal emails; mini selected only Kontur. No default-model readiness claim follows from those two cases.
- Top SERP hits disappeared because only the tail of a combined result list reached the next round. Recent queries now each retain their top hits. Search hits can be opened; later queries use newly discovered people and validation feedback.
- Product navigation crowded out useful links; canonical URL keys caused trailing-slash redirect loops; footer/mailto evidence was removed. Link diversity, exact redirect targets and footer/mailto preservation address these losses.
- Contacts restarted a speculative crawler after research. Fetched official pages now feed the existing domain/MX validator. This also exposed incomplete page coverage: fallback reach fell in the pre-quota run; later footer preservation recovered part of it. No claim that fallback coverage is fully restored.
- Initial matching could promote an unassigned email to VERIFIED_PERSONAL; blocked for iterative research. A department was returned as a person; final structured entity-type validation rejects it. Quote/source pairs are persisted together.
- Full research requests eventually failed with exhausted-credit errors. Final code records the specific reason and shares a 5-minute process-local credit cooldown across research, Direct AI assessment and copy generation.

## Direct AI Need non-HH

Historical: 62 results / 22 assessments / 15 non-HH assessments / 2 accepted companies (HH) / 1 Ready / 0 personal email.
Latest: 54 results / 24 assessments / 15 non-HH assessments / 6 accepted companies / 0 accepted non-HH / 1 downstream Ready / 0 personal email.
The first new run still lost several semantic assessments and searched non-HH procurement only in the news index. General-web routing and compact negative assessments were applied before the second run. The second run evaluated all 15 non-HH items, but they were seller pages, generic articles, stale or unconfirmed demand. Thus no non-HH identity-resolution success is proven live. Regression fixtures test resolution without structured employers, but cannot replace that missing live outcome.
Latest Direct AI lifecycle: 1 single approval, bulk invocation with 0 additional eligible entries, 1 queued, 1 in-memory sender sink call, 1 follow-up with simulated elapsed time/no-reply. No SMTP or IMAP network calls. See research-live2-direct.json. Imported Base and fresh Business discovery were not rerun after the final research changes because of the quota blocker; the fixed-cohort benchmark exercised the shared production researchCompany path.

## Validation and limitations

Final TypeScript, lint, production build: PASS. Release regressions: 31/31 PASS. Additional cooldown test: PASS. Approval/single/bulk/approve-all, queue and follow-up regression checks remain passing. git diff --check: PASS. Build regenerated .next safely; no generated-artifact cleanup was needed to make checks pass. No secrets, package.json or dependencies changed; no push/deploy/commit.
Remaining technical limits, in addition to credits: person-to-contact yield is low; some affiliations rely on SERP/old mentions rather than current fetched evidence; fallback site coverage is lower after removing speculative crawling; copy gates rejected some otherwise usable contact rows; phone channels are not extracted by the new loop; non-HH live discovery has zero accepted companies. These are not concealed as external failures. The account blocker prevents validating further semantic/retrieval repairs, not a claim that all remaining quality problems are external.

Reproduce (paid, after restoring provider capacity): node --env-file=.env.local --experimental-transform-types scripts/benchmark-research-loop.mjs resumed; run check-final-live.mjs with LIVE_REPORT_PREFIX for direct/business/import in isolated storage. Local checks: node scripts/check-release-regression.mjs; npx tsc --noEmit; npm run lint; npm run build.

Suggested commit message after renewed live validation: Improve evidence-driven company research and contact attribution. No commit created.
