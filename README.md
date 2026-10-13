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

## Сервер и выпуск

React + TypeScript + Vite; JavaScript Telegram Serverless SDK и SQLite. Официальный Serverless.call передаёт verified initData; ownership проверяет сервер. Все эффекты и receipts одного игрока коммитятся одним UPDATE с revision CAS.

Владелец разрешил **ровно один reset игрового прогресса при переходе на 0.2**. После него каждый аккаунт получает новое onboarding, стартовое яйцо и V2 птицу с нулевым балансом. Системные/сторонние ресурсы и секреты сохраняются. Последующие deploy не сбрасывают данные. Deployed reset endpoint отсутствует.

```powershell
node scripts/reset-game-v0.2.mjs --dry-run
node scripts/reset-game-v0.2.mjs --prepare
# Только после проверки приложения, сборки и публикации кандидата:
node scripts/reset-game-v0.2.mjs --apply
node scripts/reset-game-v0.2.mjs --dry-run
```

Полный порядок: [DEPLOYMENT_0.2.md](DOCS/DEPLOYMENT_0.2.md). Live URL исторической 0.1: [https://app8924974998.tgcloud.ai/](https://app8924974998.tgcloud.ai/); фактический статус нового publish/reset — в [ACCEPTANCE_RESULT_0.2.md](DOCS/ACCEPTANCE_RESULT_0.2.md). Наличие старого URL не подтверждает релиз 0.2.

## Приёмка

[Реализация](DOCS/IMPLEMENTATION_0.2.md), [результаты](DOCS/ACCEPTANCE_RESULT_0.2.md), [матрица](DOCS/ACCEPTANCE_0.2.md), [контракт](DOCS/CONTRACT_0.2.md). Документы 0.1 оставлены историческими, без требований сохранять старые облики/прогресс в 0.2.

Реальные gestures/keyboard/safe area Android/iOS и изоляцию A/B/C, A1/A2 проверяет владелец на своих Telegram аккаунтах. Score Flaps имеет sanity guard, но не полноценный античит. Durable receipts предотвращают replay; future compaction агрегата требует отдельного безопасного design.
