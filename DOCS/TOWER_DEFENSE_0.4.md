# Chipper 0.4 — Tower Defense specification

**Рабочее название:** **Nest Defense — «Защита гнезда»**. UI-имя допускает художественную редактуру, но стабильный `gameId` обязателен: `nest-defense`.  
**Тип:** single-player, мобильный, процедурные карты, **бесконечные волны**, progression-dependent feathers.  
**Контекст:** `DOCS/GDD_0.4.md`, `DOCS/ARCHITECTURE_0.4.md`.  
**Нельзя:** заменять Flaps, делать 3D/WebGL тяжёлый симулятор, начислять перья на основании клиентского `wave`.

## 1. Первый игровой цикл

На вкладке «Активности» показываются две рабочие игры: **Chippster Flaps** и **Nest Defense**.

Игрок нажимает «Начать», сервер выдаёт уникальный `runId`, `mapSeed`, `configVersion`. По seed клиент детерминированно рисует карту с извилистой дорожкой к гнезду, свободными точками постройки, декоративными пропами, и стартовой игровой валютой.

Игрок ставит/улучшает башни, затем запускает следующую волну. Враги движутся по маршруту; башни выбирают цель, наносят урон/замедляют. Убитые враги дают **матчевые монеты**, которые нельзя выводить в общие пёрышки. Каждый прошедший до конца дороги враг отнимает HP гнезда. При 0 HP — окончание; игрок также может осознанно завершить и получить награду за **серверно подтверждённую** достигнутую волну.

Волны **не имеют предустановленного конечного номера**. Нарастают HP/скорость/количество/состав противников; игра не должна обязательно обрывать волны на 25/50/100. Баланс при этом должен быть честным и понятным.

## 2. Игровое поле / процедурная карта

- Вертикальный экран, ориентир 360×640 world units, независимых от viewport CSS.
- Рекомендуемая логическая решётка 10×14 или эквивалент, с одной гарантированно проходимой дорожкой от входа до гнезда; дополнительные ветки только после тестов.
- Сервер выдает seed/config, клиент и verifier вычисляют **один и тот же** layout. Один seed → побитово стабильные walkable cells, path, obstacles, buildable cells. Новый run → новый seed.
- Генерация: seeded PRNG без `Math.random` внутри deterministic path; flood-fill/DFS/A* для проверки непрерывного маршрута и длины, ограниченная попытка перегенерации + deterministic fallback. Не полагаться на принятие первой случайной карты.
- Условия: вход/выход не смежны, не менее N поворотов/длина пути в допуске, нет пересечений/зацикливания, path не проходит за пределами карты, гарантированная доступность нескольких buildable spots в радиусе первых 2–3 участков дороги.
- Башни размещаются **только на разрешённых клетках вне пути**, не перекрывают вход/выход. Предварительное подсвечивание клетки, красный invalid preview, подтверждение стоимости/типа.
- Процедурные props не должны закрывать физические границы или clickable tiles.
- Каждая новая карта может меняться не только текстурно, но и формой маршрута/расположением башен. Пропорции препятствий читаемы на 320px.

## 3. Башни и враги (P0 минимум)

**Три типа башен:**
1. **Клюв** (single-target): дешёвая, базовая скорость/урон; стабильная стартовая.
2. **Семечко-бомба** (AoE): дороже, медленная, наносит splash урон группе.
3. **Холодный ветер** (slow): наносит небольшой урон или накладывает ограниченное замедление, не может бесконечно заморозить.

Названия рабочие; выбрать собственные художественные символы Chipper, не generic military weapons.

**Три типа врагов:** обычный, быстрый с меньшим HP и тяжёлый с большим HP/меньшей скоростью. Статистика врагов и башен — одна versioned таблица параметров shared with verifier.

- Башни имеют `price`, `range`, `damage`, `fireInterval`, `targetMode`; upgrades хотя бы 2 уровня; sell возвращает часть текущей цены (например 65%), не больше вложенного.
- Класс врага определяет `hp`, `speed`, `bounty`, `nestDamage`, resistance/slow cap.
- Начало партии: HP гнезда 10, монеты ~120, первая башня доступна сразу.
- До каждой новой волны можно потратить монеты, поменять стратегию. Постройки между волнами — стартовый P0; строительство во время волны допустимо, если детерминированно и корректно проверяется replay.
- Выбор цели фиксирован детерминированным правилом (например max path progress, затем lowest enemyId) для одинакового replay.
- Пули, hit effects и смерти анимированы, но не должны влиять на чистую симуляцию.

## 4. Волны / рост сложности

- `wave=1,2,...` без предела.
- При каждом увеличении волны возрастают count и/или HP; раз в несколько волн появляются более быстрые/тяжёлые группы.
- Первые 3 волны обучающие, первые 10 должны быть достижимы игроком без «идеального» клика.
- При большом номере волны масштабирование защищено от overflow/infinite allocations, `Number.MAX_SAFE_INTEGER`, коллапса FPS. Верхние технические guards на число одновременно созданных врагов и projectiles допустимы, **без логического ограничения последней волны**.
- Вся симуляция fixed-step, deterministic model. Интерполировать кадры для 30/60/120 FPS без изменения результатов.
- При паузе или свернутом Telegram физика останавливается; никакого автоматического проигрыша в фоне.

## 5. Взаимодействие / оболочка

- Переключение башни из toolbar, tap по клетке ставит башню; tap по установленной — инфо/upgrade/sell.
- Видимые HP гнезда, номер волны, монеты партии, выбранная башня и параметры; интерфейс не перекрывает Telegram native controls и плавающий Chipper dock.
- В начале — короткий ненавязчивый tutorial («Поставь башню», «Запусти волну»), повторно не мучать.
- У каждого вида врага и башни понятный силуэт/отклик, анимации попаданий, звуки при включённых настройках.
- Game over: wave достигнут, лучший личный wave, поощрение/следующий cooldown, Restart и Exit; личный score не публичный.
- Награды не выдаются во время полёта пули или по каждому убийству. Матчевые монеты исчезают после завершения run.
- Действие Exit позволяет `retire`: явное подтверждение, финал по последней **полностью серверно подтверждённой** волне, без произвольного `wave` с клиента.
- Походка/поглаживание цыплёнка в Home независимо от TD; не нужно создавать TD-модель питомца с новым геймплеем. Можно стилистически поместить в UI текущего питомца как поддержку гнезда.

## 6. Экономика / награда по волнам

**Цель:** игрок старается пройти дальше и получает больше пёрышек за лучший результат, но не может бесконечно фармить низкие волны или подменить клиентский wave.

Начальная **предлагаемая таблица**, хранить централизованно в config:

| Завершено волн | Пёрышек за разрешённый claim |
|---:|---:|
| 0–2 | 0 |
| 3–7 | 1 |
| 8–14 | 2 |
| 15–24 | 3 |
| 25 и более | 4 |

- `rewardPolicy.cooldownMs=20h`, **отдельный** от Flaps и ежедневного бонуса.
- Сервер выдаёт **не более одной** награды по игре за 20 часов; сумма этого единичного claim определяется **подтверждённым** достигнутым tier (maximum 4). Никаких дополнений за повторное достижение более высокой волны в этом же окне; счёт можно улучшать без новой выплаты.
- «Завершённая волна» — та, где все враги убиты или ушли и серверный deterministic state дошёл до конца wave; волна, в которой гнездо погибло, не считается завершённой.
- Таймер cooldown считается по server time и не обнуляется при смене аккаунта/питомца, reload или смене режима.
- Завершение run записывает tier, reward, bestWave и receipt одной атомарной операцией (или доказуемой связанной моделью при отдельной таблице run), кроме live timers.
- Ухаживать за птицей, играть Flaps и забирать daily можно независимо.

### Верификация и античит — ОБЯЗАТЕЛЬНО

**Запрещено:** `finish({wave:25}) => 4 feathers` без проверки.

Исследуй Telegram Serverless V8 CPU/SQLite limitations и протокол `sdk/db`. Рекомендуемое архитектурное решение:

- `startTowerRun` создаёт persisted run: verified owner, idempotent runId, server-generated seed, immutable rules configVersion, startedAt, TTL/last activity, `verifiedWave=0`, compact verified state.
- Действия `place/upgrade/sell/startWave` логируются как **валидированные commands** со счётчиком sequence, timestamps, game-specific funds, target cells; никакого прямого «health=999» и «wave=25».
- `submitTowerCheckpoint`: клиент передаёт ограниченный batch команд/игрового времени за один wave; сервер **повторяет deterministic simulation** с last verified checkpoint, проверяет карту/покупки/урон/выживание/время и двигает authoritative `verifiedWave` только при совпадении результата.
- В случае расхождения rejected without state mutation. Частично подтверждённые batch/повтор после потери ответа — идемпотентны. Формат trace/version строго ограничен размером/событиями/CPU.
- Только `finishTowerRun` (defeat/retire) может сделать reward claim по verifiedWave после проверки owner, TTL, no double finish, cooldown.
- Не хранить постоянную запись *каждого визуального кадра* ни в player JSON, ни в social table. Хранить ограниченный checkpoint и последнее доказательство, cleanup после безопасного expiration.
- Если проверка целого симулятора на сервере слишком тяжела, допускается **минимальный headless verifier для первых 25 волн** с такой же deterministic state и bounded batches/пошаговой проверкой; beyond reward cap bestWave остаётся casual при честно обозначенном trust. Не обещать античит для leaderboard.
- **Требуется реальное доказательство** работы выбранной server verification модели на настоящей SQLite и с контролируемыми часами, а не только «проверил, что прошло 3 минуты».
- Уязвимости при подделке trace клиентом описать честно: deterministic replay запрещает невозможные сценарии, но бот/скрипт может оптимально играть вместо человека. При отсутствии публичных призов и лимите наград это допустимый residual risk.

## 7. Долгие сессии, восстановление, скрытие

TD endless может длиться дольше короткого запуска Mini App.

- На изменение `document.visibilityState`/Telegram deactivate: немедленная пауза без потери tower layout, wave и HP.
- При возврате: request authoritative last checkpoint, restore seed+state (и при необходимости допустимые недосданные local actions). Не делать catchup по реальному времени.
- Один незавершённый persistent TD run на пользователя; попытки start нового должны предлагать Resume / Abandon. Между устройствами один authoritative state, optimistic CAS/sequence.
- TTL для неактивной попытки как начальный ориентир **24 часа**, продлеваемый на разумное окно при подтверждённой активности; не создавать вечных stale runs. После TTL закрыть без двойной награды/ресурсов.
- При exit игрок может добровольно завершить на validated checkpoint и получить tier, а не обязан сознательно проигрывать.
- Изменения версии конфигурации не должны молча ломать сохранённый run: поддерживать старый `configVersion` в течение TTL либо безопасно завершить/компенсировать, объяснив пользователю.

## 8. Где хранить данные

Не переполнять `chipper_players.state_json` большими run action log. Предпочтительно отдельная компактная `chipper_tower_runs` таблица: `run_id`, `telegram_id`, `revision`, `seed`, `config_version`, `status`, `verified_wave`, `checkpoint_json`, `created_at`, `expires_at`, `last_activity_at`, `claimed_operation_id`. Всё, что связано с выдачей глобальных пёрышек, должно быть согласовано с player CAS/receipts. Рассмотри атомарный SQL conditional UPDATE с cross-table guard, если SDK поддерживает, либо хранение compact reward fence в player aggregate и durable run receipt в безопасном протоколе. **Нельзя делать «пометил run claimed», затем «добавил перья» двумя несвязанными запросами**.

Рекорд хранится в уже имеющемся `player.games['nest-defense']` (`bestScore` — наибольшее число завершённых волн, `scoreType='wave'`, `scoreTrust='casual/verified-threshold'`). Тесты должны исключать конфликт с Flaps records и daily reward.

## 9. Тестирование и Definition of Done

**Procedural property tests:** ≥1000 seeds, continuity, valid entrances/exits, reachable roads, buildable tiles, reproducibility and fallback; different seeds yield visibly differing routes.

**Simulation tests:** fixed-step, 30/60/120fps deterministic results, tower firing/order/upgrade/sell, path movement, splash/slow cap, non-negative balances, no projectile memory runaway, scaling beyond wave 100/1000 without overflows.

**Server tests:** no foreign run, no client wave-trust, rejected invalid trace, max command/size/time limits, replay of valid wave checkpoints, idempotent restart/finish/lost response, concurrency across two devices, claim one/20h, correct tiers, TD vs Flaps vs Daily independence.

**Browser UI tests:** mobile portrait 320/360/390/430, native top-safe, play wave, tap/tower, invalid placement, pause/return, game-over/retire, score and cooldown, dark/light, sound/reduced motion.

**Performance:** Android WebView should be comfortably playable, progressive degradation under heavy enemy counts, no service CPU overflow, no background simulation. Measure rather than promise FPS.

**DoD:** true playable second minigame with procedural map, endless escalating waves, bounded verified wave-based feather rewards, independent record, safe save/restore, regression Flaps.
