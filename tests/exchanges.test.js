import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { exchangeFixture } from './exchanges-helpers.js';
import { operation, ctx } from './helpers.js';
import { clone } from '../tgcloud/lib/domain.js';
import { EXCHANGE_TTL_MS, createExchangeService } from '../tgcloud/lib/exchanges.js';

describe('0.5 atomic bilateral exchange', () => {
  it('moves both original birds, mirrors history and never changes currency or active IDs', async () => {
    const f = await exchangeFixture(), beforeA = await f.store.read('101'), beforeB = await f.store.read('202');
    const { exchangeId } = await f.offerExchange();
    const result = await f.exchange('respondExchange', operation({ exchangeId, accept: true }), 202);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(f.owners()).toEqual([202]); expect(f.owners(f.requested.id)).toEqual([101]);
    const a = (await f.store.read('101')).state, b = (await f.store.read('202')).state;
    expect(a.chicks.find(x => x.id === f.requested.id)).toEqual(beforeB.state.chicks.find(x => x.id === f.requested.id));
    expect(b.chicks.find(x => x.id === f.extra.id)).toEqual(beforeA.state.chicks.find(x => x.id === f.extra.id));
    expect(a.exchanges).toEqual(b.exchanges); expect(a.exchanges[0].status).toBe('accepted');
    expect(a.player.activeChickId).toBe(beforeA.state.player.activeChickId); expect(b.player.activeChickId).toBe(beforeB.state.player.activeChickId);
    expect(f.totalFeathers()).toBe(0);
    expect(JSON.stringify(result.result)).not.toMatch(/senderId|recipientId|telegramId|hunger|sleepUntil/);
    f.sqlite.close();
  });
  it('reserves only offered bird across activation, rename, gift and duplicate exchange', async () => {
    const f = await exchangeFixture(); const { exchangeId } = await f.offerExchange();
    const home = await f.call('getHome'); expect(home.state.chicks.find(x => x.id === f.extra.id).reservedExchangeId).toBe(exchangeId);
    for (const method of ['activateChick', 'renameChick']) expect((await f.call(method, operation({ chickId: f.extra.id, ...(method === 'renameChick' ? { name: 'Нет' } : {}) }))).error.code).toBe('CHICK_RESERVED');
    expect((await f.gift('offerGift', operation({ chickId: f.extra.id, recipientProfileId: f.profileId(202) }))).error.code).toBe('CHICK_RESERVED');
    expect((await f.exchange('offerExchange', operation({ chickId: f.extra.id, recipientProfileId: f.profileId(202), requestedChickId: f.requested.id }))).error.code).toBe('EXCHANGE_UNAVAILABLE');
    expect((await f.call('activateChick', operation({ chickId: f.requested.id }), 202)).ok).toBe(true);
    expect((await f.exchange('respondExchange', operation({ exchangeId, accept: true }), 202)).error.code).toBe('EXCHANGE_UNAVAILABLE');
    expect(f.owners()).toEqual([101]); f.sqlite.close();
  });
  it('gift reservation prevents exchange and cancellation releases offered reservation', async () => {
    const f = await exchangeFixture(); const gift = await f.offer();
    expect((await f.exchange('offerExchange', operation({ chickId: f.extra.id, recipientProfileId: f.profileId(202), requestedChickId: f.requested.id }))).error.code).toBe('EXCHANGE_UNAVAILABLE');
    await f.gift('cancelGift', operation({ giftId: gift.giftId }));
    const { exchangeId } = await f.offerExchange(); expect((await f.exchange('cancelExchange', operation({ exchangeId }))).ok).toBe(true);
    expect((await f.call('activateChick', operation({ chickId: f.extra.id }))).ok).toBe(true); f.sqlite.close();
  });
  it('decline and cancel atomically update both mirrors after unfriend', async () => {
    for (const decline of [false, true]) {
      const f = await exchangeFixture(); const { exchangeId } = await f.offerExchange();
      f.sqlite.prepare("UPDATE chipper_friendships SET status='removed'").run();
      const result = await f.exchange(decline ? 'respondExchange' : 'cancelExchange', operation({ exchangeId, ...(decline ? { accept: false } : {}) }), decline ? 202 : 101);
      expect(result.ok).toBe(true); expect((await f.store.read('101')).state.exchanges).toEqual((await f.store.read('202')).state.exchanges);
      expect(f.owners()).toEqual([101]); f.sqlite.close();
    }
  });
  it('expiry derives from server time, releases offered bird and does not mutate foreign rows on list', async () => {
    const f = await exchangeFixture(); const { exchangeId } = await f.offerExchange(); f.advance(EXCHANGE_TTL_MS);
    const before = await f.store.read('202'); const list = await f.exchange('listExchanges');
    expect(list.result.exchanges[0].status).toBe('expired'); expect(await f.store.read('202')).toEqual(before);
    expect((await f.exchange('respondExchange', operation({ exchangeId, accept: true }), 202)).error.code).toBe('EXCHANGE_EXPIRED');
    expect((await f.call('activateChick', operation({ chickId: f.extra.id }))).ok).toBe(true); f.sqlite.close();
  });
  it('private collection, active/last birds and foreign IDs reject without disclosing requested preview', async () => {
    const f = await exchangeFixture();
    const offer = operation({ chickId: f.extra.id, recipientProfileId: f.profileId(202), requestedChickId: f.requested.id });
    f.sqlite.prepare("UPDATE chipper_social_profiles SET collection_visibility='private' WHERE telegram_id=202").run();
    expect((await f.exchange('offerExchange', offer)).error.code).toBe('EXCHANGE_UNAVAILABLE');
    f.sqlite.prepare("UPDATE chipper_social_profiles SET collection_visibility='friends' WHERE telegram_id=202").run();
    const active = (await f.store.read('202')).state.player.activeChickId;
    expect((await f.exchange('offerExchange', { ...offer, operationId: randomUUID(), requestedChickId: active })).error.code).toBe('EXCHANGE_UNAVAILABLE');
    expect((await f.exchange('offerExchange', { ...offer, operationId: randomUUID(), requestedChickId: 'foreign-bird' })).error.code).toBe('EXCHANGE_UNAVAILABLE'); f.sqlite.close();
  });
  it('rechecks friendship and privacy inside offer commit and friendship inside accept commit', async () => {
    const f = await exchangeFixture(); const { exchangeId } = await f.offerExchange();
    f.interceptOnce(({ type, query }) => {
      if (type === 'run' && query.includes('WITH eligible AS MATERIALIZED')) { f.sqlite.prepare("UPDATE chipper_friendships SET low_blocked=1").run(); return true; }
      return false;
    });
    expect((await f.exchange('respondExchange', operation({ exchangeId, accept: true }), 202)).error.code).toBe('FRIEND_REQUIRED');
    expect(f.owners()).toEqual([101]); f.sqlite.close();
    const g = await exchangeFixture(); g.interceptOnce(({ type, query }) => {
      if (type === 'run' && query.includes('WITH eligible AS MATERIALIZED')) { g.sqlite.prepare("UPDATE chipper_social_profiles SET collection_visibility='private' WHERE telegram_id=202").run(); return true; }
      return false;
    });
    const offered = await g.exchange('offerExchange', operation({ chickId: g.extra.id, recipientProfileId: g.profileId(202), requestedChickId: g.requested.id }));
    expect(offered.error.code).toBe('EXCHANGE_UNAVAILABLE'); expect((await g.store.read('101')).state.exchanges).toBeUndefined(); g.sqlite.close();
  });
  it('lost committed offer/accept replies recover with same keys and fresh terminal keys cannot swap again', async () => {
    const f = await exchangeFixture(); const request = operation({ chickId: f.extra.id, recipientProfileId: f.profileId(202), requestedChickId: f.requested.id });
    f.loseNextResponse(); expect((await f.exchange('offerExchange', request)).ok).toBe(false); f.restartExchange();
    const offered = await f.exchange('offerExchange', request), exchangeId = offered.result.exchange.exchangeId;
    expect((await f.store.read('101')).state.exchanges).toHaveLength(1);
    const accept = operation({ exchangeId, accept: true }); f.loseNextResponse(); expect((await f.exchange('respondExchange', accept, 202)).ok).toBe(false); f.restartExchange();
    expect((await f.exchange('respondExchange', accept, 202)).ok).toBe(true);
    const terminal = await f.store.read('202');
    expect((await f.exchange('respondExchange', operation({ exchangeId, accept: true }), 202)).ok).toBe(true);
    expect((await f.store.read('202')).state.exchangeReceipts).toEqual(terminal.state.exchangeReceipts);
    expect((await f.exchange('offerExchange', request)).result.exchange.status).toBe('accepted');
    expect(f.owners()).toEqual([202]); expect(f.owners(f.requested.id)).toEqual([101]); f.sqlite.close();
  });
  it('shares operation keys with game/gift/TD and rejects forged payloads before state changes', async () => {
    const f = await exchangeFixture(); const { request, exchangeId } = await f.offerExchange();
    expect((await f.call('claimDailyBonus', { operationId: request.operationId })).error.code).toBe('OPERATION_CONFLICT');
    expect((await f.gift('cancelGift', { operationId: request.operationId, giftId: exchangeId })).error.code).toBe('OPERATION_CONFLICT');
    const same = { ...request, requestedChickId: 'other-bird' };
    expect((await f.exchange('offerExchange', same)).error.code).toBe('OPERATION_CONFLICT');
    const game = operation(); await f.call('claimDailyBonus', game);
    expect((await f.exchange('cancelExchange', { operationId: game.operationId, exchangeId })).error.code).toBe('OPERATION_CONFLICT');
    const before = await f.store.read('101');
    expect((await f.exchange('offerExchange', { ...request, now: 999, reward: 99 })).error.code).toBe('INVALID_REQUEST');
    expect(await f.store.read('101')).toEqual(before);
    expect((await f.exchange('respondExchange', operation({ exchangeId, accept: true }), 303)).error.code).toBe('EXCHANGE_NOT_FOUND'); f.sqlite.close();
  });
  it('ten acceptors plus daily and refresh preserve one swap and all effects', async () => {
    const f = await exchangeFixture(); const { exchangeId } = await f.offerExchange();
    const results = await Promise.all([...Array.from({ length: 10 }, () => f.exchange('respondExchange', operation({ exchangeId, accept: true }), 202)),
      f.call('claimDailyBonus', operation(), 202), f.call('listTraitCodex', {}, 101)]);
    expect(results.every(x => x.ok), JSON.stringify(results.filter(x => !x.ok))).toBe(true);
    expect(f.owners()).toEqual([202]); expect(f.owners(f.requested.id)).toEqual([101]); expect(f.totalFeathers()).toBe(1); f.sqlite.close();
  });
  it('list reads only own row; old state with no exchange fields is compatible', async () => {
    const f = await exchangeFixture(); f.clearLog();
    const result = await f.exchange('listExchanges'); expect(result.result.exchanges).toEqual([]);
    expect(f.log.some(x => /json_each|SELECT.*FROM chipper_players p\b/s.test(x.query))).toBe(false);
    expect((await f.store.read('101')).state).not.toHaveProperty('exchanges'); f.sqlite.close();
  });
  it('SQLite statement rolls back both mirrors/collections if second-row write fails', async () => {
    const f = await exchangeFixture(); const { exchangeId } = await f.offerExchange(); const before = [await f.store.read('101'), await f.store.read('202')];
    // Test-only trigger proves SQLite statement rollback; runtime never creates triggers.
    f.sqlite.exec("CREATE TRIGGER fail_exchange BEFORE UPDATE ON chipper_players WHEN OLD.telegram_id=202 BEGIN SELECT RAISE(ABORT,'injected'); END");
    expect((await f.exchange('respondExchange', operation({ exchangeId, accept: true }), 202)).ok).toBe(false);
    expect([await f.store.read('101'), await f.store.read('202')]).toEqual(before); f.sqlite.close();
  });
  it('mirror corruption fails safely and unknown caller cannot bootstrap', async () => {
    const f = await exchangeFixture(); const { exchangeId } = await f.offerExchange(); const row = await f.store.read('202');
    row.state.exchanges[0].requestedChick.name = 'corrupt'; await f.store.compareAndSwap('202', row.revision, row.state);
    expect((await f.exchange('respondExchange', operation({ exchangeId, accept: true }), 202)).ok).toBe(false); expect(f.owners()).toEqual([101]);
    expect((await f.exchange('listExchanges', {}, 999)).error.code).toBe('PROFILE_NOT_FOUND');
    const svc = createExchangeService({ database: f.database, store: f.store, gameService: f.service });
    expect((await svc.call('listExchanges', {}, { initDataUnsafe: ctx(101).initData })).error.code).toBe('UNAUTHORIZED'); f.sqlite.close();
  });
  it('requested bird may be gifted away while offer waits; no substitute is transferred', async () => {
    const f = await exchangeFixture(); const { exchangeId } = await f.offerExchange();
    const row = await f.store.read('202'), offered = clone(row.state.chicks.find(x => x.id === f.requested.id));
    row.state.chicks = row.state.chicks.filter(x => x.id !== offered.id); await f.store.compareAndSwap('202', row.revision, row.state);
    expect((await f.exchange('respondExchange', operation({ exchangeId, accept: true }), 202)).error.code).toBe('EXCHANGE_UNAVAILABLE'); expect(f.owners()).toEqual([101]); f.sqlite.close();
  });
  it('future exchange history version is preserved and refuses reinterpretation', async () => {
    const f = await exchangeFixture(); await f.offerExchange(); const row = await f.store.read('101');
    row.state.exchanges[0].version = 2; await f.store.compareAndSwap('101', row.revision, row.state);
    const before = await f.store.read('101'); expect((await f.exchange('listExchanges')).error.code).toBe('INVALID_SAVE');
    expect(await f.store.read('101')).toEqual(before); f.sqlite.close();
  });
});
