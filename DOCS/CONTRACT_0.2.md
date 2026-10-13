# Chipper 0.2 — интеграционный контракт

Актуальные указания владельца от 13.10.2026 имеют приоритет: новая графика V2 с нуля, без legacy renderer; разрешён ровно один адресный сброс игрового прогресса при переходе на 0.2. Исторические документы 0.1 не изменяются.

## Состояние и гены

`ChickGenesV2` использует точные поля и enum из раздела 2 CHICK_SYSTEM_0.2: `geneSchemaVersion:1`, headShape round/oval/puffed/tall/wide, bodyShape pear/compact/oval/stocky, eyeStyle big/small/curious/sleepy, beakShape triangle/short/wide/curved, legShape stubby/slender/sturdy, wingShape rounded/pointed/fluffy/small, tailShape short/fan/curled/feathery, crestShape none/tiny/tuft/three-feather/messy, pattern solid/belly-patch/spotted/striped/speckled/split, colors body/head/wing/belly/tail/marking/beak/legs (hex), detailVariant 0..3. Сервер хранит явные признаки при hatch. Все птицы нового состояния имеют appearanceVersion:2. appearanceId остаётся технической строкой, не указывает старую графику. Некорректные гены дают безопасный нейтральный V2 fallback, без случайного переролла.

Snapshot прежнего формата дополнен `player.flaps:{bestScore,completedRuns,lastPlayedAt}`. Сохранения schemaVersion 2; старые данные не мигрируют и не стираются автоматически, сервер отвечает RESET_REQUIRED до управляемого перехода.

## Рендер

`ChickArt({chick,animate?,mood?,pose?,direction?,phase?,shadow?,className?})`: chick содержит гены и стадию. pose idle/walk/turn/look/preen/feed/play/sleep/wake/flap/hit/hatch/grow; direction left/right/front; phase 0..1 для управляемой походки/крыльев. Один renderer на всех экранах. Опорная точка ног фиксирована в viewBox, тень опциональна. `renderChickSvg(options)` использует ту же геометрию и разметку; Flaps кэширует восемь фаз крыльев и hit-позу один раз на попытку.

`HomeWorld({chick,animate,action?,actionKey?,now?,sleeping?})`: локальные bounded movement/глубина/тень, серверный sleepUntil приоритетен. HomeScreen существующий публичный интерфейс сохраняет; добавляет Living World вместо статичного арта.

## Flaps

startFlapsRun({operationId}) → ApiResult state + result {runId,chickId,chick,startedAt,expiresAt,configVersion}; chick — неизменяемый снимок птицы на старте.
finishFlapsRun({operationId,runId,score,endReason:'crash'|'bounds'}) → ApiResult state + result {score,previousBest,bestScore,newBest,rewarded,rewardNextAt,reason?}.
Run фиксирует исходную птицу. TTL 10 минут, reward минимум 2 секунды, +1/20ч, общий miniGameRewardAt, 6 starts/min, один открытый run. Очки имеют server-time plausibility guard, не влияют на выплату. Перезапрос использует тот же operationId и payload.

`FlapsGame({attempt,busy,reducedMotion,sound,haptics,now,onComplete(score,endReason),onLeave})`; attempt содержит runId/chickId/chick/startedAt/expiresAt/configVersion. Activities получает state/now/busy/reducedMotion/onStart, GameResultScreen — result/chick/now/busy/reducedMotion/onAgain/onHome. Telegram BackButton отправляет событие chipper:flaps-back, которое открывает подтверждение выхода.

## Навигация и файлы

Tab = collection/incubator/home/activities/profile, Дом строго третий. BottomDock({active,onNavigate}). Home/Flaps фиксированы; остальные экраны имеют внутренний scroll. disableVerticalSwipes feature-detect, stable viewport, корректные safe insets, BackButton.

- UI: src/api/telegram.ts, src/navigation/**, src/design/**, src/app.css.
- Art: src/chicks/**, src/components/ChickArt.tsx, src/art.css, собственные geometry tests.
- World: src/world/**, src/screens/PetScreens.tsx, собственные world tests/styles.
- Flaps: src/games/flaps/**, src/screens/GameScreens.tsx, engine tests/styles.
- Backend: tgcloud/**, новые backend tests.
- Release audit: read-only CLI, подтверждённая reset procedure; cloud mutations только интегратором.
- Интегратор: App/types/client/main/i18n/Profile/package/документы/QA.

Проверки: npm run check, npm run test:ui, генерация/геометрия, deterministic physics, конкурентные CAS/replay, reset → onboarding → starter egg → V2 hatch. Browser fixtures не являются живой Telegram-приёмкой. Деплой и reset разрешены владельцем только в подтверждённый 8924974998/@chipperhatcherybot штатными поддерживаемыми средствами.
