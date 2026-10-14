import { describe, expect, it } from 'vitest';
import { fixture, operation } from './helpers.js';

const signedContext = (id = 101, first_name = 'Проверенное имя') => ({ initData: { user: { id, first_name, username: 'verified_username' } } });
const budgetRow = (f, method, owner = 101) => f.sqlite.prepare('SELECT * FROM chipper_social_limits WHERE key=?').get(`v04:${owner}:${method}`);

describe('v0.4 production service request budgets and persisted identity', () => {
  it('120 verified bootstrap calls pass, the 121st cannot persist its different identity, and the next minute reopens', async () => {
    const f = fixture(); const owner = signedContext();
    expect((await f.service.call('bootstrap', {}, owner)).ok).toBe(true);
    const calls = await Promise.all(Array.from({ length: 119 }, () => f.service.call('bootstrap', {}, owner)));
    expect(calls.every((result) => result.ok)).toBe(true);
    expect(budgetRow(f, 'bootstrap').count).toBe(120);
    const before = await f.store.read('101');
    const rejected = await f.service.call('bootstrap', {}, signedContext(101, 'Имя отклонённого обновления'));
    expect(rejected).toMatchObject({ ok: false, error: { code: 'REQUEST_RATE_LIMIT', retryable: true } });
    expect(await f.store.read('101')).toEqual(before);
    expect(before.state.player.telegramIdentity.firstName).toBe('Проверенное имя');
    expect(budgetRow(f, 'bootstrap').count).toBe(120);
    const nextMinute = rejected.error.retryAt;
    f.advance(nextMinute - f.now);
    expect((await f.service.call('bootstrap', {}, signedContext(101, 'Новое разрешённое имя'))).ok).toBe(true);
    expect(budgetRow(f, 'bootstrap').count).toBe(1);
    expect((await f.store.read('101')).state.player.telegramIdentity.firstName).toBe('Новое разрешённое имя');
    f.sqlite.close();
  }, 20000);

  it('600 getHome reads support internal social calls; overflow cannot save identity and another owner is independent', async () => {
    const f = fixture(); await f.initial(101); await f.initial(202);
    const owner = signedContext();
    expect((await f.service.call('getHome', {}, owner)).ok).toBe(true);
    const calls = await Promise.all(Array.from({ length: 599 }, () => f.service.call('getHome', {}, owner)));
    expect(calls.every((result) => result.ok)).toBe(true);
    expect(budgetRow(f, 'getHome').count).toBe(600);
    const before = await f.store.read('101');
    expect(await f.service.call('getHome', {}, signedContext(101, 'Отклонённое имя'))).toMatchObject({ ok: false, error: { code: 'REQUEST_RATE_LIMIT' } });
    expect(await f.store.read('101')).toEqual(before);
    expect((await f.service.call('getHome', {}, signedContext(202, 'Другой игрок'))).ok).toBe(true);
    expect(budgetRow(f, 'getHome', 202).count).toBe(1);
    expect(budgetRow(f, 'getHome').count).toBe(600);
    f.sqlite.close();
  }, 20000);

  it('daily/Codex own reads each stop at 60 without changing economy or blocking other read methods', async () => {
    const f = fixture(); await f.initial();
    const before = await f.store.read('101');
    const calls = await Promise.all(['getDailyBonus', 'listTraitCodex'].flatMap((method) =>
      Array.from({ length: 60 }, () => f.call(method))));
    expect(calls.every((result) => result.ok)).toBe(true);
    for (const method of ['getDailyBonus', 'listTraitCodex']) {
      expect(budgetRow(f, method).count).toBe(60);
      expect(budgetRow(f, method).seen_json).toBe('{}');
      expect(await f.call(method)).toMatchObject({ ok: false, error: { code: 'REQUEST_RATE_LIMIT' } });
      expect(budgetRow(f, method).count).toBe(60);
    }
    expect(await f.store.read('101')).toEqual(before);
    expect((await f.call('getHome')).ok).toBe(true);
    expect((await f.call('bootstrap')).ok).toBe(true);
    expect((await f.store.read('101')).state.player.feathers).toBe(0);
    f.sqlite.close();
  }, 20000);

  it('successful daily receipt bypasses a full fresh-claim budget forever without another credit', async () => {
    const f = fixture(); await f.initial();
    const winner = operation(); const success = await f.call('claimDailyBonus', winner);
    expect(success.ok).toBe(true); expect(success.result.rewardAmount).toBe(1);
    const losers = await Promise.all(Array.from({ length: 59 }, () => f.call('claimDailyBonus', operation())));
    expect(losers.every((result) => !result.ok && result.error.code === 'ALREADY_CLAIMED')).toBe(true);
    expect(budgetRow(f, 'claimDailyBonus').count).toBe(60);
    expect(Object.keys(JSON.parse(budgetRow(f, 'claimDailyBonus').seen_json))).toHaveLength(60);
    expect(await f.call('claimDailyBonus', operation())).toMatchObject({ ok: false, error: { code: 'REQUEST_RATE_LIMIT' } });
    const before = await f.store.read('101'); const fullBudget = budgetRow(f, 'claimDailyBonus');
    const replays = await Promise.all(Array.from({ length: 10 }, () => f.call('claimDailyBonus', winner)));
    expect(replays.every((result) => result.ok && JSON.stringify(result.result) === JSON.stringify(success.result))).toBe(true);
    expect(await f.store.read('101')).toEqual(before);
    expect(budgetRow(f, 'claimDailyBonus')).toEqual(fullBudget);
    expect(before.state.player.feathers).toBe(1); expect(before.state.player.dailyBonus.claimsTotal).toBe(1);
    f.advance(8 * 86400000);
    const oldReceipt = await f.call('claimDailyBonus', winner);
    expect(oldReceipt.ok).toBe(true); expect(oldReceipt.result).toEqual(success.result);
    expect(oldReceipt.state.player.feathers).toBe(1);
    expect(budgetRow(f, 'claimDailyBonus')).toEqual(fullBudget);
    f.sqlite.close();
  }, 20000);

  it('invalid body and unsafe identity fail before consuming budgets or storing metadata', async () => {
    const f = fixture(); await f.initial();
    const before = await f.store.read('101');
    expect(await f.service.call('getHome', {}, { initDataUnsafe: { user: { id: 101, first_name: 'Подделка' } } })).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } });
    expect(await f.call('listTraitCodex', { unlocks: ['headShape:wide'] })).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } });
    expect(await f.call('claimDailyBonus', operation({ timezone: 'UTC+99' }))).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } });
    expect(budgetRow(f, 'getHome')).toBeUndefined();
    expect(budgetRow(f, 'listTraitCodex')).toBeUndefined();
    expect(budgetRow(f, 'claimDailyBonus')).toBeUndefined();
    expect(await f.store.read('101')).toEqual(before);
    f.sqlite.close();
  });
});
