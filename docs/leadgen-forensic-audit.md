# Leadgen OS: forensic-аудит Supabase egress

Дата аудита: 2026-08-08.

## Вывод

Причина блокировки — не размер одной таблицы и не Supabase Realtime. Основной egress создавал экран Email Outreach: открытая вкладка каждые 15 секунд вызывала `/api/leadgen/outreach`, а endpoint перед каждым чтением заново выполнял `syncOutreachQueue(campaignId)`. Затем тот же request повторно собирал working set и summary. Параллельно UI дважды загружал follow-up и возвращал полные строки очереди, включая `body`, `metadata`, diagnostics и SMTP metadata.

В проекте нет Supabase Realtime subscriptions. Источник — REST polling + повторные `select(*)` + нелимитированные/full-history выборки.

До первых стабилизационных правок один открытый экран создавал 5 760 polling-циклов в сутки. Даже при 350 KB суммарных ответов Supabase на цикл это 2,0 GB/сутки и 55 GB менее чем за 28 дней. Для кампании на 50 компаний с телами писем и накопленными JSON diagnostics реалистичный цикл составлял 0,7–3 MB: 4–17 GB/сутки. Это объясняет фактические 55+ GB без большого числа пользователей.

## Историческая цепочка одного polling-цикла

1. UI раз в 15 секунд запрашивал `/api/leadgen/outreach?campaignId=...`.
2. GET вызывал `syncOutreachQueue`.
3. Sync целиком читал contacts, leads, companies и signals через `select(*)`, затем выполнял проверки/записи по контактам.
4. GET сразу повторно вызывал `getOutreachWorkingSet`, снова читая те же четыре таблицы и полную очередь.
5. `getOutreachSummary` ещё раз вызывал working set, follow-ups и follow-up summary.
6. UI отдельно запрашивал `/api/leadgen/followups`, а при первичной загрузке делал это дважды.
7. Ответ содержал все subject/body/metadata независимо от того, открыта ли карточка.

Таким образом одна видимая цифра dashboard строилась из нескольких одинаковых полных чтений.

## Инвентаризация чтений

| Файл / функция | Что читается | Триггер | Потенциальный объём | Вердикт |
|---|---|---|---:|---|
| `lib/leadgen/outreach-storage.ts` / `readCampaignSources` | `contacts`, `leads`, `companies`, `signals` через четыре `select(*)` | working set, sync, summary, polling | 0.2–2+ MB/кампания; большие `metadata` | Критично: убрать из runtime UI |
| `lib/leadgen/outreach-storage.ts` / `getOutreachQueue` | полные строки queue: body, metadata, diagnostics, SMTP fields | polling, mutations, processor | 0.1–1+ MB | Критично: summary и list projection отдельно, body lazy |
| `lib/leadgen/outreach-storage.ts` / bulk/schedule/control/claim/mark | полные строки queue и глобальные sent/active recipients | действия и worker | растёт со всей историей | Нужны локально; remote — только delta sync |
| `lib/leadgen/outreach-summary.ts` / `getOutreachSummary` | working set повторно, follow-ups дважды, daily rows | каждый outreach GET | дублирует главный payload | Критично: один локальный selector |
| `lib/leadgen/followup-storage.ts` / `readInitialCandidates` | до 500 полных sent initial | summary и IMAP scan | до нескольких MB | Нужны узкие headers/status fields |
| `lib/leadgen/followup-storage.ts` / `getFollowups`, bulk/edit/batch | все полные follow-up rows | polling и actions | нелимитированно | Campaign filter + projection + lazy body |
| `lib/leadgen/storage.ts` / `getCampaignDetails` | campaign и все entities через `select(*)` | dashboard mount и открытие history | 0.2–5+ MB | Не загружать автоматически; list/detail/body раздельно |
| `lib/leadgen/storage.ts` / `getRecentCampaigns` | 10 campaigns + четыре узкие child collections | dashboard mount | обычно <100 KB | Допустимо после перехода на local; remote sync не нужен |
| `lib/leadgen/storage.ts` / known-contact/outreach source helpers | полные contacts/leads/companies/signals | discovery/dedup | растёт с историей | Локальный индекс; не читать remote runtime |
| `lib/leadgen/company-registry.ts` | весь registry identities и company ids | каждый discovery run | линейный рост | Локальный дедуп-индекс; remote archive only |
| `lib/leadgen/daily-lead-limit.ts` | contacts за день | каждый run | малый/средний | Локальный count |
| `lib/leadgen/production-consistency.ts` | очередь статусов | readiness | вся queue | Не выполнять при каждом readiness request |
| `lib/leadgen/sent-mail-archive.ts` | sent rows + message metadata | backfill/audit | вся sent history | Только явная maintenance operation |
| `lib/leadgen/email-discovery-reprocess.ts` | campaign/company/contact/lead rows | ручной reprocess | до кампании целиком | Допустимо только локально/явно |
| `lib/leadgen/signals/commercial-signal-revalidation.ts` | полные company/signal/lead rows | ручная revalidation | до лимита операции | Допустимо только локально/явно |
| `components/leadgen/email-outreach-queue.tsx` | outreach + readiness + follow-ups | mount, mutation, ранее каждые 15 сек | усиливает все строки выше | Главный усилитель egress |
| `components/leadgen/leadgen-dashboard.tsx` | history и полные latest campaign details | каждый mount | до нескольких MB | Убрать eager details; lazy detail |
| `vercel.json` / cron | processor route раз в минуту | постоянно | малый в idle, выше при queue | Runtime должен читать локальную queue |

## Тяжёлые поля

- `leadgen_companies.metadata`: URL audit, inspected pages, search queries, ranked/rejected candidates, provider errors.
- `leadgen_campaigns.production_discovery_stats`: search diagnostics и aggregate state.
- `leadgen_outreach_queue.body`, `body_html`, `metadata`, `copy_quality`, `micro_value`, provider/SMTP metadata.
- исторические raw search/provider responses, HTML и telegram previews в служебных JSON.

Эти поля не нужны для счётчиков и списка карточек. Они должны храниться локально компактно, а body/diagnostics — загружаться только по явному запросу.

## Уже подтверждённые усилители

- polling был 15 секунд и работал независимо от наличия активной очереди;
- GET выполнял mutation/sync перед чтением;
- initial mount делал второй follow-up request;
- follow-up summary раньше не ограничивался campaign id;
- `select(*)` использовался в 25+ query chains;
- история последней кампании автоматически загружалась полностью;
- большие diagnostics сохранялись в company metadata и снова передавались при каждом чтении.

## Целевая модель

- runtime storage: локальный персистентный store;
- Supabase runtime requests: **0**;
- Supabase: только явный асинхронный delta sync для backup/analytics;
- list endpoints: projection + `LIMIT`;
- body/HTML/diagnostics/provider payload: lazy или не синхронизируются;
- sync failure не влияет на discovery, approval, queue, SMTP или IMAP.

## Замер до/после

| Метрика | До | Цель после |
|---|---:|---:|
| Supabase запросов на polling-цикл | десятки, включая повторные полные чтения | 0 |
| Polling-циклов открытого экрана/сутки | 5 760 | 0 к Supabase |
| Full-row reads на refresh | 10+ logical reads | 0 remote |
| Передача body/diagnostics для счётчиков | всегда | никогда |
| Runtime egress Supabase | до нескольких GB/сутки | 0 B |

Фактический remote egress после переключения можно подтвердить только метриками Supabase после восстановления проекта; архитектурно runtime network path будет отсутствовать.
