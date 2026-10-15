# Chipper 0.5 — integration contract

Base: actual main `3764261bd7ab2531b87b47c240a3158022b02754` (owner merged 0.4). Branch `feature/chipper-v0.5`. This contract is written before parallel implementation. Prior 0.3/0.4 compatibility and economy invariants remain binding.

## Compatibility

Keep `schemaVersion=2`, `appearanceVersion=2`, `geneSchemaVersion=1`, original ID/genes/palette/rarity/name/birth/ownership/care history. No reset, reroll, receipt pruning or economy/cooldown changes. Renderer visual contract is separately `visualVersion=3`: pure deterministic details derived from ID + saved genes; no persisted visual migration. All portraits, exports, guest and games use the same renderer. No new genetic variants. Maintain 320×320 viewBox, anchors/ground y282 and existing CSS hooks.

Keep five tabs, SDK native chrome, viewport/safe areas, read-only guest and Touchy Feel. Decorative events never write currency or authoritative care. Reduced motion and hidden/deactivated stop ambient work. Static CSS backdrop filters only; fallback is opaque and explicit. No per-frame blur or shader.

## Ownership

| Workstream | Exclusive files |
| --- | --- |
| A UI | `src/app.css`, `src/navigation/**`, `src/design/**`, existing feature CSS except world/art/chicks; new `src/design/overhaul.css`; visual design doc |
| B characters | `src/chicks/renderer.ts`, `geometry.ts`, `models.ts`, `previewFixtures.ts`, `ChickGallery.tsx`, `gallery.css`; geometry/visual tests. No animation.ts/ChickArt/art.css edits |
| C animation + world | `src/chicks/animation.ts`, `src/components/ChickArt.tsx`, `src/art.css`, `src/world/**`; animation/world tests, animation doc |
| E/F server | `tgcloud/lib/exchanges.js`, new exchange endpoints/tests; `tgcloud/lib/domain.js`, `service.js`, `runtime.js`, `gifts.js`; achievements pure module/tests if safe. No schema edits without root coordination |
| Root | App/types/API/devMock/screens, docs/package/README/AGENTS, integration, QA and publication |

Agents never commit/push/deploy or overwrite other owners. Request shared changes from root. Assets/setup agents only restore immutable baseline assets and inspect environment.

## Exchange (saved GDD_0.3 §11 roadmap)

Implement bilateral consent for two explicitly selected inactive, nonlast, unreserved owned chicks; accepted unblocked friendship required. Pending24h, proposer reserves their offered chick; recipient's requested chick is rechecked at acceptance. One atomic two-player conditional UPDATE freezes both revisions, relationship, expiry and inventory guards. Both full original bird records move together; no currency. Cancellation/decline/expiry release reservation. Replays must not transfer twice, fresh-key terminal handling safe. Existing gifts/activation/rename must respect exchange reservation. No sequential two-gift implementation.

Envelope remains ApiResult. Frozen endpoints: `listExchanges({}) → result.exchanges`, `offerExchange({operationId,chickId,recipientProfileId,requestedChickId})`, `respondExchange({operationId,exchangeId,accept})`, `cancelExchange({operationId,exchangeId})`; mutations return `result.exchange`. DTO: `{exchangeId,sender:Peer,recipient:Peer,offeredChick:PublicChick,requestedChick:PublicChick,status,createdAt,expiresAt,completedAt}`. Public selection uses existing authorized public profile collection; private collections remain private.

Optional schemaVersion2 fields: `state.exchanges` mirrored compact records in BOTH owners, plus actor-only `state.exchangeReceipts[operationId]={fingerprint,exchangeId,at}`. Every offer/accept/decline/cancel history transition updates both mirrors in one pair CAS; list reads only own indexed player row, no incoming global scan. Full birds are read from original owned collections at acceptance, never reconstructed from previews. Requested bird is not reserved; offered bird Snapshot exposes optional `reservedExchangeId` alongside unchanged `reservedGiftId`. Shared domain/gift guards respect both reservation kinds. Game/gift/TD/exchange reject cross-namespace operation UUID reuse. No SQL schema/table/migration change. Expiry derives from monotonic server reconciliation time; list does not persist foreign expiry.

## Additional content

Achievements use a bounded server-derived catalogue using authoritative care telemetry, owned/discovered traits and existing game records; explicit claims + permanent CAS receipt for any reward. Client taps/decoration cannot unlock rewarded interactions. Frozen endpoints `getAchievements({}) → result.achievements` and `claimAchievement({operationId,achievementId}) → result.{achievementId,rewarded,rewardAmount,achievements}`. Snapshot sibling `achievements` contains `{version:1,achievements:[{id,title,description,category,target,progress,unlocked,claimed,rewardAmount}],found,total,claimed}`. The only persisted new player field is `{achievements:{version:1,claimed:{[fixedId]:serverTimestamp}}}`; unknown future versions fail safely, never prune fences.

Fixed catalogue12 × +1 feather lifetime cap/account: `first-feed`, `first-play`, `care-cycle`, `care-five`, `hatch-three`, `collection-three`, `codex-twenty`, `flaps-first`, `flaps-ten`, `nest-three`, `gift-first`, `exchange-first`. Reads do not pay; a fresh key after claimed returns ALREADY_CLAIMED, same key replays original result. Accepted gift/exchange writes authoritative social counters for BOTH owners inside existing atomic statement. No game/care/daily cooldown change, streak/death/absence punishment. Cosmetic shop is deferred to0.6 continuation as a current release decision, without fake purchase actions; historical GDD0.3 schedules Marketplace0.6 and decor later. Root implements collection comparison and personality display.

## Release limits

Production target8924974998/@chipperhatcherybot. Current user permits read-only identity/fetch/status/diff/preflight/dry-run only. No push/migrate/reset/force/webhook/remote mutation. Git feature branch and one PR to main authorized; never merge. Record actual checks and blockers, never convert browser emulation into physical-device PASS.
