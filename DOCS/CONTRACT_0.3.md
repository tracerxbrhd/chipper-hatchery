# Chipper 0.3 — общий контракт реализации

База: `e6218fe0f9cf8fb6d838bd71b1f17ca479dc793f`, ветка `feature/chipper-v0.3`. Все ответы используют существующий `ApiResult`: `{ok:true,state:Snapshot,result?:object}` либо `{ok:false,error:{code,message,retryable,retryAt?}}`. Identity исключительно verified `ctx.initData.user.id`. Mutations требуют UUID `operationId`; retry сохраняет payload/key. `schemaVersion:2` и существующие receipts/гены/баланс сохраняются, reset запрещён.

## Владение файлами

| Поток | Исключительное владение |
|---|---|
| Оркестратор | App.tsx, types.ts, i18n.ts, schema.js, runtime.js, service.js, screens/PetScreens.tsx, ProfileScreen.tsx, SocialScreens.tsx, social frontend/CSS, документы/package/README |
| UI | api/telegram.ts, navigation/**, design/**, app.css, games/flaps/flaps.css; согласованный FlapsGame HUD |
| Touch | world/**, chicks/**, components/ChickArt.tsx, art.css, touch/world/geometry tests |
| Social backend | lib/social.js, social endpoints, tests/social*.js |
| Gifts | lib/gifts.js, gift endpoints, tests/gifts*.js |
| Games | lib/gameRegistry.js, lib/domain.js, lib/flapsRules.js, screens/GameScreens.tsx, game registry tests |
| QA | tests/ui/v03*.spec.ts, новые QA utilities, DOCS/qa/0.3; старые тесты по согласованию |

Shared edits передавать оркестратору. Не делать commit всех чужих файлов; итоговый commit/push/PR выполняет оркестратор.

## Навигация и представление

Tab = `shop|collection|home|activities|profile`. Внутренний legacy `incubator` redirect → collection/eggs; CollectionSection = chicks|eggs. HomeWorld прежние props + `readOnly?:boolean`, `onTouchFeedback?:(kind:string)=>void`; readOnly запрещает пользовательский carry/ground commands (ambient допустим), не имеет серверных действий. Touch добавляет poses tap/stroke/held/land/look, bounded local state; sleep > carry > care/grow > walk > ambient. Render past age через `{...chick,stage:unlockedStage}`, будущий renderer не создаётся.

## Игры

GameId = `chippster-flaps`; optional `gameId` start/finish по умолчанию Flaps для старых callers. Неизвестные IDs reject. `player.games[gameId] = {configVersion,scoreType,bestScore,completedRuns,lastPlayedAt,lastRewardAt,scoreTrust:'casual'}`. Lazy idempotent migration из flaps/miniGameRewardAt, старые поля поддерживаются как совместимые aliases, cooldown20ч не сбрасывается. Snapshot отдаёт registry records, нет leaderboard endpoint/UI.

## Социальные типы и SQLite

Visibility = private|friends|public. `SocialProfile = {profileId,displayName,visibility,collectionVisibility,inviteToken:string|null,shareToken:string|null}`; только собственному caller. `PublicChick = Pick<Chick,'id'|'appearanceVersion'|'genes'|'appearanceId'|'rarity'|'name'|'bornAt'|'stage'>`, никакого care/receipt/telegramId. `Peer = {profileId,displayName,canVisit?:boolean}`. `FriendRequest = {requestId,from:Peer,to:Peer,status:'pending'}`. `SocialSummary={profile:SocialProfile,friends:Peer[],incoming:FriendRequest[],outgoing:FriendRequest[],blocked:Peer[],giftsEnabled:true}`.

`PublicProfile={profileId,displayName,relationship:'self'|'friend'|'incoming'|'outgoing'|'none'|'blocked',accessible:boolean,activeChick:PublicChick|null,chicks:PublicChick[]|null,collectionVisible:boolean}`. Private invite may resolve only minimal target for consent request; no bird. Authorization rechecked each lookup/visit/share; unavailable anonymous target returns generic error.

Tables (additive, schema owned by integrator):
- chipper_social_profiles: telegram_id PK, public_id unique immutable opaque64hex, revision integer default0, display_name, visibility default private, collection_visibility default private, invite_token nullable unique, share_token nullable unique, receipts_json TEXT default '{}', updated_at.
- chipper_friendships: pair_key PK canonical numeric min:max (server-only), friendship_id unique opaque64hex (requestId), low_id/high_id, requested_by, status pending|accepted|declined|removed, low_blocked/high_blocked integer default0, revision default0, receipts_json TEXT default '{}', created_at/updated_at. Accept/block and corresponding durable receipt operate on same row with CAS. Gifts check `status='accepted' AND low_blocked=0 AND high_blocked=0`.
- chipper_social_limits: key PK, window_start/count, seen_json TEXT default '{}', atomic rate UPSERT dedupes identical validated method/target/operationId within a window.
Receipts are scoped to the profile/pair row, keyed actor:operationId; repeat payload conflicts reject in that scope. No separate operations table: state transition and receipt share the same atomic UPDATE. Retry returns current permissions/summary, never replays a foreign private DTO. Fixed-minute atomic limits:12 writes,6 new requests,60 foreign lookups; successful durable retries bypass repeated charging.

`createSocialService({database,gameService,now,id})` returns `.call(method,input,ctx)`. Profile provisioning only own existing player. Social game snapshot obtained via gameService.getHome, no foreign bootstrap. Export `friendPairKey(a,b)`, `areFriends(database,a,b)`, `publicChick(chick)`, `peerFor(database,telegramId)` for gifts.

Methods and result fields:
- getSocial({}) → `{social:SocialSummary}`.
- updatePrivacy({operationId,visibility,collectionVisibility,displayName?}) → `{social}`.
- createSocialLink({operationId,kind:'invite'|'profile'|'chick',chickId?,revoke?:boolean}) → `{link:{token,url,kind,chickId?}|null,social}`. Invite token independent, profile/chick use share token + optional chickId; no private share. Opaque startapp `i_TOKEN`, `p_TOKEN`, `c_TOKEN_CHICKID` URL-safe max512.
- resolveSocialLink({token,kind:'invite'|'profile'|'chick',chickId?}) → `{profile:PublicProfile}`.
- getPublicProfile({profileId,chickId?}) / visitProfile({profileId}) → `{profile}` under permissions.
- sendFriendRequest({operationId,profileId,inviteToken?}) → `{social}`. New requests to private/friends profiles require the current inviter token; opaque profileId alone grants no access. Public targets may receive requests without a token. A private invite resolves only intentionally shared consent label/opaque target, never active bird or collection.
- respondFriendRequest({operationId,requestId,accept:boolean}), removeFriend({operationId,profileId}), blockUser({operationId,profileId,blocked:boolean}) → `{social}`.

Each fresh invitation after decline/removal receives a new opaque requestId; a stale requestId cannot accept a later invitation. Reciprocal pending requests do not auto-accept.

Public lookup combines profile/player/friend/token authorization in one SQL SELECT. Collection visibility is checked independently after profile access. Sharing an inactive bird requires collection visibility, and all links are rechecked on resolution; rotation/revocation invalidates earlier tokens immediately. `getPublicProfile` denied access returns a generic unavailable error; invite-only consent may return inaccessible minimal PublicProfile. Reads reconcile a cloned permitted snapshot and never persist foreign state. `peerFor` returns Peer|null; `publicChick` returns the visual whitelist; friendship consent shares aliases independently from private bird visibility.

## Подарки

Offers persist in sender aggregate `state.gifts`. Chick reservation derived from pending unexpired offers, blocks activation/rename/second offer. GiftDTO = `{giftId,sender:Peer,recipient:Peer,chick:PublicChick,status:'pending'|'accepted'|'declined'|'cancelled'|'expired',createdAt,expiresAt,completedAt:number|null}`. Sender offers only nonactive, nonlast, accepted friend. TTL24h. Existing identity/name/genes/bornAt/milestones/needs/cooldowns preserved; recipient does not get feathers. Recipients must complete onboarding before acceptance.

GiftId = `${immutableSenderPublicId}.${serverUuid}`; opaque namespace uniquely identifies source without exposing Telegram ID. Durable actor-specific gift receipts live in optional `state.giftReceipts`, preserved by normal aggregate CAS. Terminal received history remains discoverable by its actual recipient after unfriend/block. Friendship removal or block prohibits accepting pending gifts; decline/cancel remain available and expiry releases reservation.

`createGiftService({database,store,gameService,now,id})` returns call. listGifts({}) → `{gifts:GiftDTO[]}`. offerGift({operationId,chickId,recipientProfileId}); respondGift({operationId,giftId,accept:boolean}); cancelGift({operationId,giftId}) → `{gift:GiftDTO}` with caller state. All known terminal gift retry stays safe. Wrong participant rejected.

Acceptance uses ONE multi-row SQLite UPDATE with CASE sender/recipient JSON and MATERIALIZED eligible CTE freezing both revision guards + accepted/unblocked friend pair BEFORE updates. Both snapshots and sender terminal history/recipient receipt commit together. Outcome exactly2 rows or0; never independent delete/add. Cancel/expiry CAS sender revision; concurrent friendship revoke checked in atomic statement. Local real SQLite proves SQL/races/crash-before/after/retry; cloud syntax support requires read-only probe before deploy. No gift table/DDL triggers/transactions required. Expose `isChickReserved(state,chickId,now)` from gifts or implement equivalent domain guard without circular imports.

## Проверка и релиз

npm ci/check/test:ui + real SQLite social/gifts/game migration; screenshots320/360/390/430 light/dark and overlays. Mock is compile-time dev-only, never signed-live evidence. Cloud requires credentials, verified8924974998/@chipperhatcherybot, fetch/status/diff, additive dry-run, rollback checkpoint. No cloud write without gates. No merge/force/reset.
