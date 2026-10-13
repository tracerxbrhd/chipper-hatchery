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

**Beta 0.2 опубликована и однократный сброс завершён.** [Открыть Chipper](https://app8924974998.tgcloud.ai/), бот @chipperhatcherybot/App 8924974998, текущая cloud revision **3**. Владелец выполнил reset из source **`cb4e83ac619435f09dc7969364c90defe18b5407`**: все **3 старых игровых профиля** очищены, completed receipt сохранён; final dry-run players 0/legacy 0/V2=0/alreadyApplied=true. Webhookin-sync,23 modules и3 static filesup-to-date. Игровой code source 7fd, схема source  c2f; final docs commit только фиксирует результат.

Проверки source cb4:186/186 unit,33/33 UI; [CI#28 SUCCESS](https://github.com/tracerxbrhd/chipper-hatchery/actions/runs/38361629720). Реальные signed onboarding/multi-account/mobile проверки остаются владельцу.

Фиксированная операция `chipper-v0.2-clean-start` больше не запускается и её completed receipt никогда не удаляется. Ordinary deploy сохраняют V2 прогресс:build/check → fetch/status/diff/review → push, без reset/migration hooks. [Release runbook](DOCS/DEPLOYMENT_0.2.md), [фактическая evidence/receipt](DOCS/ACCEPTANCE_RESULT_0.2.md). Системные данные/секреты/сторонние ресурсы не удалялись. Legacy-only DELETE и separate completion CAS защищают новые V2 от replay; общей транзакции marker+DELETE не утверждается.

## Приёмка

[Реализация](DOCS/IMPLEMENTATION_0.2.md), [результаты](DOCS/ACCEPTANCE_RESULT_0.2.md), [матрица](DOCS/ACCEPTANCE_0.2.md), [контракт](DOCS/CONTRACT_0.2.md). Документы 0.1 оставлены историческими, без требований сохранять старые облики/прогресс в 0.2.

Реальные gestures/keyboard/safe area Android/iOS и изоляцию A/B/C, A1/A2 проверяет владелец на своих Telegram аккаунтах. Score Flaps имеет sanity guard, но не полноценный античит. Durable receipts предотвращают replay; future compaction агрегата требует отдельного безопасного design.
