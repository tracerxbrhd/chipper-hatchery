import { describe, expect, it } from 'vitest';
import { DAILY_BONUS_CONFIG, claimDailyBonus, dailyBonusStatus } from '../tgcloud/lib/dailyBonus.js';
import { GameError } from '../tgcloud/lib/domain.js';

const DAY = DAILY_BONUS_CONFIG.dayMs;
const now = Date.UTC(2026, 9, 14, 12);
const aggregate = (extra = {}) => ({ player: { onboarding: 'done', feathers: 0, ...extra } });

describe('daily bonus pure server UTC rules', () => {
  it('D01 is centrally configured as one feather and does not mutate a read', () => {
    const state = aggregate();
    const before = JSON.stringify(state);
    expect(Object.isFrozen(DAILY_BONUS_CONFIG)).toBe(true);
    expect(dailyBonusStatus(state, now)).toEqual({
      available: true, rewardAmount: 1, dayUTC: Math.floor(now / DAY),
      lastClaimDayUTC: null, nextResetAt: Date.UTC(2026, 9, 15),
    });
    expect(JSON.stringify(state)).toBe(before);
  });

  it('D01/D02 changes only the balance and daily fields; fresh same-day calls reject', () => {
    const state = aggregate({ careRewardAt: 100, miniGameRewardAt: 200, games: { 'nest-defense': { lastRewardAt: 300 } } });
    const result = claimDailyBonus(state, now);
    expect(result).toMatchObject({ rewarded: true, rewardAmount: 1, dailyBonus: { available: false } });
    expect(state.player).toMatchObject({ feathers: 1, dailyBonus: { lastClaimDayUTC: Math.floor(now / DAY), lastClaimAt: now, claimsTotal: 1 }, careRewardAt: 100, miniGameRewardAt: 200, games: { 'nest-defense': { lastRewardAt: 300 } } });
    const saved = JSON.stringify(state);
    expect(() => claimDailyBonus(state, now + 1)).toThrow(GameError);
    try { claimDailyBonus(state, now + 1); } catch (error) {
      expect(error).toMatchObject({ code: 'ALREADY_CLAIMED', retryAt: Date.UTC(2026, 9, 15) });
    }
    expect(JSON.stringify(state)).toBe(saved);
  });

  it('D04 uses exactly 00:00 UTC, including epoch-day zero and the final millisecond', () => {
    const state = aggregate();
    claimDailyBonus(state, 0);
    expect(dailyBonusStatus(state, DAY - 1).available).toBe(false);
    expect(dailyBonusStatus(state, DAY).available).toBe(true);
    claimDailyBonus(state, DAY);
    expect(state.player.feathers).toBe(2);
    expect(state.player.dailyBonus.lastClaimDayUTC).toBe(1);
    const latest = aggregate();
    claimDailyBonus(latest, Date.UTC(2026, 9, 14, 23, 59, 59, 999));
    expect(dailyBonusStatus(latest, Date.UTC(2026, 9, 15)).available).toBe(true);
  });

  it('D06 does not accrue gifts during a seven-day absence', () => {
    const state = aggregate();
    claimDailyBonus(state, now);
    const returned = claimDailyBonus(state, now + 7 * DAY);
    expect(returned.rewardAmount).toBe(1);
    expect(state.player.feathers).toBe(2);
    expect(state.player.dailyBonus.claimsTotal).toBe(2);
  });

  it.each(['egg', 'name'])('D07 refuses before onboarding is done (%s)', onboarding => {
    const state = aggregate({ onboarding });
    expect(dailyBonusStatus(state, now).available).toBe(false);
    const before = JSON.stringify(state);
    expect(() => claimDailyBonus(state, now)).toThrow(GameError);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('fails closed if a previous claim is ahead of the clock', () => {
    const state = aggregate();
    claimDailyBonus(state, now + DAY);
    expect(dailyBonusStatus(state, now)).toMatchObject({ available: false, nextResetAt: Date.UTC(2026, 9, 16) });
    expect(() => claimDailyBonus(state, now)).toThrow();
    expect(state.player.feathers).toBe(1);
  });

  it.each([-1, Infinity, NaN, 1.5, '1791979200000'])('refuses invalid server clocks (%s)', value => {
    expect(() => dailyBonusStatus(aggregate(), value)).toThrow('Invalid server clock');
  });

  it.each([
    { lastClaimDayUTC: -1 }, { lastClaimDayUTC: 1.5 }, { lastClaimAt: -1 }, { claimsTotal: -1 }, { claimsTotal: Infinity },
  ])('does not overwrite corrupt daily state %o', dailyBonus => {
    const state = aggregate({ dailyBonus });
    expect(() => dailyBonusStatus(state, now)).toThrow(GameError);
    expect(() => claimDailyBonus(state, now)).toThrow(GameError);
    expect(state.player.feathers).toBe(0);
  });

  it.each([Number.MAX_SAFE_INTEGER, -1, 1.5])('refuses invalid/overflowing balances (%s) without partial writes', feathers => {
    const state = aggregate({ feathers });
    expect(() => claimDailyBonus(state, now)).toThrow(GameError);
    expect(state.player.dailyBonus).toBeUndefined();
    expect(state.player.feathers).toBe(feathers);
  });
});
