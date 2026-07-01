# ai-lidgen-os
# Leadgen OS — Current Architecture

## Цель проекта

Leadgen OS — внутренняя система лидогенерации, которая должна находить не просто компании, а компании с подтверждёнными бизнес-сигналами.

Главный принцип:

```text
Signal → Company → Lead → Contact → Outreach
```

Система не должна работать по логике:

```text
Company → потом ищем повод
```

Сначала находится сигнал, потом компания, потом уже формируется лид.

---

# Текущий статус

На текущем этапе реализованы:

* Next.js App Router + TypeScript
* Leadgen UI
* Mock Pipeline
* Supabase Persistence
* Campaign History
* Campaign Details
* Telegram Notification Layer
* Signal Foundation
* Tavily Search Provider
* Signal Query Builder

---

# Основной поток сейчас

```text
/leadgen
↓
POST /api/leadgen/run
↓
Mock Pipeline
↓
Supabase
↓
Campaign History
↓
Campaign Details
```

Пока основной pipeline всё ещё работает на mock-данных.

Real Finder ещё не подключён к `/api/leadgen/run`.

---

# База данных

Основные таблицы:

```text
leadgen_campaigns
leadgen_leads
leadgen_signals
leadgen_events
leadgen_telegram_notifications
```

## leadgen_campaigns

Хранит запуски кампаний.

## leadgen_leads

Хранит найденные компании/лиды.

Пока в этой таблице остаются старые поля:

```text
signal_title
signal_detail
signal_source_label
```

Они используются как preview главного сигнала.

Источник правды по сигналам теперь:

```text
leadgen_signals
```

## leadgen_signals

Хранит все сигналы по компаниям.

Одна компания может иметь несколько сигналов.

Примеры сигналов:

```text
HIRING_SIGNAL
GO_TO_MARKET_SIGNAL
GROWTH_SIGNAL
CONTENT_SIGNAL
TRAFFIC_SIGNAL
TECH_SIGNAL
```

## leadgen_events

Хранит события pipeline.

## leadgen_telegram_notifications

Хранит подготовленные Telegram-уведомления.

---

# Signal Foundation

Leadgen OS теперь поддерживает несколько сигналов на одну компанию.

Модель:

```text
Campaign
↓
Lead / Company
↓
Signals[]
```

Для каждого сигнала сохраняются:

```text
signal_type
signal_title
signal_detail
signal_source_label
source_url
confidence_score
found_at
```

Это нужно, чтобы система была не company-first, а signal-first.

---

# Search Provider Layer

Добавлен изолированный слой поиска.

Файлы:

```text
lib/leadgen/search/search-provider.ts
lib/leadgen/search/tavily-provider.ts
app/api/leadgen/search-test/route.ts
```

Тестовый endpoint:

```text
GET /api/leadgen/search-test?query=...
```

Он проверяет, что Tavily Search Provider работает и возвращает реальные результаты поиска.

Важно:

Tavily пока НЕ подключён к основному pipeline.

---

# Signal Query Builder

Добавлен слой генерации поисковых запросов.

Файлы:

```text
lib/leadgen/signals/query-builder.ts
app/api/leadgen/query-test/route.ts
```

Тестовый endpoint:

```text
GET /api/leadgen/query-test?signal=HIRING_SIGNAL
```

Query Builder генерирует поисковые запросы для 6 типов сигналов:

```text
HIRING_SIGNAL
GO_TO_MARKET_SIGNAL
GROWTH_SIGNAL
CONTENT_SIGNAL
TRAFFIC_SIGNAL
TECH_SIGNAL
```

Запросы генерируются на русском и английском языке.

Система использует:

* смысловые группы сигналов;
* ICP;
* отрасли;
* типы компаний;
* ключевые слова;
* source hints.

Source hints — это не ограничения и не whitelist.
Это примеры источников и контекстов, которые помогают формировать запросы.

---

# ICP Config

ICP пока зашит в:

```text
lib/leadgen/config.ts
```

Это нормально для текущего этапа, потому что Leadgen OS строится под собственный фиксированный оффер, а не как универсальный SaaS.

В config сейчас хранится:

* languages
* industries RU/EN
* companyTypes RU/EN
* keywords RU/EN
* signalPriorities
* signalSourceHints

---

# Что уже можно проверить вручную

## Проверить Tavily Search Provider

```text
http://localhost:3000/api/leadgen/search-test?query=sales%20manager%20hiring%20B2B%20SaaS
```

## Проверить Query Builder

```text
http://localhost:3000/api/leadgen/query-test?signal=HIRING_SIGNAL
```

Другие сигналы:

```text
/api/leadgen/query-test?signal=GO_TO_MARKET_SIGNAL
/api/leadgen/query-test?signal=GROWTH_SIGNAL
/api/leadgen/query-test?signal=CONTENT_SIGNAL
/api/leadgen/query-test?signal=TRAFFIC_SIGNAL
/api/leadgen/query-test?signal=TECH_SIGNAL
```

---

# Что пока НЕ подключено

На текущем этапе сознательно не подключаются:

* Clay
* Apollo
* Hunter
* Telegram Bot API
* OpenAI
* Real Finder pipeline
* Evidence Collector в основной pipeline
* автоматическая отправка сообщений
* contact enrichment

---

# Следующий этап

## Evidence Collector

Следующий слой должен принимать:

```text
SearchResult + SignalType + ICP
```

И определять:

```text
это реальный сигнал
или
это мусорная выдача
```

Evidence Collector должен возвращать:

```text
is_valid_signal
signal_type
signal_title
signal_detail
signal_source_label
source_url
confidence_score
found_at
rejection_reason
```

На первом этапе Evidence Collector работает rule-based, без OpenAI.

---

# Будущая цепочка Real Finder

Целевая логика:

```text
Signal Query Builder
↓
Tavily Search Provider
↓
Evidence Collector
↓
Lead Candidate Builder
↓
Lead Scoring
↓
LeadgenLead + LeadgenSignals
↓
Supabase
↓
Campaign Details
```

---

# Важные ограничения

## Не перепрыгивать сразу к Clay

Clay должен быть enrichment layer, а не центр системы.

Правильная логика:

```text
Signal
↓
Company
↓
Score
↓
Contact Intelligence
↓
Clay Enrichment
↓
Outreach
```

## Не подключать real search сразу в /api/leadgen/run

Сначала каждый слой тестируется отдельно:

```text
search-test
query-test
evidence-test
```

И только после этого собирается `runSignalBasedPipeline()`.

## Не ломать mock pipeline

Mock pipeline остаётся fallback-режимом до тех пор, пока signal-based pipeline не будет стабилен.

---

# Технический долг / Future Improvements

## Campaign History

Сейчас `getRecentCampaigns()` считает количество лидов через TypeScript:

```text
получает кампании
получает лиды
группирует на стороне кода
```

Это допустимо на раннем этапе.

Позже, когда запусков станет много, нужно вынести Campaign History aggregation на уровень:

```text
SQL view
или
Supabase RPC
```

Причина:

не тянуть лишние данные и не считать статистику в TypeScript.

---

# Текущий следующий шаг

Создать Evidence Collector:

```text
lib/leadgen/signals/evidence-collector.ts
```

И тестовый endpoint:

```text
GET /api/leadgen/evidence-test?signal=HIRING_SIGNAL&query=...
```

Пока НЕ подключать к основному pipeline.
__________________________________________

19.06.2026

# Leadgen OS — Progress Log

## Что сделали сегодня

Основной фокус дня — повышение качества извлечения компаний из реальной поисковой выдачи.

Ранее система уже умела:

* генерировать запросы по сигналам;
* искать результаты через Tavily;
* классифицировать источники;
* извлекать потенциальные компании;
* строить Lead Candidates;
* отсекать большую часть агрегаторов и платформ.

Но в реальных тестах появились ошибки качества:

* платформы и технические сущности иногда становились компаниями;
* компания извлекалась не полностью;
* вместо работодателя выбирался кусок домена;
* заголовки вакансий иногда воспринимались как название компании;
* города, категории вакансий и служебные элементы могли влиять на ранжирование кандидатов.

---

## Что было улучшено

### 1. Company Extraction v2

Переработана логика извлечения компании.

Теперь система разделяет:

* источник информации (source platform);
* компанию-кандидата (candidate company).

Примеры:

* LinkedIn Jobs ≠ компания;
* HH.ru ≠ компания;
* Greenhouse ≠ компания;
* Lever ≠ компания.

Платформа является источником сигнала, а не объектом лидогенерации.

---

### 2. Platform-Aware Extraction

Добавлена логика platform-like domains.

Система понимает различие между:

* company-owned domains;
* ATS;
* job boards;
* агрегаторами вакансий.

Теперь:

* Yelp через yelp.careers определяется как Yelp;
* Newsela через Greenhouse определяется как Newsela;
* Salesforce через LinkedIn Jobs определяется как Salesforce.

---

### 3. Candidate Validation

Усилена проверка качества найденных компаний.

Система больше не должна считать компаниями:

* агрегаторы;
* категории вакансий;
* должности;
* технические элементы карьерных систем;
* служебные названия страниц.

Цель проверки:

"Можно ли положить этот объект в CRM как компанию и искать по нему ЛПР?"

Если ответ сомнительный — кандидат отклоняется.

---

### 4. Diagnostics Layer

В тестовый pipeline добавлена подробная диагностика.

Теперь для каждого результата видно:

* source platform;
* source domain;
* extraction strategy;
* validation reason;
* company quality score;
* итоговое решение системы.

Это сильно упрощает отладку и анализ качества выдачи.

---

### 5. Candidate Ranking

Начата работа над самым важным этапом системы — выбором лучшего кандидата среди нескольких найденных вариантов.

Текущий фокус:

не просто найти компанию, а выбрать главного субъекта страницы.

Пример:

Если на странице присутствуют:

* Cloud
* Cloud Software Group
* Inside Cloud Software Group

то система должна понимать, что главным работодателем является Cloud Software Group.

---

## Текущий статус

Система уже:

* находит реальные компании;
* умеет работать с ATS;
* отсекает большую часть агрегаторов;
* строит Lead Candidates;
* показывает подробную диагностику решений.

Качество извлечения компаний существенно выросло по сравнению с начальной версией.

---

## Следующий фокус

Следующий этап — улучшение выбора финального company_name.

Не поиск новых компаний.

Не новые источники.

Не новые фильтры.

Именно повышение качества определения работодателя и нормализация названий компаний перед сохранением в CRM.

Цель:

Получать чистое название организации, которое можно безопасно использовать в дальнейшем поиске ЛПР, enrichment и outreach.
__________________________________________________________

22.06.2026

## Signal-Based Company Discovery: завершение MVP-этапа

### Что сделано

Собран изолированный real-search pipeline для поиска компаний по сигналам.

Текущая цепочка:

```text
Signal Type
→ Query Builder
→ Search Angles
→ Tavily Search
→ Source Classification
→ Company Extraction
→ Company Quality Validation
→ Evidence Collector
→ Lead Candidate Builder
→ Candidates / Weak Evidence / Rejected Results
```

Pipeline пока работает только через test route и не подключён к production pipeline, Supabase или Campaign History.

---

### Search Angles

Для `HIRING_SIGNAL` запросы теперь строятся не одним шаблоном, а через разные поисковые углы:

* `company_careers` — карьерные страницы компаний;
* `ats` — вакансии на Greenhouse, Lever, Ashby, Workday и других ATS;
* `job_board` — вакансии на job boards, где можно извлечь работодателя;
* `ru_job_board` — русскоязычные вакансии;
* `company_blog` — новости компаний и страницы роста;
* `market_news` — рыночные новости, рост, найм и expansion-сигналы.

Это не фиксированный список источников. Angles — это способ расширять поисковую поверхность и не зависеть от одного типа выдачи.

---

### Diversity Layer

В тестовом pipeline добавлен diversity layer.

Логика:

* pipeline идёт по поисковым углам последовательно;
* после каждого запроса собирает evidence и пересчитывает candidates;
* один angle не должен забивать всю выдачу;
* если targetCandidates ещё не достигнут, pipeline продолжает искать через другие angles;
* в response возвращается `candidates_by_angle`.

Пример:

```json
{
  "company_careers": 1,
  "ats": 2,
  "job_board": 2
}
```

---

### Company Extraction и Quality Validation

Система разделяет:

```text
source_platform — где найден результат
candidate_company — о какой компании найден сигнал
```

Например:

```text
linkedin.com/jobs → source platform
Salesforce → candidate company
```

Компания не создаётся автоматически из домена job board, ATS, агрегатора или соцсети.

Company Quality Validator проверяет, можно ли использовать извлечённую сущность как компанию для CRM.

Он отсеивает:

* job boards и ATS как кандидатов;
* агрегаторы и страницы подборок;
* города, страны, регионы;
* вакансии, должности, отделы;
* generic business phrases;
* sentence fragments;
* имена людей;
* UI-текст, cookie-текст и технический мусор;
* платформы вроде LinkedIn, Indeed, HH, ZipRecruiter.

При этом система пропускает реальные компании, если есть сильный контекст:

* company-owned domain;
* ATS slug;
* явный employer pattern;
* повтор названия компании в title/snippet;
* компания выступает субъектом вакансии или найма.

---

### Примеры корректной работы

Pipeline корректно находит:

* Ashby;
* Yelp;
* Cloud Software Group;
* saas.group;
* Newsela.

Pipeline корректно отклоняет:

* Indeed;
* LinkedIn;
* Startup Jobs;
* Open SaaS;
* Customer Success Manager;
* города и географические страницы;
* страницы с вакансиями без конкретного работодателя;
* агрегаторы без извлечённой компании.

---

### Test Route

```text
GET /api/leadgen/signal-pipeline-test
```

Пример:

```text
/api/leadgen/signal-pipeline-test?signal=HIRING_SIGNAL&targetCandidates=5&maxQueries=5&maxResultsPerQuery=5
```

Основные параметры:

```text
signal
targetCandidates
maxQueries
maxResultsPerQuery
```

В response доступны:

```text
queries_used
candidates
candidates_by_angle
weak_evidence
rejected_results
evidence_diagnostics
stopped_reason
```

---

### Текущий статус

Этап Signal-Based Company Discovery завершён как MVP.

Текущий уровень качества:

```text
Чистота поиска: ~8.5/10
```

Система уже умеет:

* искать компании по реальным сигналам;
* не превращать job boards, агрегаторы и города в компании;
* извлекать работодателей из ATS и вакансий;
* дедуплицировать компании;
* собирать несколько сигналов на одну компанию;
* считать preliminary lead score;
* показывать diagnostics по каждому решению.

---

### Что пока не подключено

Пока не реализовано:

* запись real candidates в Supabase;
* подключение к `/api/leadgen/run`;
* Campaign History для real pipeline;
* поиск контактов / ЛПР;
* enrichment через Clay, Apollo, Hunter;
* Telegram notifications;
* production orchestration;
* автоматический outreach.

---

### Следующий этап

Следующий этап — сохранить найденных real candidates в Supabase в тестовом режиме.

Цель следующего этапа:

```text
Signal Pipeline Test
→ Valid Lead Candidates
→ Supabase
→ Campaign History
→ Candidate Review
```

После этого можно будет переходить к поиску лучшей точки входа в компанию: ЛПР, маркетолог, РОП, администратор, общий email, Telegram, Instagram или форма сайта.

____________________________________________________
27.06.2026
# Leadgen OS — Progress Report

## Этап: Завершение MVP Signal-Based Company Discovery и повышение качества лидов

### Что было сделано

Сегодня основное внимание было уделено повышению качества найденных лидов и переходу от "поисковой выдачи" к действительно полезным sales-сигналам.

---

# 1. Улучшение интерпретации сигналов

После тестирования стало понятно, что система иногда принимала образовательный контент за реальные бизнес-события.

Например:

* статьи про Product Launch;
* GTM-гайды;
* best practices;
* launch strategy;
* thought leadership-контент.

Была полностью переработана логика интерпретации GO_TO_MARKET_SIGNAL.

Теперь система разделяет:

* тему материала;
* реальное бизнес-событие;
* рабочую гипотезу.

Это значительно уменьшило количество ложных GTM-лидов.

---

# 2. Улучшение качества итоговой карточки лида

Карточка перестала быть пересказом найденной статьи.

Теперь она строится вокруг:

* понятного сигнала;
* коммерческой интерпретации;
* причины, почему компании можно написать сейчас;
* персонализированной гипотезы для первого контакта.

Карточки стали ближе к формату Sales Intelligence, а не поисковой выдачи.

---

# 3. Повышение качества Evidence Analysis

Продолжена работа над логикой оценки найденного evidence.

Основной принцип:

Не всё, что найдено поиском, является коммерческим триггером.

Теперь система стремится отвечать не только на вопрос:

"Что найдено?"

Но и:

"Есть ли реальный повод начать коммуникацию именно сейчас?"

---

# 4. Улучшение качества поиска

Продолжена работа над:

* качеством Company Extraction;
* качеством Company Validation;
* интерпретацией найденных компаний;
* снижением количества ложных кандидатов.

Система стала значительно реже принимать:

* агрегаторы;
* платформы;
* общие статьи;
* нерелевантные сущности

за реальные компании.

---

# 5. ICP Fit

Продолжена работа над логикой оценки релевантности найденной компании.

Основная идея:

Не каждая найденная компания является хорошим потенциальным клиентом.

Система начала учитывать не только наличие сигнала, но и вероятность того, что компания действительно соответствует ICP.

Это особенно важно для:

* IT-компаний;
* AI-компаний;
* software vendors;
* dev agencies.

Теперь технологичность компании сама по себе больше не означает высокий приоритет.

---

# 6. Подготовка к международному поиску

Определён следующий вектор развития системы.

Leadgen OS должна одинаково хорошо работать:

* на англоязычном рынке;
* на русскоязычном рынке.

При этом архитектура не должна зависеть от фиксированных сайтов или заранее заданных источников.

Система должна использовать контекст, смысл и качество найденного evidence, а не работать по жёстким спискам ресурсов.

---

# Архитектурный результат

К концу этапа сформирована полноценная цепочка обработки лидов:

```text
Signal Type
        ↓
Query Builder
        ↓
Search Angles
        ↓
Search Provider (Tavily)
        ↓
Source Classification
        ↓
Company Extraction
        ↓
Company Quality Validation
        ↓
Evidence Collector
        ↓
Signal Interpretation
        ↓
ICP Fit Scoring
        ↓
Lead Candidate Builder
        ↓
Campaign Details
```

---

# Итог этапа

На текущий момент Leadgen OS уже умеет:

* искать реальные компании по бизнес-сигналам;
* извлекать работодателей из различных источников;
* определять качество найденной компании;
* оценивать коммерческую значимость сигнала;
* формировать осмысленные карточки лидов;
* рассчитывать Lead Score и ICP Fit;
* сохранять реальные результаты поиска;
* использовать диагностические инструменты для анализа качества поиска.

---

# Следующий этап

Следующий крупный блок развития Leadgen OS:

**Contact Discovery Engine**

Цель:

После нахождения качественной компании автоматически находить лучшую точку входа:

* CEO;
* Founder;
* Head of Sales;
* VP Sales;
* Marketing Director;
* Customer Success;
* Operations;
* общий email;
* LinkedIn;
* Telegram;
* форма обратной связи.

После этого система сможет перейти к полностью автоматизированному персонализированному outbound.

____________________________________________

29.06.2026
# Leadgen OS — Обновление этапа Discovery Engine

## Статус

Этап **Discovery Engine** практически завершён.

За последние итерации система перестала быть обычным поиском компаний и превратилась в полноценный конвейер анализа потенциальных клиентов.

Текущий pipeline:

```
Search
↓
Query Builder
↓
Market-Aware Search
↓
Evidence Collector
↓
Signal Interpretation
↓
Company Extraction
↓
Company Validation
↓
ICP Fit
↓
Decision Maker Discovery
↓
Contact Discovery
↓
Lead Prioritization
↓
Campaign Details
↓
Telegram Card
```

---

# Что реализовано

## 1. Market-Aware Search

Добавлен полноценный слой поиска по рынкам.

Поддерживаются:

- Global
- RU
- Mixed

Pipeline умеет:

- строить запросы отдельно для разных рынков;
- использовать разные search angles;
- считать `candidates_by_market`;
- балансировать выдачу между рынками;
- возвращать diagnostics по каждому запросу.

---

## 2. Query Builder

Полностью переработан.

Теперь запросы строятся не одним шаблоном, а через разные поисковые углы.

Примеры:

- Hiring
- GTM
- Product Launch
- Customer Success
- Operations
- CRM
- Automation

Для RU и Global используются разные наборы запросов.

---

## 3. Company Extraction

Extractor значительно усилен.

Добавлена поддержка:

- employer patterns;
- ATS;
- company-owned domains;
- hiring snippets;
- GTM pages;
- company announcements.

Система больше не считает:

- LinkedIn;
- Indeed;
- HH;
- агрегаторы;
- job boards;

названиями компаний.

---

## 4. Company Quality Validation

Добавлена полноценная очистка мусора.

Отсекаются:

- города;
- страны;
- должности;
- категории;
- агрегаторы;
- платформы;
- случайные токены;
- UI-текст;
- cookie-текст.

---

## 5. Evidence Collector

Полностью переработана логика GTM.

Теперь:

topic ≠ событие.

Educational-контент больше не становится подтверждённым событием.

Confirmed Event требует явного действия компании:

- announced;
- released;
- introduced;
- launched;
- new product;
- new feature;
- integration;
- expansion;
- GA;
- beta.

Источник истины по GTM находится именно здесь.

---

## 6. Signal Interpretation

Добавлены:

- signal_summary;
- why_now;
- evidence_quality;
- confidence_level;
- should_create_lead.

Signal Interpretation больше не определяет событие самостоятельно, а интерпретирует вывод Evidence Collector.

---

## 7. ICP Fit

Появился отдельный слой оценки соответствия ICP.

Учитываются:

- business fit;
- commercial fit;
- pain fit;
- exclusion risk.

Добавлен:

```
icp_fit_score
```

---

## 8. Decision Maker Discovery

Добавлен отдельный модуль определения ЛПР.

Система теперь определяет:

- Primary Persona;
- Alternative Personas;
- Department;
- Business Problem Owner;
- Expected Pain;
- Expected Goal;
- Search Keywords;
- Confidence.

Decision Maker хранится в metadata компании.

---

## 9. Contact Discovery

Создан отдельный модуль Contact Discovery.

Поддерживаются:

- confirmed_person;
- role_based_person;
- generic_email;
- contact_form;
- social_profile;
- company_website;
- no_contact_found.

Добавлен Provider Layer.

Контакты не выдумываются.

При отсутствии человека система честно показывает fallback.

---

## 10. People Discovery Status

Карточка теперь показывает:

- Found Person;
- Persona Search Status;
- Best Outreach Entry;
- Fallback Entry.

Это подготавливает систему к будущему подключению Apollo / Clay / PDL.

---

## 11. Lead Prioritization Engine

Добавлен новый слой принятия решений.

Pipeline теперь отвечает не только:

"Подходит ли компания?"

но и

"Стоит ли сейчас заниматься этим лидом?"

Используются независимые компоненты:

- ICP Score;
- Signal Strength;
- Buying Intent;
- Timing Score;
- Contact Readiness;
- Confidence.

Возвращается:

- Priority;
- Priority Score;
- Strengths;
- Risks;
- Recommended Next Action.

Приоритет хранится отдельно от Lead Score.

---

## 12. Campaign Details

Карточка лида значительно расширена.

Теперь отображаются:

- Why this company;
- Target Persona;
- Why this person;
- Expected pain;
- Expected goal;
- Alternative personas;
- Persona Search Status;
- Found Person;
- Best Outreach Entry;
- Lead Priority;
- Recommended Next Action.

---

## 13. Telegram Card

Telegram теперь получает:

- Target Persona;
- People Discovery Status;
- Lead Priority;
- Recommended Next Action.

При отсутствии новых полей обратная совместимость сохранена.

---

# Архитектурные улучшения

Важное изменение:

Lead Prioritization больше не определяет GTM Event самостоятельно.

Ответственность разделена правильно.

```
Evidence Collector
↓

Signal Interpretation
↓

Lead Prioritization
```

Каждый слой отвечает только за свою область.

---

# Что осталось исправить

Несмотря на большой прогресс, Discovery ещё не закрыт окончательно.

Есть две фундаментальные проблемы.

## 1. Company Discovery всё ещё создаёт слишком много "интересных компаний"

Сейчас система иногда создаёт лиды по причинам вроде:

- About Us;
- Careers;
- Company News;
- Technology;
- AI;
- Automation.

Это не является реальной причиной для начала продаж.

Компания должна становиться лидом только тогда, когда найдена объективная коммерческая возможность.

---

## 2. Discovery пока ищет компании, а не возможности

Сейчас система отвечает:

"Какие компании подходят?"

Но должна отвечать:

"Каким компаниям есть смысл писать именно сейчас?"

Это принципиально другой уровень.

---

# Следующий этап

## Opportunity Intelligence Engine

Следующий большой модуль Discovery.

Pipeline станет:

```
Search
↓

Evidence Collector
↓

Signal Interpretation
↓

Opportunity Intelligence
↓

Decision Maker
↓

People Discovery
↓

Lead Prioritization
```

---

## Главная задача

Компания перестаёт автоматически становиться лидом.

Перед созданием лида система должна ответить:

```
Есть ли объективная коммерческая причина
начать диалог именно сейчас?
```

---

## Opportunity Engine будет рассчитывать

- Opportunity Score;
- Opportunity Type;
- Urgency;
- Business Reasoning;
- Why Now;
- Positive Factors;
- Negative Factors;
- Missing Information;
- Recommended Action.

---

## Новое правило

```
Компания ≠ Лид
```

Лид создаётся только если Opportunity Engine подтверждает наличие реального окна продаж.

---

## Цель следующего этапа

Перевести Leadgen OS из:

```
Company Discovery
```

в

```
Business Opportunity Discovery
```

Именно после этого Discovery Engine можно будет считать полностью завершённым и переходить к следующему большому модулю:

```
People Discovery + Enrichment Providers

Apollo
↓

People Data Labs
↓

Hunter
↓

Clay
↓

Dropcontact
```

После этого Leadgen OS сможет искать уже не просто компании, а конкретных ЛПР и готовить полностью персонализированный Outreach.
