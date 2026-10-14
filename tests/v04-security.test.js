import { describe, expect, it } from 'vitest';
import { operation } from './helpers.js';
import { towerFixture, playWaves } from './tower-server-helpers.js';
import { giftFixture } from './gifts-helpers.js';
import { CHICK_PRESETS, generateGenes } from '../tgcloud/lib/chickGenes.js';
import { traitCodexStatus } from '../tgcloud/lib/traitCodex.js';

describe('v0.4 independent integration review on real SQLite', () => {
  it('a same-key daily race during Tower sealing cannot permanently strand the active slot', async () => {
    const f = await towerFixture(); const { run: first } = await f.start();
    const run = await playWaves(f, first, 3);
    const request = operation({ runId: run.runId, endReason: 'retire' });
    const originalRun = f.database.run;
    let intercepted = false; let daily;
    f.database.run = async (query, params) => {
      if (!intercepted && query.includes("SET status='settling'")) {
        intercepted = true;
        daily = await f.call('claimDailyBonus', { operationId: request.operationId });
      }
      return originalRun(query, params);
    };
    const finish = await f.tower('finishTowerRun', request);
    expect(intercepted).toBe(true);
    expect(finish.ok, JSON.stringify(finish)).toBe(true);
    expect(daily).toMatchObject({ ok: false, error: { code: 'OPERATION_CONFLICT' } });
    const recovered = await f.tower('getTowerRun', { runId: run.runId });
    expect(recovered.ok, JSON.stringify(recovered)).toBe(true);
    if (recovered.result.run.status !== 'finished') {
      const retry = await f.tower('finishTowerRun', operation({ runId: run.runId, endReason: 'retire' }));
      expect(retry.ok, JSON.stringify(retry)).toBe(true);
    }
    expect(f.sqlite.prepare('SELECT status FROM chipper_tower_runs WHERE run_id=?').get(run.runId).status).toBe('finished');
    const next = await f.tower('startTowerRun', operation());
    expect(next.ok, JSON.stringify(next)).toBe(true);
    expect(next.result.run.runId).not.toBe(run.runId);
    const state = (await f.store.read('101')).state;
    expect(state.player.feathers).toBe(1);
    expect(state.receipts[request.operationId].result).toMatchObject({ runId: run.runId, verifiedWave: 3, rewardAmount: 1 });
    expect(state.player.games['nest-defense'].completedRuns).toBe(1);
  });

  it('simultaneous accepted gift, daily claim and verified identity refresh preserve every owner effect', async () => {
    const f = await giftFixture(); const row = await f.store.read('101');
    const gift = row.state.chicks.find(chick => chick.id === f.extra.id); const preset = CHICK_PRESETS.at(-1);
    gift.appearanceId = preset.id; gift.rarity = preset.rarity; gift.genes = generateGenes(preset, () => .99);
    await f.store.compareAndSwap('101', row.revision, row.state);
    const offer = await f.offer(); const accept = operation({ giftId: offer.giftId, accept: true });
    const recipientBefore = await f.store.read('202');
    const signedContext = { initData: { user: { id: 202, first_name: 'Новое имя', username: 'new_private_tag', photo_url: 'https://t.me/i/userpic/320/test.jpg' } } };
    const responses = await Promise.all([
      f.gift('respondGift', accept, 202), f.call('claimDailyBonus', operation(), 202),
      f.service.call('bootstrap', {}, signedContext),
      ...Array.from({ length: 10 }, () => f.call('listTraitCodex', {}, 202)),
    ]);
    expect(responses.every(response => response.ok)).toBe(true);
    const after = await f.store.read('202');
    expect(f.owners()).toEqual([202]); expect(after.state.player.feathers).toBe(recipientBefore.state.player.feathers + 1);
    expect(after.state.chicks.filter(chick => chick.id === f.extra.id)).toHaveLength(1);
    expect(traitCodexStatus(after.state).found).toBe(20);
    // Gift's own post-commit getHome uses its actual verified context. Identity
    // is private and can refresh independently without changing game nickname.
    expect(f.sqlite.prepare('SELECT display_name FROM chipper_social_profiles WHERE telegram_id=202').get().display_name).toBe('Гнездо 202');
    expect(after.state.player.discoveredTraits.ids).toEqual([...new Set(after.state.player.discoveredTraits.ids)]);
    expect(after.state.player.dailyBonus.claimsTotal).toBe(1);
    expect((await f.gift('respondGift', accept, 202)).ok).toBe(true);
    expect(f.owners()).toEqual([202]);
  });

  it('rejected forged new field authority leaves all existing gift/economy/discovery data unchanged', async () => {
    const f = await giftFixture(); const offer = await f.offer(); const before = await f.store.read('202');
    const requests = [
      f.call('claimDailyBonus', operation({ now: 9_999_999_999_999, feathers: 999 }), 202),
      f.call('listTraitCodex', { discoveredTraits: { version: 1, ids: ['headShape:wide'] } }, 202),
      f.call('bootstrap', { telegramIdentity: { username: 'forged' } }, 202),
      f.gift('respondGift', operation({ giftId: offer.giftId, accept: true, recipientId: 303 }), 202),
    ];
    const responses = await Promise.all(requests);
    expect(responses.every(response => !response.ok && response.error.code === 'INVALID_REQUEST')).toBe(true);
    expect(await f.store.read('202')).toEqual(before); expect(f.owners()).toEqual([101]);
  });
});
