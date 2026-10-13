# CHIPPER 0.2 — техническая архитектура, совместимость и деплой

**Статус:** design contract для Codex; проверять на текущем checkout и версии SDK перед реализацией.  
**Связанные документы:** `GDD_0.2.md`, `CHICK_SYSTEM_0.2.md`, `CHIPPSTER_FLAPS_0.2.md`, `ACCEPTANCE_0.2.md`.  
**Исходный продакшен:** `@chipperhatcherybot`, Telegram Serverless, `https://app8924974998.tgcloud.ai/` — URL зафиксирован в отчёте 0.1, при публикации проверить фактический URL по CLI.

## 1. Подтверждённая кодовая база на момент планирования

`main` после PR #1 (`37d852e`):
- `src/App.tsx` — router/state, хедер, 4 вкладки, старая мини-игра;
- `src/screens/PetScreens.tsx` — статичный дом, коллекция и карточка;
- `src/screens/GameScreens.tsx` — «Собери зёрнышки» (25 с);
- `src/components/ChickArt.tsx`, `src/art.css` — legacy SVG: 12 `appearanceId` × 3 стадии, общий скелет по стадии;
- `src/app.css` — обычный длинный `app-main`, 4-слотная fixed nav;
- `src/api/telegram.ts` — `expand()`, safe area, theme, BackButton, Serverless.call, но **нет disableVerticalSwipes**;
- `tgcloud/lib/domain.js` — BALANCE 0.1, 12 APPEARANCES, команды miniGame, snapshots;
- `tgcloud/lib/service.js`, `tgcloud/lib/store.js` — идентичность из ctx, per-player compare-and-swap + receipts;
- `tgcloud/schema.js` — **одна таблица `chipper_players(telegram_id,revision,state_json)`**;
- `tests/` и `DOCS/ACCEPTANCE_RESULT_0.1.md` — существующие проверочные инварианты.

**Не разрушать проверенный фундамент** ради графических изменений. Добавить фичи через расширяемые интерфейсы.

## 2. Рекомендуемая новая структура модулей

```text
src/
  api/                # существующая безопасная Telegram auth + Serverless adapter
  navigation/          # AppShell, BottomDock, TabTransition, viewport coordination
  design/              # tokens, GlassSurface, themes, motion
  chicks/
    models.ts          # explicit V2 genes; visual contract
    generator/         # shape registries, palette/pattern compatibility
    renderer/          # SVG bird, transform anchors, stage and pose
    animation/         # state machine, gait, micro-motion
  world/
    HomeWorld.tsx      # bounded scene and presentation state
    worldMath.ts       # depth, shadows, click targets
  games/flaps/
    FlapsGame.tsx      # game UI
    engine.ts          # pure fixed-step physics
    obstacles.ts       # seeded obstacles/spawn/scoring
    graphics.ts        # Canvas sprite strategy
    useFlapsLoop.ts    # raf, pause, resume, input
  screens/             # адаптированные onboarding, incubator, collection, profile
tgcloud/
  endpoints/           # startFlapsRun/finishFlapsRun; старые протоколы отказывают
  lib/domain.js        # V2 chick, miniGameCooldown and flaps best
  lib/service.js       # existing CAS unchanged where possible
  lib/store.js         # existing SQL CAS unchanged
  schema.js            # старую таблицу не удалять
tests/
  ...                 # domain, migration, UI, race, geometry, flaps, viewport
```

Это ориентир; агент может выбрать другие имена, если сохраняются тестируемость и границы ответственности.

## 3. Модель V2 и однократный чистый старт

### 3.1 Source of truth

Один JSON-агрегат на verified `telegramId` хранится в `chipper_players(telegram_id,revision,state_json)`. Птицы, яйца, баланс, награды, рекорды и receipts коммитятся одним `UPDATE ... WHERE revision = expected RETURNING revision`. После конфликта CAS переход пересчитывается. Клиент не управляет валютой, случайностью, таймерами или владельцем.

### 3.2 Новый персонаж

Все вновь созданные птицы имеют `appearanceVersion: 2`, явные `genes` с `geneSchemaVersion: 1` и техническое имя палитры `appearanceId`. Полный набор морфологии и выбранных цветов сохраняется при hatch один раз. Вероятности косметической редкости 70/25/5. Возраст меняет пропорции; head/body/legs/wing/tail/beak/pattern остаются индивидуальными.

Renderer 0.1 и визуальная совместимость старых обликов полностью исключены. Неизвестные genes нормализуются в безопасную оригинальную V2 форму. Серверное состояние и экономика не переопределяются этим клиентским fallback.

### 3.3 Flaps

`player.flaps = { bestScore, completedRuns, lastPlayedAt }`. Одна незавершённая серверная попытка содержит kind='flaps', run ID, chickId и снимок внешности/стадии, startedAt, expiresAt, configVersion, finish result. Новый start отменяет предыдущий. `player.miniGameRewardAt` ограничивает +1 пёрышко раз в 20 часов. После первоначального release reset дальнейшие деплои сохраняют этот cooldown.

Рекорд клиентский, ограниченный проверками правдоподобия; не является доказательством честной игры. Score не влияет на выплату. TTL 10 минут, минимальное серверное время для выплаты 2 секунды, не более 6 starts/minute.

### 3.4 Формат состояния

Новый aggregate имеет `schemaVersion=2`. Старые schemaVersion=1 не мигрируются и не удаляются автоматически: запрос получает `RESET_REQUIRED` до разрешённой административной очистки. Повторный bootstrap после reset создаёт один новый профиль, нулевой баланс, onboarding='egg', бесплатное готовое стартовое яйцо и пустую коллекцию. Повторная выдача стартового подарка в дальнейшем невозможна.

### 3.5 Ровно один reset

Владелец разрешил полный сброс игрового прогресса в закрытой beta. Все игровые данные 0.1 находятся в `chipper_players`, поэтому очищаются только строки этой таблицы. Таблица, системные данные Telegram, конфигурация, токены и сторонние ресурсы не удаляются.

Проверенная CLI 0.2.0 не имеет SQL-команды. `tgcloud run` исполняет локальный endpoint на Serverless без публикации. `scripts/reset-game-v0.2.mjs` временно создаёт такой локальный endpoint, проверяет `api.getMe()` (ID 8924974998, username chipperhatcherybot), sqlite_master, точные столбцы, отсутствие неизвестных Chipper-таблиц, внешних ключей и опасных triggers. В режиме dry-run делает только чтение. Temporary endpoint удаляется в finally; release gate запрещает его публикацию.

До публикации выполняется `--prepare`: создаёт/валидирует только служебную таблицу `chipper_release_operations` и точный AFTER INSERT trigger, без INSERT marker и без удаления игроков. Отказ capability останавливает выпуск до замены действующей игры. Затем push V2 и `--apply`: единственный INSERT release_key='chipper-v0.2-clean-start' атомарно записывает marker и вызывает `DELETE FROM chipper_players`. `ON CONFLICT DO NOTHING` не вызывает AFTER INSERT повторно. После успеха temporary trigger удаляется, marker остаётся. Конкурентный повтор и потеря ответа после commit не удаляют новые аккаунты. Сброс не вызывается из bootstrap, handler, deployment hook или migrate.

Если фактическая схема или разрешение raw SQL на платформе не подтверждены, destructive-операция блокируется. Реальный статус доступа и сброса записывается отдельно от local SQLite тестов.

## 4. Telegram viewport, вертикальные свайпы и shell

Платформенный контракт (официальная документация): https://core.telegram.org/bots/webapps

1. На инициализации проверить `webApp?.disableVerticalSwipes` и вызвать; на teardown при необходимости `enableVerticalSwipes()` (особенно если переключаемся в режим, где жест имеет смысл). **Не обещать блокировать Telegram header drag**.
2. `expand()` — только expand, **не отключение свайпов**. `requestFullscreen()` поддерживается отдельно, не считать его обязательным условием выполнения задачи.
3. Отслеживать `viewportChanged` с `isStateStable`; корректно использовать CSS `--tg-viewport-stable-height` и safe/content insets, не принимать `100vh` как единственный источник размера.
4. Дом и игра: `overflow: hidden` на корневом layout и `touch-action` только внутри игровой сцены; в Коллекции/Профиле назначить `overflow-y: auto` **внутренней** области. Клавиатура и фокус должны оставаться работоспособными.
5. Пять вкладок: `collection/incubator/home/activities/profile`, `home` по центру. Переходы в одну экранную state-machine, маршруты для detail/settings/result должны поддерживать BackButton.
6. При смене Telegram initData полностью размонтировать старый клиент и инвалидация предыдущих async snapshots остаётся обязательной.
7. Тема Telegram: актуализировать setHeaderColor/setBackgroundColor и, при поддержке, setBottomBarColor (не дублировать системную панель на Android).

### Layout: важные предостережения

- Тапы по сцене не должны срабатывать при взаимодействии с меню/индикаторами.
- `touch-action: none` не применять глобально на всех экранах — сломает скролл Коллекции и доступность.
- SafeAreaInset и ContentSafeAreaInset не суммировать автоматически без проверки семантики и теста: возможны двойные отступы на некоторых клиентах.
- На высотах 568/667 px уменьшать декоративные блоки, а не прятать кнопки ухода за нижним dock.

## 5. Liquid Glass как дизайн-система

Определи design tokens, которые работают в light/dark:
- `--glass-bg`, `--glass-outline`, `--glass-highlight`, `--glass-shadow`, `--glass-blur`, `--glass-radius`;
- поверхность акрил/матовое стекло со световым бликом и прозрачностью, **фолбэк плотного контрастного цвета** если `backdrop-filter` не поддерживается или отключён;
- стекло только на HUD, dock, карточках, overlay; **не** создавать blur на каждом перце, крыле и кадре сцены;
- лёгкое усиление контраста при `prefers-reduced-transparency` (если поддерживается);
- минимум 44×44 CSS px интерактивные области, screen reader labels, поддержка увеличенного текста;
- не копировать pixel-perfect iOS widgets; Chipper остаётся дружелюбной графитово-белой игрой с тёплыми серыми/зелёными акцентами.

## 6. Архитектура Living World

- Локальная state-machine поведения питомца. Истинные игровые статусы sleep/care приходят с сервера, прогулки и idle происходят в клиенте и **не пишутся** в Telegram Serverless.
- Камера фиксирована. Plane имеет границы, проходные точки, z-depth в координатах `[0,1]`. Позиция трансформируется в `screenX/screenY + visualScale(depth)`.
- Точки ступней и тень следуют одной grounded world-pos; головы/крылья/хвост анимируются через anchored joint transforms, а не масштабированием единого SVG.
- Тап по сцене задаёт goal при условии разумных границ/неприкрытого UI. Движение может быть мгновенно отменено `feed/play/sleep`.
- Collision с границей мира, сортировка слоёв и минимальный набор декоративных props; не создавать Game Engine на тысячи объектов.
- `requestAnimationFrame`/CSS animation выключать при `document.hidden` и при reduced motion, не расходовать ресурсы на невидимый canvas.

## 7. Рендерер Chippster Flaps

- Физика/скоринг pure deterministic module в `games/flaps/engine` с fixed timestep (например 60 Hz) и accumulator cap, не привязывать игровые координаты к пикселям устройства.
- Canvas 2D (предпочтительно) или проверенный лёгкий гибрид Canvas/DOM с sprite cache для рендера **того же активного** V2 персонажа в динамике. Рисование не обязано использовать React renders 60 раз/сек.
- Кэш спрайта/выраженных поз на `appearanceVersion+genes+stage+size+DPR`, предотвращать дорогое пересоздание SVG при каждом кадре.
- Пауза на `visibilitychange`/Telegram deactivate; при возвращении продолжать с отсечённой дельтой или завершать по TTL, но не «телепортироваться через препятствия».
- Поле фиксированное, input `pointerdown`/touch + клавиатура Space для тестов, отсутствие пассивного браузерного scroll/zoom; плавная деградация под 30 FPS.
- Столкновения по адекватному hitbox, независимому от визуального пера/хохолка, с понятной реакцией игроку.

## 8. API Flaps — рекомендуемая эволюция

Предпочтительны `startFlapsRun` и `finishFlapsRun` (не смешивать со старым minigame handler), интерфейс:
```ts
startFlapsRun({ operationId }) =>
  { runId, chickId, startedAt, expiresAt, configVersion }
finishFlapsRun({ operationId, runId, score, endReason }) =>
  { rewarded, bestScore, previousBest, newBest, ... }
```
Запросы валидируются сервером. endReason: `crash | timeout` (либо согласованный enum), не принимать arbitrary cooldown/reward fields. Идентичность через `ctx.initData.user.id`, сервер проверяет attempt owner и `chickId` из сохранённой попытки.

Старые `startMiniGame`/`finishMiniGame` отклоняются без эффектов: игрок должен переоткрыть обновлённую игру. Поддержка старого игрового протокола не требуется.

Игровую логику, конкретные длительности и антиабуз см. `CHIPPSTER_FLAPS_0.2.md`.

## 9. Стратегия live deploy, разрешённая владельцем

**Владелец прямо разрешил** Codex публиковать новую 0.2 в действующий `@chipperhatcherybot` без отдельного подтверждения каждого штатного шага: в проекте сейчас бета, публичной аудитории не заявлено. Владелец дополнительно разрешил один адресный reset chipper_players при переходе на 0.2. Он не разрешал удаление системных ресурсов/секретов, непроверенные destructive migrations, force push, платежи или изменения других ботов.

### Порядок

1. Ветка `feature/chipper-v0.2` от актуального `main`; сначала read-only repo status/head.
2. Реализовать и провести локальные тесты. До первого live deploy зафиксировать исходный `main` SHA, baseline serverless revision, конфигурацию и обратимый артефакт из предыдущей рабочей сборки.
3. Перед cloud write проверить, что авторизация CLI относится к `@chipperhatcherybot` и тому же bot app ID **8924974998**. Проверять без раскрытия токенов; `tgcloud fetch/status/diff`.
4. Обнаружить неизвестные изменения в облаке. Если cloud revision отличается от ожиданий — fetch/сравнить, **не применять `--force`**.
5. `npm ci` → typecheck/lint/unit/integration/ui/perf smoke → production build → анализ файлов и diff модулей. Убедиться, что удаление старой minigame UI не приведёт к непреднамеренному удалению runtime endpoint.
6. Если необходимо изменить схему таблиц: сначала `npx tgcloud migrate --dry-run`, затем только подтверждённые `--safe` изменения, в порядке совместимого rollout. Предпочтительно **обойтись без SQL schema migration**, расширив существующий JSON.
7. `npx tgcloud push` (только после успешных проверок); `npx tgcloud migrate --safe` **только если** реально есть согласованные safe schema changes. Для power-user proxy следовать `DOCS/DEPLOYMENT_0.1.md`; без `tgcloud reset` и `push --force`. Затем `node scripts/reset-game-v0.2.mjs --apply` ровно один раз; обычные деплои helper не вызывают.
8. Проверить `status`, HTTP URL, отсутствие mock в production, BotFather Main Mini App/Menu Button, отсутствие 401 при *валидном* запуске владельцем — но никогда не симулировать реальные подписи чужих Telegram ID.
9. Указать точное время деплоя, source SHA, cloud revision, фактически выполненные тесты, список manual A/B/C проверок и процедуру отката.
10. Если live deploy блокируется отсутствием токена/сетью/неконтролируемым diff/опасной миграцией, **не маскировать блокер**; создать PR и инструкции, а не имитировать публикацию.

### Откат

При регрессии публикуется проверенный исправленный V2 код или предшествующий совместимый V2 checkpoint. Код 0.1 не является совместимым rollback после clean start: он не знает новые птицы/Flaps и не возвращает удалённый прогресс. Release marker и новые данные не удаляются. Если полноценный rollback требует несовместимого кода, готовится fix-forward либо временно закрывается доступ через настройки Mini App; повторный reset запрещён.

## 10. Definition of Done технического слоя

- TypeScript/lint/build/CI без ошибок.
- Регресс неизменившихся правил экономики/ухода, V2 morphology, reset и fresh-onboarding; фактическое количество тестов задокументировать.
- Двойные запросы Start/Finish/hatch не дублируют награды; 20-часовой кулдаун Flaps сохраняется после последующих обновлений.
- A/B/C и два клиента одного Telegram ID логически изолированы; real user acceptance не выдаётся за автоматизированную.
- V2 генетика не теряется после reload, возраста и переключения; новые аккаунты после reset изолированы.
- Дом/Flaps не перетягивают вниз веб-документ; Коллекция/Профиль сохраняют скролл/клавиатуру.
- Чистый production bundle без mock/токенов и доступный beta Mini App в **нужном боте**.
