# Chipper 0.4 — результаты проверки Community Expansion

Ветка: **feature/chipper-v0.4**, база актуального main: **6b8c1bb9e32a8ade6a65ff872d34f0e404a4d1f9**. Карта ниже содержит **все 84 acceptance ID** из [ACCEPTANCE_0.4.md](ACCEPTANCE_0.4.md): R — 10, F — 10, D — 10, T — 32, C — 12, P — 10. Исторические отчёты 0.1–0.3 не изменены.

Результаты локальной SQLite и Chromium отделены от подписанного Telegram и физического устройства. Ни один пункт не имеет PASS live. В графе локальной проверки PASS automated подтверждает именно перечисленную проверяемую часть; оговорки о cloud, Android/iOS и реальных A/B/C сохраняются в отдельной графе и комментариях. Финальная проверка неизменного source SHA оформляется оркестратором ниже.

<!-- ORCHESTRATOR_FINAL_GATE_START -->
## Финальный результат

**READY для review и авторизованного beta preflight. Live release BLOCKED авторизацией.**

- Base main: `6b8c1bb9e32a8ade6a65ff872d34f0e404a4d1f9`; повторный fetch подтвердил, что main не изменился.
- Проверенный local code checkpoint: **85116df54fc74b0b8213c6ed1b12b239e1256652**; опубликованный code commit: **8676ae9b76fcf78dc5b5a9b875c4949dcc8f804c**. Их Git tree идентичен: **62538178461948537fa02ae2d2750e2cc523e2bd**. Git CLI не имел write credentials, поэтому публикация выполнена через подключённый GitHub с проверкой каждого blob/tree; изменились commit metadata, а не source. Последующие commits — только отчёты/evidence. [Git proof](qa/0.4/git-publish.json).
- PR: **[#4](https://github.com/tracerxbrhd/chipper-hatchery/pull/4)**, open / unmerged — `feature/chipper-v0.4 → main`, без merge.
- `npm ci`: PASS при подготовке ветки, 213 packages; dependencies/lock versions не менялись, только package version0.4.0.
- `npm run check`: **PASS, 41 файл / 474 теста**, Node24.19.0, Vitest5.0.4; TypeScript, runtime imports/syntax, ESLint, production build/mock isolation и secret patterns PASS. Лог включает SHA: [check-final.txt](qa/0.4/check-final.txt).
- Финальный `npm run test:ui -- --workers=2`: **PASS, 79/79, 2.3 минуты**, тот же code checkpoint; [ui-final.txt](qa/0.4/ui-final.txt). Направленный visual capture suite22/22 уже прошёл; 98 действительных PNG, 320/360/390/430 × light/dark, просмотрены и исправлены Home popup/summary и TD title/44px controls.
- Cloud deployment: **BLOCKED — credentials unavailable**. `tgcloud fetch` и `migrate --local --dry-run`: exit1 / `No CLI access token found`. `node scripts/preflight-v0.4.mjs --require-tower-schema`: exit1 / `PREFLIGHT_CREDENTIALS_UNAVAILABLE`; temporary endpoint удалён. Current cloud revision/getMe/completed release receipt/platform SQL/schema не подтверждены: [cloud-preflight.txt](qa/0.4/cloud-preflight.txt).
- Migration, push, webhook write, reset и изменение live DB **не выполнялись**. Разрешённая цель — @chipperhatcherybot / App ID8924974998; прежний URL https://app8924974998.tgcloud.ai/ не является доказательством публикации0.4. Runbook — [DEPLOYMENT_0.4.md](DEPLOYMENT_0.4.md).
- Real A/B/C/A1/A2, физический Android/iOS и cloud V8 — **PENDING owner / BLOCKED cloud**, ни одного PASS live.

Два промежуточных full-check не были объявлены финальным PASS: 1000-map property превысил общий default5s при concurrent UI; только ему дан20s, все1000 seeds/assertions сохранены. Затем legacy recovery fixture с минимальной0.2 schema не содержала обязательную существующую0.3 limits table; она добавлена только в соответствующую локальную fixture, runtime не ослаблен. Финальный474-suite зелёный. Исходные failure logs сохранены: [timeout](qa/0.4/check-timeout-under-concurrent-ui.txt), [legacy fixture](qa/0.4/check-before-legacy-fixture-update.txt).
<!-- ORCHESTRATOR_FINAL_GATE_END -->

## Воспроизведённые проверки и границы evidence

Фокусные команды реально выполнялись в working tree 0.4; их counts относятся к перечисленным файлам и не складываются в уникальное количество всего suite.

| Проверка | Реальный результат | Evidence |
|---|---|---|
| Daily: pure rules, service, independent connections, UI rendering | PASS automated — 4 файла, 41 тест | npx vitest run tests/daily-bonus.test.js tests/daily-service.test.js tests/daily-ui.test.ts tests/daily-connections.test.js |
| Daily + общий SQLite request budget после интеграции | PASS automated — 5 файлов, 49 тестов | Предыдущая команда + tests/request-budget-v04.test.js; 11 independent workers admit ровно limit=6; identical retries не расходуют новые slots |
| Codex: taxonomy, discovery, production integration, client rendering | PASS automated — 3 файла, 24 теста | npx vitest run tests/codex.test.js tests/codex-integration.test.js tests/codex-client.test.ts; включая future-version status, safe refresh UI и исправленный loss-after-player-CAS fixture |
| Codex / budget / preflight + TD final combined focus | PASS automated — 11 файлов, 114 тестов /3,05 с | npx vitest run tests/codex*.test.* tests/request-budget-v04.test.js tests/preflight-v04*.test.js tests/tower-server.test.js tests/tower-server-connections.test.js tests/tower-engine.test.ts tests/v04-security.test.js tests/tower-atomicity-spike.test.js; Codex24 + budget8 + preflight39 + TD43 |
| Telegram identity: pure sanitizer и SQLite integration | PASS automated — 2 файла, 6 тестов | tests/profile-identity.test.js, tests/profile-sqlite.test.js; без настоящего Telegram photo API |
| TD service + independent SQLite + engine + independent review + early spike | PASS automated — 5 файлов, 43 теста в final combined focus | tower-server22 + tower-engine17 + independent review3 + early spike1; точная команда приведена строкой выше |
| TD engine отдельно, включая новый journal bound | PASS automated — 17 тестов | tests/tower-engine.test.ts; 1 000 maps, реальный replay до 25 волн, 30/60/120 Hz; 65-я unsent command отказана до local coins/state mutation |
| TD engine + server + independent connections + early spike после engine guards | PASS automated — 4 файла, 40 тестов | npx vitest run tests/tower-engine.test.ts tests/tower-server.test.js tests/tower-server-connections.test.js tests/tower-atomicity-spike.test.js |
| Рост хранения и replay-safe compaction | PASS automated — 4 теста, 43,55 с | CHIPPER_STORAGE_CAPTURE=1 npx vitest run tests/storage-v04.test.js; [storage-perf.json](qa/0.4/storage-perf.json) |
| Browser community + TD + performance после исправлений | PASS automated — 22 scenarios / 1,2 мин; screenshots реально просмотрены | CHIPPER_CHROMIUM_PATH=/workspace/scratch/d0f1040c67ed/browser-temp/chromium CHIPPER_CAPTURE_QA=1 npx playwright test tests/ui/v04-community.spec.ts tests/ui/v04-tower.spec.ts tests/ui/v04-performance.spec.ts --workers=2 |
| Browser performance | PASS automated — pair/TD hidden RAF0 и bounded DOM | [browser-perf.json](qa/0.4/browser-perf.json): оба sample2,5 с /150 frames, p95 pair16,8ms /TD16,7ms, long tasks0; физический Android FPS не заявляется |
| Полный browser regression suite | PASS automated — 79 тестов /2,4 мин | [ui-final.txt](qa/0.4/ui-final.txt); scripted transport не является signed live |
| Production и secrets | PASS automated | check-final.txt: development backend / fixture identities excluded; secret patterns PASS, credential directories не читались |

SQLite использует настоящий Node SQLite 3.53.3 с production SQL, включая отдельные worker connections. Telegram transport в browser fixtures синтетический; он вызывает настоящие локальные production services и не подделывает подписанную cloud-приёмку.

## R — сохранность и регрессия 0.3

| ID | Локальная проверка | Evidence и точная граница | Signed / native / cloud |
|---|---|---|---|
| R01 | PASS automated | game-registry, backend-v2, codex-integration, gifts: старый schemaVersion2, ID/genes/rarity/name/active, feathers, receipts и legacy cooldown сохранены; возраст/needs изменяются только прежним server reconcile | PENDING owner — сравнить реальные 0.3 коллекции до/после |
| R02 | PASS automated | domain, contracts, concurrency, recovery: starter/ordinary hatch, 3 ч, 45 мин сна, care 4 ч, окно 30 мин / reward 20 ч; duplicate hatch и loss-after-CAS | PENDING owner |
| R03 | PASS automated | flaps-engine, backend-v2, game-registry и UI regression: fixed physics, personal best, compatible Flaps aliases и 20 ч; generic Flaps endpoints не обходят TD verifier | PENDING owner |
| R04 | PASS automated | social, guest-access, v03-social: private/friends/public, separate collection visibility, current token/block/accepted rights, visual whitelist | PENDING owner |
| R05 | PASS automated | gifts, gifts-connections, codex-integration, v04-security: один MATERIALIZED eligible / CASE UPDATE на двух players, cancel/decline/TTL, lost reply и original chick | PENDING owner; platform SQL BLOCKED до cloud preflight |
| R06 | PASS automated | concurrency, daily-connections, gifts-connections, tower-server-connections: independent writers; 10 TD finish + daily + gift дают 5 feathers, один TD result и одного chick owner | PENDING owner — A1/A2 |
| R07 | PASS automated — local fence / source | Существующие reset-v02/preflight tests сохраняют completed fence и запрещают повтор release reset; production 0.4 не вызывает reset, schema additions не удаляют release table | BLOCKED — current target-cloud completed receipt не прочитан без CLI auth |
| R08 | PASS automated — focused matrix | v03-layout/touch + повторные v04-community/tower: 320/360/390/430, light/dark, synthetic native corridors; care summary≥44px полностью выше dock, daily panel и TD44px targets помещаются; screenshots просмотрены | PENDING owner — native chrome, физический Touchy Feel, keyboard / accessibility |
| R09 | PASS automated — endpoint owner boundary | contracts/social/gifts/guest/TD/profile: missing verified context, unsafe-only context, unknown owner и foreign IDs отвергаются; raw private aggregates не публикуются | BLOCKED — реальный platform invalid-signature/401 smoke без cloud auth; PENDING owner |
| R10 | PASS automated — final production gate | check-final.txt: ready dist, production mock/test identities исключены, Serverless imports/syntax и secret scanner PASS; временные admin/preflight endpoints запрещены release checker | Final check PASS на code checkpoint; cloud uploaded bundle BLOCKED |

## F — один read-only гость на поляне

| ID | Локальная проверка | Evidence и точная граница | Signed / native |
|---|---|---|---|
| F01 | PASS automated | guest-access accepted friend SQL + v04-community: owner и ровно один world-guest, current active visual DTO; передача ownership не происходит | PENDING owner |
| F02 | PASS automated | touch/world regression + v04 guest scenario: собственные tap/hold/drag/release работают при guest; owner chicks не меняются от локального Touchy Feel | PENDING owner |
| F03 | PASS automated | guest-access foreign care/rename/activate reject; browser pointer events на world-guest не становятся owner gesture и весь peer aggregate неизменен | PENDING owner |
| F04 | PASS automated | v04-community B → C: world-guest count остаётся 1 и aria-label соответствует новому другу; peer choice очищается отдельно от собственного active | PENDING owner |
| F05 | PASS automated | guest-access: после server active switch возвращается новая active bird, hidden collection не открывается | PENDING owner |
| F06 | PASS automated | guest-access private/remove/either block; browser focus recheck после private удаляет guest, следующий getGuestChick отказан | PENDING owner — повторить block/unfriend в реальном B |
| F07 | PASS automated | guest-access: public profile без accepted friendship не даёт guest, malformed/extra fields и forged caller reject; whitelist без Telegram ID/needs/inventory | PENDING owner |
| F08 | PASS automated | guest-access: авторизованный друг без active bird / до onboarding возвращает null, unknown caller не bootstrap; интерфейс имеет empty state | PENDING owner |
| F09 | PASS automated | guest-world: bounded approach/greet/look/together/apart за 180 с модельного времени, без foreign writes и без network realtime transport | PENDING owner — визуальное впечатление пары |
| F10 | PASS automated — geometry / lifecycle | guest-world projected lanes/pointer mapping, reduced-motion browser, просмотренные portrait shots; pair browser sample150 frames/2,5s, p9516,8ms, hidden RAF0/350ms, DOM210→213 | PENDING owner — физический Android/iOS FPS, background, reduced motion |

## D — ежедневный подарок

| ID | Локальная проверка | Evidence и точная граница | Signed / native |
|---|---|---|---|
| D01 | PASS automated | daily-service: +1, lastClaimDayUTC/lastClaimAt/claimsTotal и receipt в одном player CAS; config default 1; read не выдаёт награду | PENDING owner |
| D02 | PASS automated | daily-service + daily-connections: 10 одинаковых UUID возвращают один result, balance увеличен один раз; новый UUID в том же дне ALREADY_CLAIMED | PENDING owner |
| D03 | PASS automated | 10 разных UUID, в том числе 10 independent SQLite worker connections: один успешный credit / receipt, остальные ALREADY_CLAIMED | PENDING owner — A1/A2 |
| D04 | PASS automated | pure day zero, 23:59:59.999 → 00:00 UTC; service 10 + 10 конкурентов по разные стороны границы; backward clock не открывает день повторно | PENDING owner — реальная UTC граница без изменения clock |
| D05 | PASS automated | server clock only; now/timezone/userId/rewardAmount input отвергаются до writes, unsafe/unsigned context reject; идентификатор пользователя verified | PENDING owner |
| D06 | PASS automated | после 7 дней один текущий +1; old UUID воспроизводит старый result без выплаты, fresh UUID выдаёт один gift | PENDING owner |
| D07 | PASS automated | до hatch и во время name onboarding unavailable/FIRST_HATCH_REQUIRED; rejected call не пишет credit/receipt и не создаёт неизвестного игрока | PENDING owner |
| D08 | PASS automated | daily + simultaneous feed/play: два независимых credit, care milestone один; Flaps/TD lastRewardAt не изменены; TD service также проверяет independent policies | PENDING owner |
| D09 | PASS automated | потеря ответа именно после UPDATE chipper_players, recreated service / same UUID: один committed gift и сохранённый result | PENDING owner — сеть / relaunch |
| D10 | PASS automated — server status / UI | daily-ui: явная кнопка, UTC explanation, server-derived monotonic countdown; локальное истечение не включает claim; повторный v04-community получает +1 и показывает claimed; narrow popup полностью в viewport, screenshots просмотрены | PENDING owner — Telegram refresh/реальная доступность; cloud BLOCKED |

## T — Nest Defense, детерминированная проверка и награды

| ID | Локальная проверка | Evidence и точная граница | Signed / native |
|---|---|---|---|
| T01 | PASS automated | tower-engine: 1 000 seeds, continuous unique winding route, valid bounds, entrance/nest и доступные build sites; no random fallback | PENDING owner — впечатление разнообразия |
| T02 | PASS automated | те же property tests требуют ≥500 различных фактических path geometries; один seed воспроизводит карту | PENDING owner |
| T03 | PASS automated | tower-server: server seed/rules/owner/runId persisted; same start key, simultaneous starts и aliases resume один active run; unique owner slot | PENDING owner; cloud SQL BLOCKED |
| T04 | PASS automated | tower-engine + browser: path/borders/props/occupied cells запрещены, invalid placement не создаёт tower; route не блокируется | PENDING owner |
| T05 | PASS automated | engine: beak/seed/frost profiles, crawler/dasher/brute; combat target order, splash и slow проверены; UI toolbar / distinct silhouettes существуют | PENDING owner — мобильная читаемость всех типов |
| T06 | PASS automated | два upgrade, cap level3, funds guards, sale 65% invested; нет отрицательного баланса / sell profit; command validation | PENDING owner |
| T07 | PASS automated | tower-engine: 30/60/120 Hz дают одинаковые 80 ticks / 4 с, integer50ms steps, pause не ускоряет replay | PENDING owner |
| T08 | PASS automated — engine / browser | ordinary legal greedy strategy проходит первые10 волн на20 seeds с HP10; short build/start tutorial; реальный browser scenario проходит3 волны с upgrade, pause/reload и +1 после verified retirement | PENDING owner — первые3 волны на телефоне без идеального управления |
| T09 | PASS automated | waves25/100/1000/1e6/MAX_SAFE_INTEGER−1 имеют safe integer stats, max48 simultaneous enemies и capped spawning; logical final wave не введена | PENDING owner — длительная физическая сессия |
| T10 | PASS automated | canonical actual combat replay увеличивает completed/verifiedWave; defeat wave не считается завершённой; result использует серверный checkpoint | PENDING owner |
| T11 | PASS automated | tower-server unknown wave/score/health/state fields отвергаются, generic Flaps не допускает TD, arbitrary wave999 не даёт reward | PENDING owner; cloud endpoint smoke BLOCKED |
| T12 | PASS automated | path/funds/in-wave actions, forged hash, excessive ticks и server elapsed guard отвергаются без partial checkpoint | PENDING owner |
| T13 | PASS automated | один towerRules.js для клиента/verifier; commands → deterministic cloned state/hash, legal replay до25; batch≤64/ticks≤1200/JSON≤32KiB; frontend journal также отвергает 65-ю команду до изменения coins/state | PENDING owner |
| T14 | PASS automated | SQLite revision CAS: 10 same checkpoint races и два independent device connections двигают revision только один раз; stale/new fingerprint conflict | PENDING owner — A1/A2 |
| T15 | PASS automated | lost start/checkpoint response, reservation reply, seal, before/after credit и cleanup; recreated service/same UUID; browser потерянный committed checkpoint/finish повторяет тот же key/payload и не дублирует выплату | PENDING owner — нестабильная сеть |
| T16 | PASS automated | verified owner required; foreign get/checkpoint/finish через runId отказаны, unknown caller не создаёт чужую попытку | PENDING owner |
| T17 | PASS automated — engine / browser | pause steps0/no catchup; повторный browser native deactivated stops ticks/HP, activated сохраняет pause/restore; hidden RAF0/350ms, последующие tick/HP неизменны | PENDING owner — настоящие close/lock/background |
| T18 | PASS automated | server restart сохраняет authoritative checkpoint; browser save/exit/reload возвращает тот же runId/towers и продолжает реальные wave ticks; два устройства не создают второй active slot | PENDING owner |
| T19 | PASS automated | 24 ч inactive TTL, accepted checkpoint продлевает; expiry без credit; retire uses completedWave; defeat требует verified phase; settling не теряется по TTL | PENDING owner |
| T20 | PASS automated | реальный legal replay wave2 → 0, zero tier не начинает 20 ч cooldown; browser wave0/1 retirement → 0 | PENDING owner |
| T21 | PASS automated | реальный legal replay wave3 → +1; receipt/best/cooldown согласованы, duplicate finish не удваивает | PENDING owner |
| T22 | PASS automated | реальный legal replay wave8 → +2 при доступном cooldown | PENDING owner |
| T23 | PASS automated | реальный legal replay wave15 → +3 | PENDING owner |
| T24 | PASS automated | реальный legal replay wave25 → +4; tier cap, повтор с любым UUID не доплачивает за тот же run | PENDING owner |
| T25 | PASS automated | повтор wave8 внутри TD cooldown сохраняет лучший record без выплаты; после20 ч платит +2; zero tier cooldown не расходует | PENDING owner — реальное20 ч окно |
| T26 | PASS automated | tower-server и daily-service: независимые Flaps/daily/care timestamps; nested test rewards total5 без cross-reset; generic registry aliases preserved | PENDING owner |
| T27 | PASS automated | 10 independent SQLite finishers + daily + accepted gift: balance5, один completedRun, one durable tower fence, один владелец подарка; retry после restart без credit | PENDING owner — A1/A2 |
| T28 | PASS automated — bounded TD proof | server command/request limits; checkpoint в отдельной таблице, после verified payment terminal JSON очищен до {}; storage-v04 dense board10 917B, без полного action transcript в player JSON | Permanent compact receipts растут O(runs); это измеренное ограничение, а не обещание бесконечного bounded player JSON |
| T29 | PASS automated — focused portrait matrix | повторный v04-tower tap/path preview/build/wave/pause/retire/results, dock hidden, native-safe HUD/horizontal bounds, 44px controls; TD title/narrow labels и screenshots просмотрены | PENDING owner — mobile native controls |
| T30 | PASS automated — TD off / reduced-motion browser | отдельный actual TD scenario строит/играет с sound=false/haptics=false/reducedMotion и не создаёт audio/haptic feedback; глобальный adapter regression также проверяет preferences после focus/error | PENDING owner — физический звук / вибрация / reduced motion |
| T31 | PASS automated — browser / engine boundedness | max48 enemies, fixed50ms step, Canvas; browser sample150 frames/2,5s, p9516,7ms, long tasks0, DOM57→57, hidden RAF0/350ms; evidence browser-perf.json | PENDING owner — Android/iOS FPS/тепловая нагрузка; cloud V8 CPU BLOCKED |
| T32 | PASS automated — persisted restart / recovery | server fault/restart и browser reload восстанавливают last verified checkpoint; reward только по его completedWave; unsaved local wave не является payment authority | PENDING owner — принудительное завершение WebView посреди волны / длинная native сессия |

## C — постоянный Кодекс достижимых признаков

| ID | Локальная проверка | Evidence и точная граница | Signed / native |
|---|---|---|---|
| C01 | PASS automated | codex-client и v04-community: Коллекция → Кодекс, 10 categories, total/found и per-category progress, отдельной dock вкладки нет | PENDING owner |
| C02 | PASS automated | codex taxonomy выводится из generator: 39 morphology variants в9 категориях +12 attainable preset palettes =51; exact colors и solid transformations, невозможные samples не выдаются | PENDING owner |
| C03 | PASS automated | codex-integration: hatch записывает discoveries вместе с bird/egg/receipt внутри owner CAS без отдельного обязательного read | PENDING owner |
| C04 | PASS automated | accepted gift добавляет recipient discovery внутрь существующего двухстрочного SQL UPDATE; SQL recipient JSON assertion, lost accept retry | PENDING owner — B → C |
| C05 | PASS automated | donor discoveries остаются после ухода последней птицы с признаком; recipient onward gift также не закрывает ранее найденное | PENDING owner |
| C06 | PASS automated | old0.3 account first read/backfill union по owned birds, idempotent CAS без reroll и без награды за прошлую историю | PENDING owner |
| C07 | PASS automated | concurrent refresh/hatch, losing CAS retry, gift+daily+refresh и lost backfill: union не теряет ID, duplicates отсутствуют | PENDING owner — A1/A2 |
| C08 | PASS automated | list input unlocks/foreign IDs/clock отвергается; client summary не является discovery authority | PENDING owner |
| C09 | PASS automated — safe version handling | pure future genes skip/no overwrite; unknown discovery schema version2 сохраняется и передаётся status/result как2, UI предлагает refresh вместо reinterpretation; future geneSchemaVersion production INVALID_SAVE без crash/reroll | Future schema не объявлена playable; нужна совместимая будущая версия rules |
| C10 | PASS automated — focused UI | found/locked unknown cards/progress SSR + повторная light/dark320/360/390/430 browser matrix; summary/trait screenshots просмотрены | PENDING owner — читаемость/scroll на устройстве |
| C11 | PASS automated | own endpoint only; public social/friend DTO не содержит discoveredTraits/codex/player fields | PENDING owner |
| C12 | PASS automated | first migration и concurrent backfill не меняют chickId/genes/rarity/active/balance; old current-owned appearances остаются исходными | PENDING owner — старый реальный аккаунт |

## P — собственная verified Telegram identity

| ID | Локальная проверка | Evidence и точная граница | Signed / native |
|---|---|---|---|
| P01 | PASS automated | profile-identity/profile-sqlite: first/last/username/photo берутся только из verified ctx; browser signed-context fixture отображает имя/tag/allowed photo; avatar route синтетический | PENDING owner — настоящее optional Telegram photo_url |
| P02 | PASS automated | absent optional username очищает stale tag, UI «Без @username», выдуманной ссылки/тега нет | PENDING owner |
| P03 | PASS automated | avatar initials при отсутствии photo; browser image load failure удаляет img, без broken icon; Profile visible при fallback | PENDING owner |
| P04 | PASS automated | verified refresh меняет имя/tag/photo; absent fields очищают старые; identical identity не создаёт бессмысленный write только ради verifiedAt | PENDING owner — поменять реальный Telegram профиль |
| P05 | PASS automated | private metadata и editable Chipper display_name независимы; SQLite/profile/security integration сохраняет ручной игровой nickname | PENDING owner |
| P06 | PASS automated | profile-sqlite и public DTO whitelist: own Telegram name/tag/photo не раскрываются другу автоматически при public/friends; без consent никто не видит эту private identity | PENDING owner — B/C смотрят A |
| P07 | PASS automated | unsafe-only, foreign owner, client telegramIdentity/bootstrap fields отвергаются или не используются; browser unsafe forged name/tag не заменяет verified new-account identity | PENDING owner |
| P08 | PASS automated | HTTPS allowed Telegram host metadata, length/controls/credentials/port/API token paths rejected; backend не fetch arbitrary URL; React text не innerHTML | PENDING owner |
| P09 | PASS automated — focused portrait matrix | profile-photo/fallback screenshots light/dark320/360/390/430, stats/social/settings links; повторная browser проверка и просмотр изображений после layout fixes | PENDING owner — native accessibility / layout |
| P10 | PASS automated | browser synthetic identity A → B, focus/rebootstrap: старый avatar/name/tag не остаётся в новом own Profile; unsafe A hints не становятся B identity | PENDING owner — реальная смена Telegram аккаунта |

## Что именно доказано для TD выплаты

Сервер выдаёт seed и configVersion, сохраняет run и принимает только ограниченные commands/ticks/revision/hash. Headless verifier повторяет тот же чистый integer engine, что и frontend. completedWave получается из реальной симуляции; пользовательский wave/score/HP не принимается. Hash — средство проверки совпадения, не подпись и не секрет.

Finish сначала резервирует operation key, затем CAS переводит run в settling и замораживает checkpoint/reason. Следующий conditional player CAS проверяет sealed run и одновременно сохраняет feathers, per-game record, operation receipt и постоянный towerReceipts[runId]. Последующая terminal cleanup восстанавливается из payment fence. Crash после seal, после player credit или во время cleanup не теряет выплату и не позволяет повторить её. Settling не освобождается как обычный expired active run.

Early SQLite spike проверяет seal/crash/credit/retry. Production independent-worker test проверяет **10 finish + daily + gift** на одной БД: итог5 feathers,1 TD completion,1 accepted gifted chick owner. Все reward thresholds2/3/8/15/25 проверены законными commands и combat replay, а не прямой подстановкой verifiedWave в БД.

Допустимый остаточный риск: скрипт может легально и оптимально играть вместо человека. Replay отвергает невозможные действия/результаты, но не доказывает человеческое управление. Это личная казуальная игра без публичного leaderboard; reward cap4 и независимый cooldown20 ч сохранены. Node timing не является доказательством лимита CPU cloud V8.

## Хранение, производительность и известные ограничения

Данные ниже измерены настоящими production services на локальной SQLite; полный JSON — [storage-perf.json](qa/0.4/storage-perf.json).

| Измерение | Факт |
|---|---|
| 100 завершённых Flaps | player aggregate152 074B;202 durable receipts,137 999B receipts |
| 1 000 завершённых Flaps | aggregate1 391 935B;2 002 receipts,1 377 795B receipts; retained attempts10 /11 711B |
| 2 000 service calls для этих1 000 раундов | 42 521,52 мс локально; это последовательный cumulative test, не network latency или production throughput |
| Replay-safe terminal visual compaction | attempt1123 →450B, экономия673B; исходные permanent start/finish receipts, terminal IDs/results сохранены |
| Gift incoming query:100 /1 000 игроков с5 gift histories | median2,294 /23,860 мс; EXPLAIN: SCAN p + correlated json_each |
| Test-only recipient-index comparison | median0,094 /1,051 мс; реальный indexed query локально, production migration не выполнялась |
| TD state | initial216B; dense67 towers +48 enemies checkpoint10 917B; batch≤64 commands /1200 ticks /32768 bytes |

Дополнительный отдельный legal-strategy sample QA — [backend-perf.json](qa/0.4/backend-perf.json):25 настоящих волн /6752 ticks, p95 replay1,771 мс, max1,927 мс и max5637B checkpoint. Его gift sample имеет101 player и другой history fixture; p950,457 мс не подменяет приведённое выше измерение1000 players ×5 full gift entries.

Permanent receipts не slice/удаляются ради размера. Поэтому aggregate growth не решён полностью: исходные Flaps start snapshots доминируют, а повторная сериализация всей истории увеличивает стоимость writes. Безопасная архивная таблица receipts и gift recipient read model требуют отдельной совместимой миграции; в0.4 не заявляется, что JSON scan стал indexed production lookup. Additive request budgets ограничивают свежие daily/codex calls и сохраняют durable retries; bounded TD checkpoint вынесен из aggregate.

Privacy/identity: photo_url optional; Telegram docs не обещают полный список CDN origins, поэтому новый неизвестный origin даёт initials fallback.  реальный Bot API photo proxy не требуется и не заявляется. При отсутствии разрешённой metadata используется initials. Имена/tag/photo остаются в own player state, social display_name отдельно, никакой phone/contacts permission не запрашивается.

UI evidence находится в [qa/0.4](qa/0.4/): Home один/два, daily available/claimed, Codex summary/traits, Profile photo/fallback и TD build/wave/paused/result. Synthetic native overlay не равен настоящему Android Telegram header. Browser DOM/RAF/long-task sample не заменяет физическую Android/iOS FPS и длительную тепловую нагрузку.

## Приёмка владельца после безопасного deploy

Все следующие действия — **PENDING owner**. Сначала выполнить [DEPLOYMENT_0.4.md](DEPLOYMENT_0.4.md), сверить source SHA, bot/App, reviewed additive migration, completed0.2 release receipt и post-push invariants. Не выполнять reset, force, массовую очистку или ручной transfer коллекций.

Обозначения: **A** — старый аккаунт0.3, **B/C** — два независимых Telegram аккаунта с завершённым onboarding; **A1/A2** — один аккаунт A на двух авторизованных устройствах. Для gift tests нужна неактивная птица кроме последней собственной; получить её обычной hatch механикой, без тестовой подмены balance/time.

1. **Сохранность A.** До публикации сохранить screenshots имён/внешности/числа птиц/active bird, яйца, feathers и personal best/cooldowns; технические ID/genes при наличии собственного диагностического доступа. После0.4 сравнить; допустимы обычные elapsed-age/needs изменения, дополнительные Codex discoveries и private identity. Проверить feed/play/sleep, hatch и Flaps; исходные birds не reroll.
2. **A/B/C consent.** Создать обычные invitation links, явно принять дружбу A–B и A–C. B разрешает friends profile, коллекцию оставляет private. A выбирает B на Home: видны owner A и ровно один guest B. Погладить/поднять/перенести A; попробовать touch B — не должно быть carry/care чужой птицы или изменения её состояния.
3. **Смена/отзыв гостя.** A меняет B на C, затем убирает гостя. B меняет active bird, A обновляет Home — новая внешность. Отдельно B делает private, удаляет A из друзей и блокирует A: после focus/refresh/reconnect guest исчезает и повторное приглашение недоступно. Public profile без accepted friendship не должен давать guest.
4. **Daily на A1/A2.** Зафиксировать исходный balance. Одновременно открыть подарок и нажать claim на обоих устройствах: итог только+1. Повтор/reload/активация другого bird не начисляют снова. После реальной00:00 UTC новый gift доступен; в Самаре это04:00 местного времени. Не переводить клиентские часы ради проверки. Пропущенные дни не дают задолженность/серийный штраф.
5. **TD сначала.** В Активностях убедиться, что Flaps и Nest Defense доступны отдельно. Поставить каждый тип, попробовать path tile, upgrade дважды, sale; матчевые coins не равны feathers. Пройти первые3 волны, voluntary retire: если TD cooldown свободен,+1. Личный record считает завершённые wave; losing wave не должна прибавиться.
6. **TD thresholds / cooldown.** На независимых B/C либо после разрешённого20 ч окна проверить8→+2,15→+3,25→+4. Повторное прохождение в том же TD cooldown не доплачивает, но улучшает record. Daily и Flaps продолжают использовать свои независимые окна; уход также независим.
7. **TD pause/resume/recovery.** Во время волны заблокировать экран/свернуть Telegram на несколько минут: HP/tick не идут в фоне. Сохранить и выйти, закрыть Mini App, открыть на A2 — тот же runId/layout/coins/HP и last verified checkpoint. Принудительно завершить WebView посреди волны; после relaunch unsaved progress не даёт reward. Неактивный active run через24 ч безопасно expired; pending settling должен восстановить уже подтверждённый результат.
8. **A1/A2 races.** Одновременно менять checkpoint/start/finish: один active run, одно credit и record completion. Сеть отключать/включать между checkpoint и ответом, затем нажимать сохранённый retry; без double towers, coins или feathers. Отдельно совместить gift accept, daily и TD finish.
9. **Кодекс и gift.** На B открыть10 categories /51 достижимый trait. Вылупить новую птицу — её traits найденные. B дарит неактивную птицу C; C принимает, сверить ID/genes/name/bornAt и единственного владельца. C discovers traits; B сохраняет found даже после ухода последней птицы с trait. Повторить cancel/decline/TTL и старые gift receipts.
10. **Telegram identity / privacy.** Проверить настоящее first/last name, username/photo при наличии; без них корректный fallback. Изменить Telegram имя/tag/photo и заново запустить игру; private card обновляется, ручной Chipper nickname сохраняется. B/C, посещающие A, не должны автоматически получить его private Telegram fields. Сменить реальный Telegram аккаунт: старые guest selection/avatar/name/tag не остаются в новом own Profile.
11. **Мобильная оболочка.** Android320/360/390/430 light/dark: native Close/menu/Back, dock, daily popup и guest picker, care summary, Codex scroll, profile fallback, TD controls/results. Отключить sound/haptics и включить reduced motion; игра работает. По возможности повторить на iOS/desktop, крупном шрифте и screen reader. Зафиксировать device/client/date и конкретные проблемы.

Если выявлена ошибка экономики/ownership после публикации, сохранить source/cloud revision и использовать совместимое fix-forward0.4. Схему, players, gifts, tower fences и completed release receipt не удалять. Старый backend0.2 или произвольный rollback0.3 после новых gift/TD данных не считается проверенным восстановлением.


## Сводка статусов по группам

| Группа | Local automated part | Native / signed / cloud |
|---|---:|---|
| R regression | 10/10 PASS | Owner pending; R07/R09 cloud proof blocked |
| F guest | 10/10 PASS | Owner pending |
| D daily | 10/10 PASS | Owner pending |
| T Tower Defense | 32/32 PASS | Owner pending; V8/platform/reward smoke blocked |
| C Codex | 12/12 PASS | Owner pending |
| P identity | 10/10 PASS | Owner pending, actual Telegram photo optional |

Всего84 локальные проверяемые части PASS,0 оставшихся воспроизведённых FAIL. Это не84 полных live approvals: native/device и cloud границы явно сохраняются в каждом ID. Публичного leaderboard/доказательства человеческого ввода нет; текущие пределы хранения/JSON scan не скрываются.
