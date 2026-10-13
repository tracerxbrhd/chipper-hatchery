import { describe, expect, it, vi } from 'vitest';
import { operation, ctx } from './helpers.js';
import { giftFixture } from './gifts-helpers.js';
import { GIFT_TTL_MS, isChickReserved } from '../tgcloud/lib/gifts.js';

describe('real SQLite gifts: ownership and durable single-statement transfer', () => {
  it('P01 reserves a nonactive bird and whitelists the preview', async () => {
    const f = await giftFixture(); const beforeFeathers = f.totalFeathers();
    const offered = await f.offer();
    const gift = offered.result.result.gift;
    expect(gift.status).toBe('pending');
    expect(gift.expiresAt - gift.createdAt).toBe(GIFT_TTL_MS);
    expect(gift.giftId).toMatch(new RegExp(`^${f.profileId(101)}\\.`));
    expect(isChickReserved((await f.store.read('101')).state, f.extra.id, f.now)).toBe(true);
    expect(f.owners()).toEqual([101]); expect(f.totalFeathers()).toBe(beforeFeathers);
    expect(Object.keys(gift.chick).sort()).toEqual(['appearanceId', 'appearanceVersion', 'bornAt', 'genes', 'id', 'name', 'rarity', 'stage']);
    expect(JSON.stringify(gift)).not.toMatch(/telegramId|recipientId|receipt|hunger|pendingFeedAt/);
  });

  it('P02 refuses active and only birds without writes', async () => {
    const f = await giftFixture(); const active = (await f.store.read('101')).state.player.activeChickId;
    expect((await f.gift('offerGift', operation({ chickId: active, recipientProfileId: f.profileId(202) }))).error.code).toBe('CHICK_NOT_GIFTABLE');
    const only = (await f.store.read('202')).state.chicks[0].id;
    expect((await f.gift('offerGift', operation({ chickId: only, recipientProfileId: f.profileId(101) }), 202)).error.code).toBe('CHICK_NOT_GIFTABLE');
    expect(f.owners()).toEqual([101]);
  });

  it('P03/P14 preserves complete bird, active owner and all feathers', async () => {
    const f = await giftFixture(); const active = (await f.store.read('101')).state.player.activeChickId;
    const feathers = f.totalFeathers(); const { giftId } = await f.offer();
    f.clearLog();
    const accepted = await f.gift('respondGift', operation({ giftId, accept: true }), 202);
    expect(accepted.ok).toBe(true); expect(accepted.result.gift.status).toBe('accepted');
    expect(f.owners()).toEqual([202]); expect(f.totalFeathers()).toBe(feathers);
    expect((await f.store.read('202')).state.chicks.find((chick) => chick.id === f.extra.id)).toEqual(f.extra);
    const sender = (await f.store.read('101')).state;
    expect(sender.player.activeChickId).toBe(active);
    expect(sender.chicks.some((chick) => chick.id === active)).toBe(true);
    const writes = f.log.filter((entry) => entry.type === 'run' && /WITH eligible AS MATERIALIZED/.test(entry.query));
    expect(writes).toHaveLength(1); expect(writes[0].affected).toBe(2);
    expect(f.log.some((entry) => /\bBEGIN\b|\bDELETE\b|\bINSERT INTO chipper_players\b/i.test(entry.query))).toBe(false);
  });

  it('P04 cancellation retains sender ownership and releases reservation', async () => {
    const f = await giftFixture(); const { giftId } = await f.offer();
    const cancelled = await f.gift('cancelGift', operation({ giftId }));
    expect(cancelled.result.gift.status).toBe('cancelled'); expect(f.owners()).toEqual([101]);
    expect(isChickReserved((await f.store.read('101')).state, f.extra.id, f.now)).toBe(false);
    expect((await f.gift('respondGift', operation({ giftId, accept: true }), 202)).error.code).toBe('GIFT_NOT_PENDING');
  });

  it('P05 recipient decline safely releases bird', async () => {
    const f = await giftFixture(); const { giftId } = await f.offer();
    expect((await f.gift('respondGift', operation({ giftId, accept: false }), 202)).result.gift.status).toBe('declined');
    expect(f.owners()).toEqual([101]);
    expect(isChickReserved((await f.store.read('101')).state, f.extra.id, f.now)).toBe(false);
  });

  it('P05 expiry persists sender history and never loses bird', async () => {
    const f = await giftFixture(); const { giftId } = await f.offer(); f.advance(GIFT_TTL_MS);
    expect((await f.gift('respondGift', operation({ giftId, accept: true }), 202)).error.code).toBe('GIFT_EXPIRED');
    const listed = await f.gift('listGifts', {}, 202);
    expect(listed.result.gifts[0].status).toBe('expired');
    expect((await f.store.read('101')).state.gifts[0].status).toBe('expired');
    expect(f.owners()).toEqual([101]);
  });

  it('P06 simultaneous offers to two recipients reserve exactly once', async () => {
    const f = await giftFixture();
    const results = await Promise.all([202, 303].map((actor) => f.gift('offerGift', operation({ chickId: f.extra.id, recipientProfileId: f.profileId(actor) }))));
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.find((result) => !result.ok).error.code).toBe('CHICK_RESERVED');
    expect((await f.store.read('101')).state.gifts.filter((gift) => gift.status === 'pending')).toHaveLength(1);
    expect(f.owners()).toEqual([101]);
  });

  it('P01 offer versus activate race never reserves an active bird', async () => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const f = await giftFixture();
      const offer = () => f.gift('offerGift', operation({ chickId: f.extra.id, recipientProfileId: f.profileId(202) }));
      const activate = () => f.call('activateChick', operation({ chickId: f.extra.id }));
      const results = await Promise.all(attempt % 2 ? [activate(), offer()] : [offer(), activate()]);
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      const sender = (await f.store.read('101')).state;
      expect(sender.player.activeChickId === f.extra.id && isChickReserved(sender, f.extra.id, f.now)).toBe(false);
      expect(f.owners()).toEqual([101]);
    }
  });

  it('P07 accepts versus cancels resolve to one authoritative owner', async () => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const f = await giftFixture(); const { giftId } = await f.offer();
      const accept = () => f.gift('respondGift', operation({ giftId, accept: true }), 202);
      const cancel = () => f.gift('cancelGift', operation({ giftId }));
      await Promise.all(attempt % 2 ? [cancel(), accept()] : [accept(), cancel()]);
      const terminal = (await f.store.read('101')).state.gifts[0].status;
      expect(['accepted', 'cancelled']).toContain(terminal);
      expect(f.owners()).toEqual([terminal === 'accepted' ? 202 : 101]);
    }
  });

  it('P08 ten accepts and same-key replays transfer exactly once', async () => {
    const f = await giftFixture(); const { giftId } = await f.offer();
    const params = operation({ giftId, accept: true }); f.clearLog();
    const results = await Promise.all(Array.from({ length: 10 }, (_, index) => f.gift('respondGift', index % 2 ? params : operation({ giftId, accept: true }), 202)));
    expect(results.every((result) => result.ok && result.result.gift.status === 'accepted')).toBe(true);
    expect(f.owners()).toEqual([202]);
    expect(f.log.filter((entry) => entry.type === 'run' && /WITH eligible AS MATERIALIZED/.test(entry.query) && entry.affected === 2)).toHaveLength(1);
  });

  it('P09 response lost after atomic commit replays after service restart', async () => {
    const f = await giftFixture(); const { giftId } = await f.offer();
    const params = operation({ giftId, accept: true }); f.loseNextResponse();
    const muted = vi.spyOn(console, 'error').mockImplementation(() => {});
    const lost = await f.gift('respondGift', params, 202); muted.mockRestore();
    expect(lost.error.code).toBe('TEMPORARILY_UNAVAILABLE'); expect(f.owners()).toEqual([202]);
    f.restart(); expect((await f.gift('respondGift', params, 202)).result.gift.status).toBe('accepted');
    expect(f.owners()).toEqual([202]);
  });

  it('P09 lost offer/cancel/decline commits recover with the original request', async () => {
    for (const action of ['offerGift', 'cancelGift', 'respondGift']) {
      const f = await giftFixture();
      const offered = action === 'offerGift' ? null : await f.offer();
      const request = action === 'offerGift' ? operation({ chickId: f.extra.id, recipientProfileId: f.profileId(202) })
        : operation({ giftId: offered.giftId, ...(action === 'respondGift' ? { accept: false } : {}) });
      const actor = action === 'respondGift' ? 202 : 101;
      f.loseNextResponse(); const muted = vi.spyOn(console, 'error').mockImplementation(() => {});
      const first = await f.gift(action, request, actor); muted.mockRestore();
      expect(first.ok).toBe(false); f.restart();
      const retry = await f.gift(action, request, actor);
      expect(retry.ok).toBe(true); expect(f.owners()).toEqual([101]);
      expect((await f.store.read('101')).state.gifts).toHaveLength(1);
    }
  });

  it('P10/P15 SQLite failure on second updated row rolls back both rows', async () => {
    const f = await giftFixture(); const { giftId } = await f.offer();
    const before = f.sqlite.prepare('SELECT * FROM chipper_players ORDER BY telegram_id').all();
    // Test-only rollback fault. No triggers or runtime DDL exist in gameplay.
    f.sqlite.exec(`CREATE TRIGGER fail_receiver BEFORE UPDATE ON chipper_players
      WHEN NEW.telegram_id = 202 AND EXISTS(SELECT 1 FROM json_each(NEW.state_json,'$.chicks') WHERE json_extract(value,'$.id')='${f.extra.id}')
      BEGIN SELECT RAISE(ABORT,'injected receiver failure'); END;`);
    const muted = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await f.gift('respondGift', operation({ giftId, accept: true }), 202); muted.mockRestore();
    expect(result.ok).toBe(false);
    expect(f.sqlite.prepare('SELECT * FROM chipper_players ORDER BY telegram_id').all()).toEqual(before);
    expect(f.owners()).toEqual([101]);
    f.sqlite.exec('DROP TRIGGER fail_receiver');
    expect((await f.gift('respondGift', operation({ giftId, accept: true }), 202)).ok).toBe(true);
  });

  it('P10 faults before every accept query recover without duplicate or loss', async () => {
    const baseline = await giftFixture(); const initial = await baseline.offer(); baseline.clearLog();
    await baseline.gift('respondGift', operation({ giftId: initial.giftId, accept: true }), 202);
    const calls = baseline.log.length;
    for (let failure = 1; failure <= calls; failure += 1) {
      const f = await giftFixture(); const { giftId } = await f.offer();
      const request = operation({ giftId, accept: true }); f.failBefore(failure);
      const muted = vi.spyOn(console, 'error').mockImplementation(() => {});
      await f.gift('respondGift', request, 202); muted.mockRestore();
      expect(f.owners()).toHaveLength(1);
      f.restart(); const retry = await f.gift('respondGift', request, 202);
      expect(retry.ok).toBe(true); expect(f.owners()).toEqual([202]);
    }
  });

  it('P11 foreign actors, malformed IDs and client identity fields are rejected', async () => {
    const f = await giftFixture(); const { giftId } = await f.offer();
    expect((await f.gift('respondGift', operation({ giftId, accept: true }), 303)).error.code).toBe('GIFT_NOT_FOUND');
    expect((await f.gift('cancelGift', operation({ giftId }), 202)).error.code).toBe('GIFT_NOT_FOUND');
    expect((await f.gift('respondGift', operation({ giftId, accept: true }))).error.code).toBe('GIFT_NOT_FOUND');
    expect((await f.gift('respondGift', operation({ giftId: "' OR 1=1 --", accept: true }), 202)).error.code).toBe('INVALID_REQUEST');
    expect((await f.gift('offerGift', operation({ chickId: f.extra.id, recipientProfileId: f.profileId(202), telegramId: 202 }))).error.code).toBe('INVALID_REQUEST');
    expect((await f.gift('listGifts', {}, 303)).result.gifts).toEqual([]);
    expect(f.owners()).toEqual([101]);
  });

  it('P12 accepted friend removal/block before commit forbids transfer', async () => {
    for (const change of ["status='removed'", 'low_blocked=1', 'high_blocked=1']) {
      const f = await giftFixture(); const { giftId } = await f.offer();
      f.interceptOnce(({ type, query }) => {
        if (type !== 'run' || !query.includes('WITH eligible AS MATERIALIZED')) return false;
        f.sqlite.prepare(`UPDATE chipper_friendships SET ${change},revision=revision+1 WHERE pair_key=?`).run(f.pair());
        return true;
      });
      const result = await f.gift('respondGift', operation({ giftId, accept: true }), 202);
      expect(result.error.code).toBe('FRIEND_REQUIRED'); expect(f.owners()).toEqual([101]);
      expect((await f.gift('respondGift', operation({ giftId, accept: false }), 202)).ok).toBe(true);
    }
  });

  it('P12 terminal received history remains after friend removal/block', async () => {
    const f = await giftFixture(); const { giftId } = await f.offer();
    await f.gift('respondGift', operation({ giftId, accept: true }), 202);
    f.sqlite.prepare("UPDATE chipper_friendships SET status='removed',low_blocked=1 WHERE pair_key=?").run(f.pair());
    const received = await f.gift('listGifts', {}, 202);
    expect(received.result.gifts[0].giftId).toBe(giftId); expect(received.result.gifts[0].status).toBe('accepted');
    expect(f.owners()).toEqual([202]);
  });

  it('P13 checks donor and receiver revisions together and never produces one-row results', async () => {
    const f = await giftFixture(); const { giftId } = await f.offer();
    f.interceptOnce(async ({ type, query }) => {
      if (type !== 'run' || !query.includes('WITH eligible AS MATERIALIZED')) return false;
      const receiver = await f.store.read('202'); receiver.state.player.feathers += 3;
      await f.store.compareAndSwap('202', receiver.revision, receiver.state); return true;
    });
    const result = await f.gift('respondGift', operation({ giftId, accept: true }), 202);
    expect(result.ok).toBe(true); expect(f.owners()).toEqual([202]);
    expect((await f.store.read('202')).state.player.feathers).toBe(3);
    expect(f.log.filter((entry) => entry.type === 'run' && entry.query.includes('WITH eligible AS MATERIALIZED')).map((entry) => entry.affected)).toEqual([0, 2]);
  });

  it('operation receipts reject changed payload, and gift replay does not expose full aggregate', async () => {
    const f = await giftFixture(); const { request, giftId } = await f.offer();
    expect((await f.gift('offerGift', { ...request, recipientProfileId: f.profileId(303) })).error.code).toBe('OPERATION_CONFLICT');
    const accept = operation({ giftId, accept: true }); await f.gift('respondGift', accept, 202);
    expect((await f.gift('respondGift', { ...accept, accept: false }, 202)).error.code).toBe('OPERATION_CONFLICT');
    const replay = await f.gift('respondGift', accept, 202);
    expect(JSON.stringify(replay.result)).not.toMatch(/telegramId|recipientId|giftReceipts|pendingFeedAt/);
  });

  it('receiver must complete onboarding; identity comes only from verified context', async () => {
    const f = await giftFixture(); const { giftId } = await f.offer();
    const recipient = await f.store.read('202'); recipient.state.player.onboarding = 'name';
    await f.store.compareAndSwap('202', recipient.revision, recipient.state);
    expect((await f.gift('respondGift', operation({ giftId, accept: true }), 202)).error.code).toBe('ONBOARDING_REQUIRED');
    const request = operation({ giftId, accept: true });
    const { createGiftService } = await import('../tgcloud/lib/gifts.js');
    const service = createGiftService({ database: f.database, store: f.store, gameService: f.service });
    expect((await service.call('respondGift', request, { user: { id: 202 } })).error.code).toBe('UNAUTHORIZED');
    expect((await service.call('listGifts', {}, ctx(404))).error.code).toBe('PROFILE_NOT_FOUND');
    expect(f.owners()).toEqual([101]);
  });

  it('gift lookup budgets are atomic and resume in the next server-time window', async () => {
    const f = await giftFixture();
    f.sqlite.prepare('INSERT INTO chipper_social_limits (key,window_start,count) VALUES(?,?,?)').run('gift:101:read', f.now, 89);
    const [first, second] = await Promise.all([f.gift('listGifts'), f.gift('listGifts')]);
    expect([first, second].filter((result) => result.ok)).toHaveLength(1);
    const limited = [first, second].find((result) => !result.ok);
    expect(limited.error.code).toBe('RATE_LIMITED'); expect(limited.error.retryAt).toBe(f.now + 60000);
    f.advance(60000); expect((await f.gift('listGifts')).ok).toBe(true);
    expect(f.owners()).toEqual([101]);
  });
});
