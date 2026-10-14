/** Pure UTC daily gift rules; persistence/receipts belong to owner aggregate CAS. */
import { GameError } from './domain.js';

export const DAILY_BONUS_CONFIG = Object.freeze({
  version: 'daily-bonus-1',
  dayMs: 24 * 60 * 60 * 1000,
  rewardAmount: 1,
});

function utcDay(now) {
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('Invalid server clock');
  return Math.floor(now / DAILY_BONUS_CONFIG.dayMs);
}

function savedDailyBonus(state) {
  const value = state.player.dailyBonus;
  if (value === undefined || value === null) {
    return { lastClaimDayUTC: null, lastClaimAt: null, claimsTotal: 0 };
  }
  const lastClaimDayUTC = value.lastClaimDayUTC ?? null;
  const lastClaimAt = value.lastClaimAt ?? null;
  const claimsTotal = value.claimsTotal ?? 0;
  if ((lastClaimDayUTC !== null && (!Number.isSafeInteger(lastClaimDayUTC) || lastClaimDayUTC < 0))
    || (lastClaimAt !== null && (!Number.isSafeInteger(lastClaimAt) || lastClaimAt < 0))
    || !Number.isSafeInteger(claimsTotal) || claimsTotal < 0) {
    throw new GameError('INVALID_SAVE', 'Не удалось прочитать ежедневный подарок. Откройте игру заново.', { retryable: true });
  }
  return { lastClaimDayUTC, lastClaimAt, claimsTotal };
}

/** A read never grants a reward or modifies a legacy player's saved data. */
export function dailyBonusStatus(state, now) {
  const dayUTC = utcDay(now);
  const { lastClaimDayUTC } = savedDailyBonus(state);
  return {
    available: state.player.onboarding === 'done' && (lastClaimDayUTC === null || lastClaimDayUTC < dayUTC),
    rewardAmount: DAILY_BONUS_CONFIG.rewardAmount,
    dayUTC,
    lastClaimDayUTC,
    // The service clamps a backward clock to updatedAt. A future saved stamp is
    // nevertheless fail-closed: it cannot reopen an already claimed day.
    nextResetAt: (Math.max(dayUTC, lastClaimDayUTC ?? dayUTC) + 1) * DAILY_BONUS_CONFIG.dayMs,
  };
}

/** Mutate ONLY the service's clone; balance/day/receipt commit in one row CAS. */
export function claimDailyBonus(state, now) {
  const status = dailyBonusStatus(state, now);
  if (state.player.onboarding !== 'done') {
    throw new GameError('FIRST_HATCH_REQUIRED', 'Сначала вылупите и назовите своего первого цыплёнка.');
  }
  if (!status.available) {
    throw new GameError('ALREADY_CLAIMED', 'Сегодняшний подарок уже у вас. Новый появится в 00:00 UTC.', { retryAt: status.nextResetAt });
  }
  const previous = savedDailyBonus(state);
  const nextFeathers = state.player.feathers + DAILY_BONUS_CONFIG.rewardAmount;
  if (!Number.isSafeInteger(state.player.feathers) || state.player.feathers < 0
    || !Number.isSafeInteger(nextFeathers) || previous.claimsTotal >= Number.MAX_SAFE_INTEGER) {
    throw new GameError('INVALID_SAVE', 'Не удалось сохранить ежедневный подарок. Откройте игру заново.', { retryable: true });
  }
  state.player.feathers = nextFeathers;
  state.player.dailyBonus = {
    lastClaimDayUTC: status.dayUTC,
    lastClaimAt: now,
    claimsTotal: previous.claimsTotal + 1,
  };
  return { rewarded: true, rewardAmount: DAILY_BONUS_CONFIG.rewardAmount, dailyBonus: dailyBonusStatus(state, now) };
}
