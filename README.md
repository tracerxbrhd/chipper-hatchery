# Chipper 0.2 — Living Hatchery

Уютная Telegram Mini App для `@chipperhatcherybot`: один активный цыплёнок на живой 2.5D-площадке, полностью новая Chick System 2.0, инкубатор, коллекция и **Chippster Flaps**. Русский Liquid Glass интерфейс, светлая/тёмная тема и пять вкладок с Домом в центре. Питомцы не умирают; платежей, NFT и рекламы нет.

V2 птицы отличаются формой головы/тела/лап/крыльев/хвоста/клюва, выражением и рисунком оперения. Три возраста сохраняют индивидуальные признаки. Дом показывает grounded walk, повороты и реакции; Flaps использует выбранного питомца, полёт, collision, личный рекорд и restart.

Сон 45 минут, яйца за 6 пёрышек с 3-часовой инкубацией, награда за заботу и Flaps по +1 раз в 20 часов. Редкость 70/25/5 исключительно косметическая. Таймеры, валюту, genes и владельца определяет сервер.

## Разработка и проверки

Node.js 24 обязателен. Зависимости зафиксированы в package-lock.json.

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
npm run check
npx playwright install chromium
npm run test:ui
```

Локальная песочница явно обозначена и хранит синтетический профиль в `chipper-explicit-development-v2`. Она использует настоящую доменную логику, но не является Telegram-авторизацией/живой cloud SQLite. Production исключает dev adapter; `?mock`, localStorage и initDataUnsafe не открывают профиль. При установленном Chromium можно передать `CHIPPER_CHROMIUM_PATH` для UI тестов.

`check` включает TypeScript, Serverless syntax/imports, ESLint, Vitest, production build, отсутствие dev-кода и secret patterns. Тесты используют настоящий node:sqlite, контролируемые часы/RNG, конкуренцию CAS, V2 genes, Flaps и однократный reset. UI browser/synthetic bridge проверяется отдельно от signed Telegram acceptance.

Обычные UI tests пишут screenshots/perf в игнорируемый `test-results/qa`, оставляя Git clean для release. `CHIPPER_CAPTURE_QA=1` намеренно обновляет канонические `DOCS/qa/0.2`: используйте только при ручном обновлении evidence до commit, затем уберите переменную перед release checks.

## Сервер и выпуск

React + TypeScript + Vite; JavaScript Telegram Serverless SDK и SQLite. Официальный Serverless.call передаёт verified initData; ownership проверяет сервер. Все эффекты и receipts одного игрока коммитятся одним UPDATE с revision CAS.

По логу владельца Termux **beta 0.2 опубликована**: source `7fd2486d3233e6f560620017d00f478568cacb4d`, cloud revision **2**, [https://app8924974998.tgcloud.ai/](https://app8924974998.tgcloud.ai/). На опубликованном checkpoint 161/161 unit PASS; новый spinner-fix recovery gate — 186/186 в 12 файлах (33 reset + 12 wrapper), actual CLI progress probe PASS, без изменения frontend assets. Это не подтверждает reset: прежний helper отказал на первом SELECT sqlite_master с `Failed to prepare query [23] not authorized`, до любых SQL-записей.

Владелец разрешил один clean start старого schemaVersion=1 прогресса. Исправленный recovery сохраняет V2 аккаунты, которые могли появиться после публикации. Каталоги/PRAGMA/runtimeDDL/triggers исключены; receipt table добавляется только штатным schema-only push/migrate --safe. Prepared план → atomic legacy-only DELETE → separate completed CAS; общей транзакции marker+DELETE нет. Replay/lost response безопасны при неизменной границе V1/V2 и только V2 writers после prepared. Последующие deploy не сбрасывают данные; admin endpoint не публикуется.

Последний live шаг владельца: schema-only source `c2f87e5922b36ea616d3a90450532316edcacbad`, cloud revision 3; receipt migration added 1/skipped 0 и dry-run PASS:players=3/legacy 3/V2=0, JSON ready, receiptTableReady=true, receipt=null. Prepare отказал **до записи** из-за штатного CLI stderr `- Checking schema...`; новый wrapper принимает только empty либо одну точную эту progress-строку, остальные warnings/errors блокируются.

После перехода на точный новый spinner-fix SHA повторный push/migrate не требуется. Продолжение с остановкой на первой ошибке:

```bash
npm run check &&
node scripts/reset-game-v0.2.mjs --prepare &&
node scripts/reset-game-v0.2.mjs --apply &&
node scripts/reset-game-v0.2.mjs --dry-run &&
npx tgcloud fetch &&
npx tgcloud --no-pager status
```

Полная staged процедура: [DEPLOYMENT_0.2.md](DOCS/DEPLOYMENT_0.2.md), текущая evidence/resetstatus — [ACCEPTANCE_RESULT_0.2.md](DOCS/ACCEPTANCE_RESULT_0.2.md). Полный runbook для новой среды начинается с diagnosis и единственной safe receipt migration; эти фазы уже выполнены текущим владельческим приложением. При ошибке остановиться; не запускать все changing phases одним multilinepaste. Новое onboarding бывших V1 подтверждается только после успешной очистки; свежий V2 прогресс сохраняется.

## Приёмка

[Реализация](DOCS/IMPLEMENTATION_0.2.md), [результаты](DOCS/ACCEPTANCE_RESULT_0.2.md), [матрица](DOCS/ACCEPTANCE_0.2.md), [контракт](DOCS/CONTRACT_0.2.md). Документы 0.1 оставлены историческими, без требований сохранять старые облики/прогресс в 0.2.

Реальные gestures/keyboard/safe area Android/iOS и изоляцию A/B/C, A1/A2 проверяет владелец на своих Telegram аккаунтах. Score Flaps имеет sanity guard, но не полноценный античит. Durable receipts предотвращают replay; future compaction агрегата требует отдельного безопасного design.
