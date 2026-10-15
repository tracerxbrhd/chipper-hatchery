import { describe, expect, it } from 'vitest';
import { exchangeFixture } from './exchanges-helpers.js';
import { operation } from './helpers.js';

describe('achievement authoritative service integration', () => {
  it('same-key receipt replay pays once, different-key repeat stays fenced and does not change cooldown', async () => {
    const f = await exchangeFixture(), own = (await f.store.read('101')).state;
    await f.call('careAction', operation({ chickId: own.player.activeChickId, action: 'feed' }));
    const claim = operation({ achievementId: 'first-feed' }); f.loseNextResponse();
    const lost = await f.call('claimAchievement', claim); expect(lost.ok).toBe(false);
    const recovered = await f.call('claimAchievement', claim); expect(recovered.ok).toBe(true); expect(recovered.state.player.feathers).toBe(1);
    expect((await f.call('claimAchievement', operation({ achievementId: 'first-feed' }))).error.code).toBe('ALREADY_CLAIMED');
    expect((await f.call('getAchievements')).result.achievements.claimed).toBe(1);
    expect(recovered.state.player.careRewardAt).toBe(own.player.careRewardAt); expect(recovered.state.player.games).toEqual(own.player.games); f.sqlite.close();
  });
  it('both accepted gift/exchange participants unlock social milestones; replay does not increment server totals', async () => {
    const f = await exchangeFixture(), { exchangeId } = await f.offerExchange();
    const request = operation({ exchangeId, accept: true }); await f.exchange('respondExchange', request, 202); await f.exchange('respondExchange', request, 202);
    for (const actor of [101, 202]) {
      expect((await f.store.read(String(actor))).state.telemetry.totals.exchange_accepted).toBe(1);
      expect((await f.call('claimAchievement', operation({ achievementId: 'exchange-first' }), actor)).ok).toBe(true);
    }
    // Sender owns the former recipient bird, which remains nonactive and giftable.
    const gift = await f.offer(202, f.requested.id); await f.gift('respondGift', operation({ giftId: gift.giftId, accept: true }), 202);
    for (const actor of [101, 202]) expect((await f.call('claimAchievement', operation({ achievementId: 'gift-first' }), actor)).ok).toBe(true);
    expect(f.totalFeathers()).toBe(4); f.sqlite.close();
  });
  it('decorative/client events cannot unlock paid milestones; unknown fields fail before writes', async () => {
    const f = await exchangeFixture();
    await f.call('logEvent', operation({ event: 'app_opened' }));
    expect((await f.call('logEvent', operation({ event: 'gift_accepted' }))).error.code).toBe('INVALID_REQUEST');
    expect((await f.call('claimAchievement', operation({ achievementId: 'gift-first' }))).error.code).toBe('ACHIEVEMENT_LOCKED');
    const before = await f.store.read('101'); expect((await f.call('claimAchievement', operation({ achievementId: 'first-feed', unlocked: true }))).error.code).toBe('INVALID_REQUEST');
    expect(await f.store.read('101')).toEqual(before); f.sqlite.close();
  });
  it('future achievement schema blocks all writers before CAS and preserves permanent fences', async () => {
    const f = await exchangeFixture(); const row = await f.store.read('101');
    row.state.player.achievements = { version: 2, claimed: { 'future-milestone': f.now } };
    await f.store.compareAndSwap('101', row.revision, row.state); const before = await f.store.read('101');
    expect((await f.call('claimDailyBonus', operation())).error.code).toBe('INVALID_SAVE');
    expect(await f.store.read('101')).toEqual(before); f.sqlite.close();
  });
});
