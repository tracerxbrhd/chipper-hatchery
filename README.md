# Chipper 0.4 — Community Expansion

Уютная Telegram Mini App для `@chipperhatcherybot`: один активный цыплёнок, коллекция, яйца и Chippster Flaps. Питомцы не умирают; платежей, NFT и рекламы нет. Версия 0.4 реализована и проходит финальную приёмку: **в этой среде не опубликована**, доступ к Telegram Serverless CLI отсутствует. Фактические результаты и ограничения — в [отчёте](DOCS/ACCEPTANCE_RESULT_0.4.md).

Пять разделов: **Магазин · Коллекция · Дом · Активности · Профиль**. Магазин — честная витрина «Скоро»; яйца находятся в Коллекции. HUD занимает защищённый центр между нативными группами Telegram, баланс находится ниже. Док плавает над нижней safe area; тёмная тема — графит и шалфей.

Цыплёнка можно трогать, гладить, поднимать, переносить и мягко отпускать. Серверный сон и уход имеют приоритет. История роста позволяет увидеть уже пройденные стадии с теми же генами. Профили закрыты по умолчанию: владелец отдельно выбирает видимость профиля и коллекции, приглашает друзей, принимает запросы, блокирует нежелательные контакты, разрешает визиты и делится карточкой PNG/ссылкой. Подарок другу передаёт исходную птицу одним атомарным UPDATE двух коллекций; активную или последнюю птицу подарить нельзя.

Сон длится 45 минут, кормление и игра доступны раз в 4 часа, обычное яйцо стоит 6 пёрышек и согревается 3 часа. Награды за заботу и Flaps — по одному пёрышку раз в 20 часов, независимо друг от друга. Реестр игр переносит прежний рекорд и время награды без досрочной выплаты. Nest Defense — полноценная вторая игра с seeded процедурной картой, тремя башнями/врагами, upgrade/sell, бесконечными волнами, pause и server checkpoint recovery. Награда выдаётся только за deterministic server replay: 3/8/15/25 завершённых волн →1/2/3/4 пёрышка, отдельный cooldown20ч; публичных рейтингов нет.

На собственной поляне можно позвать одного read-only активного птенца принятого друга; дружба/видимость/block перепроверяются сервером, Touchy Feel и уход управляют своим питомцем. Ежедневный подарок +1 перо получают по явной кнопке раз в UTC-день после onboarding, без накопления и streak. Коллекция содержит Кодекс всех51 достижимых признаков (39 morphology+12 palettes), открытие сохраняется после подарка. Профиль показывает приватные verified Telegram имя/tag/optional photo с initials fallback; ручное имя Chipper отдельно и не перезаписывается.

## Разработка

Node.js 24; зависимости закреплены в package-lock.json.

```bash
npm ci
npm run dev
npm run check
npx playwright install chromium
npm run test:ui
```

Для явной локальной песочницы используйте `.env.example` → `.env.local`. Она хранит синтетический игровой профиль и исключается из production. Полный социальный цикл тестируется через production frontend и синтетический Telegram bridge с реальным SQLite, отдельно от signed Telegram-приёмки. Browser/fixture IDs никогда не дают доступ к живым аккаунтам.

`check` проверяет TypeScript, runtime imports/syntax, lint, Vitest, сборку, dev isolation и секреты в файлах/Git. UI screenshots/perf обычного запуска находятся в игнорируемом `test-results/qa`; только намеренный запуск новых suites с `CHIPPER_CAPTURE_QA=1` обновляет [evidence 0.4](DOCS/qa/0.4). Исторические 0.2/0.3 screenshots не перезаписываются. Для имеющегося Chromium задайте `CHIPPER_CHROMIUM_PATH`.

## Релиз и данные

React/TS/Vite + Telegram Serverless SQLite. Identity — verified `ctx.initData.user.id`; клиент не определяет владельца, валюту или права. Gameplay сохраняется revision-CAS с durable receipts. Подарок — один multi-row conditional UPDATE с MATERIALIZED guard обеих revisions, срока и действующей дружбы. Новая миграция0.4 добавляет только chipper_tower_runs с one-active/settling partial unique index; schema0.3 сохраняется. TD finish seals run, затем одним owner CAS пишет feathers/record/постоянный payment fence, после чего выполняет recoverable cleanup. Нет runtime DDL, последовательных delete/add или нового reset.

Live URL предыдущего релиза: https://app8924974998.tgcloud.ai/. Последняя исторически подтверждённая revision 0.2 — 3, текущая cloud revision **не проверена**. Completed receipt `chipper-v0.2-clean-start` сохраняется. **Никогда не запускайте reset повторно.** Гены, имена, птицы, яйца, баланс, care/Flaps cooldown и рекорд 0.2 сохраняются ленивой миграцией.

Порядок безопасного выпуска и точные команды — [DEPLOYMENT_0.4.md](DOCS/DEPLOYMENT_0.4.md). Перед write нужны CLI login, getMe exact 8924974998/@chipperhatcherybot, read-only preflight, fetch/status/diff, проверенный source SHA и reviewed additive dry-run. После передачи птиц или TD settlement старый backend нельзя считать безопасным rollback: исправлять вперёд, не удаляя social/gift history. Ветка0.4 открывается одним PR в main; merge выполняет владелец.

## Документы

[Контракт](DOCS/CONTRACT_0.4.md) · [Спецификация архитектуры](DOCS/ARCHITECTURE_0.4.md) · [Реализация](DOCS/IMPLEMENTATION_0.4.md) · [Приёмка](DOCS/ACCEPTANCE_0.4.md) · [Результаты](DOCS/ACCEPTANCE_RESULT_0.4.md).

Android/iOS/desktop native chrome, real A/B/C и A1/A2, физические gestures/keyboard и Telegram sharing проверяет владелец. Browser tests этого не заменяют. Score Flaps остаётся casual statistic с sanity guard. Измеренный предел хранения: после1000 Flaps player JSON≈1,39МБ, permanent receipts занимают≈99%. Incoming gift scan остаётся O(players×history). TD checkpoints bounded≤32KiB; terminal payload очищается после permanent fence. Безопасное архивирование receipts и индекс входящих подарков требуют отдельной совместимой миграции; Android/cloud capacity не заявляется.
