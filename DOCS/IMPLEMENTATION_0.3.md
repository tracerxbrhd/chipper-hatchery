# Chipper 0.3 — реализация Social & Feel Update

Разработка выполнена в `feature/chipper-v0.3` от `e6218fe0f9cf8fb6d838bd71b1f17ca479dc793f`. Это описание текущей реализации, не подтверждение публикации в Telegram. Полный интеграционный контракт — [CONTRACT_0.3.md](CONTRACT_0.3.md), устройство сервисов и границ atomicity — [ARCHITECTURE_0.3.md](ARCHITECTURE_0.3.md). Финальный SHA, команды, counts и каждый acceptance status — [ACCEPTANCE_RESULT_0.3.md](ACCEPTANCE_RESULT_0.3.md).

## Реальные потоки разработки

Главный оркестратор интегрировал App/types/schema/runtime, Collection Hub, память роста, SocialScreen/VisitorScreen, sharing и итоговые gates. Использованы шесть настоящих субагентов в общей ветке, без отдельных PR:

| Агент | Ответственность и результат |
|---|---|
| `ui` | Telegram native corridors, компактный HUD, graphitic/sage theme, floating dock, Flaps safe header, responsive CSS |
| `touch` | Pointer recognizer, hold/stroke/pickup/drag/landing, spring/gaze, joints/stance, lifecycle cleanup, touch tests |
| `games` | Game registry, additive Flaps records/cooldown migration, reward policy, game/reservation tests |
| `social_backend` | Privacy, friend links/consent/requests/block, whitelisted views, rate limits и реальные SQLite social tests; architecture/implementation docs |
| `gift_protocol` | Atomic MATERIALIZED CTE transfer, durable gift history/receipts, offer/accept/cancel/TTL, реальные SQLite failures/races и independent connection tests |
| `qa` | Shared SQLite schema/production bridge, browser native overlays, layout/touch/growth/social scenario fixtures и screenshots |

Общие файлы интегрировались оркестратором. Все агенты работали по одному [CONTRACT_0.3.md](CONTRACT_0.3.md); схема и deployment оставались у интегратора.

## Выполненные пользовательские сценарии

**Дом и оболочка.** Новая тёмная система использует вариант A graphite/sage, а не прежнюю muddy-green заливку. Основной/вторичный текст на непрозрачной dark surface имеют рассчитанный контраст 14,42:1/7,87:1. `NativeHud` занимает адаптивный центральный corridor; баланс и back перенесены ниже Telegram chrome. Dock действительно имеет внешний нижний gap, safe-bottom, стеклянный контур и fallback. Порядок `Магазин → Коллекция → Дом → Активности → Профиль`, Дом центральный. При вводе dock скрывается, вторичные экраны прокручиваются внутри shell.

**Коллекция и яйца.** `CollectionHub` переключает `Птенцы | Яйца`, используя прежний Incubator и прежние серверные buy/hatch endpoints. Стоимость/таймеры не заменены новой экономикой. Legacy incubator routing направляется в Яйца. Магазин показывает категории будущего контента и «Скоро», без payment/checkout/Stars.

**Touchy Feel.** Tap птицы не вызывает tap земли. Малое движение по телу до stationary hold становится stroke; около 250ms удержания поднимают птицу. Drag использует bounded spring actor, dangling legs/wing/head/tail реакцию и ground shadow. Release запускает land. Сон имеет приоритет; feed/play/grow не перебиваются carry. Pointercancel, вторая pointer, blur, Telegram background, смена птицы и route unmount очищают timer/capture/RAF. Включённые эффекты используют пользовательские sound/haptics preferences; touch не выдаёт feathers и не пишет положение на сервер.

**Память роста.** Baby показывает `Птенец → ? → ?`, teen открывает предыдущие две стадии, adult — все три. Карточка рендерит выбранную доступную возрастную геометрию с теми же fixed genes. Future stages disabled и не создают скрытые изображения. Просмотр не вызывает mutation и не меняет server stage/care.

**Flaps и награды.** Runtime registry знает только `chippster-flaps`; unknown gameId отвергается. Legacy bestScore/completedRuns/lastPlayedAt/miniGameRewardAt лениво переносятся в per-game record с более поздним cooldown, без досрочной выплаты. Совместимые aliases остаются. Награда — один feather за валидный finish от двух секунд, раз в 20ч этой игры; care reward независим. Server-issued run фиксирует птицу старта. Record помечен casual, leaderboard отключён.

**Social.** «Профиль → Друзья и видимость» открывает own profile settings, invite/share links, incoming/outgoing requests, accepted friends и gift history. Private — default, collection permission отдельно. Приглашение к private owner показывает consent label без птицы и даёт возможность предложить дружбу. Acceptance явный; reciprocal request не auto-accept. Decline/remove/block и revoke работают server-side. Старая requestId после закрытого приглашения не принимает новое. Foreign read возвращает разрешённый whitelist и никогда не bootstrap чужого игрока.

**Sharing и onboarding.** Из карточки своей птицы можно открыть share panel, скопировать current link, открыть Telegram link sharing и экспортировать оригинальную PNG 720×900. В private profile публикация закрыта до согласия; inactive card требует collection permission. Clipboard/PNG ошибки показывают link/manual fallback. Native media upload не реализован: кнопка «В Telegram» делится ссылкой. Startapp `i_/p_/c_` сохраняется через onboarding нового игрока и затем разрешается сервером. Старый token после rotate/revoke не раскрывает профиль; уже экспортированная картинка остаётся у получившего её пользователя.

**Гостевая сцена.** `VisitorScreen` повторно использует 2.5D HomeWorld с `readOnly`, показывает разрешённую active bird и разрешённую коллекцию. Гость не может выполнять уход, перенос/активацию/rename владельца или получить его ресурсы. Guest renderer не получает private need/care timers. Server permission/token/block проверяются одним SELECT вместе с foreign snapshot.

**Подарок.** Из карточки или SocialScreen выбираются resting bird и accepted friend; предложение требует UI confirmation. Active/last bird rejected server-side. Pending reservation блокирует activation/rename/повторный gift. Получатель принимает или отклоняет, отправитель отменяет, TTL24ч освобождает птицу. Acceptance одной conditional MATERIALIZED CTE/CASE UPDATE фиксирует **оба** player JSON и recipient receipt, проверяя оба revisions, действующую friendship и TTL. Тот же chick object оказывается ровно у получателя; имя/ID/genes/bornAt/milestones сохраняются, feathers не создаются, active sender остаётся.

Удаление/блокировка друга закрывает принятие pending gift. Reservation/history сохраняются до cancel/decline/TTL; новая явно принятая дружба до TTL снова допускает принятие. Terminal received history доступна участникам даже после удаления друга. `listGifts` может доменно сохранить истёкшее предложение через sender CAS; этот механизм не является guest care.

## Сохранность данных и ограничения

Не выполняется новый reset и не удаляется completed release receipt `chipper-v0.2-clean-start`. `chipper_players` и schemaVersion2 сохранены. Никакого reroll существующих V2 birds. Сохраняются один active питомец, отсутствие смерти, NFT/TON, Stars, рекламы и платёжных действий. Social schema добавляет только profiles/friendships/limits, unique keys и friendship lookup indices; foreign keys SDK не используются.

Social mutations сохраняют receipt с эффектом на той же CAS row; данные foreign profile не replay через сохранённый DTO. Rate UPSERT использует одно фиксированное минутное окно: write12/request6/lookup60, одинаковый validated request UUID дедуплицируется. Gift/game receipts постоянны и защищают потерянные ответы; безопасной compaction в этом релизе нет.

JSON aggregates, receipts и sender gift history растут. Incoming gift listing использует scan `json_each` по players, без отдельного recipient index. Это явный предел текущей beta; перед большим числом игроков нужны измерения, pagination и отдельный migration design. Публичные IDs opaque, но SDK serverId не объявляется криптографическим генератором. Flaps casual score имеет bounds/time guard, не является доказанно честным leaderboard score.

## Проверки и публикация

Новые проверки находятся в `tests/social.test.js`, `tests/gifts.test.js`, `tests/gifts-connections.test.js`, `tests/game-registry.test.js`, `tests/touch.test.ts` и `tests/ui/v03*.spec.ts`. Они используют настоящий SQLite и production services, включая независимые worker connections, accept/cancel races, second-row rollback, crash-before/after, lost response/restart, ownership/permission и cooldown migration. Browser fixtures синтетические и не выдаются за signed Telegram A/B/C.

Финальные результаты `npm run check`, `npm run test:ui`, production/mock/secret gates и visual review перечисляются в [ACCEPTANCE_RESULT_0.3.md](ACCEPTANCE_RESULT_0.3.md). Артефакты — [qa/0.3](qa/0.3/). Counts не копируются из исторической 0.2 и не фиксируются здесь до финальной интеграционной проверки.

**Cloud blocker подтверждён:** read-only `tgcloud fetch` завершился `No CLI access token found`. Migration/deploy в этом запуске не заявлены; revision, identity bot/app и cloud SQL capability не удалось подтвердить. Локальная поддержка MATERIALIZED доказана SQLite tests, cloud probe остаётся **PENDING**. До публикации необходимы credentials через штатный CLI, fetch/status/diff, проверка `8924974998/@chipperhatcherybot`, read-only SQL capability probe, additive schema dry-run, safe migrate и отсутствие оставшихся changes, затем штатный push при зелёных gates.

Реальная Android native chrome/drag/keyboard, supported link открытия и A/B/C/A1/A2 social/gift проверка остаются приёмкой владельца, пока не выполнены на настоящих authorized accounts. Один PR направляется в main без merge.

После передачи питомцев использовать tested fix-forward: сохранять records/tables/receipts и исправлять текущий 0.3 runtime. Наивный backend rollback на 0.2 не безопасен, поскольку старый код не знает reservation и новый social ownership protocol. Reset/drop/force запрещены.
