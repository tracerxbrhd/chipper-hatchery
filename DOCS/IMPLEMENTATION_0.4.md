# Chipper 0.4 — Community Expansion: реализация

Реализация от актуального `main` `6b8c1bb9e32a8ade6a65ff872d34f0e404a4d1f9` в `feature/chipper-v0.4`. Контракт — [CONTRACT_0.4.md](CONTRACT_0.4.md), результаты и сценарии приёмки — [ACCEPTANCE_RESULT_0.4.md](ACCEPTANCE_RESULT_0.4.md), безопасный выпуск — [DEPLOYMENT_0.4.md](DEPLOYMENT_0.4.md). Публикация в облако в этой среде заблокирована отсутствующим CLI token; наличие кода и локальные tests не означают live release.

## Реальные потоки

| Агент | Реализация и независимая проверка |
|---|---|
| guest | Guest service/permission SQL, HomeWorld с одной read-only птицей, picker, local pair AI, SQLite access и независимый mixed-CAS/UUID review |
| daily | UTC daily pure rules/endpoints/UI, CAS/recovery/worker races; фактический storage/gift scan audit; acceptance mapping |
| tower_engine | Единственная canonical JS модель, процедурная карта/симуляция, Canvas UI, journal/pause/recovery, 1000-seed и framerate tests |
| tower_server | Persisted run/checkpoints, replay verifier, reward fence, four endpoints, независимые SQLite connections и fault injection |
| codex | Авторитетная taxonomy, постоянное discovery, каталог/UI/tests, bounded request budget, read-only 0.4 release preflight |
| identity_qa | Verified private Telegram metadata/card, privacy tests, production frontend + synthetic Telegram bridge, визуальная матрица и browser performance |
| Root | Shared interfaces/schema/service/domain/gift hooks, App/routes/Activities/Profile/Collection, integration/review, final gates/Git/PR/release docs |

Все работали в общей ветке с исключительным владением файлами. Субагенты не деплоили, не создавали PR и не коммитили чужой код.

## Шесть функций

**Поляна.** `getGuestChick` одним SQL SELECT проверяет caller, accepted friendship, оба block flags, разрешение просмотра и текущий active peer snapshot. Публичного profileId без дружбы недостаточно. DTO содержит только PublicChick visual whitelist, без needs/Telegram identity/inventory. Guest не имеет care/drag/touch handlers, остановка propagation не двигает своего питомца. Две ограниченные полосы проекции предотвращают пересечение силуэтов при drag; собственный Touchy Feel сохраняется. Локальный цикл approach/greet/look/together/apart не отправляет сетевых событий. Есть смена/удаление гостя, empty/private states, reduced motion. В storage сохраняется только выбранный opaque profileId под ключом собственного аккаунта. На Home/focus/reconnect/activated/owner refresh права проверяются заново; snapshot скрывается на время проверки. В фоне RAF и periodic refresh останавливаются.

**Ежедневный подарок.** `getDailyBonus` и `claimDailyBonus`, +1 перо по явной кнопке после onboarding, server UTC day=`floor(now/86400000)`. День/баланс/receipt находятся в одном player CAS. Same UUID возвращает прежний result; свежий UUID того же дня не платит. Пропуски не накапливаются. UI использует monotonic elapsed от serverNow, при нулевом countdown предлагает проверку вместо локального разрешения claim. На Home подарок открывается компактной кнопкой в header, в Profile виден полной карточкой; новая строка не сжимает сцену и не закрывает care summary на 320 px.

**Nest Defense.** Activities показывает вторую рабочую игру с отдельным личным рекордом и cooldown. Сервер выдаёт UUID run, uint32 seed и immutable `nest-defense-1`; один active/settling slot на игрока. Pure `tgcloud/lib/towerRules.js` импортируется и клиентом, и verifier, без двух расходящихся копий. Карта 10×14 с пятью меняющимися seeded коридорами имеет гарантированный непрерывный маршрут, повороты и доступные build sites. Seed изменяет геометрию, не только декор. Три башни (Клюв/Семечко/Ветер), три типа врагов, три уровня, покупка/upgrade/sell, возврат 65% вложений, HP10/coins120, escalating endless waves; строительство между волнами. Combat в integer units, fixed50ms; targets детерминированы. Частицы/пули — представление, не источник damage.

Canvas использует кеш фона, DPR cap2 и HUD до4Hz без покадрового React. Игровое поле выбирается касанием, есть preview/confirmation, клавиатура desktop. Autosave каждые200 ticks и на start/end/pause/build; frozen pending batch сохраняет UUID при retry. Background/Telegram deactivate немедленно останавливает физику без catchup. Resume загружает authoritative checkpoint, включая смену устройства. Browser crash теряет максимум неподтверждённый отрезок (~10 s), который не даёт reward. Save-and-exit сохраняет партию; retire завершает по verified completedWave; поражение не считает проигранную волну. Terminal recovery показывает сохранённый result, новая карта получает новый seed. Inactive TTL24h продлевается accepted checkpoint, expired active не платит; settling обязательно восстанавливается до освобождения слота.

**Кодекс.** Коллекция `Птенцы | Яйца | Кодекс`, 51 действительно достижимый признак: 39 morphology в девяти категориях +12 palettes из server registry. Stable IDs `category:value`; палитра проверяется по известному preset и допустимому generated color tuple (включая solid flattening). Unknown отображается серым `?`, found — своим статичным sample/progress; фильтры по категориям и общий count. `player.discoveredTraits` — постоянный bounded union: existing-owned backfill при reconcile, hatch hook, gift recipient hook **до** двухстрочного SQL UPDATE. Отправитель сохраняет открытые признаки после transfer. Input unlocks не принимается, public profile чужой Кодекс не раскрывает. Unknown future schema не переролливается; неизвестная discovery version сохраняется и UI предлагает refresh.

**Стабильность/оптимизация.** Постоянные receipts не slice. Expired finished Flaps attempt теряет только дублирующий visual chick payload, сохраняя IDs/result/прежние replay; старый start receipt остаётся точным, новый finish UUID не платит повторно. TD transcript не хранится покадрово в player JSON: отдельный bounded checkpoint, terminal payload очищается только после permanent payment fence. Добавлены atomic minute budgets для новых daily/codex reads/claims, guest, TD; receipts/revision остаются replay authority. TD загружается отдельным lazy chunk. Gift multi-row MATERIALIZED CAS, оригинальные птицы и 0.2 release fence сохранены.

**Telegram-профиль.** Приватные first/last name, optional username/photoUrl берутся исключительно из verified `ctx.initData.user` внутри owner CAS на bootstrap/getHome. Control characters/length/HTTPS Telegram photo origin фильтруются, нет backend fetch/token/base64. Missing optional очищает старое поле; прежнее ручное имя Chipper не меняется. Card показывает initials при отсутствии/ошибке фото; публичные DTO не содержат native Telegram identity. SDK поддерживает Bot API proxy/download, но safe binary image response для JSON endpoint не документирован: fallback используется без дополнительного извлечения аватаров.

## Верификация и атомарность наград

Checkpoint принимает только commands (≤64), ticks(≤1200), revision, expectedHash; UTF8 body≤32768B. Клиентские wave/score/health/money запрещены. Все commands исполняются до ticks, потом server replay из сохранённого canonical state. Hash — consistency checksum, не MAC; authority остаётся результат replay. Cumulative simulation time ограничивается server elapsed+250ms, но время само по себе не доказывает волну.

Finish: value-free owner receipt резервирует UUID → run CAS seals immutable verified state → один player CAS с sealed-row guard меняет feathers, TD record/cooldown и permanent `towerReceipts[runId]`/result receipt → run cleanup. Потеря ответа/сбой на любом шаге безопасно повторяется. Sealed UUID collision со старым writer не перезаписывает чужой receipt и не блокирует recovery. Final run status не является доказательством выплаты; единственный payment authority — player fence. Cross-device checkpoint/reward/daily/gift races проверены на настоящей SQLite, включая отдельные worker connections.

Таблица reward: <3 waves→0; 3–7→1; 8–14→2; 15–24→3; ≥25→4, максимум одна выплата/20h по TD. Zero tier не начинает cooldown. Flaps/care/daily полностью независимы; generic Flaps endpoints отвергают `nest-defense`, даже когда registry знает эту игру. Leaderboard отсутствует. Возможны легальные оптимальные bot replays: impossible state не принимается, доказательства человеческого ввода нет.

## Измеренные ограничения

[storage-perf.json](qa/0.4/storage-perf.json): 1000 реальных completed Flaps дают player JSON 1,391,935B; 2002 receipts занимают1,377,795B. 2000 service calls в отдельном local audit заняли42.52s. Compaction экономит673B на terminal attempt, но permanent start snapshots остаются главным источником роста. Безопасное архивирование receipts требует отдельной совместимой миграции; оно не маскируется unsafe pruning.

Incoming gifts всё ещё используют JSON scan: synthetic100/1000 players×5 histories median2.294/23.860ms; отдельная test-only indexed модель0.094/1.051ms, production gift authority не переписана. TD dense67towers/48enemies checkpoint10,917B. Legal wave31 replay20samples локально Node mean1.47ms/max3.38ms (65towers379ticks); cloud V8 и Android этим не измерены. Actual browser smoke и размеры bundle — в итоговом acceptance report.

Миграция добавляет только `chipper_tower_runs` с owner/start unique, one active/settling partial unique и owner/status index. Игровые данные, social tables, release receipt не удаляются. После новых gift/TD effects восстановление — tested fix-forward с сохранением tables/fences, старый backend не является безопасным rollback.

## Итоговая проверка зафиксированного кода

Code checkpoint `85116df54fc74b0b8213c6ed1b12b239e1256652`: `npm run check` —41files/474tests PASS; `npm run test:ui -- --workers=2` —79/79 PASS,2.3minutes. Node24.19.0, Chromium153.0.8010.0. Source/tree после проверки не менялся; последующие commits только docs/evidence. Bundle: base377.72kB(121.87kB gzip), lazyTD30.11kB(11.17kB gzip), CSS55.99+4.99kB. 98 actualPNG и84-ID mapping; signed/live approval отсутствует. Оба лог-файла содержат SHA первой строкой.
