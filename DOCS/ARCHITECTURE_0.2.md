# CHIPPER 0.2 — техническая архитектура и восстановление clean start

**Статус:** design contract для Codex; проверять на текущем checkout и версии SDK перед реализацией.  
**Связанные документы:** `GDD_0.2.md`, `CHICK_SYSTEM_0.2.md`, `CHIPPSTER_FLAPS_0.2.md`, `ACCEPTANCE_0.2.md`.  
**Опубликованная beta:** по логу владельца Termux source `7fd2486d3233e6f560620017d00f478568cacb4d`, cloud revision 2, `https://app8924974998.tgcloud.ai/`, `@chipperhatcherybot` / App ID 8924974998. Однократный reset пока не завершён; recovery получает отдельный source SHA.

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

### 3.5 Один логический reset с неизменяемой версионной границей

В закрытой beta владелец разрешил очистить игровой прогресс 0.1. Все такие данные находятся в `chipper_players` JSON schemaVersion=1. После уже выполненного deployV2 новые игроки имеют schemaVersion=2; их прогресс сохраняется. Таблицы, настройки Telegram, конфигурация/секреты и сторонние ресурсы не удаляются.

Фактический Serverless отказал прежнему helper на первом SELECT sqlite_master с `Failed to prepare query [23] not authorized`, до SQL-записей. Catalog/PRAGMA/runtime CREATE TABLE/CREATE TRIGGER в recovery не используются. `chipper_release_operations` объявлена в `tgcloud/schema.js` и создаётся только supported schema-only push + migrate --safe: ровно ожидаемая safe-addition и финальный dry-run No schema changes. При warnings/manual/неизвестных операциях — остановка.

Administrative helper остаётся вне gameplay. Через temporary local endpoint `tgcloud run` он проверяет api.getMe (ID 8924974998, username chipperhatcherybot, is_bot), JSON functions и прямые именованные столбцы `telegram_id/revision/state_json`. Возвращает counts, не state_json/Telegram IDs. Malformed JSON, неизвестная/нецелочисленная schemaVersion, несовпадение player.telegramId/SQL ID, некорректные ID/revision и неподдерживаемый SQL блокируют prepare/apply. Фактическую структуру и ожидаемые schema additions проверяет штатный CLI migration inspector, а не запрещённые каталоги SDK.

- `--diagnose` read-only: getMe, JSON-capability и aggregate counts; `receiptTableReady:false` допустимо до миграции.
- `--dry-run` read-only: receipt table уже обязательна, countsV1/V2, fixed release receipt.
- `--prepare`: INSERT ON CONFLICT DO NOTHING записывает фиксированный план `chipper-v0.2-clean-start` со status='prepared' (pending операция), source_sha, planned_legacy_players/remaining_legacy_players и identity. Игроков не изменяет.
- `--apply`: требует prepared receipt; одним атомарным DELETE удаляет только целочисленную JSON schemaVersion=1 с EXISTS guard на этот prepared release/identity. После подтверждения legacy count0 отдельный conditional UPDATE/CAS переводит receipt в completed.

`DELETE` и metadata completion **не являются одной транзакцией**. При потере ответа после DELETE pending план остаётся, повтор удаляет только V1 с нулевым новым эффектом и завершает metadata. Ни один V2 профиль не подходит под DELETE. Completed receipt запрещает дальнейшую запись/очистку; появление V1 после completion возвращает blockedCode RESET_LEGACY_AFTER_COMPLETION без новой очистки.

Безопасность этой модели требует исключительно V2 writers после подготовки; возврат runtime 0.1 после status='prepared' запрещён. Ordinary gameplay/будущие deploy не вызывают helper. Wrapper prepare/apply дополнительно требует clean worktree и точный in-sync ответ pinned CLI0.2.0 от `migrate --local --dry-run`; неизвестный output/план блокирует изменение данных даже при exit0. Temporary endpoint удаляется в finally и никогда не публикуется.

Данные receipt: release_key, status(prepared/completed), prepared_at, completed_at, planned_legacy_players, remaining_legacy_players, app_id, bot_username, source_sha. Planned count — зафиксированный план, не выдуманное число фактически удалённых rows. Никаких deleted_players из прежнего trigger design.

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

### Порядок recovery после опубликованной revision 2

1. Получить точный recovery SHA существующего PR#2, проверить clean worktree и tests. Не создавать новый PR/merge.
2. Только read-only `--diagnose`: точный getMe, direct-column/JSON capability, valid ownership/version, countsV1/V2; до миграции missing receipt table допустима.
3. `fetch/status/diff`, затем `migrate --local --dry-run`: допускается ровно ожидаемая новая `chipper_release_operations`, без удаления/изменения gameplay/сторонних объектов.
4. Schema-only `push tgcloud/schema.js`; отдельно deployed `migrate --dry-run`, ожидаемый plan, `migrate --safe`; затем повторный dry-run обязательно No schema changes. Exit0 safe не подтверждает применение warning/manual changes.
5. `--dry-run → --prepare → --apply → --dry-run`: fixed prepared receipt, legacy-only DELETE, completed metadata CAS, ноль V1 и сохранённые V2. Wrapper prepare/apply дополнительно проверяет CLI schema in-sync.
6. `fetch/status`, точные source/cloud revision/URL/receipt/counts, затем signed acceptance A(бывший V1)/B(уже V2)/C(новый), A1/A2. Результаты pending до фактического выполнения.

Каждая фаза проверяется до следующей. Не передавать весь изменяющий runbook одним многострочным paste: newline shell не останавливается при ошибке. Для допустимых последовательностей использовать &&; никаких force/--yes/destructive fallback. При неподдерживаемом JSON/DML/schema — технический blocker, не симуляция успешного reset.

### Восстановление кода

После prepared/completed только проверенный V2 checkpoint/fix-forward; runtime 0.1 вновь создавал бы V1 и нарушил fence. Receipt и новую игру не удалять. До prepared возможный rollback тоже требует отдельной оценки уже созданных V2, исходный 0.1 не считается автоматически совместимым. Исходные 0.1 документы остаются историческими.

## 10. Definition of Done технического слоя

- TypeScript/lint/build/CI без ошибок.
- Регресс неизменившихся правил экономики/ухода, V2 morphology, reset и fresh-onboarding; фактическое количество тестов задокументировать.
- Двойные запросы Start/Finish/hatch не дублируют награды; 20-часовой кулдаун Flaps сохраняется после последующих обновлений.
- A/B/C и два клиента одного Telegram ID логически изолированы; real user acceptance не выдаётся за автоматизированную.
- V2 генетика не теряется после reload, возраста и переключения; новые аккаунты после reset изолированы.
- Дом/Flaps не перетягивают вниз веб-документ; Коллекция/Профиль сохраняют скролл/клавиатуру.
- Чистый production bundle без mock/токенов и доступный beta Mini App в **нужном боте**.
