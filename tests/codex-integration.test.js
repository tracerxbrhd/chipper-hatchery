import { describe, expect, it } from 'vitest';
import { BALANCE } from '../tgcloud/lib/domain.js';
import { CHICK_PRESETS, generateGenes } from '../tgcloud/lib/chickGenes.js';
import { traitCodexStatus } from '../tgcloud/lib/traitCodex.js';
import { createSocialService } from '../tgcloud/lib/social.js';
import { randomUUID } from 'node:crypto';
import { fixture, operation } from './helpers.js';
import { giftFixture } from './gifts-helpers.js';

async function replaceGiftGenes(f) {
  const row = await f.store.read('101');
  const chick = row.state.chicks.find((entry) => entry.id === f.extra.id);
  const preset = CHICK_PRESETS.at(-1);
  chick.appearanceId = preset.id; chick.rarity = preset.rarity;
  chick.genes = generateGenes(preset, () => .99);
  await f.store.compareAndSwap('101', row.revision, row.state);
}

describe('Codex production service and SQLite owner CAS integration', () => {
  it('hatch immediately persists discoveries atomically with bird/receipt, no additional read required', async () => {
    const f = fixture(); const boot = await f.call('bootstrap');
    expect(boot.state.codex).toMatchObject({ found: 0, total: 51 });
    const hatchRequest = operation({ eggId: boot.state.egg.id });
    const hatched = await f.call('hatchEgg', hatchRequest);
    expect(hatched.state.codex).toMatchObject({ found: 10, total: 51 });
    const row = await f.store.read('101');
    expect(row.state.chicks).toHaveLength(1);
    expect(row.state.player.discoveredTraits.ids).toEqual(hatched.state.codex.discoveredIds);
    expect(row.state.receipts[hatchRequest.operationId].result.chickId).toBe(row.state.chicks[0].id);
    expect((await f.call('hatchEgg', hatchRequest)).state.codex).toEqual(hatched.state.codex);
  });

  it('old 0.3 account backfills current birds once using CAS without reinterpreting genes/IDs/economy', async () => {
    const f = fixture(); await f.initial(); await f.seedFeathers(42);
    const row = await f.store.read('101'); delete row.state.player.discoveredTraits;
    row.state.balanceVersion = '0.3.0';
    await f.store.compareAndSwap('101', row.revision, row.state);
    const before = await f.store.read('101');
    const response = await f.call('listTraitCodex');
    expect(response.ok).toBe(true);
    expect(response.result.codex).toMatchObject({ version: 1, found: 10, total: 51 });
    expect(response.state.player).toMatchObject({ feathers: 42, activeChickId: before.state.player.activeChickId });
    const after = await f.store.read('101');
    expect(after.state.chicks).toEqual(before.state.chicks);
    expect(after.state.receipts).toEqual(before.state.receipts);
    expect(after.revision).toBe(before.revision + 1);
    await f.call('listTraitCodex');
    expect((await f.store.read('101')).revision).toBe(after.revision);
  });

  it('concurrent refresh/backfill/hatch recomputes union against winning row without loss', async () => {
    const f = fixture(); await f.initial(); await f.seedFeathers(6);
    const buy = await f.call('buyEgg', operation()); f.advance(BALANCE.incubationMs); f.roll(.99);
    const row = await f.store.read('101'); delete row.state.player.discoveredTraits;
    await f.store.compareAndSwap('101', row.revision, row.state);
    const hatchRequest = operation({ eggId: buy.result.eggId });
    const responses = await Promise.all([
      ...Array.from({ length: 10 }, () => f.call('listTraitCodex')),
      ...Array.from({ length: 10 }, () => f.call('hatchEgg', hatchRequest)),
    ]);
    expect(responses.every((response) => response.ok)).toBe(true);
    const final = await f.store.read('101');
    expect(final.state.chicks).toHaveLength(2);
    expect(traitCodexStatus(final.state)).toMatchObject({ found: 20, total: 51 });
    expect(new Set(final.state.player.discoveredTraits.ids).size).toBe(20);
    expect(final.state.player.feathers).toBe(0);
  });

  it('lost first backfill response commits once and retry preserves the same discoveries', async () => {
    const f = fixture(); await f.initial();
    const row = await f.store.read('101'); delete row.state.player.discoveredTraits;
    await f.store.compareAndSwap('101', row.revision, row.state);
    f.loseNextResponse();
    expect((await f.call('listTraitCodex')).ok).toBe(false);
    const afterCommit = await f.store.read('101');
    expect(traitCodexStatus(afterCommit.state).found).toBe(10);
    const retried = await f.call('listTraitCodex');
    expect(retried.ok).toBe(true);
    expect(retried.state.codex).toEqual(traitCodexStatus(afterCommit.state));
    expect((await f.store.read('101')).revision).toBe(afterCommit.revision);
  });

  it('rejects client unlocks/foreign identity/clock and authenticates list endpoint', async () => {
    const f = fixture(); await f.initial(); await f.initial(202);
    const before = await f.store.read('101');
    for (const params of [{ unlocks: ['palette:amber-night'] }, { discoveredIds: ['headShape:wide'] }, { found: 51 }, { userId: 202 }, { telegramId: '202' }, { now: 999 }]) {
      expect((await f.call('listTraitCodex', params)).error.code).toBe('INVALID_REQUEST');
    }
    expect((await f.service.call('listTraitCodex', {}, { initDataUnsafe: { user: { id: 101 } } })).error.code).toBe('UNAUTHORIZED');
    expect(await f.store.read('101')).toEqual(before);
    expect((await f.call('listTraitCodex')).result.codex.categories).toHaveLength(10);
  });

  it('future gene schema gives existing safe INVALID_SAVE without mutation or reroll', async () => {
    const f = fixture(); await f.initial();
    const row = await f.store.read('101'); row.state.chicks[0].genes.geneSchemaVersion = 2;
    await f.store.compareAndSwap('101', row.revision, row.state);
    const before = await f.store.read('101');
    expect((await f.call('listTraitCodex')).error.code).toBe('INVALID_SAVE');
    expect(await f.store.read('101')).toEqual(before);
  });

  it('future discovery schema reaches the own UI as unsupported version without reinterpretation or save mutation', async () => {
    const f = fixture(); await f.initial();
    const row = await f.store.read('101');
    row.state.player.discoveredTraits = { version: 2, ids: ['headShape:future-trait'], futureMetadata: 'preserved' };
    await f.store.compareAndSwap('101', row.revision, row.state);
    const before = await f.store.read('101');
    const response = await f.call('listTraitCodex');
    expect(response.ok).toBe(true);
    expect(response.result.codex).toMatchObject({ version: 2, discoveredIds: [], found: 0 });
    expect(response.state.codex).toMatchObject({ version: 2, discoveredIds: [], found: 0 });
    expect(await f.store.read('101')).toEqual(before);
  });
});

describe('Codex gift atomicity and privacy regression', () => {
  it('recipient discovery is inside the existing two-row SQL, sender retains discovery after transfer and onward gift', async () => {
    const f = await giftFixture(); await replaceGiftGenes(f);
    const offer = await f.offer();
    const senderBefore = traitCodexStatus((await f.store.read('101')).state);
    expect(senderBefore.found).toBe(20);
    let checkedAtomic = false;
    f.interceptOnce(async ({ type, query, params }) => {
      if (type === 'run' && /UPDATE chipper_players/.test(query) && params[':recipientJson']) {
        const recipient = JSON.parse(params[':recipientJson']);
        expect(recipient.chicks.some((chick) => chick.id === f.extra.id)).toBe(true);
        expect(traitCodexStatus(recipient).found).toBe(20);
        checkedAtomic = true;
        return true;
      }
      return false;
    });
    const accepted = await f.gift('respondGift', operation({ giftId: offer.giftId, accept: true }), 202);
    expect(accepted.ok).toBe(true); expect(checkedAtomic).toBe(true);
    expect(f.owners()).toEqual([202]);
    expect(traitCodexStatus((await f.store.read('101')).state)).toEqual(senderBefore);
    expect(traitCodexStatus((await f.store.read('202')).state).found).toBe(20);
    f.friend(202, 303);
    const onward = await f.gift('offerGift', operation({ chickId: f.extra.id, recipientProfileId: f.profileId(303) }), 202);
    expect(onward.ok).toBe(true);
    expect((await f.gift('respondGift', operation({ giftId: onward.result.gift.giftId, accept: true }), 303)).ok).toBe(true);
    expect(f.owners()).toEqual([303]);
    expect(traitCodexStatus((await f.store.read('202')).state).found).toBe(20);
    expect(traitCodexStatus((await f.store.read('303')).state).found).toBe(20);
    expect(f.totalFeathers()).toBe(0);
  });

  it('lost accept response and simultaneous refresh/daily/accept preserve received discovery once', async () => {
    const f = await giftFixture(); await replaceGiftGenes(f);
    const offer = await f.offer(); const request = operation({ giftId: offer.giftId, accept: true });
    f.loseNextResponse();
    const first = await f.gift('respondGift', request, 202);
    expect(first.ok).toBe(false);
    const afterCommit = await f.store.read('202');
    expect(traitCodexStatus(afterCommit.state).found).toBe(20);
    const responses = await Promise.all([
      ...Array.from({ length: 8 }, () => f.gift('respondGift', request, 202)),
      ...Array.from({ length: 8 }, () => f.call('listTraitCodex', {}, 202)),
      f.call('claimDailyBonus', operation(), 202),
    ]);
    expect(responses.every((response) => response.ok)).toBe(true);
    const final = await f.store.read('202');
    expect(traitCodexStatus(final.state).found).toBe(20);
    expect(final.state.chicks.filter((chick) => chick.id === f.extra.id)).toHaveLength(1);
    expect(final.state.player.feathers).toBe(1);
    expect(f.owners()).toEqual([202]);
  });

  it('public friend DTO does not disclose private Codex discovery or player fields', async () => {
    const f = await giftFixture();
    f.sqlite.prepare("UPDATE chipper_social_profiles SET visibility='friends',collection_visibility='friends' WHERE telegram_id=202").run();
    const social = createSocialService({ database: f.database, gameService: f.service, now: () => f.now, id: randomUUID });
    const response = await social.call('getPublicProfile', { profileId: f.profileId(202) }, { initData: { user: { id: 101 } } });
    expect(response.ok).toBe(true);
    expect(JSON.stringify(response.result.profile)).not.toContain('discoveredTraits');
    expect(JSON.stringify(response.result.profile)).not.toContain('discoveredIds');
    expect(JSON.stringify(response.result.profile)).not.toContain('codex');
    expect(JSON.stringify(response.result.profile)).not.toContain('telegramId');
  });
});
