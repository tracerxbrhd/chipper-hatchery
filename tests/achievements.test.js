import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS_CONFIG, ACHIEVEMENT_CATALOG, achievementStatus, claimAchievement } from '../tgcloud/lib/achievements.js';
import { GameError } from '../tgcloud/lib/domain.js';
import { TRAIT_TAXONOMY } from '../tgcloud/lib/traitCodex.js';

const now = Date.UTC(2026, 9, 15, 12);
const aggregate = (extra = {}) => ({ schemaVersion: 2,
  player: { onboarding: 'done', feathers: 4, careRewardAt: 123, miniGameRewardAt: 234, ...extra },
  telemetry: { totals: {} }, chicks: [], receipts: { historical: { untouched: true } } });
const byId = (state, id) => achievementStatus(state).achievements.find((entry) => entry.id === id);
function expectFailure(state, id, code, at = now) {
  const before = JSON.stringify(state);
  expect(() => claimAchievement(state, id, at)).toThrow(GameError);
  try { claimAchievement(state, id, at); } catch (error) { expect(error.code).toBe(code); }
  expect(JSON.stringify(state)).toBe(before);
}

describe('bounded authoritative achievement catalogue', () => {
  it('defines twelve fixed one-feather entitlements and reads legacy saves without writes', () => {
    const state = aggregate(); const before = JSON.stringify(state);
    const status = achievementStatus(state);
    expect(Object.isFrozen(ACHIEVEMENTS_CONFIG)).toBe(true);
    expect(Object.isFrozen(ACHIEVEMENT_CATALOG)).toBe(true);
    expect(ACHIEVEMENT_CATALOG.every(Object.isFrozen)).toBe(true);
    expect(new Set(ACHIEVEMENT_CATALOG.map((entry) => entry.id)).size).toBe(12);
    expect(status).toMatchObject({ version: 1, found: 0, total: 12, claimed: 0 });
    expect(new Set(status.achievements.map((entry) => entry.category))).toEqual(new Set(['care', 'collection', 'games', 'social']));
    expect(status.achievements.every((entry) => entry.rewardAmount === 1 && entry.progress === 0 && !entry.unlocked && !entry.claimed)).toBe(true);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('uses authoritative care and hatching totals and clamps displayed progress', () => {
    const state = aggregate();
    state.telemetry.totals = { first_feed: 1, first_play: 1, care_reward_claimed: 100, egg_hatched: 3 };
    for (const id of ['first-feed', 'first-play', 'care-cycle', 'care-five', 'hatch-three']) {
      const achievement = byId(state, id);
      expect(achievement.unlocked).toBe(true);
      expect(achievement.progress).toBe(achievement.target);
    }
    expect(achievementStatus(state).found).toBe(5);
    expect(state.player.feathers).toBe(4);
  });

  it('never grants progress for client logEvent, taps, opens, decoration or pending social actions', () => {
    const state = aggregate();
    state.telemetry.totals = { app_opened: 999999, app_error: 99, tap: 999, pet: 999, first_feed: '1', first_play: -1, care_reward_claimed: Infinity, egg_hatched: 1.5 };
    state.gifts = [{ status: 'pending' }, { status: 'declined' }, { status: 'expired' }];
    state.exchanges = [{ status: 'pending' }, { status: 'cancelled' }];
    expect(achievementStatus(state).found).toBe(0);
    expectFailure(state, 'first-feed', 'ACHIEVEMENT_LOCKED');
  });

  it('counts distinct owned birds, known persistent trait IDs and no private payload in the DTO', () => {
    const state = aggregate();
    state.chicks = [{ id: 'one', genes: 'private genes', name: 'private chick' }, { id: 'one' }, { id: 'two' }, { id: null }];
    expect(byId(state, 'collection-three').progress).toBe(2);
    state.chicks.push({ id: 'three' });
    expect(byId(state, 'collection-three').unlocked).toBe(true);
    const ids = TRAIT_TAXONOMY.flatMap((category) => category.traits.map((trait) => trait.id));
    state.player.discoveredTraits = { version: 1, ids: ids.slice(0, 19).concat(Array(40).fill(ids[0]), 'fake:trait') };
    expect(byId(state, 'codex-twenty')).toMatchObject({ progress: 19, unlocked: false });
    state.player.discoveredTraits.ids.push(ids[19]);
    expect(byId(state, 'codex-twenty').unlocked).toBe(true);
    const serialized = JSON.stringify(achievementStatus(state));
    for (const secret of ['private chick', 'private genes', 'historical', 'careRewardAt']) expect(serialized).not.toContain(secret);
  });

  it('requires a completed server run and a verified Nest Defense record', () => {
    const state = aggregate({ games: {
      'chippster-flaps': { completedRuns: 0, bestScore: 100 },
      'nest-defense': { completedRuns: 10, bestScore: 100, scoreTrust: 'casual' },
    } });
    expect(achievementStatus(state).found).toBe(0);
    state.player.games['chippster-flaps'].completedRuns = 1;
    expect(byId(state, 'flaps-first').unlocked).toBe(true);
    expect(byId(state, 'flaps-ten').unlocked).toBe(true);
    state.player.games['nest-defense'].scoreTrust = 'verified';
    expect(byId(state, 'nest-three').unlocked).toBe(true);
    state.player.games['nest-defense'].completedRuns = 0;
    expect(byId(state, 'nest-three').unlocked).toBe(false);
  });

  it('supports existing Flaps aliases without adding canonical and legacy runs together', () => {
    const state = aggregate({ flaps: { completedRuns: 2, bestScore: 9 },
      games: { 'chippster-flaps': { completedRuns: 2, bestScore: 10 } } });
    expect(byId(state, 'flaps-first').progress).toBe(1);
    expect(byId(state, 'flaps-ten').unlocked).toBe(true);
    delete state.player.games;
    expect(byId(state, 'flaps-first').unlocked).toBe(true);
    expect(byId(state, 'flaps-ten')).toMatchObject({ progress: 9, unlocked: false });
  });

  it('accepts committed social history or server transfer totals for both sides', () => {
    const sender = aggregate(); sender.gifts = [{ status: 'accepted' }]; sender.exchanges = [{ status: 'accepted' }];
    const recipient = aggregate(); recipient.telemetry.totals = { gift_accepted: 1, exchange_accepted: 1 };
    for (const state of [sender, recipient]) {
      expect(byId(state, 'gift-first').unlocked).toBe(true);
      expect(byId(state, 'exchange-first').unlocked).toBe(true);
      expect(state.player.feathers).toBe(4);
    }
  });
});

describe('achievement permanent entitlement fence', () => {
  it('credits exactly once and changes only feathers and its bounded claim fence', () => {
    const state = aggregate(); state.telemetry.totals.first_feed = 1;
    const expected = JSON.parse(JSON.stringify(state));
    const result = claimAchievement(state, 'first-feed', now);
    expected.player.feathers += 1;
    expected.player.achievements = { version: 1, claimed: { 'first-feed': now } };
    expect(state).toEqual(expected);
    expect(result).toMatchObject({ achievementId: 'first-feed', rewarded: true, rewardAmount: 1,
      achievements: { version: 1, found: 1, claimed: 1, total: 12 } });
    expectFailure(state, 'first-feed', 'ALREADY_CLAIMED', now + 10000000);
  });

  it('keeps claimed collection and social milestones after original evidence leaves the save', () => {
    const state = aggregate(); state.chicks = [{ id: 'one' }, { id: 'two' }, { id: 'three' }];
    claimAchievement(state, 'collection-three', 0);
    state.chicks = [];
    expect(byId(state, 'collection-three')).toMatchObject({ progress: 3, unlocked: true, claimed: true });
    expectFailure(state, 'collection-three', 'ALREADY_CLAIMED');
    state.gifts = [{ status: 'accepted' }]; claimAchievement(state, 'gift-first', now); delete state.gifts;
    expect(byId(state, 'gift-first')).toMatchObject({ unlocked: true, claimed: true });
    expectFailure(state, 'gift-first', 'ALREADY_CLAIMED');
  });

  it('bounds total lifetime credit and stored claim keys by the fixed catalogue', () => {
    const state = aggregate({ games: { 'chippster-flaps': { completedRuns: 1, bestScore: 10 },
      'nest-defense': { completedRuns: 1, bestScore: 3, scoreTrust: 'verified' } } });
    state.telemetry.totals = { first_feed: 1, first_play: 1, care_reward_claimed: 5, egg_hatched: 3, gift_accepted: 1, exchange_accepted: 1 };
    state.chicks = [{ id: 'one' }, { id: 'two' }, { id: 'three' }];
    state.player.discoveredTraits = { version: 1, ids: TRAIT_TAXONOMY.flatMap((category) => category.traits.map((trait) => trait.id)) };
    for (const { id } of ACHIEVEMENT_CATALOG) claimAchievement(state, id, now);
    expect(state.player.feathers).toBe(16);
    expect(Object.keys(state.player.achievements.claimed)).toHaveLength(12);
    expect(achievementStatus(state)).toMatchObject({ found: 12, total: 12, claimed: 12 });
    for (const { id } of ACHIEVEMENT_CATALOG) expectFailure(state, id, 'ALREADY_CLAIMED');
    expect(state.player.feathers).toBe(16);
  });

  it.each(['egg', 'name'])('refuses rewards before onboarding finishes (%s)', onboarding => {
    const state = aggregate({ onboarding }); state.telemetry.totals.first_feed = 1;
    expectFailure(state, 'first-feed', 'FIRST_HATCH_REQUIRED');
  });

  it.each([undefined, null, '', '__proto__', 'toString', 'unknown', { id: 'first-feed' }])('rejects unknown ID %s without a credit', id => {
    expectFailure(aggregate(), id, 'UNKNOWN_ACHIEVEMENT');
  });

  it.each([
    { version: 2, claimed: { 'future-id': now }, metadata: 'preserve me' },
    { version: 1, claimed: { 'unknown-id': now } },
    { version: 1, claimed: [] },
    { version: 1, claimed: { 'first-feed': -1 } },
    { version: 1, claimed: { 'first-feed': 1.5 } },
    { version: 1, claimed: { 'first-feed': '123' } },
    { version: 1, claimed: {}, extraFutureFence: true },
    [], 'invalid',
  ])('preserves unknown/malformed save data and fails closed %o', achievements => {
    const state = aggregate({ achievements }); state.telemetry.totals.first_feed = 1;
    const before = JSON.stringify(state);
    expect(() => achievementStatus(state)).toThrow(GameError);
    expectFailure(state, 'first-feed', 'INVALID_SAVE');
    expect(JSON.stringify(state)).toBe(before);
  });

  it.each([Number.MAX_SAFE_INTEGER, -1, 1.5, Infinity, '4'])('refuses invalid or overflowing feather balances %s without partial writes', feathers => {
    const state = aggregate({ feathers }); state.telemetry.totals.first_feed = 1;
    expectFailure(state, 'first-feed', 'INVALID_SAVE');
    expect(state.player.achievements).toBeUndefined();
  });

  it.each([-1, 1.5, Infinity, NaN, '123'])('refuses invalid server clocks %s without partial writes', at => {
    const state = aggregate(); state.telemetry.totals.first_feed = 1;
    const before = JSON.stringify(state);
    expect(() => claimAchievement(state, 'first-feed', at)).toThrow('Invalid server clock');
    expect(JSON.stringify(state)).toBe(before);
  });
});
