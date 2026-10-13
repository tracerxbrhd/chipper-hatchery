import { describe, expect, it } from 'vitest';
import { fixture, operation } from './helpers';
import { BALANCE } from '../tgcloud/lib/domain.js';

describe('verified context and ownership', () => {
  it.each([undefined, {}, { userId: 101 }, { initData: { user: { id: 0 } } }, { initData: { user: { id: -1 } } }, { initData: { user: { id: NaN } } }, { initData: { user: { id: 1.5 } } }])('C14 refuses unverified or invalid context %#', async auth => {
    const f = fixture(); const r = await f.service.call('bootstrap', {}, auth); expect(r.error.code).toBe('UNAUTHORIZED'); expect(f.sqlite.prepare('SELECT count(*) AS n FROM chipper_players').get().n).toBe(0);
  });
  it('U01/U02/U03/U04 A B C own independent persisted profiles', async () => {
    const f = fixture(); const ids = await Promise.all([101, 202, 303].map(id => f.initial(id))); expect(new Set(ids).size).toBe(3);
    for (let index = 0; index < 3; index++) {
      const r = await f.call('bootstrap', {}, [101, 202, 303][index]); expect(r.state.chicks).toHaveLength(1); expect(r.state.chicks[0].id).toBe(ids[index]);
    }
    await f.call('renameChick', operation({ chickId: ids[0], name: 'Луна' }));
    expect((await f.call('bootstrap')).state.chicks[0].name).toBe('Луна'); expect((await f.call('bootstrap', {}, 202)).state.chicks[0].name).not.toBe('Луна');
  });
  it.each(['careAction', 'activateChick', 'renameChick'])('C08/U09 refuses foreign and nonexistent IDs for %s', async method => {
    const f = fixture(); const first = await f.initial(); await f.initial(202);
    for (const chickId of [first, 'nonexistent']) {
      const params = operation({ chickId, ...(method === 'careAction' ? { action: 'feed' } : {}), ...(method === 'renameChick' ? { name: 'Чужой' } : {}) });
      expect((await f.call(method, params, 202)).error.code).toBe('CHICK_NOT_FOUND');
    }
    expect((await f.call('getHome')).state.chicks[0].name).toBe('Цып №1');
  });
  it('C07 rejects spoofed identity, balance, appearance and timer fields', async () => {
    const f = fixture(); const chickId = await f.initial();
    for (const extra of [{ userId: 202 }, { ownerId: 202 }, { amount: 500 }, { rarity: 'rare' }, { appearanceId: 'gold' }, { hatchReadyAt: 0 }]) {
      expect((await f.call('careAction', operation({ chickId, action: 'feed', ...extra }))).error.code).toBe('INVALID_REQUEST');
    }
    expect((await f.call('getHome')).state.player.feathers).toBe(0);
  });
  it('requires UUIDs and binds each receipt to action parameters', async () => {
    const f = fixture(); const chickId = await f.initial();
    expect((await f.call('renameChick', { chickId, name: 'Луна' })).error.code).toBe('INVALID_REQUEST');
    const op = operation({ chickId, name: 'Луна' }); await f.call('renameChick', op);
    expect((await f.call('renameChick', { ...op, name: 'Солнце' })).error.code).toBe('OPERATION_CONFLICT');
    expect((await f.call('getHome')).state.chicks[0].name).toBe('Луна');
  });
  it('does not expose receipts, attempts, analytics or other players in snapshots', async () => {
    const f = fixture(); await f.initial(); const r = await f.call('getHome'); expect(Object.keys(r.state).sort()).toEqual(['balanceVersion', 'chicks', 'egg', 'player', 'revision', 'serverNow']);
    expect(r.state.chicks[0]).not.toHaveProperty('pendingFeedAt');
  });
});

describe('minigame anti-abuse, economics and telemetry', () => {
  it('C09/C10 checks issued attempt ownership, duration and TTL', async () => {
    const f = fixture(); await f.initial(); await f.initial(202);
    expect((await f.call('finishFlapsRun', operation({ runId: 'fake', score: 2, endReason: 'crash' }))).error.code).toBe('ATTEMPT_NOT_FOUND');
    const started = await f.call('startFlapsRun', operation()); const runId = started.result.runId;
    expect((await f.call('finishFlapsRun', operation({ runId, score: 2, endReason: 'crash' }), 202)).error.code).toBe('ATTEMPT_NOT_FOUND');
    const early = await f.call('finishFlapsRun', operation({ runId, score: 0, endReason: 'crash' }));
    expect(early.ok).toBe(true); expect(early.result).toMatchObject({ rewarded: false, reason: 'too_short' });
    const another = await f.call('startFlapsRun', operation());
    f.advance(BALANCE.miniGameAttemptTtlMs + 1); expect((await f.call('finishFlapsRun', operation({ runId: another.result.runId, score: 0, endReason: 'crash' }))).error.code).toBe('ATTEMPT_EXPIRED');
  });
  it('U15 repeated rounds reward only once per rolling 20 hours and preserve sleep', async () => {
    const f = fixture(); const chickId = await f.initial(); const sleep = await f.call('careAction', operation({ chickId, action: 'sleep' }));
    const round = async () => { const s = await f.call('startFlapsRun', operation()); f.advance(25000); return f.call('finishFlapsRun', operation({ runId: s.result.runId, score: 12, endReason: 'crash' })); };
    let r = await round(); expect(r.result.rewarded).toBe(true); expect(r.state.chicks[0].sleepUntil).toBe(sleep.state.chicks[0].sleepUntil);
    r = await round(); expect(r.result.rewarded).toBe(false); expect(r.state.player.feathers).toBe(1);
    f.advance(BALANCE.rewardCooldownMs); r = await round(); expect(r.result.rewarded).toBe(true); expect(r.state.player.feathers).toBe(2);
  });
  it('C06 rejects insufficient funds and U13 ordinary eggs need three hours', async () => {
    const f = fixture(); const first = await f.initial(); expect((await f.call('buyEgg', operation())).error.code).toBe('INSUFFICIENT_FEATHERS');
    await f.seedFeathers(6); const buy = await f.call('buyEgg', operation()); expect(buy.state.player.feathers).toBe(0);
    const eggId = buy.state.egg.id; expect((await f.call('hatchEgg', operation({ eggId }))).error.code).toBe('EGG_NOT_READY');
    f.advance(BALANCE.incubationMs); const hatch = await f.call('hatchEgg', operation({ eggId })); expect(hatch.state.chicks).toHaveLength(2); expect(hatch.state.player.activeChickId).toBe(first); expect(hatch.state.egg).toBe(null);
  });
  it('server telemetry records game milestones once and refuses fabricated rewards', async () => {
    const f = fixture(); await f.initial(); await f.call('logEvent', operation({ event: 'app_error', details: { code: 'NETWORK', screen: 'home' } }));
    expect((await f.call('logEvent', operation({ event: 'care_reward_claimed' }))).error.code).toBe('INVALID_REQUEST');
    const row = await f.store.read('101'); expect(row.state.telemetry.totals.first_hatch).toBe(1); expect(row.state.telemetry.errors).toEqual([{ at: f.now, code: 'NETWORK', screen: 'home' }]);
  });
  it('care milestones for second bird are separate from global feather cooldown (C11)', async () => {
    const f = fixture(); const first = await f.initial(); await f.seedFeathers(6); const bought = await f.call('buyEgg', operation()); f.advance(BALANCE.incubationMs);
    const h = await f.call('hatchEgg', operation({ eggId: bought.state.egg.id })); const second = h.result.chickId;
    for (const chickId of [first, second]) { await f.call('activateChick', operation({ chickId })); await f.call('careAction', operation({ chickId, action: 'feed' })); await f.call('careAction', operation({ chickId, action: 'play' })); }
    const r = await f.call('getHome'); expect(r.state.player.feathers).toBe(1); expect(r.state.chicks.map(c => c.careMilestones.length)).toEqual([1, 1]);
  });
});
