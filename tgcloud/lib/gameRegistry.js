import { FLAPS_CONFIG } from './flapsRules.js';

export const FLAPS_GAME_ID = 'chippster-flaps';
export const TOWER_GAME_ID = 'nest-defense';
const HOUR = 60 * 60 * 1000;

/** Only deployed, reviewed games can issue runs or rewards. No client config. */
export const GAME_REGISTRY = Object.freeze({
  [TOWER_GAME_ID]: Object.freeze({
    gameId: TOWER_GAME_ID, title: 'Защита гнезда', configVersion: 'nest-defense-1',
    scoreType: 'wave', scoreTrust: 'verified',
    rewardPolicy: Object.freeze({ amount: 4, cooldownMs: 20 * HOUR,
      tiers: Object.freeze([{ wave: 3, amount: 1 }, { wave: 8, amount: 2 }, { wave: 15, amount: 3 }, { wave: 25, amount: 4 }]) }),
    antiAbuse: Object.freeze({ minDurationMs: 0, attemptTtlMs: 24 * HOUR, startLimit: 6, startWindowMs: 60000 }),
    leaderboard: Object.freeze({ enabled: false, scopes: Object.freeze([]), seasonId: null, scoreTrust: 'verified' }),
  }),
  [FLAPS_GAME_ID]: Object.freeze({
    gameId: FLAPS_GAME_ID,
    title: 'Chippster Flaps',
    configVersion: FLAPS_CONFIG.configVersion,
    scoreType: 'points',
    scoreTrust: 'casual',
    rewardPolicy: Object.freeze({ amount: 1, cooldownMs: 20 * HOUR }),
    antiAbuse: Object.freeze({ minDurationMs: 2000, attemptTtlMs: 10 * 60 * 1000,
      startLimit: 6, startWindowMs: 60000, maxScore: 10000 }),
    // These dimensions make future aggregation possible; no ranking is served.
    leaderboard: Object.freeze({ enabled: false, scopes: Object.freeze(['global', 'friends']),
      seasonId: null, scoreTrust: 'casual' }),
  }),
});

export function gameConfig(gameId = FLAPS_GAME_ID) {
  return typeof gameId === 'string' && Object.hasOwn(GAME_REGISTRY, gameId) ? GAME_REGISTRY[gameId] : null;
}

function score(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function timestamp(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function latest(a, b) {
  return a === null ? b : b === null ? a : Math.max(a, b);
}

export function emptyGameRecord(config) {
  return { configVersion: config.configVersion, scoreType: config.scoreType,
    bestScore: 0, completedRuns: 0, lastPlayedAt: null, lastRewardAt: null,
    scoreTrust: config.scoreTrust };
}

/**
 * Lazy additive 0.2 migration. Keeping the most recent legacy reward timestamp
 * also protects against an old 0.2 session finishing while the update rolls out.
 * No resources, receipts, runs, or bird genes are changed here.
 */
export function migrateGameRecords(player) {
  player.games ??= {};
  const config = GAME_REGISTRY[FLAPS_GAME_ID];
  const previous = player.games[FLAPS_GAME_ID] ?? emptyGameRecord(config);
  const legacy = player.flaps ?? {};
  const record = {
    configVersion: config.configVersion, scoreType: config.scoreType,
    bestScore: Math.max(score(previous.bestScore), score(legacy.bestScore)),
    completedRuns: Math.max(score(previous.completedRuns), score(legacy.completedRuns)),
    lastPlayedAt: latest(timestamp(previous.lastPlayedAt), timestamp(legacy.lastPlayedAt)),
    lastRewardAt: latest(timestamp(previous.lastRewardAt), timestamp(player.miniGameRewardAt)),
    scoreTrust: config.scoreTrust,
  };
  player.games[FLAPS_GAME_ID] = record;
  syncLegacyAliases(player, record);
  player.games[TOWER_GAME_ID] ??= emptyGameRecord(GAME_REGISTRY[TOWER_GAME_ID]);
  return player.games;
}

function syncLegacyAliases(player, record) {
  player.flaps = { bestScore: record.bestScore, completedRuns: record.completedRuns,
    lastPlayedAt: record.lastPlayedAt };
  player.miniGameRewardAt = record.lastRewardAt;
}

export function gameRewardNextAt(record, config, now) {
  return record.lastRewardAt === null || now - record.lastRewardAt >= config.rewardPolicy.cooldownMs
    ? null : record.lastRewardAt + config.rewardPolicy.cooldownMs;
}

/** Called only after server-issued run/owner/time/score validation, inside CAS. */
export function recordGameCompletion(player, config, { score: completedScore, now, durationMs }) {
  player.games ??= {};
  const record = player.games[config.gameId] ?? (player.games[config.gameId] = emptyGameRecord(config));
  const previousBest = record.bestScore;
  const tooShort = durationMs < config.antiAbuse.minDurationMs;
  const rewarded = !tooShort && gameRewardNextAt(record, config, now) === null;
  if (rewarded) {
    player.feathers += config.rewardPolicy.amount;
    record.lastRewardAt = now;
  }
  record.bestScore = Math.max(previousBest, completedScore);
  record.completedRuns += 1;
  record.lastPlayedAt = now;
  record.configVersion = config.configVersion;
  if (config.gameId === FLAPS_GAME_ID) syncLegacyAliases(player, record);
  return { gameId: config.gameId, score: completedScore, previousBest, bestScore: record.bestScore,
    newBest: completedScore > previousBest, rewarded, rewardNextAt: gameRewardNextAt(record, config, now),
    reason: rewarded ? 'rewarded' : tooShort ? 'too_short' : 'cooldown' };
}
