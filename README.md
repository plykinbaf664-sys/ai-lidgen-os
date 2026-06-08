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