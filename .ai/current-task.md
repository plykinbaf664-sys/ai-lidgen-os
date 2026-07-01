# Current Task

## Goal

Полностью завершить Discovery Layer, превратив его из системы поиска компаний в систему поиска реальных коммерческих возможностей.

После завершения этапа компания должна становиться лидом **только при наличии объективной причины для начала продаж именно сейчас**.

Discovery Engine должен отвечать не на вопрос:

> "Какая компания подходит под ICP?"

а на вопрос:

> "Почему именно сейчас этой компании имеет смысл писать?"

---

## Business Meaning

Это самый важный слой всей Leadgen OS.

Именно Discovery определяет качество всех последующих этапов:

- Decision Maker Discovery;
- People Discovery;
- Contact Discovery;
- Enrichment;
- Outreach Generation;
- Follow-up Sequences;
- AI SDR.

Если Discovery создаёт слабые лиды, вся дальнейшая цепочка становится бессмысленной.

Цель этапа — добиться того, чтобы каждый созданный лид имел реальное коммерческое основание.

---

## Global Acceptance Criteria

- Компания перестаёт автоматически становиться лидом только потому, что подходит под ICP.
- Каждый лид имеет понятную бизнес-причину ("Почему сейчас?").
- Каждый лид имеет Opportunity Score и прозрачное объяснение принятого решения.
- Discovery умеет отклонять "интересные компании", если отсутствует коммерческая возможность.
- Opportunity Engine становится обязательным этапом перед созданием production lead.
- Decision Maker, Contact Discovery и Lead Prioritization запускаются только после подтверждения Opportunity.
- Все решения системы объяснимы через diagnostics.
- Discovery Engine становится финальным source of truth для создания лидов.

---

# Stages

---

### Stage 1 — Opportunity Intelligence Engine

## Goal

Добавить новый слой Opportunity Intelligence, который будет принимать решение:

> создавать лид или нет.

Компания больше не должна автоматически становиться лидом после успешного поиска.

---

## Scope

Можно изменять:

- lib/leadgen/opportunity/
или
- lib/leadgen/opportunity-intelligence-engine.ts

- lib/leadgen/lead-discovery-engine.ts

- lib/leadgen/types.ts

- test diagnostics

---

## Acceptance Criteria

- Добавлен Opportunity Engine.
- Рассчитывается Opportunity Score.
- Рассчитывается Opportunity Type.
- Появляется should_create_lead.
- Появляется business_reasoning.
- Появляется why_now.
- Появляется why_this_company.
- Opportunity работает до создания лида.

---

## Routes To Check

```
/leadgen
```

---

## API To Check

```
GET /api/leadgen/signal-pipeline-test
```

---

## Expected UI / Behavior

Diagnostics показывают:

- Opportunity Score
- Opportunity Type
- Business Reasoning
- Why Now
- Should Create Lead

---

### Stage 2 — Opportunity Validation Rules

## Goal

Научить систему отличать настоящие коммерческие события от обычной информации о компании.

---

## Scope

Можно изменять:

- Evidence Collector
- Opportunity Engine
- Diagnostics

Не трогать Query Builder без необходимости.

---

## Acceptance Criteria

Высокий Opportunity получают:

- hiring;
- expansion;
- funding;
- GTM launch;
- integration;
- new product;
- operational pressure;
- growth;
- market expansion.

Не создают Opportunity:

- About Us;
- Careers;
- Pricing;
- Blog;
- Company News;
- generic AI;
- automation;
- workflow;
- technology;
- CRM;
- product page.

---

## Routes To Check

```
/leadgen
```

---

## API To Check

```
GET /api/leadgen/signal-pipeline-test
```

---

## Expected UI / Behavior

DealHub-подобные компании больше не становятся production leads.

---

### Stage 3 — Opportunity Gate

## Goal

Встроить Opportunity Engine как обязательный шлюз перед созданием лида.

---

## Scope

Можно изменять:

- lead-discovery-engine.ts

- Opportunity Engine

---

## Acceptance Criteria

Если:

```
should_create_lead=false
```

то:

- не запускается Decision Maker;
- не запускается People Discovery;
- не запускается Contact Discovery;
- не запускается Lead Prioritization;
- лид не сохраняется;
- компания остаётся только в diagnostics/skipped.

Если:

```
should_create_lead=true
```

pipeline работает как сейчас.

---

## Routes To Check

```
/leadgen
```

---

## API To Check

```
POST /api/leadgen/run
```

```
GET /api/leadgen/signal-pipeline-test
```

---

## Expected UI / Behavior

Количество лидов становится меньше,
но качество значительно выше.

---

### Stage 4 — Explainable Opportunity

## Goal

Сделать каждое решение системы полностью объяснимым.

Менеджер должен понимать:

Почему именно этот лид появился.

---

## Scope

Можно изменять:

- Opportunity Engine
- Campaign Details
- Diagnostics
- Telegram Card

---

## Acceptance Criteria

Каждый лид содержит:

- Opportunity Score;
- Opportunity Type;
- Business Reasoning;
- Why This Company;
- Why Now;
- Positive Factors;
- Negative Factors;
- Missing Information;
- Recommended Action.

---

## Routes To Check

```
/leadgen
```

---

## API To Check

```
GET /api/leadgen/campaigns/:id
```

---

## Expected UI / Behavior

Карточка лида объясняет решение системы человеческим языком.

---

### Stage 5 — Discovery Quality Audit

## Goal

Провести финальную валидацию Discovery Engine.

Это этап без новых функций.

Только проверка качества.

---

## Scope

Можно изменять только:

- веса;
- пороги;
- правила Opportunity;
- diagnostics.

Без новой архитектуры.

---

## Acceptance Criteria

Проверить минимум:

### Должны стать лидами

- активный hiring;
- запуск продукта;
- интеграция;
- expansion;
- funding;
- новый рынок;
- открытие филиалов;
- масштабирование продаж.

### Не должны стать лидами

- About Us;
- Careers;
- generic blog;
- pricing;
- technology page;
- AI page;
- workflow page;
- automation page;
- company overview.

---

## Routes To Check

```
/leadgen
```

---

## API To Check

```
POST /api/leadgen/run
```

```
GET /api/leadgen/signal-pipeline-test
```

---

## Expected UI / Behavior

На выходе остаются только лиды,
имеющие реальную коммерческую возможность.

Количество лидов может уменьшиться,
но качество должно заметно вырасти.

Каждый лид должен отвечать на вопрос:

> **Почему именно сейчас этой компании стоит написать?**

---

## What Must Not Change

- Не трогать env-файлы.
- Не трогать node_modules.
- Не трогать .next.
- Не менять package.json без необходимости.
- Не лезть в соседние проекты.
- Не подключать Apollo, Clay, Hunter, People Data Labs.
- Не использовать LLM для принятия решений.
- Не переписывать Query Builder без необходимости.
- Не ломать Company Extraction.
- Не ломать ICP Fit.
- Не ломать Decision Maker.
- Не ломать Contact Discovery.
- Не менять схему Supabase без необходимости.
- Не ломать Campaign History.
- Не ломать Telegram notifications.
- Не ухудшить качество уже работающего Global Search.