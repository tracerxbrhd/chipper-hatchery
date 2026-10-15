# Chipper 0.5 — аудит backend и проект контракта обмена

Дата: **15 октября 2026**. База исследования — актуальный `main` после merge 0.4, GitHub SHA **3764261bd7ab2531b87b47c240a3158022b02754**. Локальные исходники восстановлены оркестратором через GitHub с проверкой blob SHA. Сначала проведён read-only аудит и составлен проект ниже, затем по разрешению оркестратора реализован совместимый backend. Окончательные имена и API зафиксированы в `CONTRACT_0.5.md`; статус реализации приведён в конце. Старые измерения отделены от свежих проверок.

Production `push`, применение миграций, reset, webhook writes, мутирующие endpoints и чтение credentials не выполнялись. Историческое разрешение деплоя из AGENTS/0.4 не отменяет ограничение текущего задания: production только read-only до отдельного подтверждения владельца.

## 1. Подтверждённый scope и roadmap

- [PR #4](https://github.com/tracerxbrhd/chipper-hatchery/pull/4) слит владельцем 15.10.2026 в 05:04:41 UTC. Его сохранённый текст «open/unmerged» — историческое состояние, а не текущее состояние GitHub.
- Полное REST-перечисление Issues, `state=all`, содержит только закрытые PR #1–#4; отдельных Issues нет. Дискуссия PR #4 пуста. Полное recursive дерево main содержит 444 entries, `truncated=false`, отдельных документов 0.5/roadmap/TODO нет.
- **Сохранённый roadmap существует внутри [GDD_0.3 §11](GDD_0.3.md#11-магазин-и-будущий-roadmap): 0.5 — двусторонний обмен птицами; 0.6 — Marketplace после аудита экономики и транзакций.** Более старое назначение Marketplace на 0.5 в GDD_0.2 заменено этим новым решением. GDD_0.4 будущий обмен не отменяет.
- Достижения, декоративные события и магазин косметики в текущем задании — явно разрешённый дополнительный scope пользователя. Их нельзя описывать как уже реализованный или ранее утверждённый план из 0.4. GDD_0.4 прямо не предусматривает наград за заполнение Кодекса.
- Локальный `rg -n 'TODO|FIXME|HACK|0\\.5|roadmap' src tgcloud tests DOCS` не обнаружил TODO/FIXME/HACK в runtime `src`/`tgcloud`. GitHub code search не годится как отрицательное доказательство: он возвращает пусто даже для известного слова `chipper`.

## 2. Фактическая архитектура и сохранность

| Область | Реальный источник и граница |
|---|---|
| Identity | `service.js:verifiedTelegramId` принимает только verified `ctx.initData.user.id`; DTO не определяет владельца |
| Обычный gameplay | `store.js:compareAndSwap`: один `UPDATE chipper_players ... WHERE revision=:expectedRevision RETURNING revision`; эффект и receipt в одном JSON |
| Повторы gameplay | `service.js` проверяет UUID/fingerprint, возвращает старый result, затем сохраняет через тот же CAS; максимум 32 пересчёта после конфликтов |
| Подарок | `gifts.js:swapPair`: MATERIALIZED CTE фиксирует оба revisions и текущую friendship/TTL до одного двухстрочного CASE UPDATE |
| Social | `social.js` сохраняет эффект и actor-scoped receipt в той же profile/friendship CAS row; public DTO — явный whitelist |
| TD | `towerService.js`: reserve UUID → seal run в settling → player CAS с permanent `towerReceipts[runId]` и sealed-row guard → recoverable terminal cleanup |
| Схема | `schemaVersion=2`, `appearanceVersion=2`, gene schema и completed `chipper-v0.2-clean-start` остаются; runtime не выполняет DDL |

При CAS conflict код заново читает победивший агрегат и пересчитывает действие; слияния старых JSON поверх новых нет. Gift statement имеет outcome ровно 0 или 2 rows; отдельного удаления и последующего добавления птицы нет. Friendship отозванная до commit не разрешает принятие подарка; terminal history доступна только фактическим участникам и после block/unfriend.

`getHome` не является строго SQL read-only: reconcile обновляет серверное время/needs/sleep/trait discovery, own identity и при изменении сохраняет CAS. `listGifts` также может CAS-записать истечение предложения отправителя. Поэтому эти endpoints **нельзя** использовать в production read-only диагностике под видом безвредного чтения; preflight должен делать проверенный SELECT, без вызова gameplay endpoints.

## 3. Рост receipts и state_json

`store.read` парсит полный JSON; service делает `clone`, reconcile и сравнивает обе полные сериализации, затем CAS сериализует полный агрегат ещё раз. Стоимость даже маленького read/care действия растёт вместе со всей историей, а при conflicts повторяется до 32 раз.

| Поле | Рост / существующая защита |
|---|---|
| `state.receipts` | Постоянный, O(успешных mutations). Start Flaps хранит исходный полный visual chick result ради точного replay |
| `state.attempts` | Новый start удаляет истёкшие тела attempts; finished после TTL теряет дублирующий `chick`, но permanent receipt сохраняется |
| `state.gifts` | Вся история, включая terminal offers и снимки птиц, без pruning |
| `state.giftReceipts` | Постоянные actor-operation fingerprints и giftId |
| `state.towerReceipts` / TD start receipts | Компактные permanent fences, всё равно O(runs) |
| `chipper_tower_runs` | Отдельный bounded checkpoint; terminal checkpoint очищается лишь после payment fence; terminal rows сохраняются |
| Social `receipts_json` | Постоянные profile/pair operation receipts; отдельный долг от player JSON |
| Telemetry / budgets | Telemetry 90 дней и 20 ошибок; minute-local seen keys ограничены window/budget, не заменяют durable receipts |

**Повторено в этой среде 15.10.2026**, production rules/services, Node v24.19.0 / SQLite 3.53.3, in-memory синтетические игроки, без изменения файлов или live данных:

- 100 completed Flaps: baseline **2478 B**, aggregate **152074 B**, **202 receipts / 137999 B**, 10 retained attempts; 200 calls заняли около **635 ms** локально.
- Старые start и finish UUID вернули первоначальные results; баланс после повторов остался **1**, новый раунд/птица/выплата не появились.
- 10 разных concurrent daily UUID: одна успешная выплата, итог +1. 10 concurrent gift accepts: ровно одна птица у получателя.
- `EXPLAIN QUERY PLAN` текущего incoming query: `SCAN p`, `CORRELATED SCALAR SUBQUERY 1`, `SCAN g VIRTUAL TABLE INDEX 3:`.

Это отдельная направленная Node-проверка с `node:assert`, не заявленный полный Vitest gate 0.5. Реальные physical Android/cloud V8 не измерены.

Исторический полный storage test 0.4 в [storage-perf.json](qa/0.4/storage-perf.json) показывает 1000 Flaps → **1391935 B** aggregate, **2002 receipts / 1377795 B**, 2000 calls **42521.5 ms**. Эти числа повторно не измерялись и не являются production latency/throughput. Безопасная terminal visual compaction сэкономила 673 B на attempt, но почти не меняет главный источник роста.

### Решение для 0.5

Не удалять и не `slice(-N)` permanent receipts, terminal trade/gift IDs, TD fences или release receipt. Нельзя заменять их одним «последним UUID»: старый запрос после потери ответа может прийти спустя годы.

Безопасное последующее архивирование требует отдельного совместимого протокола:

1. Additive archive с unique `(owner, namespace, operationId)`, исходным fingerprint/result и проверяемым immutable replay payload.
2. Все writers (game/gift/TD/trade/social) сначала ищут оба источника. Нельзя сжимать JSON до обновления всех старых writers.
3. Copy-before-prune, compare содержимого, CAS исходного owner revision, постоянный archive pointer/fence и crash/retry proof. Если запись не доказана в archive, JSON receipt сохраняется.
4. Ретрай после частичного copy, одновременных выплат/подарков и откат версии не должен открывать повторную оплату. Индекс/архив не может отдельно владеть балансом.

Это проект продолжения, не заявленная реализация 0.5. Полезный первый шаг в 0.5 — не добавлять большие snapshots/неограниченные event logs в новые receipts; bounded achievements и cosmetic entitlement sets хранить компактно, а награды в существующем owner CAS.

## 4. Входящие подарки

`listGifts` сканирует все player rows через `json_each(state_json,'$.gifts')`, затем парсит полные matching aggregates, обходит их историю и возвращает весь отсортированный список без pagination. Таким образом рост receipts повышает стоимость scan даже при малом числе подарков. Ограничение 90 reads/min не превращает query в индексированное.

Историческое измерение 0.4 (100 / 1000 синтетических игроков × 5 histories): median **2.294 / 23.860 ms**. Test-only recipient index — **0.094 / 1.051 ms**. Он **не** установлен в production, свежая проверка подтверждает прежний SCAN plan.

Совместимое продолжение: additive recipient read model `(recipientId,senderId,giftId)` с индексом recipient, cursor pagination и обязательной повторной авторизацией/проверкой исходной записи. Критический нюанс: асинхронная вставка index после успешного offer может потеряться при crash и скрыть настоящий подарок. Нужны atomic source+index statement, поддержанный платформой, либо durable source outbox/backfill со scan fallback до proof полного покрытия. Read model никогда не определяет owner/status и не разрешает transfer самостоятельно. Пока нет этого proof, сохранение scan честнее фиктивного индексирования.

## 5. Проект двустороннего обмена 0.5

Рекомендуемый минимальный поток — **точная пара птиц с явным согласием обоих**, без валюты/fees/случайного reroll. A выбирает свою неактивную птицу и видимую неактивную птицу принятого друга B. B видит обе и принимает/отклоняет; A может отменить. Одно предложение, никакой автоматической встречной заявки или последовательности двух подарков.

### Дополнительные поля без новой SQL schema

`state.trades ??= []`, `state.tradeReceipts ??= {}` — только optional additive поля внутри schemaVersion2. Предложение записывается **в оба** player aggregates одним pair CAS. Это компактная mirrored history/inbox: list не сканирует остальных игроков. Последующие terminal transitions также меняют оба зеркала одним pair CAS; самостоятельных write одного зеркала нет.

Server-only запись version1:

```text
{version:1, tradeId, proposerId, recipientId,
 proposer:Peer, recipient:Peer,
 offeredChickId, requestedChickId,
 offeredChick:PublicChick, requestedChick:PublicChick,
 status:'pending'|'accepted'|'declined'|'cancelled'|'expired',
 createdAt, expiresAt, completedAt:null|number}
```

`tradeId` = immutable proposer publicId + server UUID. `proposerId/recipientId` — только server state, никогда DTO. Previews — visual whitelist 0.3; полные private needs/ownership snapshots не дублируются в истории. При завершении public previews обновляются из реально переданных original chicks. История/receipts сохраняются; будущая compaction только по доказанному протоколу.

`tradeReceipts[operationId]={fingerprint,tradeId,at}` принадлежит только actor, инициировавшему действие. Глобальный owner UUID конфликтует с `receipts` и `giftReceipts`; game/gift/TD writers также обязаны проверять `tradeReceipts`. Social profile/pair namespace остаётся отдельным существующим контрактом.

Предварительные endpoint names (до freeze root):

| Метод | Input | Result |
|---|---|---|
| `listTrades` | `{}` | `{trades:TradeDTO[]}`; только own mirrored history |
| `offerTrade` | `{operationId,recipientProfileId,offeredChickId,requestedChickId}` | `{trade:TradeDTO}` |
| `respondTrade` | `{operationId,tradeId,accept:boolean}` | `{trade:TradeDTO}` |
| `cancelTrade` | `{operationId,tradeId}` | `{trade:TradeDTO}` |

Envelope/error/retry semantics сохраняются. Client не передаёт sender/recipient ID, genes, rarity, reward, цены или timestamp. Unknown поля отвергаются; UUID canonicalized и fingerprint строится из canonical input. Successful same-key replay возвращает прежний trade в текущем terminal состоянии без повторной передачи; fresh UUID на accepted trade тоже не меняет owner.

### Предложение и приватность

1. A/B существуют и прошли onboarding; разные владельцы; accepted friendship без обоих block flags.
2. До получения/показа `requestedChick` проверить **текущий profile И collection visibility**, как в `social.js`. Знание opaque profileId/chickId не даёт доступа private коллекции. Отказ generic, без подсказки существования скрытой птицы.
3. Обе птицы принадлежат своим владельцам, не active, не последняя; own offered bird не занята gift/trade. Requested bird тоже должна быть свободна при создании, но **не резервируется** до принятия: A не может заморозить чужую птицу без согласия.
4. Server TTL — 24 часа. Только offeredChick резервируется у A: запрет activation/rename/второго gift/trade через общий reservation helper. Просьба о B bird не препятствует B играть, дарить или активировать её; тогда accept вернёт `TRADE_UNAVAILABLE`, без частичного transfer.
5. В момент offer commit materialized eligible проверяет оба revisions, current friendship и текущие collection/profile visibility. В оба JSON добавляется одинаковая запись, receipt только у A. Spam budget рекомендуется 20 новых offers/час на proposer, bounded minute reads/writes как existing gift.

### Принятие: одна атомарная смена двух владельцев

1. Resolve proposer через trade namespace; проверить actor — точный recipient. Mirror participants/pair IDs должны совпасть; corruption — безопасный отказ без восстановления «на глаз».
2. Перечитать оба агрегата и reconcile серверным временем; проверить pending/TTL, обеих владельцев, nonactive/nonlast, no duplicate IDs у противоположного владельца.
3. A offered reservation должна принадлежать **этому** trade и не конфликтовать с gift/другим trade. B requested bird должна быть свободна от всех gift/trade reservations. Перечитать настоящие full chicks из текущих collections; не создавать их из preview.
4. В clone A удалить offered, добавить original requested; в clone B наоборот. Сохранить ID, genes/appearanceVersion/rarity/name/bornAt/milestones/needs/cooldowns, active IDs, balance и все неизвестные additive поля. Trait discovery union для обоих в этих же snapshots. Legitimate server reconcile времени допускается, reroll нет.
5. Оба mirrored records → accepted/completedAt, recipient operation receipt записывается до persistence в его clone. Feathers, reward cooldown, incubator и per-game records не меняются обменом.
6. Один `WITH eligible AS MATERIALIZED (...) UPDATE chipper_players SET state_json=CASE ...` фиксирует **оба** revisions, pending trade/TTL и current friendship/block predicate. Outcome только 0 или 2 rows; 0 → bounded fresh-read retry. Friendship remove/block до commit блокирует acceptance. Не полагаться на preflight `areFriends` вне statement.
7. Accepted ownership + обе history copies + receipt + discoveries коммитятся одной SQLite statement. Crash до него = ничего; crash после = replay видит accepted, без новых птиц. Отдельного settling/payment этапа не нужно: перьев и отдельной trade table нет.

Явное B accept является согласием передать эту точную птицу A; ранее созданный trade preview не раскрывает остальную коллекцию. Новый offer требует текущей видимости. После revoke/block старые pending previews не выдаются посторонним, acceptance запрещён; cancel/decline и собственная terminal history остаются доступны участникам как у gifts.

Decline/cancel меняют **оба** зеркала одним pair CAS без friendship requirement, после проверки нужного actor. Expiry для read/reservation выводится из server time; необязательно писать чужие JSON из list. Если persisted expired transition нужен, делать его тем же pair CAS. Истёкшая запись не удерживает птицу независимо от сохранённого status. Fresh terminal retry никогда не resurrect proposal.

### Обязательные shared hooks

- `domain.js`: общий gift/trade reservation guard и Snapshot optional `reservedTradeId`; сохранить `reservedGiftId` для старых callers.
- `gifts.js`: проверять trade reservation перед offer/accept; проверять чужой namespace UUID перед записью receipt.
- `service.js`, `towerService.js`: запрет повторного использования trade UUID; TD settlement recovery не перезаписывает trade receipt при defensive old-writer collision.
- `runtime.js`/endpoints, types/API/dev production bridge/UI: только после freeze центрального контракта. Не импортировать SDK в pure rules/frontend.
- Collection/profile/social дают точный preview и confirmation обеих птиц, reservation/expiry/error/retry states. Гость/read-only visitor никогда не получает swap action.

## 6. Риски и приёмка обмена

| Риск | Обязательное доказательство до релиза |
|---|---|
| Один owner исчез / появился дубль | SQL effect либо обе пары исходных owners, либо обе обменённые; original full chick fields равны |
| Race с gift/activate/rename | Один winner; общие reservation guards и оба revisions предотвращают lost update |
| Requested bird изменена после offer | Accept safely rejects changed ownership/active/reserved state; никакой подмены на другую птицу |
| Privacy / stale friendship | Unknown/private ID не раскрывает bird, block/remove перед commit запрещает accept |
| 10 devices / accept vs cancel | Independent SQLite connections, один terminal outcome, два owners по одному экземпляру |
| Lost response / crash | Fail до statement, lost reply после commit, recreated service и old/new-key retry без повторной передачи |
| Replay UUID между подсистемами | Game↔gift↔TD↔trade коллизии дают `OPERATION_CONFLICT`, ни namespace не перезаписывает другой |
| Clock/expiry | UTC-independent server TTL boundary, clock rollback не resurrect expired state, DTO/guard согласованы |
| Mixed CAS | Parallel daily/hatch/TD finish/identity refresh + trade сохраняют все balance/cooldowns/discoveries/receipts |
| Mirror рост/неполнота | Оба зеркала совпадают после любой transition; list читает own PK, не global scan; pending cap/spam budget |
| Совместимость | Old schemaVersion2 без trade полей читается; подарки/Flaps/TD/0.2 fence сохранены; production без dev mocks |

Проверки: отдельный service suite на real SQLite, fault injection, independent-worker races, UI обеих подтверждений/TTL/privacy/retry, затем полный `npm ci`, `npm run check`, `npm run test:ui`. Наличие этого проекта не отмечает будущие tests PASS.

Главный риск обмена — shared reservation и receipt namespaces, а не SQL swap: существующий подарок уже доказывает соответствующий двухстрочный паттерн. Полная реализация должна проходить после центрального freeze и сохранять atomic boundary. Cloud SQL capability, реальные A/B/C/A1/A2 и physical WebView остаются отдельной ручной/read-only preflight приёмкой; local SQLite не заменяет их.

## 7. Реализация после freeze контракта

В working tree реализованы `tgcloud/lib/exchanges.js`, четыре endpoints `listExchanges/offerExchange/respondExchange/cancelExchange`, shared reservation/UUID guards в domain/service/gifts/towerService, runtime integration. Приняты финальные имена **exchange**, `state.exchanges`, `state.exchangeReceipts`, `reservedExchangeId`; названия trade из проекта раздела 5 не являются API. Offer input использует `chickId` для своей offered птицы.

Сервер сохраняет оба зеркала одной MATERIALIZED pair CAS; offer commit проверяет видимость и дружбу внутри SQL, accept — friendship/TTL/оба revisions/обе текущие inventory. Requested bird остаётся свободна. Expired list не пишет чужой player state. Fresh-key terminal запрос возвращает текущее terminal состояние без нового exchange receipt или повторного эффекта; исходный transition UUID остаётся постоянным. Это исключает рост receipts от произвольных no-op повторов. Ключи реальных обменных transitions учитывают game/gift/TD и наоборот, включая TD defensive settlement.

`achievements.js` реализует 12 фиксированных авторитетных достижений. Бounded claimed fence и +1 feather находятся в том же owner CAS и operation receipt. Не больше 12 новых перьев за всю жизнь аккаунта; старые cooldown не меняются. Gift/exchange accepted записывает counters обеим сторонам внутри atomic transfer. Клиентский `logEvent` не принимает эти события.

Направленный dependency-free Node smoke действительно прошёл: 10 одновременных accepts + daily, оба правильных уникальных owner, mirrored histories, counters по одному, повтор offer UUID вернул accepted, обе стороны получили social achievement claim. Затем обычный gift после exchange сохранил работу и дал обоим gift milestone. `node scripts/check-server.mjs` — PASS. Полные Vitest/UI результаты фиксируются интегратором после установки зависимостей; этот smoke их не заменяет. SQL schema и production не изменялись.

SocialScreen интегрирован с `ExchangePanel`: выбор доступной собственной птицы, explicit authorized read коллекции принятого друга, точные обе preview и подтверждение перед предложением/принятием, отмена/отказ, server-derived TTL и history по 20 карточек. Чужой read не применяет возвращённый own Snapshot к App и защищён auth-key/request-sequence/unmount guards; background/deactivated очищает локальную чужую коллекцию без polling. Все mutations идут через root onAction с сохраняемым UUID и общим retry/error flow. Gift composer также исключает `reservedExchangeId`.

Три новых browser tests в `tests/ui/v05-exchanges.spec.ts` проверяют no foreign mutation на preview, точное двустороннее согласие и reservation, lost committed response с тем же UUID, private collection и background cleanup. Первоначально локальные dependencies/browser были заблокированы; затем все три реально прошли в составе103 UI tests в GitHub Actions runtime c3b07c8, run38695995822. Физические Telegram dialog/keyboard/focus и Android/iOS остаются ручными проверками, Chromium emulation их не подтверждает. Полные результаты: [ACCEPTANCE_RESULT_0.5.md](ACCEPTANCE_RESULT_0.5.md).
