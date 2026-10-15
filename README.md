# Chipper 0.5 — Personality & Visual Overhaul

Уютная Telegram Mini App для `@chipperhatcherybot`: странные обаятельные птицы, уход, коллекция, инкубатор, друзья и две игры. Пять разделов: Магазин · Коллекция · Дом · Активности · Профиль. Нет смерти питомцев, реальных платежей и наказаний за отсутствие.

0.5 добавляет оригинальный SVG Visual System3, асимметрию и стабильные характеры, выразительный риг и комические движения, многослойную дневную/ночную поляну, cream/plum темы и настоящий Liquid Glass dock с непрозрачным fallback. Все исторические V2 гены/палитры/ID сохранены. В коллекции можно сравнивать птиц и просматривать уже прожитые возрасты.

Двусторонний обмен передаёт две выбранные птицы одним атомарным UPDATE после согласия обоих друзей. Сервер повторно проверяет дружбу, срок, ownership и reservations. Достижения подтверждаются серверным уходом, коллекцией, социальными передачами и результатами игр:12 постоянных наград по+1 перу, каждая выдаётся один раз. Декоративные события не начисляют валюту. Магазин косметики отнесён к продолжению0.6; покупки недоступны.

Сохранены Touchy Feel, read-only гость, закрытые по умолчанию профили, подарки, Кодекс51 признака, verified Telegram identity, daily+1 раз в UTC-день, Flaps и Nest Defense. Кормление/игра раз в4ч, сон45мин, яйцо6 перьев/3ч; cooldown наград ухода и игр20ч не менялся. Nest Defense оплачивает серверный replay подтверждённых волн.

## Разработка и проверка

Node24, закреплённый package-lock:

```bash
npm ci
npm run dev
npm run check
npx playwright install chromium
npm run test:ui
```

`.env.example` → `.env.local` включает явную dev-песочницу. Production build исключает backend mock и галерею `?art=1`. Социальные UI-тесты используют production services/реальный SQLite за синтетическим Telegram transport; это не signed-live проверка.

`check` включает TypeScript, lint, Vitest, build, runtime imports, dev isolation, secrets и36 контрастных пар. GitHub Actions выполняет полный набор и сохраняет0.5 QA screenshots/report artifacts. `CHIPPER_CAPTURE_QA=1` сохраняет намеренные снимки в DOCS/qa; обычные тесты — в test-results. Дополнительные Node-проверки:

```bash
node tests/regression-native-smoke.js
npm run test:native
node --loader ./scripts/lib/ts-extension-loader.mjs scripts/qa-v05-world.mjs
node scripts/qa-v05-adapter.mjs
```

Фактический статус: [ACCEPTANCE_RESULT_0.5.md](DOCS/ACCEPTANCE_RESULT_0.5.md). Полный GitHub Actions CI прошёл: npm ci, npm run check (543 теста) и npm run test:ui (103 теста). [Галерея и реальные before/after](DOCS/qa/0.5/README.md) включают восемь light/dark viewport-вариантов и замеры. Это кандидат для бета-тестирования; физическая Android/iOS Telegram-приёмка и авторизованный production preflight остаются владельцу. Production не изменён.

## Сохранения и выпуск

React/TypeScript/Vite + Telegram Serverless SQLite. Identity только verified `ctx.initData.user.id`. schemaVersion2, appearanceVersion2, geneSchema1 и release fence `chipper-v0.2-clean-start` сохранены; новой DB migration0.5 нет. Постоянные receipts не удаляются. Existing incoming gift scan и рост receipts требуют отдельной совместимой работы; [аудит](DOCS/AUDIT_0.5.md).

Production target8924974998/@chipperhatcherybot, исторический URL https://app8924974998.tgcloud.ai/. Текущая cloud revision не проверена. В этой задаче разрешена read-only диагностика при авторизованном окружении. Deployment/migrate/reset/force/webhook требуют отдельного подтверждения владельца. После обменов/achievement claims старый backend0.4 не является безопасным rollback.

Ветка feature/chipper-v0.5 → один PR в main, без merge. [Deployment runbook](DOCS/DEPLOYMENT_0.5.md) содержит стоп-условия и физическую Telegram-приёмку. CI Chromium не заменяет Android/iOS WebView.

[GDD](DOCS/GDD_0.5.md) · [Визуальный стиль](DOCS/VISUAL_DESIGN_0.5.md) · [Анимации](DOCS/ANIMATION_0.5.md) · [Контракт](DOCS/CONTRACT_0.5.md) · [Реализация](DOCS/IMPLEMENTATION_0.5.md) · [Приёмка](DOCS/ACCEPTANCE_0.5.md).
