# CODEX MASTER TASK — Chipper 0.2 «Living Hatchery»

**Project:** `tracerxbrhd/chipper-hatchery`  
**Telegram:** `@chipperhatcherybot` · Bot/App ID `8924974998` (перед любым deploy подтвердить в живом CLI)  
**Target:** реализовать, протестировать и **опубликовать живую beta 0.2** на существующем Telegram Serverless без потери данных 0.1.  
**Model/orchestration:** использовать текущую мощную модель Codex как технического руководителя и настоящих субагентов, если доступны.  
**Git:** работать в `feature/chipper-v0.2` от актуального `main`, в конце один PR в `main`, **не мержить**.  
**Язык UI, документации и отчёта:** русский.  
**Статус:** задача для выполнения, НЕ утверждение, что код уже реализован.

## 0. Роль

Ты — principal engineer, lead game developer, арт-техдиректор и orchestrator проекта Chipper. Ранее 0.1 была реально опубликована на Telegram Serverless. Пользователь предоставил замечания к живой игре; не останавливайся на обсуждении/макетах: **доведи 0.2 до функционального релиза**, сам выдели подзадачи, параллельные потоки и в конце интегрируй их.

Разрешение владельца на релиз: **можно сразу деплоить проверенную версию 0.2 прямо в действующий `@chipperhatcherybot`, без отдельного ожидания подтверждения.** Однако запрещены разрушение сохранений, рискованные миграции, `push --force`, `reset`, работа с чужими ботами, секреты в логах и мердж PR без владельца.

## 1. Прочитать ПОЛНОСТЬЮ до работы

В порядке приоритета при коллизиях:

1. `DOCS/GDD_0.2.md` — утверждённые продуктовые требования 0.2 и границы.
2. `DOCS/CHICK_SYSTEM_0.2.md` — параметры внешности, анимации, legacy V1 и Living World.
3. `DOCS/CHIPPSTER_FLAPS_0.2.md` — **правильное имя Chippster Flaps**, game design, физика, API, награды.
4. `DOCS/ARCHITECTURE_0.2.md` — текущая кодовая база, схема состояния, Telegram viewport, перенос без потери данных, деплой.
5. `DOCS/ACCEPTANCE_0.2.md` — требования для тестов, приёмки и качества, в т.ч. три аккаунта.
6. `AGENTS.md`, `DOCS/tgcloud-sdk.md`, `DOCS/CONTRACT_0.1.md`, `DOCS/DEPLOYMENT_0.1.md`.
7. `DOCS/GDD_0.1.md`, `DOCS/ACCEPTANCE_RESULT_0.1.md` и существующие тесты для сохранения 0.1-поведения.

Изучи реальные исходники `src/**`, `tgcloud/**`, `tests/**`, `package.json`, конфигурацию cloud, существующий GitHub PR #1. Перед изменениями `git status`, `git log`, `git branch`. Ни один документ 0.1 не переписывать под код 0.2.

Если к задаче приложен исходный визуальный референс ChickFocus — используй его **только как эстетическое направление**, не копируй чужие SVG/иконки/макеты. Сам создавай оригинальную графику Chipper.

## 2. Результат, который должен увидеть владелец

Открыв beta Mini App, пользователь видит:
- компактный glass HUD и **фиксированную домашнюю игровую сцену**, без нежелательного вертикального свайпа / скролла;
- цыплёнка, который **гуляет по 2.5D-площадке**, двигает лапками, поворачивается, моргает, смотрит на пользователя, реагирует на корм/игру/сон и нажатие по полю;
- **разных по формам, а не только цвету, птиц**: голова, тело, хвост, крылья, лапки, клюв, узоры, многоцветное оперение, все три стадии; прежние экземпляры 0.1 остаются прежними;
- 5-позиционный нижний glass-dock `Коллекция — Инкубатор — [ДОМ] — Активности — Профиль`; центральная вкладка Дом выделена, переключения плавно анимированы;
- на вкладке Активности **Chippster Flaps**, а не «Собери зёрнышки»: current active chick летает между авторскими препятствиями, тап = flap, есть score, collision, personal best, быстрый restart, звуки/награда;
- существующие системы ухода, редкостей, яиц, взросления, коллекции, серверного прогресса продолжают работать без потери данных;
- обновлённые русские подписи, состояние загрузки/offline/retry, dark/light/reduced motion.

## 3. Оркестрация — используйте настоящих субагентов

Если среда позволяет, запусти независимых субагентов. Ориентир **6 направлений**, точное число регулируй под доступные ресурсы.

**Agent A — Telegram WebView / UI Foundation.**  
Владение: `src/api/telegram.ts`, `src/navigation/**`, `src/design/**`, `src/app.css`. Feature-detect `disableVerticalSwipes`, stable viewport, safe area, fixed scene layout, 5-tab dock, стеклянная дизайн-система, анимации маршрутов, a11y.

**Agent B — Chick System 2.0 / Art.**  
Владение: `src/chicks/**`, `src/components/ChickArt.tsx`, `src/art.css`. Модульные морфологические варианты, anchors, renderer V1/V2, 3 возраста, позы, общий avatar/sprite adapter для Дома/Flaps, dev preview gallery. Техническое качество важнее числа «рандомных палитр».

**Agent C — Living World / Home.**  
Владение: `src/world/**`, `src/screens/PetScreens.tsx` (координировать с интегратором создание Profile, чтобы не возникало файловых конфликтов). 2.5D-площадка, real grounded walk/gait, локальная state-machine, реакция по тапу, care buttons, низкие экраны.

**Agent D — Chippster Flaps Frontend.**  
Владение: `src/games/flaps/**`, `src/screens/GameScreens.tsx` и отдельные тесты engine в согласованной собственной папке. Physics/touch/collisions/score/result/restart/hidden-state, original obstacles, sprite текущей птицы, профилирование. Не меняет серверную экономику самостоятельно.

**Agent E — Backend / save format / migrations.**  
Владение: `tgcloud/**`. Версия внешности V2 server-only, old V1 fallback, CAS/receipt, `startFlapsRun`/`finishFlapsRun`, общий 20ч cooldown, anti-abuse, personal best и retrocompatibility, bounded-attempts или безопасная политика storage роста. **Не изменять текущую таблицу и данные деструктивно**.

**Agent F — QA / regressions / release audit.**  
Владение: `tests/**`, `scripts/**`, UI visual regression fixtures и отчёты QA (при согласованной интеграции). Проверка всех P0 из ACCEPTANCE, симулированной конкуренции, контрактов, legacy-state, mobile viewport, perf, secrets, live checklist.

**YOU — Integrator / release owner.**  
Владение: `src/App.tsx`, `src/api/client.ts`, `src/types.ts`, `src/main.tsx`, `src/i18n.ts`, `src/screens/ProfileScreen.tsx`, `package.json`, CI, README, AGENTS и итоговые документы. Ты определяешь контракты до параллельной работы, принимаешь интеграционные решения и лично запускаешь final quality gate/deploy/PR.

**Критически важно:** перед стартом параллельного программирования зафиксируй в `DOCS/CONTRACT_0.2.md` (это должен быть новый файл) конкретные данные:
- stable `ChickGenesV2` и fallback `appearanceId`;
- `ChickRenderer`/sprite API (для Living World и Flaps);
- интерфейс `HomeWorld`;
- front-end `startFlapsRun/finishFlapsRun` and result shape;
- shared navigation API and tab names;
- server `Snapshot` extension и error envelope;
- раздельное владение файлами и команды проверок.

Если нет функции субагентов — выполни те же потоки самостоятельно последовательно. Это не блокер.

## 4. Порядок работы и контрольные точки

### Phase 0 — Audit + baseline

- Установи фактический `main` HEAD и чистоту worktree; создай feature branch.
- Прочитай текущий `AGENTS.md`: старые строки «работай на v0.1» необходимо согласовать с 0.2, но сохранить действующие технические предостережения.
- Изучи фактический DOM/layout/CSS, 0.1 backend, тесты, подход к deploy. Проверь по официальной документации Telegram наличия `disableVerticalSwipes`, `viewportStableHeight`, BackButton, Serverless SDK.
- Создай `DOCS/CONTRACT_0.2.md` и короткий актуальный интеграционный план в собственной заметке/документе. Убедись, что разные агенты не редактируют `App.tsx` и `src/types.ts` одновременно.

### Phase 1 — implementation in parallel

- Foundation/Glass/Nav; Chick generator V2; Living World; Flaps engine; Serverless state/API; QA infra.
- Не жди финальных артов и не проси пользователя сделать картинки: SVG/Canvas создаёшь программно из оригинальных примитивов.
- Начинай интеграцию при первом готовом работающем вертикальном срезе, а не после полного завершения всех субагентов.
- Каждый модуль должен иметь реальные тесты, не тесты-заглушки и не ручное скриншотное «кажется красиво».

### Phase 2 — integration

- End-to-end UX: welcome/egg → home walk → feed/play/sleep → collection → activate new → home → Chippster Flaps → result → profile → back → incubator/hatch.
- Бывшие птицы 0.1 с полным набором legacy данных работают без изменения генов.
- Новые птицы получают v2 genes сервером ровно один раз; в UI их возраст и окраска меняются корректно при взрослении.
- `miniGameRewardAt` остаётся общей глобальной границей. У Flaps нет прежнего фиксированного правила «ждать 25 секунд до game-over».
- Приложение не выглядит как стандартная dashboard форма: минималистичные чистые композиции, glass только где нужен, character-first сцена.

### Phase 3 — automated and real UI quality gate

- `npm ci`, `npm run check`, `npm run test:ui`, тесты нового engine и инвариантов. Убедись, что последний коммит с исходниками покрыт этими запусками.
- Скриншоты mobile light/dark + legacy V1 + несколько максимально разных V2 + Flaps ready/play/crash/result; зафиксируй их в `DOCS/qa/0.2/`.
- Проверка overflow, safe areas, false touches, анимаций, accessible labels, touch-first input. Никаких визуальных дефектов, видимых невооружённым глазом.
- Конкурентные вызовы сохраняют инварианты: один profile, один hatch, один reward, один finish, idempotent operations, foreign IDs refused.
- Если реальный UI test без Telegram initData, это browser mock. Не выдавай его за живой подписанный Telegram запуск.

### Phase 4 — live Telegram beta release (AUTHORIZED)

**Владелец прямо разрешил live deploy в существующий бот**, но только после Phase 3 с зелёными блокирующими проверками.

1. Чётко определи бот/app ID, baseline cloud revision и текущие серверные файлы (read-only `tgcloud fetch/status/diff`).
2. Сохрани известный работающий source SHA и процедуру кодового rollback без изменения БД.
3. Проверь production build и отсутствие dev mock/secret values.
4. Сделай безопасную проверку миграций **если они требуются** (`migrate --dry-run`, а для отличия local/deployed при необходимости `--local`). Применять только ожидаемые `--safe` после согласованного `push`.
5. Если cloud не синхронизирован или обнаружено неожиданное удаление modules/table, останови именно деплой, не force.
6. Деплой `npx tgcloud push` в **того же** `@chipperhatcherybot`. Для Windows proxy используй проверенные рекомендации `DOCS/DEPLOYMENT_0.1.md`, не считывай/не печатай токен.
7. Проверка статуса, манифеста модулей, сайта, отсутствия production dev code, реального URL, доступности Main Mini App. По возможности сделай безопасные signed live actions только на своём разрешённом тестовом аккаунте. Не подделывай A/B/C.
8. Если обнаружена тяжёлая production регрессия, выполни безопасный rollback к записанному working code, без отката/обнуления БД; если rollback невозможен без риска сохранений — не выполняй рискованных действий, честно обозначь блокер.

**Не требуй отдельного подтверждения на обычный безопасный deploy**, оно уже получено в задании. Но не придумывай credentials, если доступа действительно нет. В этом случае закончи код, открой PR и дай точные команды владельцу.

### Phase 5 — отчёт + PR

- Открой один PR `feature/chipper-v0.2 → main`. Не сливай его.
- Оформи `DOCS/IMPLEMENTATION_0.2.md`, `DOCS/ACCEPTANCE_RESULT_0.2.md`, обнови README/AGENTS если требуются реальные инструкции.
- В PR: что сделано, что сознательно не сделано, source SHA, cloud release revision/url, schema changes (если есть), все тесты и флаги, регрессия legacy 0.1, known issues, чеклист владельца с несколькими аккаунтами.
- **Не закрывай работу после одних документов, scaffold или 80% P0**, если можешь продолжать. Цель: готовое приложение.

## 5. Hard constraints

### No data loss

- НЕ удаляй таблицу `chipper_players`, не сбрасывай `state_json` или счётчики пёрышек, не переролливай старые appearanceId.
- НЕ меняй устройство серверного CAS без доказательной необходимости. Новое поле рекорда/genes должно входить в ту же атомарную запись вместе с receipt/reward.
- НЕ выбрасывай старые `operationId` receipts без корректной replay-safe стратегии; длинная история — технический долг, но наивное `slice(-50)` может вернуть двойные покупки.
- НЕ превращай случайный seed V2 в единственный источник генетики. Сохрани полную версионированную конфигурацию.
- Схема legacy поля `appearanceId` по-прежнему есть; V2 добавляет optional поля без breaking change.

### Telegram and UX

- `disableVerticalSwipes` используется, если доступен; системный header всегда может свернуть приложение. Не пытайся перехватывать нативные жесты Android/iOS глобально.
- Fixed Дом **не значит** запретить скролл карточки/Профиля/Коллекции или перемещение к клавиатуре.
- 5-вкладочный dock, Дом на позиции 3. У Flaps dock скрыт.
- Liquid Glass имеет fallback, reduced-motion, dark/light, доступность. Не делать 60 раз в секунду CSS/backdrop filter recalculation.
- Не подключать Three.js/WebGL/физические движки ради маленькой 2.5D площадки. Используй лёгкую сцену/SVG/CSS и Canvas2D для Flaps.
- Питомец в Flaps и в Home действительно совпадает по v1/v2 облику; для старых птиц не допускать внешней замены generic bird.

### Security and ethics

- Не вводить NFT/крипто, торговлю, рекламу, звёзды или смерть питомцев.
- Функции `chickId`, `runId` проверяются на ownership; Telegram ID берётся из verified backend context, а не из client input.
- Награда за мини-игру максимум +1 раз/20ч; клиентский score не влияет на пёрышки. Рекорд не публичный/не античит-гарантированный.
- Не выводить в PR/логи Telegram credentials, initData, содержимое частных профилей, чужие ID.
- Внешние поставщики и аналитика не нужны; никаких post-to-external endpoints.

## 6. Обязательный итоговый формат отчёта

На русском языке:

1. **Статус:** `0.2 готова к приёмке` или `НЕ готова` и почему.
2. **Git:** ветка, start SHA, финальный SHA, PR URL, merge не сделан.
3. **Субагенты:** реальное распределение и артефакты; если не было API субагентов — так и сказать.
4. **Функционал:** что работает для каждого P0, что добавлено из P1.
5. **Тесты:** точные команды, число PASS/FAIL, screenshots/art gallery; честный live/mock distinction.
6. **Serverless:** идентификация бота, фактический URL/revision, способ deploy, нужны ли schema migrations, preserved saved data.
7. **Приёмка владельца:** сценарии A/B/C, A1/A2, отдельные steps для Android.
8. **Дефекты/ограничения и rollback** с SHA и безопасными командами.

**Твоя задача завершена не в момент создания PR, а когда у владельца есть работающая 0.2 на beta-боте (или честный технический блокер), набор проверенных изменений и готовые шаги для пользовательской приёмки.**
