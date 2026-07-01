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