### Stage 8 - Identity Discovery & Contact Intelligence Layer

#### Goal

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

#### Identity Discovery Rules

Для каждого найденного человека система должна искать:

##### Tier 1

- подтверждённый рабочий email;
- LinkedIn Profile;
- Telegram;
- рабочий телефон.

##### Tier 2

- Personal Website;
- X (Twitter);
- GitHub;
- Instagram;
- Facebook;
- YouTube;
- Medium;
- Substack.

##### Tier 3

- Department Email;
- Company Contact Form;
- Company LinkedIn;
- Company Telegram;
- Company Website.

##### Tier 4

- Generic Email;
- Generic Contact Form.

Каждый найденный канал должен быть подтверждён источником.

---

#### Contact Channel Ranking Rules

Приоритет каналов:

1. подтверждённый рабочий email;
2. LinkedIn найденного человека;
3. Telegram найденного человека;
4. рабочий телефон;
5. персональный сайт;
6. X (Twitter);
7. GitHub;
8. Instagram;
9. общий email отдела;
10. общий email компании;
11. форма сайта;
12. LinkedIn компании;
13. сайт компании;
14. no contact found.

При ранжировании учитывать:

- принадлежит ли канал найденному человеку;
- совпадает ли канал с Primary Person;
- подтверждён ли источник;
- относится ли канал к нужному department;
- можно ли использовать канал для первого outreach;
- confidence канала.

---

#### Identity Confidence Rules

Высокий confidence:

- канал принадлежит найденному человеку;
- подтверждён несколькими источниками;
- совпадает компания;
- совпадает должность.

Средний confidence:

- подтверждён один источник;
- связь с человеком вероятна;
- совпадает компания.

Низкий confidence:

- канал принадлежит компании;
- человек не подтверждён;
- связь косвенная.

Нулевой confidence:

- канал выдуман;
- источник отсутствует;
- невозможно подтвердить принадлежность.

---

#### Provider Layer Requirements

Identity Discovery не должен зависеть от конкретного сервиса.

Архитектура должна поддерживать:

- Apollo;
- Clay;
- Hunter;
- People Data Labs;
- Dropcontact;
- LinkedIn;
- Public Website;
- Company Website;
- Manual Import.

Добавление нового provider не должно требовать переписывания Identity Discovery.

---

#### Diagnostics Requirements

В diagnostics / metadata должны быть видны:

- primary person;
- identity profile;
- available channels;
- selected contact channel;
- channel confidence;
- source;
- fallback channel;
- alternative channels;
- missing channels;
- identity confidence;
- why this channel was selected;
- recommended next action.

Recommended next action:

- `send_outreach`
- `run_enrichment`
- `use_fallback_channel`
- `manual_review`
- `skip_until_contact_found`

---

#### Routes To Check

- `/leadgen`

---

#### API To Check

- `POST /api/leadgen/run`
- `GET /api/leadgen/campaigns/:id`
- `GET /api/leadgen/signal-pipeline-test`

---

#### Expected UI / Behavior

Campaign Details показывает:

- Primary Person;
- должность;
- department;
- Identity Profile;
- Best Contact Method;
- Contact Value;
- Confidence;
- Source;
- Fallback Channel;
- Alternative Channels;
- Recommended Next Action.

Telegram Card показывает:

- компанию;
- причину обращения;
- Primary Person;
- лучший канал связи;
- confidence;
- fallback;
- identity summary.

Если подтверждённый контакт отсутствует, система честно пишет:

```text
No confirmed personal contact found.

Identity profile created successfully.

Recommended next action: run enrichment.
```

При этом пользователь понимает:

- кого система хочет найти;
- какие каналы уже проверены;
- каких данных ещё не хватает;
- какой следующий шаг необходимо выполнить.
