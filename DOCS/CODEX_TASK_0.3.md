# CODEX MASTER TASK — Chipper 0.3 / Social & Feel Update

**Repository:** `tracerxbrhd/chipper-hatchery`  
**Production-beta Telegram bot:** `@chipperhatcherybot`, App ID `8924974998` (verify before every write)  
**Base:** current `main`, currently known merge of 0.2 `cc2e0e2a0c1d901397d9f0605355cc8969ac2f33`  
**Work branch:** `feature/chipper-v0.3`  
**Outcome:** one autonomous Codex orchestration-run to deliver implementation, tests, beta deploy when safe, and one PR into `main` **without merge**  
**User language:** Russian  
**Current file status:** this file is the **actual implement-now assignment**, not a description of a future assignment.

## 0. Start here, not from the chat

You are the principal engineer and final integrator for Chipper 0.3. Read the **complete content** of these repository files, then inspect code:

1. `DOCS/CODEX_TASK_0.3.md` — this master task.
2. `DOCS/GDD_0.3.md` — canonical user-approved scope and visual/behavior requirements.
3. `DOCS/ACCEPTANCE_0.3.md` — mandatory scenario matrix and release gates.
4. `AGENTS.md` — existing developer rules; update 0.3 heading carefully, retaining valuable Serverless expertise.
5. `DOCS/CONTRACT_0.2.md`, `DOCS/IMPLEMENTATION_0.2.md`, `DOCS/ACCEPTANCE_RESULT_0.2.md`, `DOCS/DEPLOYMENT_0.2.md`, `DOCS/tgcloud-sdk.md`.
6. Source under `src/`, `tgcloud/`, `tests/`, `scripts/`, `package.json` and all checks.

**Priority:** these 0.3 documents override 0.2 instructions where they conflict. Retain all 0.2 safety invariants where not explicitly superseded. Do not modify the historical 0.1/0.2 GDD or fabricate historical test/deploy evidence.

### Images attached to the Codex launch message

The owner will attach:
- Four screenshots of running **Chipper 0.2** (Home, Chippster Flaps, Chick Card, and a fourth current UI screenshot if applicable).
- A **Telegram floating-glass bottom navigation reference**.

Inspect these actual images **before** redesigning the UI. 0.2 screenshots are defect evidence and a before-state, not a requirement to preserve faulty layout. Telegram dock image is a visual direction for a floating capsule, **not** a request to copy trademarked assets or Telegram interface pixel-for-pixel. You may build original Chipper icons and UI. Do not invent missing attachments.

## 1. Mission and decisions (owner-approved)

This is one **large v0.3 release** combining 0.2 polish, tactile pet behavior, evolution memory, extensible game economy, and actual social play.

### Core stays

- One active bird; all others in Collection and resting.
- Chick System V2 existing gene system is retained and improved, **not re-rolled**.
- Pets **never die**. No injury, disease, pay-to-resurrect, unfair absence punishments.
- No NFT, blockchain, Telegram Stars, advertising, paywall, monetization, real trading/marketplace.
- **No new DB reset.** The v0.2 one-time clean-start has completed; its receipt must remain and is never run again.
- Existing feathers, pets, egg timers, growth, achievements, Flaps personal best and cooldown survive.
- Telegram Serverless + SQLite remains backend. No VPS.

### New mandatory scope P0

1. Dark theme is completely redesigned (not болотная/грязная), consistent clean Liquid Glass light/dark with accessible contrast.
2. Tiny top HUD **between native Telegram system button groups**, never underneath Close/Back/overflow; Flaps score/header is also protected.
3. Floating translucent **bottom dock** with gap from bottom and responsive safe area.
4. Tab order: **Магазин | Коллекция | [ДОМ] | Активности | Профиль**. Home precisely middle and more prominent.
5. Incubator moves into Collection as tabs **Птенцы | Яйца**, retaining all hatch mechanics and navigation.
6. Complete **Touchy Feel**: tap, hold, pick up, drag, release, petting, follow/gaze, context reactions and reliable cleanup.
7. Character animation/anatomy improvements for the valid v2 shapes/stages, with correct feet/weight, articulated head/tail/wing, held pose.
8. Chick Card shows three stages, future as `?`, past as selectable actual visual previews.
9. Personal game record registry and future leaderboard data foundation **without publishing a leaderboard**.
10. Per-game feathers with independent cooldown/reward-policy; the 0.2 Flaps cooldown and score migrate without fresh rewards.
11. Social: privacy/controlled public profiles, friend requests, accepted friendships, shareable bird cards, visited/read-only bird scenes, **safe gift proposals and real transfer of a chick**. These are **implemented features**, not future-only docs or placeholder buttons.
12. Preserve all existing game functionality, real quality gates and a careful beta release.

### Store decision

The new `Магазин` is a styled honest **coming-soon storefront**, with categories/slots for future cosmetics and merchandise. **No functional payments** yet. Disable/omit purchase actions.

### Priority choices when work is hard

UX safety, data safety, and correct Serverless behavior outrank visual gimmicks. A real safe partially-scoped result must be labelled honestly; do not falsely state that gifts or public profiles work if the backend is unsafe. However, **invest effort to complete them in the same pass**, including targeted research/proof-of-concept.

## 2. Inspect actual code, not assumptions

Before changing files:
- `git status`, `git branch`, `git log`, inspect `main` head and existing remote branch;
- confirm current React/TS/Vite and Telegram Serverless SDK version;
- read `src/App.tsx`, `src/api/telegram.ts`, `src/app.css`, `src/navigation/BottomDock.tsx`, `src/design/GlassSurface.tsx`;
- inspect `src/screens/PetScreens.tsx`, `EggScreens.tsx`, `ProfileScreen.tsx`, `GameScreens.tsx`;
- inspect `src/world/HomeWorld.tsx`, `worldEngine.ts`, `worldMath.ts`, CSS; `src/chicks/**`, `src/games/flaps/**`;
- inspect `tgcloud/lib/domain.js`, `service.js`, `store.js`, `flapsRules.js`, `tgcloud/schema.js`, endpoints, migrations;
- review prior 0.2 screenshots and tests/QA logs as evidence (do not re-use old test PASS to claim new PASS).

Observe:
- `src/App.tsx` currently routes five tabs `collection/incubator/home/activities/profile` and has dedicated `chick`, `settings`, `game` subroutes.
- `HomeWorld` has `onPointerDown` for walk and `world-chick-action` for interaction; carefully separate new pointer gestures from scene approach.
- `src/api/telegram.ts` already manages `safeAreaInset`, content insets, stable viewport, `disableVerticalSwipes`; do **not** casually double count insets or globally set touch-action:none.
- `tgcloud/lib/store.js` uses per-player SQLite `revision` CAS; that's not automatically cross-player atomicity.
- `tgcloud/schema.js` includes completed 0.2 reset receipt table. **Never drop it.**
- v0.2 Flaps reward stored in `player.miniGameRewardAt`; Flaps record `player.flaps.bestScore`.
- Existing game server validation and receipts must not regress.

## 3. Multi-agent orchestration (really use agents if available)

You are the responsible orchestrator. If true subprocess/subagent facilities exist, spawn agents in parallel. If they do not, do all streams sequentially; do not pretend to have agents. Suggested **eight independent domains**:

**A — Telegram native layout and visual UI:** new theme tokens, HUD native-control safe zones, responsive fixed Home/Flaps, floating five-slot dock, transitions and `GlassSurface` fallback.

**B — Touchy Feel / character physics:** pointer gesture recognizer, lift/drag/land, petting, gaze/follow, keyframes/kinematics, no audio on sound-off, test extreme gene forms.

**C — Collection Hub & growth:** `Птенцы | Яйца`, incubator routes, Chick Card timeline `? / ?`, 3 age render, coming-soon Shop UI, forms.

**D — Social backend/profile/privacy/friends:** model, endpoints, invite links, private/friends/public, blocking, authorization, public DTO, rate limits.

**E — Gifts cross-account correctness:** investigate SDK transactional properties, implement atomic/escrow safe offer/accept/cancel/expiry, proof with real SQLite concurrency; no unsafe dual writes.

**F — Game rewards & records:** per-game registry and persisted stats, one-time 0.2 Flaps migration, leaderboard-ready metadata only, tests.

**G — Social frontend/share/visits:** public profiles, list friends, accept/decline, public pet share cards, copied/deep links, visit read-only HomeWorld, gift UX with confirm/errors.

**H — QA + security + performance:** integration, browser and native adapters, tests for social auth/gift races, screenshots light/dark/320–430px, CI, secrets review.

**YOU — integration owner:** final contracts, `src/App.tsx`, shared `src/types.ts`, `src/i18n.ts`, `tgcloud/schema.js` concurrency, cross-agent code review, deployment, PR and verification.

Rules:
1. Create `DOCS/CONTRACT_0.3.md` **before parallel implementation**, with explicit types and functions for every shared interface.
2. Agree exact names of methods, DTO, error contracts, gift semantics, friend visibility and state transitions.
3. Partition file ownership; prohibit two agents rewriting same file in shared worktree. Shared files only integrator or coordinated commit.
4. Integrate vertical slices early, not on last day.
5. Every agent must supply evidence and tests; orchestrator runs the final full test suite, not only repeats agent claims.
6. Maintain one task board/checklist with clear P0 statuses. No separate PR per subagent and no merge to main until owner accepts.

## 4. UI and dark theme specifics

Current owner screenshots show muddy dark #202220-ish surfaces and weak separation. Explore 2–3 tokenized themes, then choose the most legible. Starting candidates are defined in GDD 0.3: `#131719` background, `#1C2225` surface, `#F1F3F0` text, desaturated sage accents, warm gold for small highlights.

**Native HUD:** it currently visually collides with Telegram Close/Back and top-right system buttons. Do not assume the native top safe area alone is enough; test protected center slot with realistic overlays. Small header 38–46 px, icons/text adaptively condensed, relocate feather badge to safe secondary row if needed. Keep proper accessibility target sizes where clickable. Chippster Flaps header/counter must move below native overlap too.

**Dock:** one floating translucent pill above the bottom edge with air gap, rounded glass, modest translucent indicator. MaxWidth suited to phone, 5 labels legible. Middle Home stronger. Do not use Telegram screenshot as exact asset to copy. Safe area and keyboard. `Collection` now contains active `Птенцы | Яйца` with functioning incubator. Keep collection scroll and old routes redirected.

**Transitions:** 180–280ms (start target), avoid double navigation/unmounted overlays, reduced-motion fallback. Full viewport Home fixed. Preserve internal scroll elsewhere.

**Shop:** use honest disabled coming-soon content. No money/virtual purchases yet.

## 5. Touchy Feel + anatomy: product-quality target

Build gesture states `idle/approach/tap/stroke/hold/pickup/drag/land` with priority over ambient walk and below server sleep/care where appropriate. Distinguish stroke vs drag by movement trajectory, duration and gesture thresholds. React event callbacks should not re-render the entire SVG/world at 60fps; use RAF and controlled render transforms.

**Tap:** expressive randomized nonrepeating response.
**Hold:** around 250ms (tune for real touch) lifts chick, legs dangle, head reorients.
**Drag:** follow finger with responsive damped spring/small inertia; wing/head/tail react to acceleration; contact shadow remains in the world plane.
**Release:** bounded safe landing, squash/stretch only subtly, separate landed emotion.
**Stroke:** gentle petting feels different from drag (eyes close/blink/head lean).
**Follow/look:** nearby pointer moves eyes/head; tap ground requests approach without duplicate pet tap.
**Idle:** small occasional preen/peck/turn/look/yawn, not repetitive mechanical bouncing.
**Sleep:** no lift-cancels-sleep exploit; graceful quiet response only.

Test pointercancel, multi-touch, unfocus, tab change, active chick switch, reduced motion, scene bounds. Prevent gestures from reaching native UI, buttons, or interfering with vertical scroll outside world.

Render anatomy-aware poses for head/neck/legs/feet/wings/tail/beak in all selected generator extremes and ages. Keep ground contact stable; stop RAF on hidden webview. Preserve Chippster Flaps flying animation.

## 6. Growth history UI

In bird detail show:

- baby: `Птенец → ? → ?`;
- teen: `Птенец → Подросток → ?`;
- adult: `Птенец → Подросток → Взрослая`.

Select an **unlocked** stage to preview same chick genes with corresponding developmental renderer; server stage and care progress remain unchanged. Locked stages must not reveal graphics through hidden DOM or public API, not only CSS overlay. If adding timestamps for transitions, introduce non-destructive optional fields with compatible defaults.

## 7. Game registry / feathers / records

Implement an extensible server-authoritative `games` / `gameId` registry with known gameIds, configVersion, scoreType, cooldown, reward and anti-abuse policy.

Migrate:
- old `player.flaps.bestScore/completedRuns/lastPlayedAt` into per-game records;
- old `player.miniGameRewardAt` into `chippster-flaps` last rewarded/cooldown.
No early bonus upon deployment and no deletion of old receipts.

Flaps remains the only playable 0.3 game. +1 feather only on valid completion and per-game 20h cooldown, independent of claimed score. Care reward remains separate. Unknown gameId, foreign owner, replay and parallel requests reject/dedupe. Test new game config as fixture only; don't expose an unfinished second game.

Prepare **data architecture** for global/friends/season leaderboards without public UI or claim that browser score is cheat-proof. Do not display fabricated ranks.

## 8. Social & privacy: work end-to-end

Social features are **real P0**, not merely 'backend foundation':
- private by default; `friends` / `public` opt-in; collection visibility separate from profile;
- send/accept/reject friend requests, remove/unfriend, block unwanted users, list friends;
- Telegram supported deep-link `startapp` invites; correctly preserve intended profile when a new player must onboard first;
- sharing a printable/exportable/or Telegram-friendly original pet card plus link, with safe fallback if native media sharing not supported;
- read-only visits showing a friend's allowed active bird (reuse 2.5D scene), no foreign mutation;
- gift offer/accept/reject/revoke/expire between confirmed friends, with secure ownership transfer and preserved ID/genes/name/date.

For public browsing expose a purpose-built whitelist DTO; NEVER return entire `state_json` or receipts. Do not publish raw Telegram IDs in URLs if avoidable; use opaque tokens. Invite tokens are rotatable/revocable and permission checked at time of read. Rate-limit requests, social actions and repeated lookups. No contacts/phone permission.

**Gifts are special.** Per-user CAS cannot guarantee atomic transfer between A/B. Research the SDK supported SQLite raw syntax/transaction guarantees and implement one of:
1. demonstrably atomic conditional update covering both owners, including owner/permission revision constraints; or
2. a real durable escrow with one authoritative owner and idempotent claim/rollback/resume transitions.

**Prove** concurrent accept/cancel/timeouts/lost response/restart with actual SQLite tests, not mocked Promise resolution alone. Never give a bird to two owners or make it permanently disappear. Recipient can accept/decline; sender cancel until claim; active or only bird cannot be gifted. Pending reserved bird may not be switched active/gifted again. Gift completion does not mint a new bird or feather.

If platform truly cannot support safe inter-user transfer, keep the gift endpoint **disabled**, mark BLOCKED in acceptance, describe exact failed proofs and a feasible alternative; still finish rest of 0.3. Do not call the release completely done while unsafe gift P0 remains blocked.

## 9. Data, migrations, performance and security

Current 0.2 game is live; player state uses CAS in `chipper_players` and `chipper_release_operations` includes the completed clean-start receipt. **DO NOT delete tables, replay reset, wipe profiles, force schema changes, or drop receipts**.

Create only justified additive schema changes, via supported `tgcloud migrate --dry-run` and reviewed `--safe` path. Note SDK no foreign keys. Every state migration should be lazy, idempotent, CAS-safe with concurrent sessions and no early game reward. Keep identity from verified `ctx.initData.user.id`, never client userId.

Potential new social separate tables need proper unique keys and ownership (friend-pair ordering, gift state, token hashes) and safe change ordering. Sensitive personal fields minimal. IDs are not permissions. Social read endpoints must never accidentally create foreign player state.

Do not leak API tokens, initData or players' private details in logs/PR. Do not place credentials in repo. Maintain devMock compile-time dev-only. Avoid background perpetual timers in inactive WebViews; use stable viewport and lightweight motion/glass layers for Android.

Existing one-time reset completed in v0.2: **do not execute `scripts/reset-game-v0.2.mjs`**. Do not remove the release receipt `chipper-v0.2-clean-start`. Do not redeploy old v0.1 runtime even for rollback; it is forbidden after the reset fence.

## 10. End-to-end implementation phases (continue to completion)

**Phase 0 — reconnaissance/contract:**
- Inspect Git main, baseline CLI/SDK, tests.
- Create feature branch from actual main.
- Create `DOCS/CONTRACT_0.3.md` and concise implementation plan/ownership.
- Triage social/gift transaction feasibility with early proof, don't postpone it until the end.

**Phase 1 — parallel development:**
- UI dark/light, top system safe HUD, floating dock, Collection Hub/Shop;
- Touchy Feel, animation, evolution timeline;
- game registry/rewards/migration;
- social privacy/friends/share/visits;
- safe gifts;
- tests/performance.
Keep integrator working on cross-component APIs early.

**Phase 2 — integrate true user flows:**
- launch old 0.2 user -> Home -> tap/lift/stroke -> Collection/eggs -> view past stage -> Flaps score/reward -> Profile -> invite -> friend request -> accept -> visit -> gift offer -> accept -> owned by recipient;
- refresh and network faults at each stage;
- light/dark and low-height WebView.

**Phase 3 — Quality gates:**
- `npm ci`, `npm run check`, `npm run test:ui`, plus social/perf/concurrency tests.
- All acceptance IDs in `DOCS/ACCEPTANCE_0.3.md` must be reported PASS/PENDING/BLOCKED/FAIL.
- Screenshot evidence in `DOCS/qa/0.3/` for light/dark, native-header overlay, floating dock, Home, shop, Collection eggs, stages, drag in progress, social visiting/gifts, Flaps.
- Inspect screenshots visually; fix ugly/dead overlays and too-dark contrasts.
- Existing 0.2 tests still pass; list actual new totals, not 0.2 historical counts.
- No mocked Telegram identity presented as live signed user evidence.

**Phase 4 — safe Beta release (owner previously allowed normal verified deploys):**
- Verify exact `@chipperhatcherybot` / App ID `8924974998` and live cloud revision.
- Read-only `tgcloud fetch/status/diff`, review unexpected changes.
- Record current working code SHA and rollback/fix-forward plan.
- Review schema dry-run and destructive differences. **No force, no reset, no drop**.
- Deploy only when mandatory security/regression P0 gates pass; user previously approved safe releases to this beta bot.
- Confirm cloud revision, real URL and correctness of App menu. Real Telegram A/B/C acceptance is still the owner's task; do not invent a successful multiple-account test.
- If lack of credentials, unsafe cloud diff or migration, stop **only** cloud write; complete PR and provide exact owner steps.
- If rollout introduces social DB changes not compatible with old 0.2, don't recommend naive rollback to old backend. Use tested fix-forward or explicitly validated compatibility path.

**Phase 5 — one PR and report:**
- Update `README.md` and `AGENTS.md` to 0.3, respecting SDK lessons.
- Create `DOCS/ARCHITECTURE_0.3.md`, `DOCS/IMPLEMENTATION_0.3.md`, `DOCS/ACCEPTANCE_RESULT_0.3.md` with accurate implementation.
- Open `feature/chipper-v0.3` → `main` PR and **DO NOT MERGE**.
- Report source SHA, PR URL, actual passed/failed test counts, all subagents, screenshot links, cloud status/deploy revision, data preservation, blockers and A/B/C owner test instructions.

## 11. Hard prohibitions

- No shallow Photoshop/CSS-only fix pretending to be Touchy Feel.
- No generic emoji or SVG copy replacing existing V2 birds.
- No fake store purchases, fake global leaderboard, fake friend list, fake gift transfer, fake Telegram sharing.
- No client-authoritative economy/social rights.
- No "DELETE A; INSERT B" gifts without atomic proof or escrow.
- No new Star/NFT/pay-to-revive mechanics.
- No extra DB reset, release receipt removal, dropping player rows, or silent changes to old bird genes.
- No force-push to main, no PR merge, no secrets in git.
- No stopping at plan/scaffold when full implementation can continue.

## 12. Final report format (in Russian)

1. **Status:** "Chipper 0.3 ready for owner acceptance" / "NOT ready" with specific blockers.
2. Git: base sha, feature sha, one PR URL; unmerged.
3. Subagents: actually spawned, ownership, completed work.
4. Each major P0: delivered behavior / regression / deferred explicitly with reason.
5. Tests: command/number passed/failed/blocked, browser snapshots.
6. Social/gifts: database invariants, real SQLite concurrency evidence, safe guest permissions.
7. Cloud: verified bot, current URL/revision, migration and beta deployment result.
8. Data: v0.2 progress preserved, no repeated reset.
9. Owner acceptance: A/B/C and A1/A2 steps, Android native top/dock/drag.
10. Known defects and precise safe rollback/fix-forward steps.

**Success is one cohesive working Chipper 0.3, not large lines-of-code output.** Complete all available work in one orchestrated run, truthfully separate automated evidence from owner live checks.
