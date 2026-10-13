# Chipper 0.3 — архитектура Social & Feel Update

Документ описывает реализованный код ветки `feature/chipper-v0.3`, исходная база `e6218fe0f9cf8fb6d838bd71b1f17ca479dc793f`. Общие интерфейсы зафиксированы в [CONTRACT_0.3.md](CONTRACT_0.3.md), требования — в [GDD_0.3.md](GDD_0.3.md). Итоговые команды, количества тестов, снимки и статусы живой приёмки фиксируются отдельно в [ACCEPTANCE_RESULT_0.3.md](ACCEPTANCE_RESULT_0.3.md).

## 1. Границы системы

Frontend остаётся React/TypeScript/Vite. `App.tsx` хранит только снимок текущего авторизованного игрока, выбранный экран и локальные состояния взаимодействия. Игровой снимок не сохраняется в browser storage; там остаются пользовательские настройки звука, анимации и haptics. Ответы сверяются с authentication key и revision: запоздалый ответ не заменяет более новый снимок.

Backend — JS-модули Telegram Serverless с документированными асинхронными `sdk/db` raw-запросами. `runtime.js` создаёт три сервиса: игровой, социальный и подарков. Все endpoints возвращают общий `ApiResult`; успешный ответ содержит **собственный** `Snapshot` caller и отдельный `result`. Identity берётся только из verified `ctx.initData.user.id`.

| Слой | Реальный код | Ответственность |
|---|---|---|
| Навигация и интеграция | `src/App.tsx`, `src/types.ts` | Onboarding, маршруты, auth/revision fences, retry того же UUID/payload |
| Telegram и визуальная оболочка | `src/api/telegram.ts`, `src/design/NativeHud.tsx`, `src/navigation/BottomDock.tsx`, `src/app.css` | Native corridors, стабильный viewport, клавиатура, темы и плавающий dock |
| Локальный питомец | `src/world/**`, `src/chicks/**`, `src/components/ChickArt.tsx` | 2.5D, распознавание жестов, анатомия и рендер сохранённых V2 genes |
| Коллекция и рост | `src/screens/CollectionHub.tsx`, `src/screens/PetScreens.tsx` | Птенцы/яйца, старые маршруты инкубатора, read-only preview возраста |
| Игры | `tgcloud/lib/gameRegistry.js`, `domain.js`, `src/games/flaps/**` | Registry, миграция рекорда/cooldown, серверная выдача, физика Flaps |
| Social | `tgcloud/lib/social.js`, `src/screens/SocialScreens.tsx`, `src/social/**` | Privacy, links, friendship, whitelisted guest DTO, PNG/link sharing |
| Передача владения | `tgcloud/lib/gifts.js` | Предложение, reservation, отмена/отказ/TTL и атомарное принятие |

## 2. Оболочка, темы и маршруты

Выбран вариант A — нейтральный графит с приглушённым sage, из сравнения в [theme-candidates.png](qa/0.3/theme-candidates.png). Dark: canvas `#131719`, поверхность `#1C2225`, основной текст `#F1F3F0`, вторичный `#ABB8B7`, accent `#B8D1AA`, warm `#E4BC8E`. Расчёт контраста непрозрачных пар текст/поверхность даёт **14,42:1** и **7,87:1** соответственно. Это проверка конкретных токенов, не обещание контраста каждой композиции с blur. Light использует `#F5F6F3`, белую поверхность, `#252C2A`, `#65726D`, `#52785F`.

Telegram не предоставляет прямоугольники своих native button groups. `nativeChromeLayout` сохраняет консервативные боковые corridors минимум 96 CSS px, центральный HUD высотой 44px и adaptive mark/compact/full. Баланс и собственная кнопка назад располагаются во второй строке ниже chrome. Safe/content exclusions объединяются максимумом, а не суммируются. Stable viewport удерживает dock при промежуточном native drag; во время редактирования `visualViewport` помогает уменьшить рабочую высоту, клавиатура скрывает dock.

Dock — пять равных grid-слотов `Магазин | Коллекция | Дом | Активности | Профиль`; Дом третий и визуально усилен. Нижний gap задаётся вместе с safe-bottom. При отсутствии blur остаётся непрозрачная glass surface; reduced-transparency/high-contrast отключают blur. Home/Flaps фиксированы, вторичные экраны прокручиваются внутри shell. Flaps скрывает dock. Старые `#incubator` и `?tab=incubator`, а также внутренний переход `incubator`, открывают `Коллекция → Яйца`.

## 3. Touchy Feel и память роста

`touchGestures.ts` разделяет tap, stroke и stationary hold: hold около 250ms, движение от 8px до подъёма становится поглаживанием. Pointer capture не позволяет потерять перенос при выходе пальца за кнопку. `worldEngine` хранит локальные position/target/lift/spring, выбирает реакцию и позу. Drag ограничен ground-plane bounds и доступной высотой сцены; отдельная тень остаётся на земле. Release запускает мягкую посадку.

Перемещение DOM actor/shadow обновляется напрямую через RAF; joint poses обновляются ограниченно, около 30Hz. Рендер использует анатомические anchors сохранённой генетики, planted stance/переносную фазу ноги, head/wing/tail pivots и held pose. Приоритеты: server sleep → held/drag → care/growth → walk → ambient. Pointercancel, потеря capture, второй палец, blur, Telegram deactivation, смена птицы и unmount отменяют взаимодействие. Hidden scene останавливает RAF. Reduced motion сохраняет реакцию/перенос без постоянной ambient-анимации.

Touch не вызывает economy endpoints и не сохраняет позицию. Серверный сон не прерывается жестом. В гостевой сцене `readOnly` запрещает carry и ground commands; используются только разрешённые визуальные поля, без настоящих need/care значений владельца.

Карточка создаёт renderer только выбранной открытой стадии: `{...chick, stage: previewStage}`. Порядок baby/teen/adult определяет доступные кнопки, будущие подписаны `?` и disabled. Сохранённые genes одинаковы; server stage, возраст, milestones и care не меняются. Нового persistent growth-history слоя нет.

## 4. Данные, CAS и миграция игр

`chipper_players(telegram_id, revision, state_json)` остаётся авторитетным aggregate storage с `schemaVersion:2`. Обычный игровой эффект и permanent receipt сохраняются одним условным UPDATE по revision. CAS conflict пересчитывает эффект на выигравшем aggregate, не сливает расходящиеся JSON. Игровой сервис проверяет конфликт UUID с gift receipts.

`migrateGameRecords` лениво добавляет `player.games['chippster-flaps']`. Best/completed берутся как максимум текущего registry и legacy, timestamps — самые поздние валидные. `player.flaps`/`miniGameRewardAt` остаются совместимыми aliases. Миграция не выдаёт feather и не меняет птиц/старые receipts. Flaps — единственная runtime game: +1 feather при допустимом finish от 2 секунд и независимом 20ч cooldown. Server-issued attempt, TTL10мин, start6/мин, owner/time/score bounds сохраняются. Leaderboard metadata имеет `enabled:false`; scoreTrust — `casual`, публичного ranking endpoint нет.

V2 genes, IDs, имена, дата рождения, активная птица, яйца, баланс, таймеры и milestones сохраняются. `chipper_release_operations` и completed receipt `chipper-v0.2-clean-start` остаются в схеме. Повторный reset не входит в код выпуска.

## 5. Social: permissions и атомарные строки

Схема расширяется тремя таблицами, без удаления прежних таблиц и без foreign keys:

| Таблица | Ключи и индексы | Содержимое |
|---|---|---|
| `chipper_social_profiles` | PK telegram_id; UNIQUE public_id/invite_token/share_token | Immutable opaque profileId, private defaults, отдельная collection visibility, alias, revision и receipts_json |
| `chipper_friendships` | PK pair_key, UNIQUE friendship_id; индексы low_id/high_id | Canonical pair, requester/status, оба directional block flags, revision и receipts_json |
| `chipper_social_limits` | PK key | Window start/count/seen_json для атомарного rate UPSERT |

Наружу не публикуются numeric Telegram IDs и canonical pair key. ProfileId и токены — opaque64hex; генератор использует доступный serverId, без утверждения о криптографически сертифицированной энтропии SDK. Новое приглашение после удаления/отказа получает новый requestId, старый экран не принимает новое предложение.

Public access выполняется одним SELECT, объединяющим profile/player/friend/token/block gates. Полный foreign JSON остаётся внутри backend, DTO содержит только alias, relationship, allowed active bird и отдельно разрешённую collection. `PublicChick` исключает needs, care timers, receipts и Telegram identity. Reconcile разрешённого foreign snapshot выполняется на clone без сохранения. Private invite намеренно открывает лишь consent alias/opaque target, не птицу. Invite token независим; profile/chick links используют общий share token, поэтому создание новой share-ссылки отзывает прежние share-ссылки. Private/friends target получает новый request только по current inviteToken; взаимный pending request не означает автоматическое согласие.

Profile/pair transition и его receipt имеют общий CAS boundary. Retry возвращает current permissions/summary, не replay чужого private DTO. Лимиты фиксированы на **одно окно 60 секунд**: 12 writes, 6 friend requests, 60 profile/link lookups. `seen_json` дедуплицирует одинаковые validated method/target/UUID внутри окна. Удаление/блокировка меняют ту же pair row, которая используется для accept и gifts authorization.

## 6. Подарки: одна атомарная передача

Предложения и история находятся в `state.gifts` отправителя, receipts — в `state.giftReceipts` участников. GiftId объединяет immutable sender profileId и UUID; получатель имеет явно зафиксированный identity. Предложение резервирует неактивную, не последнюю птицу на 24ч. Reservation блокирует новую передачу, активацию и переименование; собственный Snapshot показывает только `reservedGiftId`.

Принятие использует **один** `WITH eligible AS MATERIALIZED (...) UPDATE chipper_players ... CASE ... RETURNING`:

1. Materialized eligible фиксирует обе ожидаемые player revisions, действующую accepted/unblocked friendship и неистёкший TTL до обновления.
2. CASE записывает оба новых aggregate: исходная птица удаляется из коллекции отправителя и тот же объект добавляется получателю; sender history становится accepted, recipient receipt сохраняется.
3. Допустимый результат — ровно две строки или ноль. SQLite statement либо сохраняет обе строки, либо откатывает обе при ошибке.

Отмена использует sender CAS. Отказ использует тот же двухстрочный CAS без требования текущей дружбы. При TTL ownership не меняется: reservation истекает по серверному времени; gift listing может безопасно сохранить expired history sender CAS. Это доменная reconciliation подарка, а не право гостя изменять уход за птицей.

После удаления/блокировки друга принятие запрещено live friendship guard. Pending запись остаётся до отмены, отказа или TTL; если дружба снова явно принята до TTL, её действующие права снова допускают принятие предложения. Уже переданная птица не возвращается автоматически при удалении друга. Feather не создаётся, ID/genes/name/bornAt/milestones и текущая птица отправителя сохраняются.

Локальные SQLite tests проверяют races, потерю ответа после commit, service restart, rollback второго row-update и независимые worker/connection writers. Поддержка **cloud** `MATERIALIZED/CASE/RETURNING` пока PENDING: локальное доказательство не выдаётся за probe Serverless.

## 7. Sharing, пределы и выпуск

`src/social/share.ts` экспортирует оригинальную PNG-карточку 720×900 из общего V2 SVG renderer. XML-текст экранируется. Telegram sharing передаёт ссылку через `openTelegramLink` и `t.me/share/url`; при отсутствии API открывается обычная ссылка. Clipboard имеет ручной fallback. Передачи готового медиа через native Telegram media API здесь нет. Уже сохранённую PNG нельзя отозвать: revoke действует на ссылку и последующие серверные чтения.

Startapp hint хранится в mounted App до завершения onboarding, затем разрешается backend. `initDataUnsafe.start_param` используется только как навигационный hint, не authorization.

Модель подходит для текущей beta, но JSON aggregate/неудаляемые receipts и sender gift history растут. Поиск входящих подарков выполняет `json_each` по player aggregates и не имеет отдельного индексированного gift recipient table. Перед масштабированием нужны измерения, pagination и новая продуманная receipt/archive модель; текущий код не обещает неограниченной пропускной способности.

Cloud release в этом запуске заблокирован: read-only `tgcloud fetch` сообщил **`No CLI access token found`**. Cloud revision, точная linked bot identity, additive migration plan и SQL capability probe не подтверждены; live deployment не заявляется. После доступа нужны fetch/status/diff, проверка `8924974998/@chipperhatcherybot`, read-only SQL probe, migration dry-run с только ожидаемыми добавлениями, safe migrate и итоговое `No schema changes`, затем штатный push после gates. Никаких force/reset/drop.

После социальных передач безопасная стратегия — tested **fix-forward**. Откат backend на 0.2 недопустим без специального доказательства совместимости: старый код не знает reservations/social ownership и может разрушить новые инварианты. Данные, receipts и additive tables при исправлении сохраняются.
