import { describe, expect, it } from 'vitest';
import { createGameService } from '../tgcloud/lib/service.js';
import { BALANCE, clone, requestFingerprint, validateRequest } from '../tgcloud/lib/domain.js';
import { FLAPS_GAME_ID, GAME_REGISTRY, gameConfig, migrateGameRecords, recordGameCompletion } from '../tgcloud/lib/gameRegistry.js';
import { ctx, fixture, operation } from './helpers';

async function editState(f, edit) {
  const row = await f.store.read('101');
  edit(row.state);
  expect(await f.store.compareAndSwap('101', row.revision, row.state)).toBe(true);
}

async function round(f, { duration = 2000, score = 0, gameId } = {}) {
  const start = await f.call('startFlapsRun', operation(gameId === undefined ? {} : { gameId }));
  expect(start.ok).toBe(true);
  f.advance(duration);
  return f.call('finishFlapsRun', operation({ runId: start.result.runId, score, endReason: 'crash',
    ...(gameId === undefined ? {} : { gameId }) }));
}

describe('0.3 per-game records and additive SQLite migration', () => {
  it('publishes one reviewed playable game and no active leaderboard', () => {
    expect(Object.keys(GAME_REGISTRY)).toEqual([FLAPS_GAME_ID]);
    expect(gameConfig()).toMatchObject({ gameId: FLAPS_GAME_ID, scoreTrust: 'casual', scoreType: 'points',
      rewardPolicy: { amount: 1, cooldownMs: BALANCE.rewardCooldownMs }, leaderboard: { enabled: false } });
    expect(gameConfig('__proto__')).toBe(null);
  });

  it('M02/M03 preserves old records, bird identity, feathers and receipts with no early reward', async () => {
    const f = fixture(); await f.initial();
    await editState(f, state => {
      delete state.player.games;
      state.player.feathers = 17;
      state.player.miniGameRewardAt = f.now - 3600000;
      state.player.flaps = { bestScore: 42, completedRuns: 71, lastPlayedAt: f.now - 12000 };
    });
    const before = await f.store.read('101');
    const loaded = await f.call('bootstrap');
    const record = loaded.state.player.games[FLAPS_GAME_ID];
    expect(record).toEqual({ configVersion: 'flaps-1', scoreType: 'points', bestScore: 42, completedRuns: 71,
      lastPlayedAt: before.state.player.flaps.lastPlayedAt, lastRewardAt: before.state.player.miniGameRewardAt, scoreTrust: 'casual' });
    expect(loaded.state.player.feathers).toBe(17);
    const after = await f.store.read('101');
    expect(after.state.chicks).toEqual(before.state.chicks);
    expect(after.state.receipts).toEqual(before.state.receipts);
    const finish = await round(f);
    expect(finish.result).toMatchObject({ rewarded: false, reason: 'cooldown',
      rewardNextAt: before.state.player.miniGameRewardAt + BALANCE.rewardCooldownMs });
    expect(finish.state.player.feathers).toBe(17);
    expect(finish.state.player.games[FLAPS_GAME_ID].bestScore).toBe(42);
  });

  it('migration under twelve concurrent reads persists exactly once and survives service restart', async () => {
    const f = fixture(); await f.initial();
    await editState(f, state => { delete state.player.games; state.player.flaps.bestScore = 9; state.player.miniGameRewardAt = f.now; });
    const before = await f.store.read('101');
    const results = await Promise.all(Array.from({ length: 12 }, () => f.call('getHome')));
    expect(results.every(result => result.ok && result.state.player.games[FLAPS_GAME_ID].bestScore === 9)).toBe(true);
    const after = await f.store.read('101');
    expect(after.revision).toBe(before.revision + 1);
    const reopened = createGameService({ store: f.store, now: () => f.now });
    const loaded = await reopened.call('bootstrap', {}, ctx());
    expect(loaded.state.player.games).toEqual(results[0].state.player.games);
    expect((await f.store.read('101')).revision).toBe(after.revision);
  });

  it('loss of migration response is retry-safe without claiming a new reward', async () => {
    const f = fixture(); await f.initial();
    await editState(f, state => { delete state.player.games; state.player.miniGameRewardAt = f.now; });
    f.loseNextResponse();
    expect((await f.call('getHome')).ok).toBe(false);
    const recovered = await f.call('getHome');
    expect(recovered.state.player.games[FLAPS_GAME_ID].lastRewardAt).toBe(f.now);
    expect(recovered.state.player.feathers).toBe(0);
    expect((await round(f)).result.rewarded).toBe(false);
  });

  it('preserves a newer registry cooldown and safely absorbs late legacy updates', async () => {
    const f = fixture(); await f.initial();
    await editState(f, state => {
      state.player.games[FLAPS_GAME_ID] = { ...state.player.games[FLAPS_GAME_ID], lastRewardAt: f.now,
        bestScore: 12, completedRuns: 8, lastPlayedAt: f.now };
      state.player.miniGameRewardAt = f.now - 3600000;
    });
    let loaded = await f.call('getHome');
    expect(loaded.state.player.miniGameRewardAt).toBe(f.now);
    f.advance(3600000);
    await editState(f, state => {
      state.player.flaps.bestScore = 15; state.player.flaps.completedRuns = 9;
      state.player.flaps.lastPlayedAt = f.now; state.player.miniGameRewardAt = f.now;
    });
    loaded = await f.call('getHome');
    expect(loaded.state.player.games[FLAPS_GAME_ID]).toMatchObject({ bestScore: 15, completedRuns: 9,
      lastRewardAt: f.now, lastPlayedAt: f.now });
  });

  it('M04/M05 concurrent explicit-game finishes issue one feather and one record', async () => {
    const f = fixture(); await f.initial();
    const start = await f.call('startFlapsRun', operation({ gameId: FLAPS_GAME_ID })); f.advance(2000);
    const request = operation({ gameId: FLAPS_GAME_ID, runId: start.result.runId, score: 0, endReason: 'bounds' });
    const results = await Promise.all(Array.from({ length: 12 }, () => f.call('finishFlapsRun', request)));
    expect(results.every(result => result.ok && result.result.rewarded)).toBe(true);
    const loaded = await f.call('getHome');
    expect(loaded.state.player.feathers).toBe(1);
    expect(loaded.state.player.games[FLAPS_GAME_ID]).toMatchObject({ completedRuns: 1, lastRewardAt: f.now, lastPlayedAt: f.now });
    expect(loaded.state.player.flaps.completedRuns).toBe(1);
  });

  it.each(['another-game', '__proto__', '', null, 123])('M06 unknown gameId %s cannot create a run or consume one', async gameId => {
    const f = fixture(); await f.initial();
    const start = await f.call('startFlapsRun', operation()); f.advance(2000);
    const before = await f.store.read('101');
    expect((await f.call('startFlapsRun', operation({ gameId }))).error.code).toBe('UNKNOWN_GAME');
    expect((await f.call('finishFlapsRun', operation({ gameId, runId: start.result.runId, score: 0, endReason: 'bounds' }))).error.code).toBe('UNKNOWN_GAME');
    expect(await f.store.read('101')).toEqual(before);
  });

  it('default game canonicalization preserves 0.2 receipt fingerprints and pending run compatibility', async () => {
    const f = fixture(); await f.initial();
    const request = operation();
    const first = await f.call('startFlapsRun', request);
    await editState(f, state => {
      delete state.player.games;
      const receipt = state.receipts[request.operationId];
      delete receipt.result.gameId;
      const attempt = state.attempts.find(item => item.id === first.result.runId);
      delete attempt.gameId;
    });
    const repeat = await f.call('startFlapsRun', { ...request, gameId: FLAPS_GAME_ID });
    expect(repeat.ok).toBe(true);
    expect(repeat.result.runId).toBe(first.result.runId);
    expect(requestFingerprint('startFlapsRun', validateRequest('startFlapsRun', request))).toBe('["startFlapsRun",{}]');
    f.advance(2000);
    const finish = await f.call('finishFlapsRun', operation({ gameId: FLAPS_GAME_ID, runId: first.result.runId, score: 0, endReason: 'crash' }));
    expect(finish.result.rewarded).toBe(true);
  });

  it('M07 test-only config has independent record/cooldown and never appears in runtime registry', () => {
    const config = gameConfig();
    const dummy = { ...config, gameId: 'fixture-only-game', configVersion: 'fixture-1' };
    const player = { feathers: 0, careRewardAt: 100, miniGameRewardAt: null, flaps: { bestScore: 0, completedRuns: 0, lastPlayedAt: null } };
    migrateGameRecords(player);
    const finish = game => recordGameCompletion(player, game, { score: 0, now: 10000, durationMs: 2000 });
    expect(finish(config).rewarded).toBe(true);
    const flaps = clone(player.games[FLAPS_GAME_ID]);
    expect(finish(dummy).rewarded).toBe(true);
    expect(player.games[FLAPS_GAME_ID]).toEqual(flaps);
    expect(player.miniGameRewardAt).toBe(10000);
    expect(player.careRewardAt).toBe(100);
    expect(finish(config).rewarded).toBe(false);
    expect(finish(dummy).rewarded).toBe(false);
    expect(player.feathers).toBe(2);
    expect(gameConfig(dummy.gameId)).toBe(null);
  });

  it('care rewards are independent from the game-specific cooldown', async () => {
    const f = fixture(); const chickId = await f.initial();
    await round(f);
    await f.call('careAction', operation({ chickId, action: 'feed' }));
    const cared = await f.call('careAction', operation({ chickId, action: 'play' }));
    expect(cared.result.rewarded).toBe(true);
    expect(cared.state.player.feathers).toBe(2);
    expect((await round(f)).result.rewarded).toBe(false);
  });
});

describe('gift reservations in the ordinary gameplay domain', () => {
  async function reservedFixture() {
    const f = fixture(); await f.initial(); await f.seedFeathers(6);
    const buy = await f.call('buyEgg', operation()); f.advance(BALANCE.incubationMs);
    const hatch = await f.call('hatchEgg', operation({ eggId: buy.result.eggId }));
    const chickId = hatch.result.chickId;
    await editState(f, state => { state.gifts = [{ giftId: 'reserved-offer', chick: clone(state.chicks.find(chick => chick.id === chickId)),
      status: 'pending', expiresAt: f.now + 1000 }]; });
    return { f, chickId };
  }

  it('pending gifts expose only own reservedGiftId and block activation/rename without side effects', async () => {
    const { f, chickId } = await reservedFixture();
    const loaded = await f.call('getHome');
    expect(loaded.state.chicks.find(chick => chick.id === chickId).reservedGiftId).toBe('reserved-offer');
    expect(loaded.state).not.toHaveProperty('gifts');
    const before = await f.store.read('101');
    expect((await f.call('activateChick', operation({ chickId }))).error.code).toBe('CHICK_RESERVED');
    expect((await f.call('renameChick', operation({ chickId, name: 'Переименован' }))).error.code).toBe('CHICK_RESERVED');
    expect(await f.store.read('101')).toEqual(before);
  });

  it('exact expiry releases the reservation and does not mint anything', async () => {
    const { f, chickId } = await reservedFixture(); f.advance(1000);
    const loaded = await f.call('getHome');
    expect(loaded.state.chicks.find(chick => chick.id === chickId)).not.toHaveProperty('reservedGiftId');
    expect((await f.call('activateChick', operation({ chickId }))).ok).toBe(true);
    expect((await f.call('renameChick', operation({ chickId, name: 'Свободный' }))).ok).toBe(true);
    expect((await f.call('getHome')).state.player.feathers).toBe(0);
  });
});
