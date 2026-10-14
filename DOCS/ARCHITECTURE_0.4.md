# Chipper 0.4 — Integration Architecture & Serverless Contracts

**Статус:** initial design/constraints for Codex; actual source, supported CLI and SDK must be verified before implementation.  
**Source of truth:** `DOCS/GDD_0.4.md`, `DOCS/TOWER_DEFENSE_0.4.md`, `DOCS/ACCEPTANCE_0.4.md`.  
**Known baseline:** `main` merge 0.3 `6f4bdc227a1c6c00befd3e3d63e07a1535c48dfa`.

## 1. Что уже существует в 0.3

- React + TypeScript/Vite, Telegram WebApp adapter, visual Chick V2 genes, HomeWorld/Touchy Feel, Liquid Glass.
- Telegram Serverless V8, SDK `sdk/db`, SQLite: one authoritative player state JSON row + revision CAS, durable receipts.
- `tgcloud/lib/gameRegistry.js`: versioned `GAME_REGISTRY`, `chippster-flaps`, `player.games` record, independent per-game reward (Flaps +1/20h).
- `tgcloud/lib/social.js`: private/friends/public DTO + accepted friend check, opaque profile IDs, accepted friendship/block states.
- `tgcloud/lib/gifts.js`: multi-row CAS/conditional gift owner transfer; compatibility with gifts must not regress.
- `tgcloud/schema.js`: `chipper_players`, `chipper_release_operations` (completed receipt), `chipper_social_profiles`, `chipper_friendships`, `chipper_social_limits`.
- `src/screens/ProfileScreen.tsx`: basic Chipper counts/Flaps, no Telegram avatar card yet.
- `src/chicks/models.ts` and `tgcloud/lib/chickGenes.js`: gene enums/presets; Codex category must reflect actual server generator.
- `DOCS/DEPLOYMENT_0.3.md`: caution — **no reset**, beware fix-forward after gifts; for 0.4 use read-only cloud preflight and compatible migrations.

## 2. Recommended module layout

```text
src/
  world/
    HomeWorld.tsx                     # own + optional guest read-only V2 avatar
    GuestChick.tsx                    # guest presentation, independent low-cost AI
  screens/
    ProfileScreen.tsx                 # new Telegram identity card + Chipper progress
    GameScreens.tsx                   # Activities includes Flaps and Nest Defense
    CollectionHub.tsx                 # Codex third subsection
  community/
    FriendOnWorldPicker.tsx           # accepted friends, privacy/error states
    DailyBonus.tsx                    # server claim and countdown
  codex/
    registry.ts                       # taxonomy and pinned label/preview metadata
    TraitCodex.tsx                    # seen/locked taxonomy, filters, progress
  games/tower/
    engine.ts, map.ts, waves.ts       # deterministic pure model
    towers.ts, enemies.ts, config.ts
    TowerDefense.tsx                  # mobile game with overlay, pause/resume
    graphics.ts                       # canvas2d and sprite cache
    controls.ts
  profile/
    TelegramIdentityCard.tsx, avatar.ts, profile.css
tgcloud/
  endpoints/
    getDailyBonus.js, claimDailyBonus.js
    listTraitCodex.js
    getGuestChick.js
    startTowerRun.js, checkpointTowerRun.js, finishTowerRun.js, getTowerRun.js
    # verified own identity upsert, if explicitly supported in auth context
  lib/
    dailyBonus.js, traitCodex.js, tower*.js, profileIdentity.js
    gameRegistry.js                   # add nest-defense, preserve Flaps
    domain.js, social.js, gifts.js    # additive evolution only
  schema.js                           # additive tables/indices only
tests/
  daily, codex, guest-access, profile, tower-engine, tower-replay, races, webview
```

Names are suggestions; **write `DOCS/CONTRACT_0.4.md` first** specifying final shared types/endpoints, error envelopes, file ownership and migrations before agents work.

## 3. Backend model: daily bonus

Daily reward stored on **current verified owner's player aggregate** as optional `player.dailyBonus={lastClaimDayUTC,lastClaimAt,claimsTotal}`; defaults safely from missing data. A day index is `Math.floor(serverNow / 86400000)`, but use server clock abstraction. One `claimDailyBonus({operationId})` changes feathers (+1), day stamp and durable receipt **in same CAS**.

- Read-only `getDailyBonus` returns own eligibility, rewardAmount=1 and `nextResetAt`.
- On repeated same day with new operationId, return `ALREADY_CLAIMED` with known nextReset; no feathers.
- Same operationId replay exactly returns same response. CAS conflict retry reconciles against winner.
- No accumulating missed days. Unknown player does not bootstrap under a fake ID; onboarding required.
- Use existing `gameService` and `player` snapshot rather than a second independent writer for balance.
- New fields include a specific schema/balance version if needed, without rejecting old 0.3 records. NO reset.

## 4. Codebook / discovered traits

Server taxonomy must match what server *actually generates* in `tgcloud/lib/chickGenes.js`. Analyze all enums and allowed palette colors. Do not invent an impossible color category. Define stable IDs like `headShape:round`, `pattern:striped` and `palette:<serverId>` if a stable palette registry exists; otherwise classify existing color sets deliberately and maintain compatibility.

Player `discoveredTraits` should be independent of current chicks; once found it persists even if bird gifted away. At first 0.4 read/upgrade, **union** seen traits from all currently owned V2 birds; at each hatch or accepted gift, union again inside the same successful authoritative owner change where practical. No invented unlocks from arbitrary client-selected genes.

If gifting stores can change recipient chick JSON via a different multi-row SQL path, update the server authoritative codebook in that same atomic transaction or use a safe idempotent post-transfer reconciliation that cannot lose ownership before discovery. Ensure no lock/re-entry regressions for `gifts.js` atomic protocol.

`listTraitCodex()` returns the **known fixed taxonomy** plus authenticated user seen IDs/metrics only. Public peers do not automatically see this info; may be shown when user explicitly opts in later. Pages/grouping and progress calculations are client presentation; unlocking never trusts frontend state. Historical V2 genes remain immutable.

## 5. One guest bird on player's own HomeWorld

Prefer a **read-only guest DTO** returned from current 0.3 `social.js` infrastructure via an authenticated `getGuestChick({profileId})` query. It should:
1. Resolve peer profileId to current player.
2. Verify caller's own signed Telegram identity.
3. Verify friendship is `accepted`, neither blocked, and privacy permits active pet viewing/visits.
4. Return only current active chick's **public visual subset** and allowed peer display name, never `telegramId`, player JSON, care metrics or inventory.
5. Be resistant to enumeration and revoked friendship links.
6. Apply reasonable short-lived cache/refresh policy and rate limiting; do not spam read requests for animation.

HomeWorld becomes a local pair of visual entities: own bird remains interactive and server-authoritative for care/active. Guest is decorative, separately animated, not hittable for pickup/drag/care, not a second active in `player.activeChickId`. Enforce no tap propagation from guest to own bird and no touch leaks to underlying scene.

Single guest per Home; local selection can persist as `profileId` preference only, but the server must reauthorize when app resumes/reconnects and then revoke content if permissions changed. If guest selected before friend privacy changes, UI should show graceful explanation.

No realtime WebSocket, bot presence/online requirements, sending friend's touch inputs or changing their pet. If user asks later for co-op, 0.5+ could support it.

## 6. Avatar / Telegram profile

Official contract: https://core.telegram.org/bots/webapps .

`Telegram.WebApp.initDataUnsafe.user` is a **UI hint**, not trusted server identity/authorization. `ctx.initData.user` on Serverless endpoint is verified. The user may have `first_name`, optional `last_name`, `username`, `photo_url`. `photo_url` is OPTIONAL — do not call `getUserProfilePhotos` client-side without supported access.

### Client own profile

- Display verified Telegram user name if server snapshot available; optimistic fallback local from initDataUnsafe only for own UI.
- @username rendered only if present; if none, “без username”, avoid invalid Telegram links.
- Use photo_url if provided and allowed; whitelist valid HTTPS (approved Telegram hosts verified against docs or same verified source); avoid unsafe untrusted arbitrary image URL. Lazy loaded thumbnail with graceful `onError` initials/pet silhouette fallback.
- Profile UI must not display raw Telegram ID, token, initData.
- Differentiate **Telegram identity** from user's customizable Chipper `displayName` (social settings) — don't auto-overwrite manual game nickname each launch.
- If photo_url absent, only explore optional `api.getUserProfilePhotos` / `getFileContent` via documented SDK, with verified request, permission, **proper safe image response delivery**; if unsupported or too expensive, fallback. No Bot token in frontend/URL.

### Server/profile synchronization

- Authenticated own endpoint can persist sanitized verified name/username/photo metadata (only needed/consented fields). No update from client-owned `profileName/photo_url` as authority.
- Existing private/public display_name in `chipper_social_profiles` persists. Telegram identity may change independently. If games choose auto-sync, only update if user hasn't selected custom displayName; explicit player override always wins.
- Telegram profile photo/name never becomes publicly visible via social DTO without owner opt-in and permission checks, even if the game displays it locally. Avatar is not guaranteed available.
- Privacy defaults remain private; reconnect and permission revocation should not leak old caches.
- Cache TTL/time-based refresh; no remote avatars persisted in giant JSON arrays, no random external fetch or third-party telemetry.

## 7. New game and reliable reward model

Registry: `tgcloud/lib/gameRegistry.js` owns `chippster-flaps` and **`nest-defense`**. Each has independent `rewardPolicy`, `cooldown`, config version, score format, and proof policy. Flaps existing `player.games`, `miniGameRewardAt` aliases and claims untouched.

TD state may live in separate `chipper_tower_runs`, indexed by actor/runId/status. One active TD run per player. Real deterministic command/replay verification in bounded server calls. Need **atomic finish/reward receipt** across player and separate run table; before implementation prove supported single-statement claim protocol or design a recovery-safe staged fence.

Do not use a server background process to tick waves. Only validate on demand. Max record can grow with no limit of logical waves; reward caps 4 at >=25. No client authority over wave or feathers.

New game score metadata can use `player.games['nest-defense']` with `scoreType='wave'` and `scoreTrust='casual/verified-threshold'`. UI explicitly presents wave as personal record, no global competitive leaderboard.

## 8. Improve storage growth / social performance

Current JSON history contains durable receipts and attempts. It is unsafe to `slice(-N)` without replay fences. Audit size and realistic limits. Options: compact archived terminal attempts separated from proof receipts; TTL only for truly non-value-bearing data; persistent dedupe claims with stable indexed keys; bounded verified TD run checkpoint table. Existing gifts depend on active/pending reservations and history. Preserve claimed/terminal gift IDs and dispute-free owner authority. Authenticated requests cannot enumerate other users.

Optimize `json_each` incoming gift search carefully: new index/table only if proven safe with live migration; do not manually rewrite gift records to incompatible schema. Prefer extra read models/indices built from source without changing authority semantics.

Rate limit TD checkpoints, guest refresh, profile sync, daily bonus and codex reads. Test concurrency with two devices and mixed gift/hatch/TD completion; CAS retries bounded and messages user-friendly.

## 9. Deployment boundaries (owner beta)

Owner previously authorized safe beta releases to `@chipperhatcherybot` after full quality gates.

- Work `feature/chipper-v0.4` off current `main`, one PR **unmerged**.
- Check actual bot ID 8924974998, cloud revision and existing schema before writes. If CLI not connected, do not pretend live deployment; finish code and provide owner's Termux commands.
- **No new player reset**, no destructive migration, no dropping `chipper_release_operations`; `chipper-v0.2-clean-start` completed receipt preserved.
- For upgrades of social/gifts, live cross-player ownership transfer invariants must still hold. After new social transfers, naive rollback to 0.2/0.3 may be unsafe; have fix-forward or proven backward-compatible plan.
- Use `tgcloud fetch/status/diff`, safe SQL read-only preflight, migration dry-run, conditional safe migrate, reviewed push (app modules/static), postdeploy checks, user A/B/C acceptance. Do not `--force`.
- Production bundle must exclude dev mock/test identities and secret patterns.

## 10. Shared interfaces to define in CONTRACT_0.4

A. `GuestChickDTO`, select/clear guest semantics, permissions and caching.
B. `DailyBonusState`, server UTC day, claim API and snapshot shape.
C. `TraitCodexTaxonomy`, `discoveredTraits`, migration/hatch/gift path.
D. `TelegramProfileDTO` with public/private separation and absence of username/avatar.
E. `TowerRun` and configVersion/seed/command/event/checkpoint/finish/result API; min/max size and types.
F. `GameRegistry` new `nest-defense` entry and reward tiers/cooldown.
G. Ownership of changed source files, SQL schema, test fixtures and canary/release flow.

Do not delegate implementation before resolving cross-module data contracts. The final integrator owns `src/App.tsx`, common types, schema and shared SDK methods.

**Definition of done:** no breaking 0.3 behavior, fully playable TD with wave-verified rewards, codex/guest/daily/profile actually work, tested on local SQLite/browser and published to correct bot if credentials and cloud preflight allow.
