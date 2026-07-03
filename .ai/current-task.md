# Current Task

## Goal

Stage 6 — Contact Discovery & Enrichment Layer

Построить полноценный слой Contact Discovery & Enrichment, который использует результаты People Discovery и определяет лучший реальный способ связаться с найденным ЛПР.

После завершения этапа Leadgen OS должна отвечать не только на вопросы:

> "Почему именно этой компании стоит написать?"

> "Кому именно нужно писать?"

но и на вопрос:

> "Как именно с этим человеком лучше связаться?"

Contact Discovery должен находить доступные каналы связи, оценивать их качество, определять лучший канал outreach и честно фиксировать отсутствие контактов, если данных нет.

## Business Meaning

Reduce manual duplication in the autonomous development workflow and execute the source stage through a validated five-stage task plan.

## Global Acceptance Criteria

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

## Stages

### Stage 1  Architecture / Core Contract

#### Goal

Define the minimal contract and file boundaries required by the source stage.

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

- The implementation approach follows the source stage goal.
- Scope is not expanded beyond the source stage.
- Existing workflow compatibility is preserved.

#### Routes To Check

- none

#### API To Check

- none

#### Expected UI / Behavior

No UI behavior changes unless explicitly required by the source stage.

### Stage 2  Ranking / Scoring / Confidence

#### Goal

Implement or adjust the ranking, scoring, confidence, or decision logic required by the source stage.

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

#### Routes To Check

- none

#### API To Check

- none

#### Expected UI / Behavior

Behavior reflects the source stage acceptance criteria without unrelated changes.

### Stage 3  Provider / Integration Layer

#### Goal

Connect the core logic to existing provider or integration boundaries allowed by the source stage.

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

- Existing provider abstractions remain compatible.
- No real external service is added unless explicitly required by the source stage.
- No fake people, fake contacts, fake emails, or invented data are introduced.

#### Routes To Check

- none

#### API To Check

- none

#### Expected UI / Behavior

Provider behavior remains deterministic and explainable.

### Stage 4  Pipeline + UI Integration

#### Goal

Wire the stage result into the existing pipeline and UI surfaces allowed by the source stage.

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

- Pipeline behavior remains backward compatible.
- UI changes are limited to the source stage requirements.
- Existing routes and legacy outputs are not broken.

#### Routes To Check

- /leadgen

#### API To Check

- none

#### Expected UI / Behavior

The user can see or use the completed stage behavior where the source stage requires it.

### Stage 5  Quality Audit / Diagnostics

#### Goal

Verify the stage behavior with deterministic checks, diagnostics, and final quality review.

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

- The source stage acceptance criteria pass.
- Diagnostics explain failures clearly.
- TypeScript, lint, and build checks pass when required by the supervisor config.

#### Routes To Check

- /leadgen

#### API To Check

- none

#### Expected UI / Behavior

No regressions are visible in the checked surfaces.

## What Must Not Change

- Do not touch env files, node_modules, .next, package.json, commits, pushes, deploys, or unrelated business logic.
- Do not change files outside the source stage Scope.
- Do not touch .env files.
- Do not touch node_modules.
- Do not touch .next.
- Do not change package.json unless explicitly required.
- Do not commit, push, or deploy.
