# Chipper 0.3 — Social & Feel Update

Уютная Telegram Mini App для `@chipperhatcherybot`: один активный цыплёнок, коллекция, яйца и Chippster Flaps. Питомцы не умирают; платежей, NFT и рекламы нет. Версия 0.3 готовится к приёмке: **в этой среде не опубликована**, доступ к Telegram Serverless CLI отсутствует. Фактические результаты и ограничения — в [отчёте](DOCS/ACCEPTANCE_RESULT_0.3.md).

Пять разделов: **Магазин · Коллекция · Дом · Активности · Профиль**. Магазин — честная витрина «Скоро»; яйца находятся в Коллекции. HUD занимает защищённый центр между нативными группами Telegram, баланс находится ниже. Док плавает над нижней safe area; тёмная тема — графит и шалфей.

Цыплёнка можно трогать, гладить, поднимать, переносить и мягко отпускать. Серверный сон и уход имеют приоритет. История роста позволяет увидеть уже пройденные стадии с теми же генами. Профили закрыты по умолчанию: владелец отдельно выбирает видимость профиля и коллекции, приглашает друзей, принимает запросы, блокирует нежелательные контакты, разрешает визиты и делится карточкой PNG/ссылкой. Подарок другу передаёт исходную птицу одним атомарным UPDATE двух коллекций; активную или последнюю птицу подарить нельзя.

Сон длится 45 минут, кормление и игра доступны раз в 4 часа, обычное яйцо стоит 6 пёрышек и согревается 3 часа. Награды за заботу и Flaps — по одному пёрышку раз в 20 часов, независимо друг от друга. Реестр игр переносит прежний рекорд и время награды без досрочной выплаты. Flaps остаётся единственной игрой; публичных рейтингов нет.

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

`check` проверяет TypeScript, runtime imports/syntax, lint, Vitest, сборку, dev isolation и секреты в файлах/Git. UI screenshots/perf обычного запуска находятся в игнорируемом `test-results/qa`; только намеренный запуск новых suites с `CHIPPER_CAPTURE_QA=1` обновляет [evidence 0.3](DOCS/qa/0.3). Исторические 0.2 screenshots не перезаписываются. Для имеющегося Chromium задайте `CHIPPER_CHROMIUM_PATH`.

## Релиз и данные

React/TS/Vite + Telegram Serverless SQLite. Identity — verified `ctx.initData.user.id`; клиент не определяет владельца, валюту или права. Gameplay сохраняется revision-CAS с durable receipts. Подарок — один multi-row conditional UPDATE с MATERIALIZED guard обеих revisions, срока и действующей дружбы. Таблицы профилей, связей и лимитов добавляются штатной миграцией. Нет runtime DDL, последовательных delete/add или нового reset.

Live URL предыдущего релиза: https://app8924974998.tgcloud.ai/. Последняя исторически подтверждённая revision 0.2 — 3, текущая cloud revision **не проверена**. Completed receipt `chipper-v0.2-clean-start` сохраняется. **Никогда не запускайте reset повторно.** Гены, имена, птицы, яйца, баланс, care/Flaps cooldown и рекорд 0.2 сохраняются ленивой миграцией.

Порядок безопасного выпуска и точные команды — [DEPLOYMENT_0.3.md](DOCS/DEPLOYMENT_0.3.md). Перед write нужны CLI login, getMe exact 8924974998/@chipperhatcherybot, read-only preflight, fetch/status/diff, проверенный source SHA и reviewed additive dry-run. После первой передачи птицы backend 0.2 нельзя считать безопасным rollback: исправлять вперёд, не удаляя social/gift history. Ветка0.3 открывается одним PR в main; merge выполняет владелец.

## Документы

[Контракт](DOCS/CONTRACT_0.3.md) · [Архитектура](DOCS/ARCHITECTURE_0.3.md) · [Реализация](DOCS/IMPLEMENTATION_0.3.md) · [Приёмка](DOCS/ACCEPTANCE_0.3.md) · [Результаты](DOCS/ACCEPTANCE_RESULT_0.3.md).

Android/iOS/desktop native chrome, real A/B/C и A1/A2, физические gestures/keyboard и Telegram sharing проверяет владелец. Browser tests этого не заменяют. Score Flaps остаётся casual statistic с sanity guard. Постоянные receipts и JSON-поиск входящих подарков подходят текущей бете; масштабирование требует отдельного проекта, сохраняющего идемпотентность.
