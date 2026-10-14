# CODEX MASTER TASK — Chipper 0.4 / Community Expansion

**Repository:** `tracerxbrhd/chipper-hatchery`  
**Telegram:** `@chipperhatcherybot` / App ID 8924974998 (verify cloud identity before writes)  
**Baseline:** Chipper 0.3 merged into `main`; known gameplay merge `6f4bdc227a1c6c00befd3e3d63e07a1535c48dfa`, but branch **must start from actual latest main** including these docs.  
**Branch:** `feature/chipper-v0.4`  
**Execution:** one autonomous Codex + real subagents (if available) implementation pass; do not stop after a plan.  
**Goal:** complete, tested Chipper 0.4 beta release and **one PR into main, unmerged**.  
**Language:** Russian UI, docs/report.  
**Status of this file:** real task for immediate execution, not a proposal.

## 0. Mandatory reading and attached images

Before writing source, read entire:

1. **`DOCS/CODEX_TASK_0.4.md`** — this master assignment.
2. **`DOCS/GDD_0.4.md`** — complete product scope and decisions.
3. **`DOCS/TOWER_DEFENSE_0.4.md`** — procedural endless Tower Defense and verified wave-dependent rewards.
4. **`DOCS/ARCHITECTURE_0.4.md`** — current 0.3 integration, data, serverless, privacy.
5. **`DOCS/ACCEPTANCE_0.4.md`** — acceptance and release gates.
6. `AGENTS.md`, `DOCS/tgcloud-sdk.md`, `DOCS/CONTRACT_0.3.md`, `DOCS/IMPLEMENTATION_0.3.md`, `DOCS/ACCEPTANCE_RESULT_0.3.md`, `DOCS/DEPLOYMENT_0.3.md`.
7. Existing `src/**`, `tgcloud/**`, `tests/**`, `scripts/**` and earlier 0.1/0.2/0.3 docs as historical compatibility references.

**Visual materials:** owner may attach screenshots of present Chipper 0.3 to the short chat launch prompt. Inspect the actual attachments before changing UI. If no images are attached, use `DOCS/qa/0.3/` existing verified browser captures and current app code — do not invent screenshots. Chipper's original flat/SVG/2.5D + Liquid Glass identity remains. No external paid assets.

**0.4 specifications override older docs when explicitly updated.** Historical reports must not be rewritten.

## 1. Six approved features — actually implement

**1. Friend guest on Home.** Owner may select **one accepted friend's active chick** and display it next to own bird in their 2.5D Home. Only OWN chick may receive Touchy Feel, movement commands, feed/play/sleep or other server actions. Guest has locally simulated friendly idle/greet/approach animations, no remote movement syncing and no mutation of friend's state. Reuse 0.3 privacy/accepted friendship/block rights, hide on revoke/unfriend, no extra guest beyond one. Mobile layout/reduced-motion matter.

**2. Daily login bonus.** Add clear once-per-UTC-day claim of **+1 feather** (centralized configurable default). No streak or debt for missed days, no day claims in advance, not affected by client timezone. Server clock + one CAS receipt, concurrent devices safe; after onboarding only. Show unobtrusive "Ежедневный подарок" in Home/Profile.

**3. Procedural Tower Defense.** Implement real second mini-game `nest-defense`/«Защита гнезда»: procedural passable seeded maps, 3 tower and enemy types, build/upgrade/sell, resource economy inside a run, endless escalating waves, nest HP, fluid mobile UI, pause/resume, personal best wave. **Reward depends on verified completed wave** using proposed tiers 0 (<3), 1 (3–7), 2 (8–14), 3 (15–24), 4 (>=25) feathers; at most one reward claim per separate 20h cooldown. Flaps remains unchanged with independent reward. No unconditional credit for client-supplied wave. See `TOWER_DEFENSE_0.4.md`.

**4. Trait Codex.** Add third subsection `Коллекция → Кодекс` alongside Птенцы/Яйца. Catalog *all actually attainable* gene trait variants, unlocked ones highlighted, locked ones visible as unknown; overall and category completion counts. Unlock when user first **receives** bird with trait (hatch, accepted gift), permanently even after transfer. On first 0.4 login backfill from already owned birds CAS-safe. Derive gene taxonomy from server V2 generator, no impossible placeholder traits and no client-unlock input.

**5. Stability/performance.** Audit growing player JSON receipts/attempts/gifts, TD run persistence, gift ownership, social reads; replay-safe optimizations, rate limits, real SQLite concurrency and Android WebView/Canvas performance, safe migrations and current data preservation. Do not claim unmeasured scale. Retain all existing P0 0.3 functionality.

**6. Native Telegram player profile.** Improve own Profile with trustworthy Telegram first/last name, optional @username and optional photo + attractive card, in addition to separate editable in-game Chipper displayName and existing stats/social controls. Prefer verified `ctx.initData.user` backend. `initDataUnsafe` allowed for **own UI hint only**, never server auth/public DTO. Telegram user `photo_url` may not exist: graceful initials/avatar fallback. Do not automatically disclose Telegram photo/tag publicly. Refresh changes on next verified launch. No requirement to request phone/contacts.

No NFT, death, advertisements, Marketplace payments/Stars, public leaderboard, real-time multiplayer, second active owned bird, or reset of 0.3 data.

## 2. Current architecture — confirm in actual source

- React/TS/Vite + `src/App.tsx` shell, `HomeWorld` Touchy Feel, `CollectionHub`, `ProfileScreen`.
- Serverless V8 endpoints with validated `ctx.initData.user.id`.
- SQLite `chipper_players` per-user revision CAS and permanent replay receipts.
- `chipper_social_profiles` / `chipper_friendships` and `social.js` for privacy/friendships/guests.
- `gifts.js` performs one multi-row conditional SQL UPDATE for cross-account transfer; **never** replace with delete-add, preserve no-duplicate ownership.
- `gameRegistry.js` has Flaps and per-game rewards; adapt to add TD, do not regress old `player.flaps` aliases and existing 20h cooldown.
- `chipper_release_operations` contains completed `chipper-v0.2-clean-start`. **Do not rerun reset**, delete receipt or use old 0.1 runtime.

Review actual code, not assumptions. Before starting: `git status`, `git log`, actual main/branch; version lockfiles; SDK docs. Run quick baseline tests.

## 3. Subagents: genuinely delegate (recommended 7 streams)

You are the final orchestrator/integrator and will own cross-agent interfaces, release and PR. If the environment supports true subagents/worktrees, spawn real ones; otherwise sequentially execute their responsibilities without pretending to have them. **Agree contracts and exclusive file ownership before parallel edits.**

**A — Social Scene / Friend Guest.** Owns `src/world/**`, guest/picker components, selected `tgcloud/lib/guest*.js` and endpoints. Reuse `social.js` read/permission methods without ownership bypass. Makes second bird appear decoratively, no control of foreign chick, guest authorization and cleanup.

**B — Daily Bonus.** Owns new `tgcloud/lib/dailyBonus.js`, endpoint(s), Home bonus component/tests. Integrator exclusively owns shared `domain.js/service.js/src/App.tsx`; write small compatible modules and agree player field shape.

**C — Tower Defense Game Engine/UI.** Owns `src/games/tower/**`, procedural map, fixed-step simulation, player controls/animation, local headless tests. Collaborates with D to synchronize shared deterministic rules; no frame-by-frame React rerenders.

**D — Tower Defense Server/Verifier.** Owns `tgcloud/lib/tower*.js`, new tower endpoints, related tests. Designs persisted run, seed/configVersion, checkpoint command log verification, verifiedWave, cross-record reward CAS/fence, cooldown, simulated concurrency and game result. Prove no fake wave reward, not just elapsed-time guards.

**E — Trait Codex.** Owns `src/codex/**`, new taxonomy + discovery backend under own named files and tests; coordinates with server gene registries, recipient gift path and integrator's shared `domain.js/gifts.js` changes.

**F — Telegram Identity/Profile.** Owns `src/profile/**`, new Profile card component, own identity refresh backend module and tests. Source name/@username/photo from verified server context; optional photo fallback and privacy safe. Integrator owns existing `ProfileScreen.tsx` cross-route edits.

**G — QA/Security/Performance/Release.** Owns tests/ (with agreed nonoverlapping names), scripts/, QA captures and CI; independent review of SQL race/identity, expected tablet/Android behavior, gift regression, security and fail states.

**Integrator (you):** `src/App.tsx`, shared `src/types.ts`, `src/i18n.ts`, `src/screens/CollectionHub.tsx`, `src/screens/ProfileScreen.tsx`, `src/screens/GameScreens.tsx`, `tgcloud/lib/domain.js`, `tgcloud/lib/gameRegistry.js`, `tgcloud/lib/service.js`, `tgcloud/lib/gifts.js`, `tgcloud/schema.js`, config/CI, docs, merging code, final tests/real release.

If agents need another agent-owned file, change via proposed patch/contract to integrator. Avoid multiple agents writing same TS/SQL module in a shared worktree. All UI screens and endpoints must ultimately be integrated in the same production branch.

## 4. Phase 0 — architecture gates BEFORE parallel code

1. Create `feature/chipper-v0.4` from current latest main.
2. Read all five 0.4 docs, sources and previous QA/deploy notes.
3. Create **`DOCS/CONTRACT_0.4.md`** with exact:
   - guest DTO and current friendship/privacy proof;
   - daily reward player field, UTC epoch-day, 1 feather and CAS receipt;
   - trait taxonomy with stable IDs, discoveredTraits state, backfill and gift-hook;
   - TelegramIdentity DTO/verified field flows, public/private distinctions, fallback;
   - `nest-defense` config, seed, map, run, commands, checkpoint, finish result/reward;
   - game registry integration, endpoint names, types/error shapes, limits;
   - data table additions, transaction boundaries, file ownership and compatibility.
4. Run a **minimal real SQLite spike** proving cross-table or per-player reward claim atomicity for Tower Defense. This is an early risk; not last-day TODO.
5. Freeze contracts before spawning parallel streams, then delegate real implementation.

## 5. Phase 1 — actual feature implementation

### Friend home guest

Use existing accepted relationship and publicChick DTO. Define `getGuestChick` with verified caller, profileId and strict permission. A friend has at most one displayed active bird on host's Home; selected guest is not editable nor touch-draggable. Local animations greeting, sitting, looking at another bird. Host's own bird retains drag, petting and care; no mutual online claim. On reconnect verify rights and drop guest snapshot if relationship or privacy changed. Max 1, no background HTTP polling each frame.

### Daily

Server UTC date drives eligible claim; +1 feather once per day via one owner CAS effect and operation receipt. UI shows claim available/claimed/next reset. Missed days not stack, no streak penalties, no client timestamp authority. Care/Flaps/Tower cooldown independent.

### Trait Codex

Use actual `chickGenes.js` possibilities and V2 schema, not hardcoded fake trait count. Include all 9 morph categories and allowed palettes as long as they can be mapped reliably. Locked gray, unlocked colored, progress per category, persistent discovery. Gift receipt/hatch mutate discovery in same player authoritative state; existing old birds backfill no reroll. State growth bounded and versioned.

### Profile

Use Telegram WebApp signed initData + Serverless verified ctx.initData.user for trusted fields. first_name/last_name, optional username and photo_url. Keep existing manual Chipper displayName untouched. Own UI has avatar or friendly initials fallback. Do not expose Telegram avatar/tag to other players by default, validate photo URL/source, handle image loads failing; do not store giant images in SQLite. Do not require Bot API getUserProfilePhotos: attempt only after checking SDK support, permissions and privacy; fallback acceptable. Test switching Telegram account and stale cache.

### Nest Defense

Implement full core rather than wireframes. Procedural seeded path, tile-based buildable map, 3 tower types + 3 enemies, upgrades/sell, deterministic fixed-step wave simulation, endless escalating waves, mobile touch, no tower placed on path, wave-dependent game reward, private personal best score. Reusable game engine with light Canvas2D. Pause/resume mid-run/after app background with server-backed compact checkpoints. No generic static sprite pretending to be Tower Defense.

**Critical:** never trust arbitrary claimed `wave` from frontend. Server-issued seed/rules and bounded deterministic command replay or validated checkpoint proof required. Rewards must only use **verifiedWave** and be issued once per 20h using atomically safe claim protocol. At most 4 feathers by wave tier. Flaps unaffected. Test adversarial messages and lost-network replay.

### Technical debt

Audit receipts JSON, attempt list, gift incoming lookup, TD transcript lifecycle, SQL query cost and memory. Optimize with proof preserving receipts/ownership. No reset or naive `slice` of idempotency history.

## 6. Phase 2 — integration and design

- One Activities screen with both **Chippster Flaps** and **Nest Defense**, each separate record/cooldown and correct start/end flows.
- Profile contains trusted Telegram identity, count chicks, feathers, Codex progress, both game bests, friends/privacy links.
- Collection → `Птенцы | Яйца | Кодекс`. Full incubator remains.
- Home guest picker accessible without obscuring Touchy Feel; own and guest V2 silhouettes visible at narrow sizes. All panels match existing Liquid Glass, light/dark.
- Daily claim prominent enough to discover but not pop up aggressively on every return or block play.
- Handle network errors, offline/retries, read-only visitors and revocations.
- Avoid giant unscrollable forms and navigational regressions.

## 7. Phase 3 — quality gate (full)

Run actual (or accurately report platform restrictions):
- `npm ci`, `npm run check`, `npm run test:ui`;
- TD deterministic map property tests for **1000+ seeds**, path solvability, fixed timestep and simulate 30/60/120;
- TD server verification against crafted impossible wave/actions, rerun, two sessions/device races, claim tiers 0/1/2/3/4, game independence, resume after termination;
- daily UTC midnight race, duplicate requests, 7 days absence;
- Codex discoveredTraits migrate/hatch/gift/CAS and no client unlock;
- friends guest permission/block/revoke/no foreign mutations;
- Telegram profile valid optional fields/unsafe source avoidance and no public data leaks;
- existing gift no-duplication/Chick V2/Flaps/Incubator/Touche Feel regression;
- screenshots in `DOCS/qa/0.4/`: Home one/two birds, light/dark, daily, Codex locked/unlocked, TD waves/build/results and profile with/without photo, sizes 320/360/390/430;
- performance/paused app, no endless RAF while hidden; ensure build excludes devMock and creds.
- Every acceptance ID in `DOCS/ACCEPTANCE_0.4.md` marked PASS automated/PASS live/PENDING owner/BLOCKED/FAIL with specific evidence.

**Review actual screenshots** and fix UX regressions. Agent assertions without recorded test runs are not sufficient.

## 8. Phase 4 — safe beta deployment (previously authorized)

Owner previously allowed normal tested changes to release to existing beta bot. This does **not** allow destructive operations or deleting any saved chicks. Deploy only if all core P0 security/invariants pass.

1. Verify linked CLI bot `@chipperhatcherybot` and App ID 8924974998, current cloud revision, existing schemas and completed 0.2 reset receipt.
2. `tgcloud fetch/status/diff` read-only. Record working source SHA and code-only recovery plan compatible with social gifts and new TD run state.
3. Review `migrate --local --dry-run` (only additive expected tables/indices), then deploy schema and `migrate --dry-run`/`--safe` as documented; verify no pending migration.
4. Full production build/check, proof no devMock/credentials/temporary endpoints. Run and inspect browser screenshots.
5. Normal `tgcloud push` only after guards; no `--force`, `reset`, mass-delete or surprise schema modifications.
6. Post-deploy: `fetch/status/migrate --dry-run/webhook`, URL HTTP and one owner-allowed read-only cloud probe, if SDK available. No synthetic Telegram signed claims of A/B/C.
7. Log actual app revision, URL, source SHA, schema additions, failures and rollout instructions. If credentials missing (as in previous Work sessions), complete implementation+PR, provide safe `DOCS/DEPLOYMENT_0.4.md` instructions for owner/Termux instead of pretending release succeeded.
8. If TD reward verification/claim is not proved, do **not** deploy a live backend that pays by untrusted wave; gate TD behind disabled launch and clearly mark release BLOCKED/PARTIAL, fix within this orchestration if possible.

Do not reactivate `scripts/reset-game-v0.2.mjs` or break verified social gift semantics. After 0.3 gifts, backend naïvely rolled back to 0.2 is unsafe; prefer fix-forward if new gifting or TD data exists.

## 9. Phase 5 — PR and honest report

- One PR `feature/chipper-v0.4 → main`; **do not merge**.
- Create `DOCS/CONTRACT_0.4.md`, `DOCS/IMPLEMENTATION_0.4.md`, `DOCS/DEPLOYMENT_0.4.md`, `DOCS/ACCEPTANCE_RESULT_0.4.md`. Update README and `AGENTS.md` to v0.4; preserve all older docs.
- Final report in Russian:
  1. READY/NOT READY, actual Git base/head SHA and PR URL.
  2. Subagents **actually used**, files and test proofs.
  3. Six product features with exact verified behavior, incomplete items marked BLOCKED not hidden.
  4. TD procedural/replay/claim proof details, active cap and anti-cheat residual risks.
  5. Tests commands, counts, screenshots, cloud vs mock.
  6. Data saved, schema changed, privacy/identities and gift regression.
  7. Real Serverless deployment result, bot/revision/URL, expected/actual migration, no secret data exposed.
  8. Owner A/B/C real acceptance actions and known limitations.
  9. Safe recovery plan preserving gifts, TD runs and existing 0.3 birds.

**Finish one true working 0.4 release (or clearly proven platform blocker), not just docs, UI-only mocks or vague promises.** No further questions unless user action/credentials are essential. Continue through available phases autonomously.
