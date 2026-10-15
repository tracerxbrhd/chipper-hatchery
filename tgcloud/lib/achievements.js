/** Bounded, server-derived milestones. Owner CAS persists credit and the fence. */
import { GameError } from './domain.js';
import { FLAPS_GAME_ID, TOWER_GAME_ID } from './gameRegistry.js';
import { traitCodexStatus } from './traitCodex.js';

export const ACHIEVEMENTS_CONFIG = Object.freeze({ version: 1, rewardAmount: 1 });

// IDs are permanent payment entitlements. Never reuse an ID for another goal or
// remove its claimed fence; extending this catalogue requires a reviewed cap.
export const ACHIEVEMENT_CATALOG = Object.freeze([
  { id: 'first-feed', title: 'Крошка заботы', description: 'Впервые покормите своего цыплёнка.', category: 'care', target: 1 },
  { id: 'first-play', title: 'Очень важная игра', description: 'Впервые поиграйте со своим цыплёнком.', category: 'care', target: 1 },
  { id: 'care-cycle', title: 'Два добрых дела', description: 'Получите первое пёрышко за кормление и игру.', category: 'care', target: 1 },
  { id: 'care-five', title: 'Специалист по уюту', description: 'Получите пёрышко за заботу пять раз, без спешки и серий.', category: 'care', target: 5 },
  { id: 'hatch-three', title: 'Кто там стучит?', description: 'Помогите вылупиться трём цыплятам.', category: 'collection', target: 3 },
  { id: 'collection-three', title: 'Маленькая банда', description: 'Соберите в своей коллекции трёх цыплят одновременно.', category: 'collection', target: 3 },
  { id: 'codex-twenty', title: 'Знаток нелепостей', description: 'Откройте двадцать разных особенностей в Кодексе.', category: 'collection', target: 20 },
  { id: 'flaps-first', title: 'Лётное недоразумение', description: 'Завершите первый раунд Chippster Flaps.', category: 'games', target: 1 },
  { id: 'flaps-ten', title: 'Крылья на месте', description: 'Наберите десять очков в Chippster Flaps.', category: 'games', target: 10 },
  { id: 'nest-three', title: 'Гнездо под присмотром', description: 'Защитите гнездо от трёх волн в Nest Defense.', category: 'games', target: 3 },
  { id: 'gift-first', title: 'Из лапок в лапки', description: 'Подарите или примите цыплёнка у друга.', category: 'social', target: 1 },
  { id: 'exchange-first', title: 'Обоюдное чирик!', description: 'Завершите первый двусторонний обмен с другом.', category: 'social', target: 1 },
].map(Object.freeze));

const IDS = new Set(ACHIEVEMENT_CATALOG.map((entry) => entry.id));
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const count = (value) => Number.isSafeInteger(value) && value >= 0 ? value : 0;

function invalidSave() {
  return new GameError('INVALID_SAVE', 'Не удалось прочитать достижения. Обновите игру и попробуйте ещё раз.', { retryable: true });
}

function savedAchievements(state) {
  if (!plain(state?.player)) throw invalidSave();
  const saved = state.player.achievements;
  if (saved === undefined || saved === null) return { version: ACHIEVEMENTS_CONFIG.version, claimed: {} };
  // Unknown versions and unknown fences are preserved verbatim by refusing a
  // downgrade. Silently dropping a claimed key could reopen an old payment.
  if (!plain(saved) || saved.version !== ACHIEVEMENTS_CONFIG.version || !plain(saved.claimed)
    || Object.keys(saved).some((key) => !['version', 'claimed'].includes(key))
    || Object.keys(saved.claimed).some((key) => !IDS.has(key)
      || !Number.isSafeInteger(saved.claimed[key]) || saved.claimed[key] < 0)) throw invalidSave();
  return saved;
}

function progressFor(state) {
  const totals = state.telemetry?.totals;
  const flaps = state.player.games?.[FLAPS_GAME_ID];
  const legacyFlaps = state.player.flaps;
  const completedFlaps = Math.max(count(flaps?.completedRuns), count(legacyFlaps?.completedRuns));
  const tower = state.player.games?.[TOWER_GAME_ID];
  const completedTower = tower?.scoreTrust === 'verified' && count(tower?.completedRuns) > 0;
  const accepted = (entries) => Array.isArray(entries) && entries.some((entry) => entry?.status === 'accepted');
  // Server totals survive transfers. Old senders also retain accepted gift
  // history; recipients' new gift/exchange totals are recorded in the atomic
  // transfer, never from logEvent, taps, guest interactions or app opens.
  return {
    'first-feed': count(totals?.first_feed),
    'first-play': count(totals?.first_play),
    'care-cycle': count(totals?.care_reward_claimed),
    'care-five': count(totals?.care_reward_claimed),
    'hatch-three': count(totals?.egg_hatched),
    'collection-three': new Set((Array.isArray(state.chicks) ? state.chicks : [])
      .map((chick) => chick?.id).filter((id) => typeof id === 'string' && id.length > 0)).size,
    'codex-twenty': traitCodexStatus(state).found,
    'flaps-first': completedFlaps,
    'flaps-ten': completedFlaps > 0 ? Math.max(count(flaps?.bestScore), count(legacyFlaps?.bestScore)) : 0,
    'nest-three': completedTower ? count(tower.bestScore) : 0,
    'gift-first': count(totals?.gift_accepted) > 0 || accepted(state.gifts) ? 1 : 0,
    'exchange-first': count(totals?.exchange_accepted) > 0 || accepted(state.exchanges) ? 1 : 0,
  };
}

/** Authenticated owner view only; a read neither pays nor modifies the save. */
export function achievementStatus(state) {
  const saved = savedAchievements(state);
  const progress = progressFor(state);
  const achievements = ACHIEVEMENT_CATALOG.map((entry) => {
    const claimed = Object.hasOwn(saved.claimed, entry.id);
    const value = claimed ? entry.target : Math.min(entry.target, progress[entry.id]);
    return { ...entry, progress: value, unlocked: value >= entry.target, claimed,
      rewardAmount: ACHIEVEMENTS_CONFIG.rewardAmount };
  });
  return { version: ACHIEVEMENTS_CONFIG.version, achievements,
    found: achievements.filter((entry) => entry.unlocked).length,
    total: achievements.length, claimed: Object.keys(saved.claimed).length };
}

/** Mutate only a cloned owner aggregate; caller commits receipt/balance via CAS. */
export function claimAchievement(state, achievementId, now) {
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('Invalid server clock');
  if (typeof achievementId !== 'string' || !IDS.has(achievementId)) {
    throw new GameError('UNKNOWN_ACHIEVEMENT', 'Такого достижения пока нет.');
  }
  const saved = savedAchievements(state);
  if (state.player.onboarding !== 'done') {
    throw new GameError('FIRST_HATCH_REQUIRED', 'Сначала вылупите и назовите своего первого цыплёнка.');
  }
  if (Object.hasOwn(saved.claimed, achievementId)) {
    throw new GameError('ALREADY_CLAIMED', 'Пёрышко за это достижение уже у вас.');
  }
  const achievement = achievementStatus(state).achievements.find((entry) => entry.id === achievementId);
  if (!achievement.unlocked) throw new GameError('ACHIEVEMENT_LOCKED', 'Для этого достижения нужно ещё немного приключений.');
  const feathers = state.player.feathers;
  const nextFeathers = feathers + ACHIEVEMENTS_CONFIG.rewardAmount;
  if (!Number.isSafeInteger(feathers) || feathers < 0 || !Number.isSafeInteger(nextFeathers)) throw invalidSave();
  // Build every fallible result before writing either resource or entitlement.
  const next = { version: ACHIEVEMENTS_CONFIG.version, claimed: { ...saved.claimed, [achievementId]: now } };
  const achievements = achievementStatus({ ...state, player: { ...state.player, achievements: next } });
  state.player.feathers = nextFeathers;
  state.player.achievements = next;
  return { achievementId, rewarded: true, rewardAmount: ACHIEVEMENTS_CONFIG.rewardAmount, achievements };
}
