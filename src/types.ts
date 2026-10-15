export type Stage = 'baby' | 'teen' | 'adult';
export type Rarity = 'common' | 'uncommon' | 'rare';
export type CareAction = 'feed' | 'play' | 'sleep';
export interface ChickGenesV2 {
  geneSchemaVersion: 1;
  headShape: 'round' | 'oval' | 'puffed' | 'tall' | 'wide';
  bodyShape: 'pear' | 'compact' | 'oval' | 'stocky';
  eyeStyle: 'big' | 'small' | 'curious' | 'sleepy';
  beakShape: 'triangle' | 'short' | 'wide' | 'curved';
  legShape: 'stubby' | 'slender' | 'sturdy';
  wingShape: 'rounded' | 'pointed' | 'fluffy' | 'small';
  tailShape: 'short' | 'fan' | 'curled' | 'feathery';
  crestShape: 'none' | 'tiny' | 'tuft' | 'three-feather' | 'messy';
  pattern: 'solid' | 'belly-patch' | 'spotted' | 'striped' | 'speckled' | 'split';
  colors: { body: string; head: string; wing: string; belly: string; tail: string; marking: string; beak: string; legs: string };
  detailVariant: number;
}
export interface Chick {
  appearanceVersion: 2; genes: ChickGenesV2;
  id: string; appearanceId: string; rarity: Rarity; name: string; bornAt: number;
  stage: Stage; hunger: number; mood: number; energy: number;
  lastFeedAt: number | null; lastPlayAt: number | null; sleepUntil: number | null;
  careMilestones: number[];
  reservedGiftId?: string;
  reservedExchangeId?: string;
}
export interface GameRecord { configVersion: string; scoreType: string; bestScore: number; completedRuns: number; lastPlayedAt: number | null; lastRewardAt: number | null; scoreTrust: 'casual' | 'verified' }
export type Visibility = 'private' | 'friends' | 'public';
export type PublicChick = Pick<Chick, 'id' | 'appearanceVersion' | 'genes' | 'appearanceId' | 'rarity' | 'name' | 'bornAt' | 'stage'>;
export interface GuestChickDTO { profileId: string; displayName: string; chick: PublicChick | null; checkedAt: number }
export interface DailyBonusStatus { available: boolean; rewardAmount: number; dayUTC: number; lastClaimDayUTC: number | null; nextResetAt: number }
export interface TraitCodexStatus { version: number; discoveredIds: string[]; total: number; found: number }
export interface TelegramIdentity { firstName: string; lastName: string; username: string | null; photoUrl: string | null; verifiedAt: number }
export interface Peer { profileId: string; displayName: string; canVisit?: boolean }
export interface FriendRequest { requestId: string; from: Peer; to: Peer; status: 'pending'; createdAt?: number }
export interface SocialProfile extends Peer { visibility: Visibility; collectionVisibility: Visibility; inviteToken: string | null; shareToken: string | null }
export interface SocialSummary { profile: SocialProfile; friends: Peer[]; incoming: FriendRequest[]; outgoing: FriendRequest[]; blocked: Peer[]; giftsEnabled: boolean }
export interface PublicProfile extends Peer { relationship: 'self' | 'friend' | 'incoming' | 'outgoing' | 'none' | 'blocked'; accessible: boolean; activeChick: PublicChick | null; chicks: PublicChick[] | null; collectionVisible: boolean; invited?: boolean }
export interface SocialLink { token: string; url: string; kind: 'invite' | 'profile' | 'chick'; chickId?: string }
export interface Gift { giftId: string; sender: Peer; recipient: Peer; chick: PublicChick; status: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired'; createdAt: number; expiresAt: number; completedAt: number | null }
export interface Exchange { exchangeId: string; sender: Peer; recipient: Peer; offeredChick: PublicChick; requestedChick: PublicChick; status: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired'; createdAt: number; expiresAt: number; completedAt: number | null }
export interface AchievementEntry { id: string; title: string; description: string; category: string; target: number; progress: number; unlocked: boolean; claimed: boolean; rewardAmount: number }
export interface AchievementStatus { version: 1; achievements: AchievementEntry[]; found: number; total: number; claimed: number }
export interface Egg { id: string; kind: 'starter' | 'ordinary'; createdAt: number; readyAt: number }
export interface Snapshot {
  revision: number; serverNow: number; balanceVersion: string;
  player: { telegramId: string; feathers: number; activeChickId: string | null;
    onboarding: 'egg' | 'name' | 'done'; careRewardAt: number | null; miniGameRewardAt: number | null;
    flaps: { bestScore: number; completedRuns: number; lastPlayedAt: number | null }; games?: Record<string, GameRecord>;
    dailyBonus?: { lastClaimDayUTC: number | null; lastClaimAt: number | null; claimsTotal: number };
    discoveredTraits?: { version: 1; ids: string[] }; telegramIdentity?: TelegramIdentity | null };
  chicks: Chick[]; egg: Egg | null; dailyBonus?: DailyBonusStatus; codex?: TraitCodexStatus; achievements?: AchievementStatus;
}
export interface ApiError { code: string; message: string; retryable: boolean; retryAt?: number }
export type ApiResult = { ok: true; state: Snapshot; result?: Record<string, unknown> } | { ok: false; error: ApiError };
export type Method = 'bootstrap' | 'getHome' | 'listChicks' | 'getIncubator' | 'hatchEgg' | 'completeOnboarding' | 'careAction' | 'activateChick' | 'renameChick' | 'buyEgg' | 'startFlapsRun' | 'finishFlapsRun' | 'logEvent' | 'getSocial' | 'updatePrivacy' | 'createSocialLink' | 'resolveSocialLink' | 'getPublicProfile' | 'visitProfile' | 'sendFriendRequest' | 'respondFriendRequest' | 'removeFriend' | 'blockUser' | 'listGifts' | 'offerGift' | 'respondGift' | 'cancelGift' | 'getDailyBonus' | 'claimDailyBonus' | 'listTraitCodex' | 'getGuestChick' | 'startTowerRun' | 'getTowerRun' | 'checkpointTowerRun' | 'finishTowerRun' | 'getAchievements' | 'claimAchievement' | 'listExchanges' | 'offerExchange' | 'respondExchange' | 'cancelExchange';
