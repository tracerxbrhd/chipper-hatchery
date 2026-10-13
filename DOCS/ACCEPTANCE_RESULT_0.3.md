# Chipper 0.3 — фактический результат приёмки

**Chipper 0.3 ready for owner acceptance — реализация и автоматизированные проверки завершены. Бета-релиз NOT ready: cloud доступ отсутствует.** В этой сессии не выполнялись migration, push в Telegram, reset или реальные signed A/B/C тесты. PR в main открывается без merge.

## Git и доказательства

| Поле | Факт |
|---|---|
| Репозиторий | tracerxbrhd/chipper-hatchery |
| Актуальная база main | `e6218fe0f9cf8fb6d838bd71b1f17ca479dc793f`; повторный fetch подтвердил отсутствие новых main commits |
| Ветка | feature/chipper-v0.3 |
| Проверенный локальный checkpoint | **`285b75f06a308ef141030a19e7281691383ee461`** |
| Runtime commit в GitHub | **`9db3c6e95b1bfe9df390ebb525ce428cd79643a5`**, идентичный tree `5f65e3490a9814b9316424f88466c6ec6af69258` |
| Финальный HEAD | Позднейшие commits только дополняют этот отчёт/логи; runtime checkpoint выше |
| PR | Создаётся после фиксации отчёта; ссылка будет внесена отдельным docs commit |
| Merge | Не выполнялся |
| Окружение | Node24.19.0, SQLite3.53.3, Chromium153, @tgcloud/cli0.2.0 |

Git CLI push отказал из-за отсутствия HTTPS write credentials. Доступ подключённого GitHub API подтвердил push permission;115 blobs сверены с локальными Git hashes, созданный tree **точно совпал** с проверенным `5f65e3490a9814b9316424f88466c6ec6af69258`. API commit меняет metadata, а не runtime. Ветка публикуется штатными GitHub objects/ref без force и без изменения main. Этот Git-блокер разрешён; Telegram CLI-блокер остаётся.

Финальные проверки выполнены **на зафиксированном `285b75f06a308ef141030a19e7281691383ee461`**, с чистым worktree и без capture-флага:

| Команда | Фактический результат |
|---|---|
| `npm ci` | PASS; зависимости package-lock установлены, dependency upgrades не выполнялись |
| `npm run check` | **PASS: 290/290 tests, 20 files**, TypeScript, Serverless imports/syntax, lint, build, dev/mock isolation, secrets |
| `CHIPPER_CHROMIUM_PATH=/tmp/chipper-browser/chromium npm run test:ui` | **PASS: 57/57, 46,8с**, старые и новые suites вместе |
| Gift SQL/races | **23/23**, включая отдельные SQLite connections/worker isolates |
| Social | **21/21**, private/permissions/consent/token/races/whitelist |
| Game registry | **17/17**, migration/retry/cooldown/fixture second-game |
| Read-only preflight | **31/31**, включая fakeCLI failures/cleanup и реальный localSQLite |
| Touch model | **9/9**; вместе с world/geometry owned43/43; реальные pointer suites входят в57 |
| PNG/intent unit | **2/2**, escaping/current stage/malformed intent |
| Финальный secrets/history gate | PASS:230 files/30 commits, credential directories не читались |
| Temporary administrative endpoints | ABSENT; release check отвергает остаток reset/preflight helper |

Логи: [check-285b75f.txt](qa/0.3/check-285b75f.txt), [ui-285b75f.txt](qa/0.3/ui-285b75f.txt). Production assets: `index-iqctckBx.css`, `index--PsLYWWr.js`. После фиксации отчёта проверка истории/секретов повторяется; docs-only HEAD не выдаётся за другой runtime.

## Что реализовано

- Нейтральный графит/sage, glass fallback, protected center HUD и отдельный баланс/Back, safe floating dock с центральным Домом. Flaps title/score/controls больше не попадают в синтетические native зоны.
- `Магазин | Коллекция | Дом | Активности | Профиль`; работающие Птенцы/Яйца и legacy redirect. Магазин честно «Скоро», без платежей.
- Tap/stroke/hold250ms/pickup/drag/land, отдельная наземная тень, анатомические poses и cleanup. Reduced motion сохраняет смысл жестов и статичного ухода; после ухода снова доступны касания. Сон не прерывается, touch не выдаёт наград.
- Память роста с теми же genes: открытые прошлые стадии доступны, будущие `?`, renderer для закрытых форм не создаётся, server stage не меняется.
- Per-game registry сохраняет Flaps record и прежний20ч reward clock. Care отдельно, unknown gameId rejected, публичных рейтингов нет.
- Private default, отдельная collection visibility, consent friendship/request/accept/decline/remove/block, opaque rotate/revoke links, onboarding return-to-intent, read-only visits.
- Оригинальная карточка PNG720×900, копирование и Telegram **link** sharing. Native media upload не реализован; сохранённая PNG не может быть отозвана, ссылка повторно проверяет текущие permissions.
- Реальные подарки resting bird accepted friend: UI confirmation, reservation, accept/decline/cancel/24ч TTL, unchanged ID/genes/name/bornAt/care history, без валютной выдачи.

## Субагенты

| Реальный агент | Владение и результат |
|---|---|
| ui | Telegram adapter/HUD/dock/themes/Flaps readability,11 adapter tests и визуальное сравнение3 палитр |
| touch | world/gesture/renderer/anatomy,43 owned tests, extreme adult320 smoke и reduced-care regression |
| games | registry/domain/GameScreens и17 tests; независимое read-only review social/gift auth/CAS |
| social_backend | social.js,10 endpoints,21 tests; architecture/implementation docs |
| gift_protocol | gifts.js,4 endpoints,23 tests; preflight script/core и31 tests |
| qa |4 новые browser suites/24 tests, existing navigation adaptation, synthetic realSQLite social flow, screenshots/perf |
| Оркестратор | Общие контракты/types/schema/runtime/service/App, Collection/growth/Shop/social screens/sharing, интеграционные fixes, общий прогон, report/PR/release review |

## Атомарность подарков и разрешения

Авторитетное владение остаётся в `chipper_players.state_json.chicks`. Pending history хранится у отправителя, receipt у действующего actor. Accept выполняет **один** conditional UPDATE обеих player rows через CASE; MATERIALIZED eligible CTE заранее фиксирует оба expected revisions, accepted/unblocked pair и срок. Обе коллекции, terminal history и receipt получателя коммитятся вместе. Разрешены только0 или2 изменённые строки; нет отдельного delete/add и промежуточного владельца.

Реальный SQLite доказал:10 concurrent accepts из независимых connections, accept/cancel races, offer/activate и offerB/C, recipient revision conflict, потерю ответа после commit/restart, faults перед каждым query, RAISE(ABORT) на второй строке с rollback обеих. Test-only trigger используется только локально, runtime DDL отсутствует. У A остаётся собственный active, B получает тот же исходный объект. TTL и отмена не удаляют птицу. Block/unfriend запрещает принятие; pending сохраняется до cancel/decline/TTL, новая явная дружба до TTL может снова разрешить принятие.

Public/visit endpoint одним SELECT проверяет current privacy/token/block и возвращает whitelist visual DTO; private state_json/receipts/Telegram IDs не возвращаются. Идентификатор сам по себе не permission, чужие mutation IDs отклоняются, foreign bootstrap отсутствует. Все browser A/B/C ниже синтетические; это не доказательство подписи настоящего Telegram initData.

## Визуальная evidence и пределы

**35 PNG** в [qa/0.3](qa/0.3/), mapping в [README](qa/0.3/README.md). Визуально просмотрены Home/card320/360/390/430 light/dark, Flaps320, shop/eggs, прошлые стадии, held/drag, private invite/onboarding, visit, pending/accepted gift и экспортированная PNG. Итоговый общий57-suite запущен без capture и не переписывает historical0.2 evidence.

[Home dark390](qa/0.3/home-native-dark-390.png) · [Flaps320](qa/0.3/flaps-native-dark-320.png) · [Drag](qa/0.3/touch-drag-light.png) · [Gift accepted](qa/0.3/gift-accepted-dark.png) · [Card PNG](qa/0.3/shared-chick-card.png).

Локальный perf5с:160→160 DOM,298 frames, P95 interval16,8мс,0 long tasks,0 новых RAF за300ms после deactivation. Это smoke в Chromium, не гарантия Android FPS. На320 птица меньше из-за безопасной высоты; care targets≥44px. Screen reader/200%font/orientation и физическая чувствительность gestures не объявляются проверенными.

## Статус облака и сохранность0.2

| Gate | Факт |
|---|---|
| Read-only `tgcloud status` | CLI не привязан, snapshot отсутствует |
| `tgcloud fetch` | **BLOCKED:** No CLI access token found |
| `tgcloud migrate --local --dry-run` | **BLOCKED:** та же отсутствующая credential |
| Реальный `node scripts/preflight-v0.3.mjs` | **BLOCKED:** PREFLIGHT_CREDENTIALS_UNAVAILABLE; последующие повторные запуски очистили temporary endpoint |
| Точный getMe8924974998/@chipperhatcherybot | Target из задания; live verification этого запуска **BLOCKED** |
| Cloud MATERIALIZED/JSON probe | **BLOCKED**, локальная поддержка доказана, live не подменяется локальной |
| Cloud revision/diff/schema/receipt/webhook | Текущие значения **не проверены**; historical0.2 revision3 не объявляется текущей |
| Migration / beta push | **Не выполнялись** |
| URL | Предыдущая beta: https://app8924974998.tgcloud.ai/; публикация0.3 на этом URL не заявлена |

Новые schema declarations только additive: profiles/friendships/limits и их keys/checks/indices. `chipper_players`, `chipper_release_operations`, completed0.2 receipt не удалялись/не сбрасывались. Lazy games migration CAS-safe и сохраняет V2 прогресс. **В этой сессии live DB вообще не записывалась.** Сохранность новых алгоритмов подтверждена fixture migrations/concurrency, но текущий cloud state без credentials прочитать нельзя.

Первый запуск preflight оставил temporary file по невоспроизводимой причине; агент проверил его generated read-only содержимое и удалил. Два повторных реальных запуска подтвердили cleanup,11 fakeCLI cases прошли, release guard отдельно запрещает leftover. Это не скрывается и не выдаётся за выполненную cloud verification. SIGKILL может оставить файл; сначала проверить завершение процесса, затем удалить только этот локальный helper, не push.

## Все87 acceptance IDs

`PASS automated` означает реально исполненный localSQLite/Chromium test на checkpoint выше. Native/signed/live в отдельной колонке всегда `PENDING owner` либо `BLOCKED`; даже весь зелёный local suite не становится `PASS live`.

### Группа R

| ID | Критерий | Автоматизация / evidence | Native/signed/cloud |
|---|---|---|---|
| R01 | A старый пользователь открывает приложение | PASS automated: game-registry migration сохраняет исходные птицы/genes/feathers/timers | PENDING owner |
| R02 | B новый пользователь получает яйцо | PASS automated: bootstrap/onboarding/start egg backend и fresh UI | PENDING owner |
| R03 | A/B/C используют приложение одновременно | PASS automated: social/ownership tests и synthetic auth switch | PENDING owner |
| R04 | Hatch double/retry + profile concurrent | PASS automated: concurrency/recovery hatch + CAS retries | PENDING owner |
| R05 | Уход, 45мин сон, 3ч яйцо, 4ч care cooldown | PASS automated: domain/contracts timing и реальное UI egg/care/sleep | PENDING owner |
| R06 | Открытие после многодневного отсутствия | PASS automated: domain inactive decay floor/no death | PENDING owner |
| R07 | Прежние V2 гены и стадии | PASS automated: geometry и same-genes Home/Flaps/growth browser | PENDING owner |
| R08 | Player schema/receipt из 0.2 | PASS automated: game-registry migration и сохранённые receipts | PENDING owner |
| R09 | Обычный deployment | PASS automated: additive source + read-only preflight guards; ordinary live deploy не исполнен | BLOCKED cloud credentials |
| R10 | 20ч legacy miniGameRewardAt | PASS automated: legacy20ч lastReward migration tests | PENDING owner |

### Группа U

| ID | Критерий | Автоматизация / evidence | Native/signed/cloud |
|---|---|---|---|
| U01 | Android: Home сверху | PASS automated: 8 native overlay Home grid | PENDING owner |
| U02 | Android: Chippster Flaps | PASS automated: native Flaps320 title/score/controls | PENDING owner |
| U03 | Карточка птицы и профиль | PASS automated: 8 card HUD/back grid + social route | PENDING owner |
| U04 | 320×568 / 360×640 / 390×844 / 430×932 | PASS automated: 4 размера ×2 темы, no overflow | PENDING owner |
| U05 | Dock: пять кнопок | PASS automated: exact5 tabs, Home center coordinates | PENDING owner |
| U06 | Floating dock на телефоне | PASS automated: dock safe16 +gap≥20px | PENDING owner |
| U07 | Rapid switch 20 раз | PASS automated: 20 rapid tabs + legacy40-card scroll suite | PENDING owner |
| U08 | Коллекция | PASS automated: Collection tabs и внутренний scroll | PENDING owner |
| U09 | Инкубатор внутри Коллекции | PASS automated: buy/countdown/hatch +return-to-chicks browser | PENDING owner |
| U10 | Старый маршрут incubator | PASS automated: ?tab=incubator/#incubator +internal redirect | PENDING owner |
| U11 | Магазин | PASS automated: shop without payment buttons/checkout | PENDING owner |
| U12 | Dark/Light/unsupported blur | PASS automated: theme tokens/no-blur/reduced-transparency source+browser | PENDING owner |
| U13 | Keyboard / rename | PASS automated: keyboard visual-height rename/dock adapter | PENDING owner |
| U14 | Home downward swipe | PASS automated: synthetic swipe API scoping; physical swipe не исполнен | PENDING owner |
| U15 | системный Telegram header drag | PENDING owner: rectangles protected; physical system header drag не исполнен | PENDING owner |
| U16 | reduced motion + voice accessibility | PENDING owner: targets≥44px/ARIA/reduced tests PASS; voice/screen reader не исполнялись | PENDING owner |

### Группа T

| ID | Критерий | Автоматизация / evidence | Native/signed/cloud |
|---|---|---|---|
| T01 | Одиночный tap по птице | PASS automated: pointer tap remains local distinct/nonrepeat model | PENDING owner |
| T02 | Pointer hold ~250ms | PASS automated: browser250ms hold/held pose | PENDING owner |
| T03 | Drag по области поля | PASS automated: browser drag +30/60/120Hz damped model | PENDING owner |
| T04 | Release над допустимой точкой | PASS automated: browser release/land +separate plane shadow | PENDING owner |
| T05 | Drag за пределы/по HUD | PASS automated: browser bounds/multitouch/extreme adult320 | PENDING owner |
| T06 | Petting stroke | PASS automated: stroke cancels hold before pickup threshold | PENDING owner |
| T07 | Touch alongside bird | PASS automated: ground approach/look, bird event isolated | PENDING owner |
| T08 | pointercancel, second finger | PASS automated: pointercancel/second pointer/capture cleanup browser | PENDING owner |
| T09 | Tab switch/back/background во время drag | PASS automated: tab/background/unmount browser +RAF lifecycle | PENDING owner |
| T10 | Сон / кормление / рост / прогулка | PASS automated: sleep/care/grow priority model+browser | PENDING owner |
| T11 | Different gene extremes/3 ages | PASS automated: 180 morphology combinations ×3 ages +geometry/gait tests | PENDING owner |
| T12 | SFX disabled/reduced-motion | PASS automated: sound/haptics-off adapter UI +reduced hold/care | PENDING owner |
| T13 | Touchy Feel abuse | PASS automated: browser before/after aggregate equality/no mutation | PENDING owner |
| T14 | Perf/profile | PASS automated: 5с perf smoke +30с old perf +hiddenRAF0 | PENDING owner |

### Группа G

| ID | Критерий | Автоматизация / evidence | Native/signed/cloud |
|---|---|---|---|
| G01 | Baby | PASS automated: baby UI current +2 locked | PENDING owner |
| G02 | Teen | PASS automated: teen UI2 unlocked +1 locked | PENDING owner |
| G03 | Adult | PASS automated: adult UI3 unlocked | PENDING owner |
| G04 | Нажать на открытую прошлую стадию | PASS automated: past preview saved genes unchanged | PENDING owner |
| G05 | Нажать на закрытую стадию | PASS automated: disabledfuture/no future renderer +public current-stage DTO | PENDING owner |
| G06 | Просмотр предыдущего возраста | PASS automated: same localSQLite state stage/milestones/needs after preview | PENDING owner |
| G07 | Reload / другой аккаунт | PASS automated: snapshot-based growth reload/independent fixtures | PENDING owner |

### Группа M

| ID | Критерий | Автоматизация / evidence | Native/signed/cloud |
|---|---|---|---|
| M01 | Flaps после обновления | PASS automated: all legacy Flaps UI/engine/adapter tests | PENDING owner |
| M02 | Legacy bestScore, completedRuns | PASS automated: legacy score/runs/time registry migration | PENDING owner |
| M03 | Legacy miniGameRewardAt | PASS automated: latest legacy reward timestamp retained | PENDING owner |
| M04 | Завершить Flaps при разрешённой награде | PASS automated: valid Flaps+1/20ч exactserver reward tests | PENDING owner |
| M05 | Повторить finish одновременно | PASS automated: 10concurrent finish/replay/CAS | PENDING owner |
| M06 | Неизвестный gameId | PASS automated: unknown gameId rejects/no rewards | PENDING owner |
| M07 | Добавить test-only dummy game config | PASS automated: fixture-only registry game independent care/Flaps | PENDING owner |
| M08 | Клиент подделывает high score | PASS automated: server time/score bounds, fixed rewardamount | PENDING owner |
| M09 | Долгое время / logout/login | PASS automated: durable per-game record/reload/receipt tests | PENDING owner |
| M10 | UI leaderboard | PASS automated: registry metadata disabled, no leaderboard UI | PENDING owner |

### Группа S

| ID | Критерий | Автоматизация / evidence | Native/signed/cloud |
|---|---|---|---|
| S01 | A default private, B открывает A по ID/link | PASS automated: private default foreign ID/link denied | PENDING owner |
| S02 | A переключает profile visibility public/friends/private | PASS automated: visibility public/friends/private current-read tests | PENDING owner |
| S03 | A отдельно запрещает просмотр коллекции | PASS automated: separate collection permissions | PENDING owner |
| S04 | B отправляет другу A запрос | PASS automated: private invite→request synthetic production UI | PENDING owner |
| S05 | A принимает запрос | PASS automated: explicit accept +one pair backend/UI | PENDING owner |
| S06 | A отклоняет/удаляет/блокирует | PASS automated: decline/remove/block vsaccept tests | PENDING owner |
| S07 | B повторяет/спамит request | PASS automated: atomic window budget/dedup10retries | PENDING owner |
| S08 | A расшаривает карточку птицы | PENDING owner: PNG/export/linkstring/return-intent PASS; nativeTelegram open not executed | PENDING owner |
| S09 | A отзывает доступ после share | PASS automated: rotate/revoke/currentprivacy applied to old token | PENDING owner |
| S10 | C впервые открывает ссылку | PASS automated: newC onboarding→private invitation browser | PENDING owner |
| S11 | B посещает A, смотрит 2.5D scene | PASS automated: read-only visit owneraggregate unchanged | PENDING owner |
| S12 | B tries foreign care/activate/rename/egg | PASS automated: foreign care/activate/rename/egg IDs reject | PENDING owner |
| S13 | B knows A internal id/telegramId | PASS automated: opaque ID validation/private lookup/auth guards | PENDING owner |
| S14 | Link malformed/expired | PASS automated: malformed revoked token safe errors and parserfallback | PENDING owner |
| S15 | No contacts permission | PASS automated: production flows without phone/contacts APIs | PENDING owner |

### Группа P

| ID | Критерий | Автоматизация / evidence | Native/signed/cloud |
|---|---|---|---|
| P01 | A предлагает неактивную птицу B другу | PASS automated: nonactive offer/reservation/activation guard | PENDING owner |
| P02 | A дарит единственную либо активную птицу | PASS automated: active/only rejects without writes | PENDING owner |
| P03 | B accepts | PASS automated: atomic original-object transfer+browser accepts | PENDING owner |
| P04 | A cancels before accept | PASS automated: cancel retains sender ownership/reservation released | PENDING owner |
| P05 | B declines/TTL expiration | PASS automated: decline/TTL/restart releases safely | PENDING owner |
| P06 | A simultaneously offers bird to B/C | PASS automated: simultaneous B/C offers single reservation | PENDING owner |
| P07 | Accept vs cancel race | PASS automated: accept/cancel real separate connection races | PENDING owner |
| P08 | 10 concurrent accepts / retries | PASS automated: 10concurrent accepts across worker connections | PENDING owner |
| P09 | Lost server response after commit | PASS automated: lost commit response/new service originalkey replay | PENDING owner |
| P10 | Network exception/crash at each protocol stage | PASS automated: fault beforeeveryquery +second-row ABORT rollback | PENDING owner |
| P11 | Wrong giftId or recipientId | PASS automated: wrong gift/recipient/client identity reject | PENDING owner |
| P12 | Friend removed / blocked during pending | PASS automated: relation revoke beforeatomicwrite; terminalhistory retained | PENDING owner |
| P13 | Database consistency check | PASS automated: SQL0or2rows +exact1authoritativeowner assertions | PENDING owner |
| P14 | Active not last after transfer | PASS automated: sender active/notlast +receiveractive preserved | PENDING owner |
| P15 | Platform atomicity proof | PASS automated: literal MATERIALIZED SQL proven localSQLite3.53.3; cloudprobe blocked | BLOCKED cloud credentials |

## Приёмка владельца и восстановление

1. На авторизованной машине выполнить [DEPLOYMENT_0.3.md](DEPLOYMENT_0.3.md): точный source, green gates, CLI login, fetch/status/diff, read-only preflight, reviewed3 additions, schema-only push →safe migrate→No schema changes→strict preflight→runtime/static push. Не выполнять reset/force. При неожиданном diff остановить только cloud write.
2. A — существующий0.2: проверить исходные птицы/genes/имена/active, feather/egg/care/Flaps timers и record. B/C — независимые аккаунты: одно starter egg, no leaks, private default.
3. A приглашает B; B просит дружбу; A принимает. Проверить friends/public/private, отдельно collection, revoke/remove/block, malformed token и onboarding C→return intent.
4. Визит B→A: только разрешённый просмотр. Подарить resting A→B: offer/accept, исходный chickId/genes/name/bornAt, один owner, no feather; отдельно cancel/decline/TTL. A1/A2: одновременные hatch/care/finish/offer/accept/cancel.
5. Android: реальные Close/Back/menu, Home/Flaps score/dock, удержание/перенос/поглаживание/отпускание/фон, keyboard rename и native header drag. iOS/desktop/font200%/voice при наличии.

После pending gifts/transfers старый backend0.2 не считается безопасным rollback. Сохранить source/cloud revision; подготовить tested fix-forward0.3, при необходимости выключить giftwrites без удаления history/receipts, повторить read-only invariants и штатный push. Схема/players/clean-start receipt не удаляются. До schema migration новый runtime не публикуется, текущая0.2 остаётся работоспособной. Точные команды и post-push checks — в runbook.

Оставшиеся реальные ограничения: отсутствие cloud access; физические signed A/B/C/native проверки; компактная птица на320; рост permanent receipts/history и JSONscan входящих gifts; casual browser score. **Ни одно из них не маскируется fake data или заявленным livePASS.** Неподтверждённых claims об облачном deploy/атомарности platform runtime нет.
