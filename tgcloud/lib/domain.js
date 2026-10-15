/** Chipper's deterministic rules. No platform or browser dependencies. */
import { CHICK_PRESETS, generateGenes, validGenes } from './chickGenes.js';
import { maximumPlausibleScore } from './flapsRules.js';
import { claimDailyBonus, dailyBonusStatus } from './dailyBonus.js';
import { discoverOwnedTraits, discoverChickTraits, traitCodexStatus } from './traitCodex.js';
import { FLAPS_GAME_ID, gameConfig, migrateGameRecords, recordGameCompletion } from './gameRegistry.js';
import { achievementStatus, claimAchievement } from './achievements.js';
const HOUR = 60 * 60 * 1000;

export const BALANCE = Object.freeze({
  version: '0.5.0',
  hourMs: HOUR,
  careCooldownMs: 4 * HOUR,
  careCycleWindowMs: 30 * 60 * 1000,
  rewardCooldownMs: 20 * HOUR,
  sleepDurationMs: 45 * 60 * 1000,
  incubationMs: 3 * HOUR,
  eggCost: 6,
  teenAgeMs: 20 * HOUR,
  adultAgeMs: 72 * HOUR,
  miniGameMinDurationMs: 2000,
  miniGameAttemptTtlMs: 10 * 60 * 1000,
  miniGameStartLimit: 6,
  miniGameStartWindowMs: 60000,
  minNeed: 35,
  initialNeeds: Object.freeze({ hunger: 65, mood: 60, energy: 70 }),
  decayPerHour: Object.freeze({ hunger: 1.2, mood: 0.9, energy: 1.1 }),
  careEffects: Object.freeze({ feed: 30, play: 22 }),
});

export const APPEARANCES = CHICK_PRESETS;

export class GameError extends Error {
  constructor(code, message, { retryable = false, retryAt } = {}) {
    super(message);
    this.name = 'GameError';
    this.code = code;
    this.retryable = retryable;
    this.retryAt = retryAt;
  }
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const READ_METHODS = ['bootstrap', 'getHome', 'listChicks', 'getIncubator', 'getDailyBonus', 'listTraitCodex', 'getAchievements'];
const PARAMS = Object.freeze({
  claimDailyBonus: [],
  claimAchievement: ['achievementId'],
  hatchEgg: ['eggId'],
  completeOnboarding: [],
  careAction: ['chickId', 'action'],
  activateChick: ['chickId'],
  renameChick: ['chickId', 'name'],
  buyEgg: [],
  startMiniGame: [],
  finishMiniGame: ['attemptId', 'score'],
  startFlapsRun: ['gameId'],
  finishFlapsRun: ['gameId', 'runId', 'score', 'endReason'],
  logEvent: ['event', 'details'],
});

export function isReadMethod(method) {
  return READ_METHODS.includes(method);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLAIN_OBJECT = (value) => value !== null && typeof value === 'object'
  && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

function hasControlCharacters(value) {
  return Array.from(value).some((character) => {
    const code = character.codePointAt(0);
    return code <= 31 || (code >= 127 && code <= 159);
  });
}

function requireId(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 128 || /\s/u.test(value) || hasControlCharacters(value)) {
    throw new GameError('INVALID_REQUEST', 'Некорректный идентификатор.');
  }
  return value;
}

export function normalizeName(value) {
  if (typeof value !== 'string') throw new GameError('INVALID_NAME', 'Введите имя от 1 до 20 символов.');
  // Reject all Unicode format characters except the joiner required by emoji
  // families. The joiner alone never counts as a visible name.
  const invalidFormat = Array.from(value).some((character) => /\p{Cf}/u.test(character) && character !== '\u200d');
  if (hasControlCharacters(value) || invalidFormat) {
    throw new GameError('INVALID_NAME', 'В имени есть недопустимые символы.');
  }
  const name = value.normalize('NFC').trim().replace(/\s+/gu, ' ');
  const length = Array.from(name).length;
  const visible = name.split('\u200d').join('').trim();
  if (length < 1 || length > 20 || visible.length === 0) throw new GameError('INVALID_NAME', 'Введите имя от 1 до 20 символов.');
  return name;
}

/** Only canonical, validated parameters are used in receipt fingerprints. */
export function validateRequest(method, input) {
  if (!isReadMethod(method) && !Object.hasOwn(PARAMS, method)) {
    throw new GameError('UNKNOWN_METHOD', 'Такое действие не поддерживается.');
  }
  const params = input ?? {};
  if (!PLAIN_OBJECT(params)) throw new GameError('INVALID_REQUEST', 'Некорректный запрос.');
  const allowed = isReadMethod(method) ? [] : ['operationId', ...PARAMS[method]];
  if (Object.keys(params).some((key) => !allowed.includes(key))) {
    throw new GameError('INVALID_REQUEST', 'Запрос содержит неподдерживаемые поля.');
  }
  if (isReadMethod(method)) return {};
  if (typeof params.operationId !== 'string' || !UUID.test(params.operationId)) {
    throw new GameError('INVALID_REQUEST', 'Для действия требуется уникальный ключ операции.');
  }
  const canonical = { operationId: params.operationId.toLowerCase() };
  if (PARAMS[method].includes('chickId')) canonical.chickId = requireId(params.chickId);
  if (method === 'hatchEgg') canonical.eggId = requireId(params.eggId);
  if (method === 'claimAchievement') canonical.achievementId = requireId(params.achievementId);
  if (method === 'careAction') {
    if (!['feed', 'play', 'sleep'].includes(params.action)) {
      throw new GameError('INVALID_REQUEST', 'Выберите действие ухода.');
    }
    canonical.action = params.action;
  }
  if (method === 'renameChick') canonical.name = normalizeName(params.name);
  if (method === 'startFlapsRun' || method === 'finishFlapsRun') {
    if (!gameConfig(params.gameId) || (params.gameId !== undefined && params.gameId !== FLAPS_GAME_ID)) throw new GameError('UNKNOWN_GAME', 'Эта игра пока недоступна.');
    // The default is implicit in the canonical fingerprint so receipts issued
    // by 0.2 still match both old callers and explicit 0.3 Flaps callers.
    if (params.gameId !== undefined && params.gameId !== FLAPS_GAME_ID) canonical.gameId = params.gameId;
  }
  if (method === 'finishMiniGame') {
    canonical.attemptId = requireId(params.attemptId);
    if (!Number.isSafeInteger(params.score) || params.score < 0 || params.score > 500) {
      throw new GameError('INVALID_SCORE', 'Некорректный результат игры.');
    }
    canonical.score = params.score;
  }
  if (method === 'finishFlapsRun') {
    canonical.runId = requireId(params.runId);
    if (!Number.isSafeInteger(params.score) || params.score < 0 || params.score > gameConfig(params.gameId).antiAbuse.maxScore) {
      throw new GameError('INVALID_SCORE', 'Некорректный результат Chippster Flaps.');
    }
    if (!['crash', 'bounds'].includes(params.endReason)) {
      throw new GameError('INVALID_REQUEST', 'Некорректная причина завершения раунда.');
    }
    canonical.score = params.score;
    canonical.endReason = params.endReason;
  }
  if (method === 'logEvent') {
    if (!['app_opened', 'app_error'].includes(params.event)) {
      throw new GameError('INVALID_REQUEST', 'Это событие записывает только сервер.');
    }
    canonical.event = params.event;
    canonical.details = {};
    if (params.details !== undefined) {
      if (!PLAIN_OBJECT(params.details) || Object.keys(params.details).some((key) => !['code', 'screen'].includes(key))) {
        throw new GameError('INVALID_REQUEST', 'Некорректные данные события.');
      }
      for (const key of ['code', 'screen']) {
        if (params.details[key] !== undefined) {
          if (typeof params.details[key] !== 'string' || !/^[a-zA-Z0-9_:-]{1,48}$/.test(params.details[key])) {
            throw new GameError('INVALID_REQUEST', 'Некорректные данные события.');
          }
          canonical.details[key] = params.details[key];
        }
      }
    }
  }
  return canonical;
}

export function requestFingerprint(method, params) {
  const effect = Object.fromEntries(Object.entries(params).filter(([key]) => key !== 'operationId'));
  return JSON.stringify([method, effect]);
}

function newId(state, id) {
  // A unique identifier is server-issued; a faulty injected generator cannot
  // overwrite an egg, bird or game attempt already in the aggregate.
  for (let tries = 0; tries < 8; tries += 1) {
    const candidate = id();
    if (typeof candidate === 'string' && candidate.length > 0
      && !state.chicks.some((chick) => chick.id === candidate)
      && !state.eggs.some((egg) => egg.id === candidate)
      && !state.attempts.some((attempt) => attempt.id === candidate)) return candidate;
  }
  throw new GameError('TEMPORARILY_UNAVAILABLE', 'Не удалось сохранить действие. Попробуйте ещё раз.', { retryable: true });
}

export function recordEvent(state, event, now, details = {}) {
  const day = Math.floor(now / (24 * HOUR));
  const key = String(day);
  const counters = state.telemetry.days[key] ?? (state.telemetry.days[key] = {});
  counters[event] = (counters[event] ?? 0) + 1;
  state.telemetry.totals[event] = (state.telemetry.totals[event] ?? 0) + 1;
  // Totals retain milestone information. Daily cohorts retain the latest 90 days.
  for (const existing of Object.keys(state.telemetry.days)) {
    if (Number(existing) < day - 89) delete state.telemetry.days[existing];
  }
  if (event === 'app_error') {
    state.telemetry.errors.push({ at: now, code: details.code ?? 'UNKNOWN', screen: details.screen ?? 'unknown' });
    state.telemetry.errors = state.telemetry.errors.slice(-20);
  }
}

export function createInitialState(telegramId, now, id) {
  const state = {
    schemaVersion: 2,
    balanceVersion: BALANCE.version,
    createdAt: now,
    updatedAt: now,
    player: { telegramId: String(telegramId), feathers: 0, activeChickId: null, onboarding: 'egg', careRewardAt: null, miniGameRewardAt: null,
      flaps: { bestScore: 0, completedRuns: 0, lastPlayedAt: null } },
    chicks: [],
    eggs: [],
    attempts: [],
    receipts: {},
    telemetry: { totals: {}, days: {}, errors: [], clientWindowAt: now, clientWindowCount: 0 },
  };
  migrateGameRecords(state.player);
  state.eggs.push({ id: newId(state, id), kind: 'starter', createdAt: now, readyAt: now, chickId: null });
  recordEvent(state, 'onboarding_started', now);
  return state;
}

function clampNeed(value) {
  return Math.min(100, Math.max(BALANCE.minNeed, value));
}

export function stageFor(chick, now) {
  if (now - chick.bornAt >= BALANCE.adultAgeMs && chick.careMilestones.length >= 3) return 'adult';
  if (now - chick.bornAt >= BALANCE.teenAgeMs && chick.careMilestones.length >= 1) return 'teen';
  return 'baby';
}

/** Apply elapsed server time once. Inactive birds preserve their three needs. */
export function reconcileState(state, now) {
  migrateGameRecords(state.player);
  state.balanceVersion = BALANCE.version;
  discoverOwnedTraits(state);
  // Finished run visual payload is duplicated in its permanent start receipt.
  // Keep terminal IDs/results for fresh-key replay; never prune value fences.
  for (const attempt of state.attempts) {
    if (attempt.finishedAt !== null && now > attempt.expiresAt) delete attempt.chick;
  }
  for (const chick of state.chicks) {
    const active = chick.id === state.player.activeChickId;
    const previous = Math.min(now, chick.lastComputedAt);
    const hours = active ? Math.max(0, now - previous) / HOUR : 0;
    if (active) {
      chick.hunger = clampNeed(chick.hunger - BALANCE.decayPerHour.hunger * hours);
      chick.mood = clampNeed(chick.mood - BALANCE.decayPerHour.mood * hours);
    }
    if (chick.sleepUntil !== null) {
      if (now >= chick.sleepUntil) {
        const afterSleepHours = active ? Math.max(0, now - Math.max(previous, chick.sleepUntil)) / HOUR : 0;
        chick.energy = clampNeed(100 - BALANCE.decayPerHour.energy * afterSleepHours);
        chick.sleepUntil = null;
      }
    } else if (active) {
      chick.energy = clampNeed(chick.energy - BALANCE.decayPerHour.energy * hours);
    }
    chick.lastComputedAt = now;
    chick.stage = stageFor(chick, now);
    // Expired unmatched actions cannot be used to manufacture a later cycle.
    if (chick.pendingFeedAt !== null && now - chick.pendingFeedAt > BALANCE.careCycleWindowMs) chick.pendingFeedAt = null;
    if (chick.pendingPlayAt !== null && now - chick.pendingPlayAt > BALANCE.careCycleWindowMs) chick.pendingPlayAt = null;
  }
  state.updatedAt = now;
  return state;
}

export function snapshot(state, revision, now) {
  const currentEgg = state.eggs.find((egg) => egg.chickId === null);
  return {
    revision,
    serverNow: now,
    balanceVersion: state.balanceVersion,
    player: clone(state.player),
    dailyBonus: dailyBonusStatus(state, now),
    codex: traitCodexStatus(state),
    achievements: achievementStatus(state),
    chicks: state.chicks.map((chick) => ({
      id: chick.id, appearanceId: chick.appearanceId, rarity: chick.rarity,
      appearanceVersion: 2, genes: clone(chick.genes),
      name: chick.name, bornAt: chick.bornAt, stage: chick.stage,
      hunger: chick.hunger, mood: chick.mood, energy: chick.energy,
      lastFeedAt: chick.lastFeedAt, lastPlayAt: chick.lastPlayAt,
      sleepUntil: chick.sleepUntil, careMilestones: [...chick.careMilestones],
      ...(reservedGiftId(state, chick.id, now) ? { reservedGiftId: reservedGiftId(state, chick.id, now) } : {}),
      ...(reservedExchangeId(state, chick.id, now) ? { reservedExchangeId: reservedExchangeId(state, chick.id, now) } : {}),
    })),
    egg: currentEgg ? { id: currentEgg.id, kind: currentEgg.kind, createdAt: currentEgg.createdAt, readyAt: currentEgg.readyAt } : null,
  };
}

export function selectAppearance(random) {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new GameError('TEMPORARILY_UNAVAILABLE', 'Не удалось вылупить яйцо. Попробуйте ещё раз.', { retryable: true });
  }
  const category = value < 0.7 ? 'common' : value < 0.95 ? 'uncommon' : 'rare';
  const start = category === 'common' ? 0 : category === 'uncommon' ? 0.7 : 0.95;
  const span = category === 'common' ? 0.7 : category === 'uncommon' ? 0.25 : 0.05;
  const choices = APPEARANCES.filter((appearance) => appearance.rarity === category);
  // One draw gives exactly 70/25/5 percent categories and uniform entries.
  return choices[Math.min(choices.length - 1, Math.floor(((value - start) / span) * choices.length))];
}

/** 0.1 aggregates need the authorized release reset; reads never delete. */
export function validateStateVersion(state) {
  if (state?.schemaVersion !== 2) {
    throw new GameError('RESET_REQUIRED', 'Гнездо обновляется до Chipper 0.2. Попробуйте зайти чуть позже.', { retryable: true });
  }
  if (!state.player?.flaps || state.chicks.some((chick) => chick.appearanceVersion !== 2 || !validGenes(chick.genes))) {
    throw new GameError('INVALID_SAVE', 'Не удалось прочитать сохранение. Попробуйте ещё раз.', { retryable: true });
  }
  // Validate new permanent entitlements before any reconciliation/CAS. Unknown
  // future fences must never be silently downgraded or followed by a credit.
  achievementStatus(state);
  if (state.exchanges !== undefined && state.exchanges !== null
    && (!Array.isArray(state.exchanges) || state.exchanges.some(entry => !entry || entry.version !== 1))) {
    throw new GameError('INVALID_SAVE', 'Обновите игру, чтобы прочитать историю обменов.', { retryable: true });
  }
}

function reservedGiftId(state, chickId, now) {
  return state.gifts?.find((gift) => gift.chick?.id === chickId && gift.status === 'pending' && gift.expiresAt > now)?.giftId ?? null;
}

export function reservedExchangeId(state, chickId, now) {
  return state.exchanges?.find(entry => String(entry.senderId) === state.player.telegramId
    && entry.offeredChick?.id === chickId && entry.status === 'pending' && entry.expiresAt > now)?.exchangeId ?? null;
}

/** Shared ownership-transfer reservation; requested foreign birds stay free. */
export function chickReservation(state, chickId, now, excludeExchangeId = null) {
  const giftId = reservedGiftId(state, chickId, now);
  if (giftId) return { kind: 'gift', id: giftId };
  const exchangeId = reservedExchangeId(state, chickId, now);
  return exchangeId && exchangeId !== excludeExchangeId ? { kind: 'exchange', id: exchangeId } : null;
}

function ownChick(state, chickId, requireActive = false, now = null) {
  const chick = state.chicks.find((entry) => entry.id === chickId);
  if (!chick) throw new GameError('CHICK_NOT_FOUND', 'Цыплёнок не найден в вашей коллекции.');
  if (requireActive && state.player.activeChickId !== chick.id) {
    throw new GameError('CHICK_NOT_ACTIVE', 'Сначала сделайте этого цыплёнка активным.');
  }
  if (now !== null && chickReservation(state, chickId, now)) {
    throw new GameError('CHICK_RESERVED', 'Цыплёнок участвует в предложении. Сначала отмените его.');
  }
  return chick;
}

function hatch(state, eggId, now, random, id) {
  const egg = state.eggs.find((entry) => entry.id === eggId);
  if (!egg) throw new GameError('EGG_NOT_FOUND', 'Яйцо не найдено в вашем инкубаторе.');
  if (egg.chickId !== null) return { chickId: egg.chickId };
  if (now < egg.readyAt) throw new GameError('EGG_NOT_READY', 'Яйцо ещё согревается.', { retryAt: egg.readyAt });
  const appearance = selectAppearance(random);
  const genes = generateGenes(appearance, () => {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new GameError('TEMPORARILY_UNAVAILABLE', 'Не удалось вылупить яйцо. Попробуйте ещё раз.', { retryable: true });
    }
    return value;
  });
  const chickId = newId(state, id);
  const chick = {
    id: chickId, appearanceId: appearance.id, rarity: appearance.rarity,
    appearanceVersion: 2, genes,
    name: `Цып №${state.chicks.length + 1}`, bornAt: now, stage: 'baby',
    ...BALANCE.initialNeeds,
    lastFeedAt: null, lastPlayAt: null, sleepUntil: null,
    careMilestones: [], pendingFeedAt: null, pendingPlayAt: null,
    lastComputedAt: now,
  };
  state.chicks.push(chick);
  discoverChickTraits(state, chick);
  egg.chickId = chickId;
  if (state.player.activeChickId === null) state.player.activeChickId = chickId;
  if (egg.kind === 'starter') {
    state.player.onboarding = 'name';
    recordEvent(state, 'first_hatch', now);
  }
  recordEvent(state, 'egg_hatched', now);
  return { chickId };
}

function available(lastAt, now, interval = BALANCE.rewardCooldownMs) {
  return lastAt === null || now - lastAt >= interval;
}

function care(state, params, now) {
  const chick = ownChick(state, params.chickId, true);
  if (params.action === 'sleep') {
    if (chick.sleepUntil === null) chick.sleepUntil = now + BALANCE.sleepDurationMs;
    return { rewarded: false };
  }
  if (chick.sleepUntil !== null) {
    throw new GameError('CHICK_SLEEPING', 'Цыплёнок отдыхает. Можно выбрать другого.', { retryAt: chick.sleepUntil });
  }
  const feed = params.action === 'feed';
  const lastAt = feed ? chick.lastFeedAt : chick.lastPlayAt;
  if (!available(lastAt, now, BALANCE.careCooldownMs)) {
    throw new GameError('CARE_COOLDOWN', feed ? 'Цыплёнок пока сыт.' : 'Цыплёнок пока доволен игрой.', { retryAt: lastAt + BALANCE.careCooldownMs });
  }
  if (feed) {
    chick.hunger = clampNeed(chick.hunger + BALANCE.careEffects.feed);
    chick.lastFeedAt = now;
    chick.pendingFeedAt = now;
    if (!state.telemetry.totals.first_feed) recordEvent(state, 'first_feed', now);
  } else {
    chick.mood = clampNeed(chick.mood + BALANCE.careEffects.play);
    chick.lastPlayAt = now;
    chick.pendingPlayAt = now;
    if (!state.telemetry.totals.first_play) recordEvent(state, 'first_play', now);
  }
  let rewarded = false;
  if (chick.pendingFeedAt !== null && chick.pendingPlayAt !== null
    && Math.abs(chick.pendingFeedAt - chick.pendingPlayAt) <= BALANCE.careCycleWindowMs) {
    const lastMilestone = chick.careMilestones.length ? chick.careMilestones[chick.careMilestones.length - 1] : null;
    if (available(lastMilestone, now)) chick.careMilestones.push(now);
    if (available(state.player.careRewardAt, now)) {
      state.player.feathers += 1;
      state.player.careRewardAt = now;
      rewarded = true;
      recordEvent(state, 'care_reward_claimed', now);
    }
    chick.pendingFeedAt = null;
    chick.pendingPlayAt = null;
    chick.stage = stageFor(chick, now);
  }
  return { rewarded };
}

/** Mutate a cloned, reconciled aggregate; the service commits it with one CAS. */
export function applyMutation(state, method, params, { now, random, id }) {
  switch (method) {
    case 'claimDailyBonus': return claimDailyBonus(state, now);
    case 'claimAchievement': return claimAchievement(state, params.achievementId, now);
    case 'hatchEgg': return hatch(state, params.eggId, now, random, id);
    case 'completeOnboarding': {
      if (state.chicks.length === 0) throw new GameError('FIRST_HATCH_REQUIRED', 'Сначала помогите цыплёнку вылупиться.');
      state.player.onboarding = 'done';
      return {};
    }
    case 'careAction': return care(state, params, now);
    case 'activateChick': {
      const chick = ownChick(state, params.chickId, false, now);
      if (state.player.activeChickId !== chick.id) {
        state.player.activeChickId = chick.id;
        // Reconciliation has already applied the old bird's elapsed time and
        // settled this bird's sleep. Its active decay now starts at this instant.
        chick.lastComputedAt = now;
        recordEvent(state, 'chick_activated', now);
      }
      return {};
    }
    case 'renameChick': {
      ownChick(state, params.chickId, false, now).name = params.name;
      return {};
    }
    case 'buyEgg': {
      if (state.eggs.some((egg) => egg.chickId === null)) throw new GameError('INCUBATOR_BUSY', 'В инкубаторе уже есть яйцо.');
      if (state.player.feathers < BALANCE.eggCost) throw new GameError('INSUFFICIENT_FEATHERS', 'Для нового яйца нужны 6 пёрышек.');
      state.player.feathers -= BALANCE.eggCost;
      const eggId = newId(state, id);
      state.eggs.push({ id: eggId, kind: 'ordinary', createdAt: now, readyAt: now + BALANCE.incubationMs, chickId: null });
      recordEvent(state, 'egg_created', now);
      return { eggId };
    }
    case 'startMiniGame':
    case 'finishMiniGame':
      throw new GameError('GAME_REPLACED', 'Теперь здесь Chippster Flaps. Обновите Mini App.');
    case 'startFlapsRun': {
      const config = gameConfig(params.gameId);
      if (state.chicks.length === 0) throw new GameError('FIRST_HATCH_REQUIRED', 'Сначала помогите цыплёнку вылупиться.');
      const chick = ownChick(state, state.player.activeChickId, true);
      const recent = state.attempts.filter((attempt) => (attempt.gameId ?? FLAPS_GAME_ID) === config.gameId
        && attempt.startedAt > now - config.antiAbuse.startWindowMs);
      if (recent.length >= config.antiAbuse.startLimit) {
        const retryAt = Math.min(...recent.map((attempt) => attempt.startedAt)) + config.antiAbuse.startWindowMs;
        throw new GameError('RATE_LIMITED', 'Подождите немного перед новым раундом.', { retryable: true, retryAt });
      }
      // One unfinished attempt prevents trivial mass creation. A new round may
      // explicitly supersede an abandoned one, without modifying sleep or care.
      for (const attempt of state.attempts) {
        if ((attempt.gameId ?? FLAPS_GAME_ID) === config.gameId && attempt.finishedAt === null) attempt.cancelled = true;
      }
      // Receipts remain permanent; a pruned run cannot pay again with a fresh
      // operation key. Rate limiting retains every start inside its window.
      state.attempts = state.attempts.filter((attempt) => now <= attempt.expiresAt);
      const attempt = { kind: 'flaps', gameId: config.gameId, id: newId(state, id), chickId: chick.id,
        chick: snapshot(state, 0, now).chicks.find((entry) => entry.id === chick.id),
        configVersion: config.configVersion, startedAt: now,
        expiresAt: now + config.antiAbuse.attemptTtlMs, finishedAt: null,
        cancelled: false, score: null, endReason: null, result: null };
      state.attempts.push(attempt);
      recordEvent(state, 'flaps_started', now);
      return { gameId: config.gameId, runId: attempt.id, chickId: attempt.chickId, chick: clone(attempt.chick),
        startedAt: attempt.startedAt, expiresAt: attempt.expiresAt, configVersion: attempt.configVersion };
    }
    case 'finishFlapsRun': {
      const config = gameConfig(params.gameId);
      const attempt = state.attempts.find((entry) => entry.kind === 'flaps' && entry.id === params.runId
        && (entry.gameId ?? FLAPS_GAME_ID) === config.gameId);
      if (!attempt) throw new GameError('ATTEMPT_NOT_FOUND', 'Начните новый раунд игры.');
      ownChick(state, attempt.chickId);
      if (attempt.finishedAt !== null) {
        if (attempt.score !== params.score || attempt.endReason !== params.endReason) {
          throw new GameError('ATTEMPT_ALREADY_FINISHED', 'Результат этого раунда уже сохранён.');
        }
        return clone(attempt.result);
      }
      if (attempt.cancelled) throw new GameError('ATTEMPT_CANCELLED', 'Этот раунд заменён новым.');
      if (now > attempt.expiresAt) throw new GameError('ATTEMPT_EXPIRED', 'Время раунда истекло. Начните новый.');
      const elapsed = now - attempt.startedAt;
      if (params.score > maximumPlausibleScore(elapsed)) {
        throw new GameError('INVALID_SCORE', 'Такой счёт невозможен за время этого раунда.');
      }
      attempt.finishedAt = now;
      attempt.score = params.score;
      attempt.endReason = params.endReason;
      attempt.result = recordGameCompletion(state.player, config, { score: params.score, now, durationMs: elapsed });
      if (attempt.result.rewarded) {
        recordEvent(state, 'flaps_reward_claimed', now);
      }
      recordEvent(state, 'flaps_finished', now);
      return clone(attempt.result);
    }
    case 'logEvent': {
      if (now - state.telemetry.clientWindowAt >= 60000) {
        state.telemetry.clientWindowAt = now;
        state.telemetry.clientWindowCount = 0;
      }
      if (state.telemetry.clientWindowCount >= 30) {
        throw new GameError('RATE_LIMITED', 'Подождите немного и попробуйте снова.', { retryable: true, retryAt: state.telemetry.clientWindowAt + 60000 });
      }
      state.telemetry.clientWindowCount += 1;
      recordEvent(state, params.event, now, params.details);
      return {};
    }
    default: throw new GameError('UNKNOWN_METHOD', 'Такое действие не поддерживается.');
  }
}
