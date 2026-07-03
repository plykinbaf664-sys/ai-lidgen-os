АГЕНТ ПО СЕЛФКОДИНГУ 02.07.2026

Вот короткий блок для README / docs:

````md
# AI Dev Supervisor — Current Stage Automation

## Что сделали

Доработали логику постановки задач для AI Dev Supervisor.

Раньше нужно было вручную заполнять два файла:

- `.ai/current-stage.md`
- `.ai/current-task.md`

Это создавало лишнюю ручную работу и риск рассинхрона между большим этапом и подзадачами.

Теперь целевая логика такая:

```text
.ai/current-stage.md
→ auto-generate .ai/current-task.md
→ validate generated task
→ run ai-run-task.sh
→ execute stages
→ final report
````

## Новая идея процесса

`.ai/current-stage.md` становится единственным ручным source of truth.

Пользователь описывает только большой этап, например:

```text
Stage 6 — Contact Discovery & Enrichment Layer
```

Дальше система сама должна:

1. прочитать `.ai/current-stage.md`;
2. сгенерировать `.ai/current-task.md` по утверждённому шаблону;
3. разбить большой stage на 5 логичных подэтапов;
4. проверить, что stages соответствуют исходному current stage;
5. проверить scope и ограничения;
6. если validation OK — запустить обычный supervisor pipeline;
7. если validation failed — остановиться и написать report.

## Что должен делать новый workflow

Добавляется новый основной запуск:

```bash
./scripts/ai-run-current-stage.sh
```

Он должен запускать цепочку:

```text
current-stage.md
→ ai-generate-current-task.sh
→ current-task.md
→ ai-validate-generated-task.sh
→ task-validation-report.md
→ ai-run-task.sh
```

## Новые скрипты

Планируемые / добавляемые скрипты:

```text
scripts/ai-run-current-stage.sh
scripts/ai-generate-current-task.sh
scripts/ai-validate-generated-task.sh
```

## Новые prompt-файлы

```text
.ai/prompts/generate-current-task-from-stage.md
.ai/prompts/validate-generated-task.md
```

## Новые отчёты

```text
.ai/task-generation-report.md
.ai/task-validation-report.md
.ai/current-task.backup.md
```

## Validation rules

Generated `.ai/current-task.md` должен содержать:

* `# Current Task`
* `## Goal`
* `## Business Meaning`
* `## Global Acceptance Criteria`
* `## Stages`
* ровно 5 stages
* `## What Must Not Change`

Stages должны идти по логике:

1. Architecture / Core Contract
2. Ranking / Scoring / Confidence
3. Provider / Integration Layer
4. Pipeline + UI Integration
5. Quality Audit / Diagnostics

## Safety logic

Если generated task:

* расширяет scope;
* противоречит current stage;
* добавляет запрещённые действия;
* создаёт лишнюю бизнес-логику;
* не содержит 5 stages;

то implementation не запускается.

## Итог

Цель доработки — убрать ручное дублирование между `current-stage.md` и `current-task.md`.

Теперь пользователь должен заполнять только:

```text
.ai/current-stage.md
```

А supervisor сам формирует задачу, проверяет её и запускает выполнение.

```
```