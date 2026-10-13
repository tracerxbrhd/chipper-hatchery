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
    models.ts          # appearance v1/v2 types; visual contract
    legacy/            # неизменная/совместимая отрисовка 12 старых птиц
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
  endpoints/           # новые startFlapsRun/finishFlapsRun (+ старые для graceful compat)
  lib/domain.js        # поддержка v1 и v2 chick, miniGameCooldown and flaps best
  lib/service.js       # existing CAS unchanged where possible
  lib/store.js         # existing SQL CAS unchanged
  schema.js            # старую таблицу не удалять
tests/
  ...                 # domain, migration, UI, race, geometry, flaps, viewport
```

Это ориентир; агент может выбрать другие имена, если сохраняются тестируемость и границы ответственности.

## 3. Контракт модели данных и сохранение 0.1

### 3.1 Source of truth

В игре уже используется один атомарно обновляемый JSON-агрегат на `telegramId`. Это даёт безопасную единую транзакционную границу для птиц, яиц, наград и рекорда. Сохранять модель CAS (`UPDATE WHERE telegram_id AND revision = expected RETURNING revision`). Не переносить выдачу птиц/наград на клиент или непроверенные многозапросные транзакции.

### 3.2 Внешность

Для каждой птицы:
- **V1 (legacy)**: `appearanceId` — один из 12 имеющихся ID; отсутствие `appearanceVersion` трактуется как 1. Старый рендер должен оставаться доступным. Старые птицы не переролливаются и не пересоздаются.
- **V2:** `appearanceVersion: 2`, `genes: { ...versioned fields... }`, `appearanceId`: legacy-compatible fallback ID того же `rarity` для старого клиента/временного rollback; детали V2 определяются genes. Уникальный неизменяемый chick.id сохраняется.
- Выбор `rarity` по 70/25/5 и `genes` происходит сервером **один раз при hatch**. Результат хранится полностью, без зависимости от новой версии генератора при последующих просмотрах.
- `Snapshot` 0.2 расширяется опциональными полями `appearanceVersion` и `genes` для птиц V2, остальные поля `Chick` остаются совместимыми.
- Отдельный `geneSchemaVersion` (например, 1) для будущих изменений словаря форм. **Не хранить только seed:** он может интерпретироваться иначе после обновления генератора; закреплять конкретные значения.
- Если данные genes неполные или неизвестные, корректный legacy fallback без краша всего приложения; ошибка логируется без персональных данных.

### 3.3 Flaps

Использовать общий с 0.1 `player.miniGameRewardAt` для кулдауна `+1 пёрышко / 20ч`, **не обнулять его при замене мини-игры**.

Новые поля игрока в state JSON по умолчанию (lazy init при чтении):
```ts
player.flaps?: {
  bestScore: number;          // личный, не подтверждённый античитом рекорд
  completedRuns: number;      // завершённые попытки
  lastPlayedAt: number | null;
}
```
Серверные попытки (внутри `state.attempts` либо в отдельно версионированном агрегатном поле) включают: `kind: 'flaps'`, id, chickId на start, startedAt, expiresAt, finishedAt, cancelled и результат. Старые grain-attempts могут существовать до истечения TTL; не полагаться на их отсутствие. Историю длинных попыток хранить осмысленно, не накапливать вечно бессмысленные кадры.

Серверный `bestScore` не является доказанно честным результатом: браузер заявляет очки; применить plausibility bounds по серверному времени и настройкам препятствий, но не говорить, что это полноценный античит. Без глобальной таблицы рекордов и наград за лидерборд.

### 3.4 Преобразования состояния

- В 0.2 поддерживать `schemaVersion=1` из 0.1; при первом обращении возможно **идемпотентное lazy upgrade** в памяти + CAS, не удаляя неизвестные поля.
- Если вводится `schemaVersion=2`, тестировать повторную загрузку, upgrade при параллельных стартах и rollback старым серверным кодом. Откат не должен безвозвратно менять данные V2; при невозможности безопасного rollback — не вводить несовместимый schemaVersion в 0.2.
- Старые ID/яйца/таймеры/пёрышки/кудауны/милстоуны/receipts остаются неизменными по смыслу.
- Убедиться, что legacy-генерация при обновлении не меняет шанс редкости для уже созданных птиц.
- Ни в каком окружении не выполнять массовый reset, truncate, drop, принудительный purge или пересоздание базы ради 0.2.

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
- Canvas 2D (предпочтительно) или проверенный лёгкий гибрид Canvas/DOM с sprite cache для рендера **того же активного** v1/v2 персонажа в динамике. Рисование не обязано использовать React renders 60 раз/сек.
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

Старые `startMiniGame`/`finishMiniGame` можно оставить на одну версию для 0.1 клиентских сессий, но **не показывать зерновую игру в UI 0.2**; общий `miniGameRewardAt` не допускает получение двух наград через разные протоколы.

Игровую логику, конкретные длительности и антиабуз см. `CHIPPSTER_FLAPS_0.2.md`.

## 9. Стратегия live deploy, разрешённая владельцем

**Владелец прямо разрешил** Codex публиковать новую 0.2 в действующий `@chipperhatcherybot` без отдельного подтверждения каждого штатного шага: в проекте сейчас бета, публичной аудитории не заявлено. Это разрешение **не** распространяется на удаление пользовательских данных, destructive migrations, force push, передачу секретов, незапрошенные платежи и изменения в других ботах.

### Порядок

1. Ветка `feature/chipper-v0.2` от актуального `main`; сначала read-only repo status/head.
2. Реализовать и провести локальные тесты. До первого live deploy зафиксировать исходный `main` SHA, baseline serverless revision, конфигурацию и обратимый артефакт из предыдущей рабочей сборки.
3. Перед cloud write проверить, что авторизация CLI относится к `@chipperhatcherybot` и тому же bot app ID **8924974998**. Проверять без раскрытия токенов; `tgcloud fetch/status/diff`.
4. Обнаружить неизвестные изменения в облаке. Если cloud revision отличается от ожиданий — fetch/сравнить, **не применять `--force`**.
5. `npm ci` → typecheck/lint/unit/integration/ui/perf smoke → production build → анализ файлов и diff модулей. Убедиться, что удаление старой minigame UI не приведёт к непреднамеренному удалению runtime endpoint.
6. Если необходимо изменить схему таблиц: сначала `npx tgcloud migrate --dry-run`, затем только подтверждённые `--safe` изменения, в порядке совместимого rollout. Предпочтительно **обойтись без SQL schema migration**, расширив существующий JSON.
7. `npx tgcloud push` (только после успешных проверок); `npx tgcloud migrate --safe` **только если** реально есть согласованные safe schema changes. Для power-user proxy следовать `DOCS/DEPLOYMENT_0.1.md`; никакого `reset`, `push --force`.
8. Проверить `status`, HTTP URL, отсутствие mock в production, BotFather Main Mini App/Menu Button, отсутствие 401 при *валидном* запуске владельцем — но никогда не симулировать реальные подписи чужих Telegram ID.
9. Указать точное время деплоя, source SHA, cloud revision, фактически выполненные тесты, список manual A/B/C проверок и процедуру отката.
10. Если live deploy блокируется отсутствием токена/сетью/неконтролируемым diff/опасной миграцией, **не маскировать блокер**; создать PR и инструкции, а не имитировать публикацию.

### Откат

При регрессии допускается обратная публикация **последней реально рабочей версии кода**, но не SQL rollback/удаление записей. Сервер V2 должен писать так, чтобы при откате 0.1 хотя бы корректно загрузил player aggregate, даже если v2-питомец временно отрисуется legacy-compatible видом. Тестировать это **до** релиза.

## 10. Definition of Done технического слоя

- TypeScript/lint/build/CI без ошибок.
- Полный регресс 0.1: 62 domain+contract+races тестов как baseline (фактическое количество после переписывания задокументировать), плюс новые тесты.
- Двойные запросы Start/Finish/hatch не дублируют награды; 20-часовой кулдаун общий для v1/v2 minigame.
- A/B/C и два клиента одного Telegram ID логически изолированы; real user acceptance не выдаётся за автоматизированную.
- Legacy птицы выглядят по-прежнему; V2 генетика не теряется после reload и rollback чтения.
- Дом/Flaps не перетягивают вниз веб-документ; Коллекция/Профиль сохраняют скролл/клавиатуру.
- Чистый production bundle без mock/токенов и доступный beta Mini App в **нужном боте**.
