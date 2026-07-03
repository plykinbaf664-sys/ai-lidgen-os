### Stage 6 — Contact Discovery & Enrichment Layer

#### Goal

Построить полноценный слой Contact Discovery & Enrichment, который использует результаты People Discovery и определяет лучший реальный способ связаться с найденным ЛПР.

После завершения этапа Leadgen OS должна отвечать не только на вопросы:

> "Почему именно этой компании стоит написать?"

> "Кому именно нужно писать?"

но и на вопрос:

> "Как именно с этим человеком лучше связаться?"

Contact Discovery должен находить доступные каналы связи, оценивать их качество, определять лучший канал outreach и честно фиксировать отсутствие контактов, если данных нет.

#### Scope

Можно изменять:

- `lib/leadgen/contact-discovery-service.ts`
- `lib/leadgen/contact-provider.ts`
- `lib/leadgen/public-contact-provider.ts`
- `lib/leadgen/people-provider.ts`
- `lib/leadgen/people-provider-manager.ts`
- `lib/leadgen/types.ts`
- `lib/leadgen/lead-discovery-engine.ts`
- `lib/leadgen/telegram-card.ts`
- `components/leadgen/campaign-details.tsx`
- `components/leadgen/telegram-card-preview.tsx`

Можно создавать при необходимости:

- `lib/leadgen/contact-enrichment/`
- `lib/leadgen/contact-enrichment-engine.ts`
- `lib/leadgen/contact-channel-ranking.ts`
- `lib/leadgen/contact-intelligence.ts`

#### Acceptance Criteria

- Contact Discovery использует результат People Discovery как главный источник целевого человека.
- Система определяет лучший доступный канал связи для primary person.
- Для каждого найденного контакта есть confidence score.
- Для каждого контакта есть source / источник данных.
- Для каждого контакта есть contact type:
  - work_email
  - linkedin
  - telegram
  - phone
  - website_form
  - generic_email
  - company_social
  - no_contact_found
- Система умеет выбирать:
  - best outreach channel
  - fallback channel
  - alternative channels
- Если прямой контакт человека не найден, система не выдумывает email, LinkedIn, Telegram или телефон.
- Если контакта нет, система честно фиксирует `no_contact_found`.
- Если нет персонального контакта, система предлагает лучший fallback:
  - общий email
  - форма сайта
  - LinkedIn компании
  - сайт компании
- Contact Discovery не должен работать раньше People Discovery.
- Contact Discovery не должен подменять People Discovery.
- Contact Discovery должен быть готов к будущему подключению Apollo, Hunter, Clay, People Data Labs, Dropcontact.
- Архитектура не должна быть жёстко привязана к одному enrichment-провайдеру.
- Campaign Details показывает найденного человека и лучший способ связаться.
- Telegram Card показывает лучший контактный канал и confidence.

#### Contact Channel Ranking Rules

Приоритет каналов:

1. подтверждённый work email человека
2. LinkedIn человека
3. Telegram человека
4. телефон человека
5. общий email отдела
6. общий email компании
7. форма сайта
8. LinkedIn компании
9. сайт компании
10. no contact found

Ранжирование должно учитывать:

- принадлежит ли контакт конкретному найденному человеку;
- является ли контакт персональным или общим;
- есть ли источник данных;
- насколько источник надёжен;
- есть ли совпадение с primary person;
- есть ли связь с нужным department;
- можно ли реально использовать канал для outreach.

#### Contact Confidence Rules

Высокий confidence:

- персональный work email с источником;
- LinkedIn profile найденного primary person;
- контакт явно связан с именем / ролью человека;
- источник подтверждает связь с компанией.

Средний confidence:

- общий department email;
- LinkedIn компании;
- форма сайта с релевантным routing;
- контактная страница компании.

Низкий confidence:

- общий info@ email;
- generic contact page;
- social profile компании без персонального человека;
- слабый или косвенный источник.

Нулевой confidence:

- контакт выдуман;
- email сгенерирован без подтверждения;
- LinkedIn не связан с найденным человеком;
- нет источника;
- данные не относятся к компании.

#### Provider Layer Requirements

Contact Discovery должен быть независим от конкретного провайдера.

Нужно подготовить контракт для будущих провайдеров:

- Apollo
- Hunter
- Clay
- People Data Labs
- Dropcontact
- Public website scraping
- Manual upload / CSV

Добавление нового contact provider не должно требовать переписывания основной логики Contact Discovery.

#### Diagnostics Requirements

В diagnostics / metadata должны быть видны:

- primary person
- selected contact channel
- selected contact value
- contact confidence score
- contact source
- fallback channel
- alternative channels
- reason why this channel was selected
- missing contact information
- recommended next action

Recommended next action:

- `send_outreach`
- `run_enrichment`
- `use_fallback_channel`
- `manual_review`
- `skip_until_contact_found`

#### Routes To Check

- `/leadgen`

#### API To Check

- `POST /api/leadgen/run`
- `GET /api/leadgen/campaigns/:id`
- `GET /api/leadgen/signal-pipeline-test`

#### Expected UI / Behavior

Campaign Details показывает:

- Primary Person
- должность
- department
- Best Contact Method
- contact value
- confidence
- source
- fallback channel
- alternative channels
- recommended next action

Telegram Card показывает:

- компанию
- причину обращения
- primary person
- лучший канал связи
- confidence контакта
- fallback, если прямой контакт не найден

Если подходящий контакт не найден, система честно пишет:

```text
No confirmed contact found. Recommended next action: run enrichment.
