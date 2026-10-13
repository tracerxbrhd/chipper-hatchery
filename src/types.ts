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
}
export interface Egg { id: string; kind: 'starter' | 'ordinary'; createdAt: number; readyAt: number }
export interface Snapshot {
  revision: number; serverNow: number; balanceVersion: string;
  player: { telegramId: string; feathers: number; activeChickId: string | null;
    onboarding: 'egg' | 'name' | 'done'; careRewardAt: number | null; miniGameRewardAt: number | null;
    flaps: { bestScore: number; completedRuns: number; lastPlayedAt: number | null } };
  chicks: Chick[]; egg: Egg | null;
}
export interface ApiError { code: string; message: string; retryable: boolean; retryAt?: number }
export type ApiResult = { ok: true; state: Snapshot; result?: Record<string, unknown> } | { ok: false; error: ApiError };
export type Method = 'bootstrap' | 'getHome' | 'listChicks' | 'getIncubator' | 'hatchEgg' | 'completeOnboarding' | 'careAction' | 'activateChick' | 'renameChick' | 'buyEgg' | 'startFlapsRun' | 'finishFlapsRun' | 'logEvent';
