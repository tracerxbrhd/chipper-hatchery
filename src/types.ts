export type Stage = 'baby' | 'teen' | 'adult';
export type Rarity = 'common' | 'uncommon' | 'rare';
export type CareAction = 'feed' | 'play' | 'sleep';
export interface Chick {
  id: string; appearanceId: string; rarity: Rarity; name: string; bornAt: number;
  stage: Stage; hunger: number; mood: number; energy: number;
  lastFeedAt: number | null; lastPlayAt: number | null; sleepUntil: number | null;
  careMilestones: number[];
}
export interface Egg { id: string; kind: 'starter' | 'ordinary'; createdAt: number; readyAt: number }
export interface Snapshot {
  revision: number; serverNow: number; balanceVersion: string;
  player: { telegramId: string; feathers: number; activeChickId: string | null;
    onboarding: 'egg' | 'name' | 'done'; careRewardAt: number | null; miniGameRewardAt: number | null };
  chicks: Chick[]; egg: Egg | null;
}
export interface ApiError { code: string; message: string; retryable: boolean; retryAt?: number }
export type ApiResult = { ok: true; state: Snapshot; result?: Record<string, unknown> } | { ok: false; error: ApiError };
export type Method = 'bootstrap' | 'getHome' | 'listChicks' | 'getIncubator' | 'hatchEgg' | 'completeOnboarding' | 'careAction' | 'activateChick' | 'renameChick' | 'buyEgg' | 'startMiniGame' | 'finishMiniGame' | 'logEvent';
