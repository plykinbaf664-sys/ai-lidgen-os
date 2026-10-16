# Экономный research: включён по умолчанию

Перезапустить приложение после обновления кода. `.env` и ключи этой итерацией не менялись; конфигурация ниже описывает доступные настройки, а не уже добавленные секреты.

## Что переиспользуется

| Данные | Срок | Условия |
|---|---|---|
| Результаты поиска | 6 часов | Тот же запрос, параметры и цепочка провайдеров; только непустой успешный результат |
| Загруженная страница | 12 часов | Тот же URL; исходное время загрузки сохраняется |
| Структурированный ответ модели | 24 часа | Совпадают input, инструкции, schema, модель, endpoint и аккаунт; валидная структура |
| OpenAI web-search response | 6 часов | Только успешный завершённый ответ; это поисковая подсказка, не доказательство email |
| Подтверждённый person research | 24 часа | Совпадают компания, домен, сигнал, целевая роль и модель; исследование завершилось с персональным контактом и fetched evidence |

Хранение: `.leadgen-data/research-cache/`, либо `research-cache/` внутри `LEADGEN_LOCAL_DATA_DIR`. Эта директория уже исключена из Git. Записи атомарны; максимум 1 MB на запись, около 1000 записей на раздел с очисткой при превышении. Ошибки, пустые поиски, незавершённые исследования не становятся положительным кешем. Повторная проверка принадлежности контакта выполняется существующим downstream; кеш не изменяет verification или approval.

Одновременные одинаковые запросы объединяются внутри процесса. Отмена одного потребителя не отменяет работу для другого; при отмене всех прекращается underlying request. Между процессами переиспользуется записанный кеш; два ещё не завершённых запроса из разных процессов могут выполняться одновременно.

В контекст модели не дублируются одинаковые ссылки из навигации разных страниц. Исходные документы и доступная навигация сохраняются. Для OpenAI задаётся стабильный `prompt_cache_key`; кеш ответа приложения позволяет вообще избежать API-вызова, тогда как provider prompt caching только уменьшает его стоимость.

## Ограничение расходов

| Настройка | Значение по умолчанию |
|---|---|
| `LEADGEN_RESEARCH_CACHE_ENABLED` | `true` |
| `LEADGEN_AI_DAILY_BUDGET_USD` | `1` |
| `LEADGEN_AI_COMPANY_BUDGET_USD` | `0.20` |
| `LEADGEN_AI_PROVIDER` | `auto` |

Лимиты охватывают все модельные вызовы приложения и встроенный OpenAI web search. Tavily тарифицируется отдельно его провайдером и не входит в этот USD-счётчик; повторные Tavily-запросы сокращает общий поисковый кеш. Суточный лимит считается по UTC и объединяет процессы с одной локальной директорией данных. Дневной ledger сохраняется в `research-cache/spend/YYYY-MM-DD.json`, поэтому перезапуск приложения не обнуляет расходы. Не удалять ledger ради очистки evidence-кеша.

До вызова резервируется консервативная оценка максимальной стоимости input/output и web-search tool. После ответа она уточняется по `usage`. Запросы в работе тоже занимают бюджет. При отмене/ошибке с неизвестной стоимостью резерв сохраняется. Значение `chargedUsd` включает такие резервы; это локальный расчёт по тарифам, не выписка провайдера. При повреждении/блокировке ledger платный вызов запрещён. Зависший после аварии `.lock` не удаляется автоматически: сначала убедиться, что использующий ledger процесс завершён. Лимиты можно повышать явно; значение `0` запрещает новые платные вызовы, но позволяет кешированные результаты.

Лимит компании действует вокруг общего `researchCompany`; discovery до идентификации компании ограничен общим суточным бюджетом. При исчерпании бюджета возвращается диагностическая причина `provider_budget_exceeded`, действует обычный безопасный fallback. Это не автоматическое продолжение незавершённого агента: доступны сохранённые страницы, поиск и точные ответы, но следующий запуск планирует недостающие шаги заново.

`bypassCache: true` в `researchCompany` обходит все уровни кеша для честного live benchmark; денежные лимиты продолжают действовать. Обычные production-вызовы кеш используют. TTL ограничивает устаревание; смена сигнала или модели инвалидирует результаты соответствующего уровня.

Для проверки production-режима с кешем в `benchmark-research-loop.mjs` задать `RESEARCH_BENCHMARK_USE_CACHE=true`; отчёт сохраняет `cacheEnabled`. По умолчанию benchmark продолжает обходить кеш, чтобы измерения свежего поиска не смешивались с повторным использованием результатов.

## Подключение Qwen позже

Нужны настройки окружения:

```text
LEADGEN_AI_PROVIDER=qwen
QWEN_API_KEY=<ключ выбранного Qwen-провайдера>
QWEN_BASE_URL=<HTTPS OpenAI-compatible base URL вашего workspace, до /chat/completions>
QWEN_MODEL=qwen3.7-plus
```

Base URL брать в кабинете провайдера для своего региона/workspace. Не присылать ключ в чат. Режим `auto` выбирает Qwen, когда присутствует `QWEN_API_KEY`; при неполной конфигурации вызов завершается ошибкой, скрытого перехода на платный GPT нет. Без Qwen-ключа остаются прежние модели OpenAI. Для явного выбора OpenAI: `LEADGEN_AI_PROVIDER=openai`.

Qwen вызывается через `chat/completions`: system/user messages, строгий JSON Schema, ограничение output и `enable_thinking=false`. Ответ и usage преобразуются в существующий внутренний контракт; несоответствие schema и усечённый ответ отклоняются. Поддержку этих параметров нужно проверить на выбранном endpoint. Качество Qwen live пока не измерено.

Базовый расчёт для Qwen3.7-Plus использует $0.40/M input и $1.60/M output (консервативно относительно Global, без скидки кеша). Для другого тарифа/модели задать `QWEN_INPUT_USD_PER_MILLION` и `QWEN_OUTPUT_USD_PER_MILLION`; неизвестная модель без тарифов не вызывается. Для OpenAI сейчас учтены используемые GPT-4.1 и GPT-4.1-mini. При смене тарифов расчёт необходимо обновить.

Поиск отделён от семантической модели. Переключение research на Qwen не заменяет встроенный OpenAI web search. `LEADGEN_OPENAI_SEARCH_FALLBACK=false` явно отключает этот платный резерв; останутся public web/Tavily, если доступны. Ошибка баланса OpenAI не блокирует семантическую модель Qwen и наоборот.

## Проверка без платных запросов

Подключение нового Qwen endpoint проверять отдельно от research. Сначала заполнить локально ключ, Base URL без `/chat/completions`, точный model ID и тарифы выбранного провайдера. Ключ должен соответствовать региону endpoint. Наш текущий adapter требует `json_schema`; Alibaba документирует ограничения по модели/региону (в частности, ограничение Singapore для JSON Schema). Не считать произвольный OpenAI-compatible endpoint совместимым без проверки. Источники: [API compatibility](https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope), [structured output](https://www.alibabacloud.com/help/en/model-studio/qwen-structured-output).

```text
# Только локальная конфигурация, без API:
node --experimental-transform-types --env-file=.env.local scripts/check-qwen-connection.mjs
# Один короткий запрос через production adapter, без поисков/SMTP:
node --experimental-transform-types --env-file=.env.local scripts/check-qwen-connection.mjs --live
```

Live probe обходит кеш, чтобы проверить текущую доступность; сохраняет суточный бюджет и ограничивает свой расчётный бюджет меньшим из $0.01 и лимита компании. Ключи и provider response bodies не выводит. `CONNECTION_PASS` доказывает соединение и минимальный schema/usage контракт, но не качество lead research. Для отключения оставшихся платных OpenAI web-search запросов отдельно задать `LEADGEN_OPENAI_SEARCH_FALLBACK=false`.

```text
node --experimental-transform-types scripts/check-research-economy.mjs
node scripts/check-release-regression.mjs
npx tsc --noEmit
npm run lint
npm run build
```

Изолированные fixtures доказывают: 10 повторных модельных запросов → 1 mock network call; после перезапуска кеш читается без сети; проверяются TTL, смена input/prompt, bypass, конкурентная отмена, атомарные резервы бюджета, Qwen mapping и schema guard. `check-iterative-research.mjs` проверяет повторный person research с исходными evidence без новых model/search calls. Это проверка механики экономии, не обещание конкретного процента экономии на новых компаниях и не live-quality PASS.

Официальные контракты: [OpenAI prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching), [Qwen structured output](https://www.alibabacloud.com/help/en/model-studio/qwen-structured-output), [Qwen pricing](https://www.alibabacloud.com/help/en/model-studio/model-pricing).
