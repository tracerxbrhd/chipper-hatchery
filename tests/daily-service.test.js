import { describe, expect, it } from 'vitest';
import { BALANCE } from '../tgcloud/lib/domain.js';
import { DAILY_BONUS_CONFIG } from '../tgcloud/lib/dailyBonus.js';
import { createGameService } from '../tgcloud/lib/service.js';
import { ctx, fixture, operation } from './helpers';

const DAY = DAILY_BONUS_CONFIG.dayMs;

describe('daily bonus durable receipts through production service on real SQLite', () => {
  it('D01/D02 adds one feather with daily state and one atomic owner receipt', async () => {
    const f = fixture(); await f.initial();
    const available = await f.call('getDailyBonus');
    expect(available.ok).toBe(true);
    expect(available.result.dailyBonus.available).toBe(true);
    const request = operation();
    const claimed = await f.call('claimDailyBonus', request);
    expect(claimed.ok).toBe(true);
    expect(claimed.result).toMatchObject({ rewarded: true, rewardAmount: 1, dailyBonus: { available: false } });
    const row = await f.store.read('101');
    expect(row.state.player.feathers).toBe(1);
    expect(row.state.player.dailyBonus).toEqual({ lastClaimDayUTC: Math.floor(f.now / DAY), lastClaimAt: f.now, claimsTotal: 1 });
    expect(row.state.receipts[request.operationId]).toMatchObject({ fingerprint: '["claimDailyBonus",{}]', result: claimed.result, at: f.now });
    const replay = await f.call('claimDailyBonus', request);
    expect(replay.ok).toBe(true);
    expect(replay.result).toEqual(claimed.result);
    expect(replay.state.player.feathers).toBe(1);
    const second = await f.call('claimDailyBonus', operation());
    expect(second.error).toMatchObject({ code: 'ALREADY_CLAIMED', retryAt: (Math.floor(f.now / DAY) + 1) * DAY });
  });

  it('D03 ten different UUIDs race against the same SQLite revision and only one earns', async () => {
    const f = fixture(); await f.initial();
    const requests = Array.from({ length: 10 }, () => operation());
    const results = await Promise.all(requests.map(request => f.call('claimDailyBonus', request)));
    expect(results.filter(result => result.ok)).toHaveLength(1);
    expect(results.filter(result => !result.ok).map(result => result.error.code)).toEqual(Array(9).fill('ALREADY_CLAIMED'));
    const row = await f.store.read('101');
    expect(row.state.player.feathers).toBe(1);
    expect(row.state.player.dailyBonus.claimsTotal).toBe(1);
    expect(requests.filter(request => Object.hasOwn(row.state.receipts, request.operationId))).toHaveLength(1);
  });

  it('D02 ten identical requests return the same receipt and perform one credit', async () => {
    const f = fixture(); await f.initial(); const request = operation();
    const results = await Promise.all(Array.from({ length: 10 }, () => f.call('claimDailyBonus', request)));
    expect(results.every(result => result.ok && result.result.rewarded)).toBe(true);
    expect(new Set(results.map(result => JSON.stringify(result.result))).size).toBe(1);
    const row = await f.store.read('101');
    expect(row.state.player.feathers).toBe(1);
    expect(row.state.player.dailyBonus.claimsTotal).toBe(1);
  });

  it('D04 grants once per side of UTC midnight under simultaneous different requests', async () => {
    const f = fixture(); await f.initial();
    f.advance((Math.floor(f.now / DAY) + 1) * DAY - f.now - 1);
    const first = await Promise.all(Array.from({ length: 10 }, () => f.call('claimDailyBonus', operation())));
    expect(first.filter(result => result.ok)).toHaveLength(1);
    f.advance(1);
    const second = await Promise.all(Array.from({ length: 10 }, () => f.call('claimDailyBonus', operation())));
    expect(second.filter(result => result.ok)).toHaveLength(1);
    expect((await f.store.read('101')).state.player).toMatchObject({ feathers: 2, dailyBonus: { claimsTotal: 2 } });
  });

  it.each([{ now: Date.UTC(2050, 0, 1) }, { timezone: 'Pacific/Kiritimati' }, { userId: 202 }, { rewardAmount: 999 }])('D05 rejects client authority fields %o', async extra => {
    const f = fixture(); await f.initial();
    const before = await f.store.read('101');
    const result = await f.call('claimDailyBonus', operation(extra));
    expect(result.error.code).toBe('INVALID_REQUEST');
    expect(await f.store.read('101')).toEqual(before);
  });

  it('D05 uses only verified identity; unsigned calls cannot create/claim a profile', async () => {
    const f = fixture(); await f.initial();
    for (const fakeCtx of [{}, { user: { id: 101 } }, { initDataUnsafe: { user: { id: 101 } } }]) {
      expect((await f.service.call('claimDailyBonus', operation(), fakeCtx)).error.code).toBe('UNAUTHORIZED');
    }
    expect((await f.call('claimDailyBonus', operation(), 202)).error.code).toBe('PROFILE_NOT_FOUND');
    expect(await f.store.read('202')).toBeNull();
    expect((await f.store.read('101')).state.player.feathers).toBe(0);
  });

  it('D06/D09 old receipt after seven days remains one old credit; fresh key earns one current gift', async () => {
    const f = fixture(); await f.initial(); const request = operation();
    const original = await f.call('claimDailyBonus', request);
    f.advance(7 * DAY);
    const replay = await f.call('claimDailyBonus', request);
    expect(replay.result).toEqual(original.result);
    expect(replay.state.dailyBonus.available).toBe(true);
    expect(replay.state.player.feathers).toBe(1);
    const current = await f.call('claimDailyBonus', operation());
    expect(current.result.rewardAmount).toBe(1);
    expect(current.state.player.feathers).toBe(2);
  });

  it('D07 before hatch/name completion daily is unavailable and no mutation/receipt is persisted', async () => {
    const f = fixture(); const boot = await f.call('bootstrap'); const request = operation();
    const before = await f.store.read('101');
    expect(boot.state.dailyBonus.available).toBe(false);
    expect((await f.call('claimDailyBonus', request)).error.code).toBe('FIRST_HATCH_REQUIRED');
    expect(await f.store.read('101')).toEqual(before);
    const hatched = await f.call('hatchEgg', operation({ eggId: boot.state.egg.id }));
    expect(hatched.state.player.onboarding).toBe('name');
    expect((await f.call('claimDailyBonus', request)).error.code).toBe('FIRST_HATCH_REQUIRED');
    await f.call('completeOnboarding', operation());
    expect((await f.call('claimDailyBonus', request)).state.player.feathers).toBe(1);
  });

  it('D08 leaves care, Flaps and TD cooldowns unchanged while concurrent care commits safely', async () => {
    const f = fixture(); const chickId = await f.initial();
    const initial = await f.store.read('101');
    initial.state.player.miniGameRewardAt = f.now;
    initial.state.player.games['chippster-flaps'].lastRewardAt = f.now;
    initial.state.player.games['nest-defense'].lastRewardAt = f.now;
    await f.store.compareAndSwap('101', initial.revision, initial.state);
    const results = await Promise.all([
      f.call('claimDailyBonus', operation()),
      f.call('careAction', operation({ chickId, action: 'feed' })),
      f.call('careAction', operation({ chickId, action: 'play' })),
    ]);
    expect(results.every(result => result.ok)).toBe(true);
    const row = await f.store.read('101');
    expect(row.state.player.feathers).toBe(2);
    expect(row.state.player.careRewardAt).toBe(f.now);
    expect(row.state.player.miniGameRewardAt).toBe(f.now);
    expect(row.state.player.games['chippster-flaps'].lastRewardAt).toBe(f.now);
    expect(row.state.player.games['nest-defense'].lastRewardAt).toBe(f.now);
    expect(row.state.chicks[0].lastFeedAt).toBe(f.now);
    expect(row.state.chicks[0].lastPlayAt).toBe(f.now);
  });

  it('D09 lost CAS response survives recreated service with the same key and preserved receipt', async () => {
    const f = fixture(); await f.initial(); const request = operation(); f.loseNextResponse();
    const lost = await f.call('claimDailyBonus', request);
    expect(lost.error).toMatchObject({ code: 'TEMPORARILY_UNAVAILABLE', retryable: true });
    const reopened = createGameService({ store: f.store, now: () => f.now });
    const recovered = await reopened.call('claimDailyBonus', request, ctx());
    expect(recovered.ok).toBe(true);
    expect(recovered.state.player.feathers).toBe(1);
    expect(recovered.state.player.dailyBonus.claimsTotal).toBe(1);
    expect(recovered.result).toEqual((await f.store.read('101')).state.receipts[request.operationId].result);
  });

  it('D01 migration does not reward reads/reroll legacy birds or reset old cooldowns', async () => {
    const f = fixture(); await f.initial();
    const before = await f.store.read('101');
    delete before.state.player.dailyBonus;
    before.state.player.feathers = 17;
    before.state.player.careRewardAt = f.now;
    before.state.player.miniGameRewardAt = f.now;
    before.state.player.games['chippster-flaps'].lastRewardAt = f.now;
    await f.store.compareAndSwap('101', before.revision, before.state);
    f.advance(BALANCE.hourMs);
    const read = await f.call('getDailyBonus');
    expect(read.state.player.feathers).toBe(17);
    expect(read.state.player.careRewardAt).toBe(before.state.player.careRewardAt);
    expect(read.state.player.miniGameRewardAt).toBe(before.state.player.miniGameRewardAt);
    expect(read.state.chicks[0].id).toBe(before.state.chicks[0].id);
    expect(read.state.chicks[0].genes).toEqual(before.state.chicks[0].genes);
    expect((await f.store.read('101')).state.receipts).toEqual(before.state.receipts);
  });

  it('old daily operation keys cannot be reused for another aggregate method', async () => {
    const f = fixture(); const chickId = await f.initial(); const request = operation();
    await f.call('claimDailyBonus', request);
    const conflict = await f.call('renameChick', { ...request, chickId, name: 'Подмена' });
    expect(conflict.error.code).toBe('OPERATION_CONFLICT');
    expect((await f.store.read('101')).state.player.feathers).toBe(1);
  });

  it('clock rollback cannot reopen a UTC day already committed', async () => {
    const f = fixture(); await f.initial(); await f.call('claimDailyBonus', operation());
    f.advance(-2 * DAY);
    const refused = await f.call('claimDailyBonus', operation());
    expect(refused.error.code).toBe('ALREADY_CLAIMED');
    expect((await f.store.read('101')).state.player.feathers).toBe(1);
  });
});
