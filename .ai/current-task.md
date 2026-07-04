# Current Task

## Goal

Stage 8 - Identity Discovery & Contact Intelligence Layer

Построить полноценный слой Identity Discovery & Contact Intelligence, который использует результаты Person Intelligence и определяет полный цифровой профиль найденного ЛПР.

После завершения этапа Leadgen OS должна отвечать не только на вопросы:

> "Почему именно этой компании стоит написать?"

> "Кому именно нужно писать?"

но и на вопрос:

> "Где находится этот человек и через какой канал лучше всего начать коммуникацию?"

Identity Discovery должен строить цифровую карту присутствия человека, находить доступные каналы связи, оценивать их качество и выбирать лучший способ первого контакта.

Система не должна ограничиваться поиском email.

Она должна искать любую подтверждённую цифровую идентичность человека.

---

## Business Meaning

Reduce manual duplication in the autonomous development workflow and execute the source stage through a validated five-stage task plan.

## Global Acceptance Criteria

- Identity Discovery использует результаты Person Intelligence как главный источник.
- Для каждого найденного человека строится Identity Profile.
- Система ищет все доступные каналы коммуникации.
- Каждый найденный канал получает Confidence Score.
- Каждый канал содержит источник происхождения.
- Для каждого канала определяется Contact Type.
- Система определяет:
  - Primary Contact Channel;
  - Fallback Channel;
  - Alternative Channels.
- Система никогда не генерирует вымышленные контакты.
- Если контакт отсутствует - честно фиксирует это.
- Если персональный контакт отсутствует - предлагает лучший подтверждённый fallback.
- Identity Discovery полностью независим от конкретного enrichment-provider.
- Архитектура готова к Apollo, Clay, Hunter, People Data Labs, Dropcontact и другим provider'ам.
- Campaign Details показывает Identity Profile человека.
- Telegram Card показывает лучший канал первого контакта.

---

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
- `lib/leadgen/person-intelligence.ts`
- `lib/leadgen/types.ts`
- `lib/leadgen/lead-discovery-engine.ts`
- `lib/leadgen/telegram-card.ts`
- `components/leadgen/campaign-details.tsx`
- `components/leadgen/telegram-card-preview.tsx`

Можно создавать при необходимости:

- `lib/leadgen/identity-discovery/`
- `lib/leadgen/identity-discovery-engine.ts`
- `lib/leadgen/contact-intelligence.ts`
- `lib/leadgen/contact-channel-ranking.ts`
- `lib/leadgen/identity-confidence.ts`

---

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
- `lib/leadgen/person-intelligence.ts`
- `lib/leadgen/types.ts`
- `lib/leadgen/lead-discovery-engine.ts`
- `lib/leadgen/telegram-card.ts`
- `components/leadgen/campaign-details.tsx`
- `components/leadgen/telegram-card-preview.tsx`

Можно создавать при необходимости:

- `lib/leadgen/identity-discovery/`
- `lib/leadgen/identity-discovery-engine.ts`
- `lib/leadgen/contact-intelligence.ts`
- `lib/leadgen/contact-channel-ranking.ts`
- `lib/leadgen/identity-confidence.ts`

---

#### Acceptance Criteria

- Identity Discovery использует результаты Person Intelligence как главный источник.
- Для каждого найденного человека строится Identity Profile.
- Система ищет все доступные каналы коммуникации.
- Каждый найденный канал получает Confidence Score.
- Каждый канал содержит источник происхождения.
- Для каждого канала определяется Contact Type.
- Система определяет:
  - Primary Contact Channel;
  - Fallback Channel;
  - Alternative Channels.
- Система никогда не генерирует вымышленные контакты.
- Если контакт отсутствует - честно фиксирует это.
- Если персональный контакт отсутствует - предлагает лучший подтверждённый fallback.
- Identity Discovery полностью независим от конкретного enrichment-provider.
- Архитектура готова к Apollo, Clay, Hunter, People Data Labs, Dropcontact и другим provider'ам.
- Campaign Details показывает Identity Profile человека.
- Telegram Card показывает лучший канал первого контакта.

---

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
- `lib/leadgen/person-intelligence.ts`
- `lib/leadgen/types.ts`
- `lib/leadgen/lead-discovery-engine.ts`
- `lib/leadgen/telegram-card.ts`
- `components/leadgen/campaign-details.tsx`
- `components/leadgen/telegram-card-preview.tsx`

Можно создавать при необходимости:

- `lib/leadgen/identity-discovery/`
- `lib/leadgen/identity-discovery-engine.ts`
- `lib/leadgen/contact-intelligence.ts`
- `lib/leadgen/contact-channel-ranking.ts`
- `lib/leadgen/identity-confidence.ts`

---

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
- `lib/leadgen/person-intelligence.ts`
- `lib/leadgen/types.ts`
- `lib/leadgen/lead-discovery-engine.ts`
- `lib/leadgen/telegram-card.ts`
- `components/leadgen/campaign-details.tsx`
- `components/leadgen/telegram-card-preview.tsx`

Можно создавать при необходимости:

- `lib/leadgen/identity-discovery/`
- `lib/leadgen/identity-discovery-engine.ts`
- `lib/leadgen/contact-intelligence.ts`
- `lib/leadgen/contact-channel-ranking.ts`
- `lib/leadgen/identity-confidence.ts`

---

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
- `lib/leadgen/person-intelligence.ts`
- `lib/leadgen/types.ts`
- `lib/leadgen/lead-discovery-engine.ts`
- `lib/leadgen/telegram-card.ts`
- `components/leadgen/campaign-details.tsx`
- `components/leadgen/telegram-card-preview.tsx`

Можно создавать при необходимости:

- `lib/leadgen/identity-discovery/`
- `lib/leadgen/identity-discovery-engine.ts`
- `lib/leadgen/contact-intelligence.ts`
- `lib/leadgen/contact-channel-ranking.ts`
- `lib/leadgen/identity-confidence.ts`

---

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
