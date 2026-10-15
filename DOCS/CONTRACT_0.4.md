# Chipper 0.4 — замороженный интеграционный контракт

База: актуальный `main` **6b8c1bb9e32a8ade6a65ff872d34f0e404a4d1f9**, ветка `feature/chipper-v0.4`. Отчёт фиксирует фактические уточнения, все существенные изменения согласуются оркестратором. Сохраняются schemaVersion2, V2 genes, все постоянные receipts, gift multi-row CAS и completed release fence. Reset запрещён.

## Envelope, авторизация и владение

Все endpoints возвращают существующий `ApiResult`: `{ok:true,state:Snapshot,result?:object}` / `{ok:false,error:{code,message,retryable,retryAt?}}`. Единственный owner — verified `ctx.initData.user.id`. Mutation `operationId` — UUID; повтор сохраняет payload/key. SDK imports только внутри `tgcloud`, frontend может импортировать **чистые** общие JS rules из `tgcloud/lib` (Vite/allowJs). No client identity/clock/genes/unlocks authority.

| Поток | Исключительные файлы |
|---|---|
| A Guest | `src/world/**`, `src/community/FriendOnWorldPicker.tsx`, guest CSS, `tgcloud/lib/guest*.js`, `tgcloud/endpoints/getGuestChick.js`, `tests/guest*.test.*` |
| B Daily | `tgcloud/lib/dailyBonus.js`, daily endpoints, `src/community/DailyBonus.tsx`, daily CSS/tests |
| C TD engine/UI | `tgcloud/lib/towerRules.js` (единственный pure deterministic source), `src/games/tower/**`, `tests/tower-engine.test.*` |
| D TD service/verifier | `tgcloud/lib/towerService.js`, остальные tower helpers кроме towerRules, четыре tower endpoints, `tests/tower-server*.test.*` |
| E Codex | `tgcloud/lib/traitCodex.js`, listTraitCodex endpoint, `src/codex/**`, `tests/codex*.test.*` |
| F Identity + QA | `tgcloud/lib/profileIdentity.js`, `src/profile/**`, `tests/profile*.test.*`, `tests/ui/v04*`, `DOCS/qa/0.4/**`, новые v04 QA utilities |
| Root | App/types/i18n, PetScreens/CollectionHub/ProfileScreen/GameScreens, domain/service/runtime/gifts/gameRegistry/schema, общие fixtures/dev-server, config/package/CI/scripts/docs, atomicity spike |

Шесть субагентов + root = семь доступных слотов. F после identity выполняет QA; root отвечает за независимую проверку экономики/релиз. Не коммитить чужие файлы, не push/deploy из субагентов.

## Guest

`getGuestChick({profileId}) → result.guest: {profileId,displayName,chick:PublicChick|null,checkedAt}`. `PublicChick` — whitelist 0.3, без needs, owner IDs, identity, inventory. Один SQL read объединяет accepted friendship, оба block flags, разрешённую visibility (`friends|public`), текущий active chick. Public без дружбы не даёт guest. До onboarding caller/peer — безопасный отказ/empty. Read budget 60/min через существующую limits table. Foreign aggregate никогда не пишется.

HomeWorld получает `guest?:GuestChickDTO|null`; guest renderer не получает Touchy Feel/care handlers. Таймеры локальные, максимум один, stop on hidden/deactivation/reduced motion. Выбор хранится только profileId под ключом собственного аккаунта; snapshot не кэшируется постоянно. Проверка при входе Home, reconnect/focus/visibility и periodic owner refresh; при отказе очищается. Picker props: `friends:Peer[]`, `guest`, `busy`, `onSelect(profileId)`, `onClear`, `onRefresh` (уточнить экспорт с root).

## Daily

Pure module exports `DAILY_BONUS_CONFIG`, `dailyBonusStatus(state,now)`, `claimDailyBonus(state,now)`; root вызывает его в обычном domain CAS. `player.dailyBonus={lastClaimDayUTC:number|null,lastClaimAt:number|null,claimsTotal:number}`. Missing safely defaults. Reward default1; day=`floor(serverNow/86400000)`. Status `{available,rewardAmount,dayUTC,lastClaimDayUTC,nextResetAt}`. Snapshot дополнен `dailyBonus:status`; `getDailyBonus({}) → result.dailyBonus`, `claimDailyBonus({operationId}) → result {rewarded:true,rewardAmount:1,dailyBonus}`. Same-day fresh UUID → `ALREADY_CLAIMED`; receipt replay возвращает сохранённый result. Onboarding done required. Независим от всех игровых/care cooldown.

## Codex

Pure module exports `TRAIT_TAXONOMY`, `discoverOwnedTraits(state)`, `traitCodexStatus(state)` и при необходимости `discoverChickTraits(state,chick)`. `player.discoveredTraits={version:1,ids:string[]}` — ограниченное union, никогда не удаляется по текущей коллекции. Stable IDs `category:value`, девять `GENE_OPTIONS` categories + 12 `palette:presetId` по достоверному appearanceId/colors; generator registry — authoritative import. Future schema не угадывается. Root вызывает discovery в reconcile/backfill, после hatch и **внутри** gift recipient snapshot до двухстрочного atomic UPDATE. Endpoint read через gameService: `listTraitCodex({}) → result.codex={version,categories:[{id,label,traits:[{id,label,...}]}],discoveredIds,total,found}`. Snapshot `codex:{version,discoveredIds,total,found}` (category counts могут быть computed UI). Не принимать input unlocks. UI `TraitCodex({codex,...})`, exact prop согласуется E.

## Identity

Pure `profileIdentity.js`: `verifiedProfileIdentity(ctx,now)` / `refreshProfileIdentity(state,ctx,now)`; сохраняется приватный `player.telegramIdentity={firstName,lastName,username:string|null,photoUrl:string|null,verifiedAt}` только из signed user. Root обновляет на bootstrap/getHome (прочие reads допустимы), в owner CAS; одинаковые поля не вызывают бессмысленный отдельный write. Sanitized lengths/Unicode controls, HTTPS photo source whitelist Telegram hosts, no fetch/base64/token. Отсутствующие optional поля **очищают** старые. Никогда не меняется social display_name. Social/PublicChick DTO identity не содержат. Own card `TelegramIdentityCard({identity})`, fallback initials/onError, private note. SDK getUserProfilePhotos поддерживается proxy, но безопасная выдача binary image endpoint не документирована; использовать verified photo_url/fallback без arbitrary fetch.

## Nest Defense: чистая модель и checkpoint

GameId=`nest-defense`, rules version=`nest-defense-1`. Канонический **один** `towerRules.js` используется frontend и verifier; exports `TOWER_CONFIG`, `generateTowerMap(seed)`, `createTowerState(seed)`, `applyTowerCommand(state,command)`, `stepTower(state)`, `replayTowerCheckpoint(state,commands,ticks)`, `towerStateHash(state)`, `towerRewardAmount(verifiedWave)`. Pure commands mutate clone; errors не дают partial persistence. Config: fixed step50ms; grid10×14; HP10/coins120; towers `beak|seed|frost`, levels1–3; enemies `crawler|dasher|brute`; build/upgrade/sell только между волнами. Commands `{type:'place',x,y,towerType}`, `{type:'upgrade'|'sell',x,y}`, `{type:'startWave'}`. Integer/fixed-unit simulation deterministic target order. Seed server integer uint32. State содержит `seed,configVersion,tick,phase:'build'|'wave'|'defeat',wave,completedWave,hp,coins,towers,enemies,...` и bounded spawn state, не whole replay.

Checkpoint batch: `{operationId,runId,revision,commands:TowerCommand[],ticks,expectedHash}`. Все commands исполняются **до** указанных ticks, нельзя строить посреди wave. ticks0..1200 (60s CPU bounded), commands≤64, JSON≤32KiB; actual thresholds уточняются measured tests. UI sends before/after wave and every~10s; no frame React rerender. Hash обязателен (consistency, не secret/MAC). Клиентское wave/score/HP/coins/unlocks запрещены. Replay moves verifiedWave только из `completedWave`, проигранная wave не завершена. Verify total simulated tick*time ≤ elapsed server time (+small fixed-step tolerance), но награда опирается на replay, не на elapsed guard.

`startTowerRun({operationId}) → result.run:TowerRunDTO`; если active — тот же run с resume. `getTowerRun({runId?}) → result.run:TowerRunDTO|null`. `checkpointTowerRun(batch) → result.run`. `finishTowerRun({operationId,runId,endReason:'retire'|'defeat'}) → result {gameId,score,verifiedWave,bestScore,previousBest,newBest,rewarded,rewardAmount,rewardNextAt,reason,runId}`. DTO `{runId,revision,seed,configVersion,status,verifiedWave,checkpoint,startedAt,expiresAt}` (D уточняет эти stable names). Ended/expired/checkpoint conflicts явные ошибки; get authoritative state для восстановления. Один active/settling run на игрока. Inactive TTL24h продлевается accepted checkpoints. App pause on document.hidden/Telegram deactivate, без catchup; после browser crash восстанавливается последний verified checkpoint. Retire может получить награду только за уже подтверждённые wave. Defeat требует verified defeat state.

## SQLite и reward fence — доказать до параллельной реализации

Новая additive `chipper_tower_runs`: `run_id` PK; `telegram_id`; `revision`; `seed`; `config_version`; `status active|settling|finished|expired`; `verified_wave`; `checkpoint_json`; `created_at`; `expires_at`; `last_activity_at`; `start_operation_id`; `last_operation_id`; `last_fingerprint`; `finish_reason`; `result_json`. Unique owner/start_operation_id + partial unique owner where active/settling, lookup owner/time indices. D передаёт root exact DDL до integration.

Finish protocol: (1) revision CAS freezes run to **settling** with immutable final verified state/reason, запрещая checkpoints; (2) owner CAS atomically changes feathers + games record + permanent `state.towerReceipts[runId]=result` (and operation receipt), additionally guarding sealed run; (3) run finished/result/compact cleanup is recoverable derived bookkeeping. Нельзя считать status settling/finished доказательством выплаты; единственный payment authority — permanent player fence. Crash между шагами безопасен: retry pays only if fence absent, concurrent daily/gift CAS recomputes against winner. Pending settling slot не заменяется новым run до успешного payment reconciliation. Expired active closes без credit; нельзя expire settling и потерять незавершённый claim. Terminal rows сохраняют компактный start/result fence, checkpoint clearing допустимо после payment fence. Старые checkpoint UUID/seq не могут повторно переместить state при stale revision.

Early real SQLite proof: `tests/tower-atomicity-spike.test.js` проверяет freeze/crash-after-freeze/lost-after-CAS, 10 simultaneous finish + daily (balance5), отсутствие повторной выплаты и невозможность изменить sealed wave. D расширяет это production service/fault/independent connection тестами.

`player.games['nest-defense']` standard record, scoreType wave, scoreTrust `verified`; independent rewardCooldown20h. tiers 0(<3),1(3–7),2(8–14),3(15–24),4(≥25). Zero tier не запускает cooldown. Generic Flaps start/finish отвергает nest-defense, хотя registry его знает: TD только через verifier. Flaps aliases и старые fingerprints неизменны.

## Growth/performance/release

Receipts и gift history не slice. TD permanent compact receipts separate from bounded checkpoint; completed attempt payload может compact только с replay proof. QA измеряет реальные bytes/CPU/bounded batches и Browser RAF hidden; Android FPS owner pending. Existing gift incoming JSON scan остаётся явно измеренным beta limit если нет безопасного migration.

Root расширяет common SQLite fixtures/dev bridge с новой таблицей и endpoints, production bundle исключает devMock/admin helpers. Read-only CLI `fetch` уже воспроизвёл **No CLI access token found**; это platform blocker live preflight/deploy, не причина останавливать код/PR. Credentials вручную не читаются. Деплой только при точной identity8924974998/@chipperhatcherybot, reviewed additive dry-run и всех gates. Один open PR, no merge.

Уточнение после independent race review: перед sealing finish UUID резервируется value-free owner CAS receipt; collision daily/gift не может занять его после reservation. Recovery sealed run дополнительно не зависит от глобального UUID: не перезаписывает чужой receipt, credit authority остаётся permanent towerReceipts[runId]. Terminal DTO checkpoint=null и result содержит сохранённый finish; UI учитывает interrupted-finalization recovery.

Own identity refresh shares read budgets: bootstrap120/minute, getHome600/minute (includes internal social/gift responses without disrupting normal60/minute lookup budget), daily/codex60/minute. Rejected requests do not persist cloned metadata. Successful durable mutation replay bypasses fresh-claim budget.
