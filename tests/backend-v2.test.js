import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { BALANCE, selectAppearance } from '../tgcloud/lib/domain.js';
import { GENE_OPTIONS, CHICK_PRESETS, generateGenes, validGenes } from '../tgcloud/lib/chickGenes.js';
import { FLAPS_CONFIG, maximumPlausibleScore } from '../tgcloud/lib/flapsRules.js';
import { FLAPS_CONFIG as CLIENT_FLAPS_CONFIG } from '../src/games/flaps/config';
import { createGameService } from '../tgcloud/lib/service.js';
import { fixture, operation, ctx } from './helpers';

describe('Chick System 2.0 server generation', () => {
  it('uses original preset IDs and all explicit versioned morphology fields', () => {
    expect(CHICK_PRESETS).toHaveLength(12);
    const legacy = ['charcoal', 'cloud', 'fluffy', 'spot', 'sleepy', 'tiny', 'ash', 'ginger', 'midnight', 'snow', 'star', 'gold'];
    expect(CHICK_PRESETS.every((preset) => !legacy.includes(preset.id))).toBe(true);
    let seed = 0x71c205;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const seen = Object.fromEntries(Object.keys(GENE_OPTIONS).map((key) => [key, new Set()]));
    const counts = { common: 0, uncommon: 0, rare: 0 };
    for (let index = 0; index < 5000; index += 1) {
      const preset = selectAppearance(random);
      const genes = generateGenes(preset, random);
      expect(validGenes(genes)).toBe(true);
      expect(Object.keys(genes).sort()).toEqual([...Object.keys(GENE_OPTIONS), 'geneSchemaVersion', 'colors', 'detailVariant'].sort());
      counts[preset.rarity] += 1;
      for (const key of Object.keys(GENE_OPTIONS)) seen[key].add(genes[key]);
    }
    for (const [key, options] of Object.entries(GENE_OPTIONS)) expect([...seen[key]].sort()).toEqual([...options].sort());
    expect(counts.common / 5000).toBeCloseTo(.7, 1);
    expect(counts.uncommon / 5000).toBeCloseTo(.25, 1);
    expect(counts.rare / 5000).toBeCloseTo(.05, 1);
  });

  it('persists identical genes after lost hatch response, replay, growth and service restart', async () => {
    const f = fixture();
    const boot = await f.call('bootstrap');
    const request = operation({ eggId: boot.state.egg.id });
    f.roll(.83); f.loseNextResponse();
    expect((await f.call('hatchEgg', request)).ok).toBe(false);
    const saved = (await f.store.read('101')).state.chicks[0];
    f.roll(.02);
    const hatch = await f.call('hatchEgg', request);
    expect(hatch.state.chicks[0]).toMatchObject({ appearanceVersion: 2, genes: saved.genes, id: saved.id });
    await f.call('careAction', operation({ chickId: saved.id, action: 'feed' }));
    await f.call('careAction', operation({ chickId: saved.id, action: 'play' }));
    f.advance(BALANCE.teenAgeMs);
    const reopened = createGameService({ store: f.store, now: () => f.now });
    const after = await reopened.call('bootstrap', {}, ctx());
    expect(after.state.chicks[0]).toMatchObject({ stage: 'teen', genes: saved.genes, appearanceId: saved.appearanceId });
  });

  it('ignores no client trait overrides and never rerolls a malformed save', async () => {
    const f = fixture(); const boot = await f.call('bootstrap');
    for (const extra of [{ genes: {} }, { rarity: 'rare' }, { appearanceVersion: 1 }, { appearanceId: 'fake' }]) {
      expect((await f.call('hatchEgg', operation({ eggId: boot.state.egg.id, ...extra }))).error.code).toBe('INVALID_REQUEST');
    }
    await f.initial();
    const row = await f.store.read('101');
    row.state.chicks[0].genes.headShape = 'not-a-head';
    await f.store.compareAndSwap('101', row.revision, row.state);
    const before = await f.store.read('101');
    expect((await f.call('bootstrap')).error.code).toBe('INVALID_SAVE');
    expect(await f.store.read('101')).toEqual(before);
  });

  it('bad morphology RNG does not partially hatch, issue an ID or save a receipt', async () => {
    const f = fixture(); const boot = await f.call('bootstrap');
    const before = await f.store.read('101');
    let draws = 0;
    const broken = createGameService({ store: f.store, now: () => f.now,
      random: () => ++draws === 3 ? 1 : .1, id: randomUUID });
    const hatch = await broken.call('hatchEgg', operation({ eggId: boot.state.egg.id }), ctx());
    expect(hatch.error.code).toBe('TEMPORARILY_UNAVAILABLE');
    expect(await f.store.read('101')).toEqual(before);
  });
});

describe('Chippster Flaps authoritative runs and economics', () => {
  it('has matching physics configuration and rejects impossible scores without consuming the run', async () => {
    expect(FLAPS_CONFIG).toEqual(CLIENT_FLAPS_CONFIG);
    expect(FLAPS_CONFIG).toMatchObject({ configVersion: 'flaps-1', width: 360, height: 640, minimumGap: 156 });
    expect(maximumPlausibleScore(1000)).toBe(0);
    expect(maximumPlausibleScore(3000)).toBe(1);
    const f = fixture(); await f.initial();
    const run = await f.call('startFlapsRun', operation());
    f.advance(3000);
    const bad = await f.call('finishFlapsRun', operation({ runId: run.result.runId, score: 10000, endReason: 'crash' }));
    expect(bad.error.code).toBe('INVALID_SCORE');
    const good = await f.call('finishFlapsRun', operation({ runId: run.result.runId, score: 1, endReason: 'crash' }));
    expect(good.result).toMatchObject({ score: 1, previousBest: 0, bestScore: 1, newBest: true, rewarded: true, reason: 'rewarded' });
  });

  it.each([0, 1999, 2000])('reward duration threshold at %s ms is exact and independent of score', async (elapsed) => {
    const f = fixture(); await f.initial(); const start = await f.call('startFlapsRun', operation()); f.advance(elapsed);
    const result = await f.call('finishFlapsRun', operation({ runId: start.result.runId, score: 0, endReason: 'bounds' }));
    expect(result.ok).toBe(true);
    expect(result.result.rewarded).toBe(elapsed >= 2000);
    expect(result.result.reason).toBe(elapsed >= 2000 ? 'rewarded' : 'too_short');
    expect(result.state.player.flaps.completedRuns).toBe(1);
    expect(result.state.player.feathers).toBe(elapsed >= 2000 ? 1 : 0);
  });

  it.each([-1, 0])('rolling reward cooldown opens at exactly 20 hours (%s ms offset)', async (offset) => {
    const f = fixture(); await f.initial(); const start = await f.call('startFlapsRun', operation()); f.advance(2000);
    const first = await f.call('finishFlapsRun', operation({ runId: start.result.runId, score: 0, endReason: 'bounds' }));
    f.advance(BALANCE.rewardCooldownMs - 2000 + offset);
    const next = await f.call('startFlapsRun', operation()); f.advance(2000);
    const second = await f.call('finishFlapsRun', operation({ runId: next.result.runId, score: 0, endReason: 'bounds' }));
    expect(second.result.rewarded).toBe(offset === 0);
    expect(second.state.player.feathers).toBe(offset === 0 ? 2 : 1);
    if (offset < 0) expect(second.result.rewardNextAt).toBe(first.result.rewardNextAt);
  });

  it.each([0, 1])('attempt TTL accepts exactly its boundary and refuses the next millisecond (%s)', async (offset) => {
    const f = fixture(); await f.initial(); const start = await f.call('startFlapsRun', operation());
    f.advance(BALANCE.miniGameAttemptTtlMs + offset);
    const finish = await f.call('finishFlapsRun', operation({ runId: start.result.runId, score: 0, endReason: 'bounds' }));
    expect(finish.ok).toBe(offset === 0);
    if (offset > 0) expect(finish.error.code).toBe('ATTEMPT_EXPIRED');
  });

  it('uses one global 20-hour cooldown and durable personal records across services', async () => {
    const f = fixture(); await f.initial();
    const round = async (duration, score) => {
      const start = await f.call('startFlapsRun', operation()); f.advance(duration);
      return f.call('finishFlapsRun', operation({ runId: start.result.runId, score, endReason: 'crash' }));
    };
    const first = await round(3000, 1);
    const nextAt = first.result.rewardNextAt;
    const second = await round(20000, 8);
    expect(second.result).toMatchObject({ bestScore: 8, previousBest: 1, newBest: true, rewarded: false, reason: 'cooldown', rewardNextAt: nextAt });
    f.advance(nextAt - f.now);
    const start = await f.call('startFlapsRun', operation());
    const third = await f.call('finishFlapsRun', operation({ runId: start.result.runId, score: 0, endReason: 'bounds' }));
    expect(third.result.rewarded).toBe(false); // Zero-duration finish does not earn even after cooldown.
    f.advance(60000);
    const fourth = await round(2000, 0);
    expect(fourth.result.rewarded).toBe(true);
    const reopened = createGameService({ store: f.store, now: () => f.now });
    const profile = await reopened.call('bootstrap', {}, ctx());
    expect(profile.state.player).toMatchObject({ feathers: 2, flaps: { bestScore: 8, completedRuns: 4, lastPlayedAt: f.now } });
  });

  it('retains immutable active-bird snapshot when another client switches, renames or grows it', async () => {
    const f = fixture(); const first = await f.initial(); await f.seedFeathers(6);
    const buy = await f.call('buyEgg', operation()); f.advance(BALANCE.incubationMs);
    f.roll(.9);
    const hatch = await f.call('hatchEgg', operation({ eggId: buy.result.eggId }));
    const op = operation(); const start = await f.call('startFlapsRun', op);
    expect(start.result.chick.id).toBe(first);
    await f.call('activateChick', operation({ chickId: hatch.result.chickId }));
    await f.call('renameChick', operation({ chickId: first, name: 'Новое имя' }));
    const repeated = await f.call('startFlapsRun', op);
    expect(repeated.result).toEqual(start.result);
    expect(repeated.state.player.activeChickId).toBe(hatch.result.chickId);
    f.advance(2000);
    expect((await f.call('finishFlapsRun', operation({ runId: start.result.runId, score: 0, endReason: 'crash' }))).ok).toBe(true);
  });

  it('atomic concurrent finish commits one outcome, one record and one feather', async () => {
    const f = fixture(); await f.initial(); const start = await f.call('startFlapsRun', operation()); f.advance(10000);
    const finishes = await Promise.all(Array.from({ length: 12 }, (_, index) =>
      f.call('finishFlapsRun', operation({ runId: start.result.runId, score: index % 2, endReason: 'crash' }))));
    expect(finishes.some((result) => result.ok)).toBe(true);
    expect(finishes.filter((result) => !result.ok).every((result) => result.error.code === 'ATTEMPT_ALREADY_FINISHED')).toBe(true);
    const state = (await f.call('bootstrap')).state;
    expect(state.player.feathers).toBe(1);
    expect(state.player.flaps.completedRuns).toBe(1);
    expect(new Set(finishes.filter((result) => result.ok).map((result) => JSON.stringify(result.result))).size).toBe(1);
  });

  it('recovers lost finish response with the same receipt and refuses changed end reason', async () => {
    const f = fixture(); await f.initial(); const start = await f.call('startFlapsRun', operation()); f.advance(2000);
    const request = operation({ runId: start.result.runId, score: 0, endReason: 'crash' }); f.loseNextResponse();
    expect((await f.call('finishFlapsRun', request)).ok).toBe(false);
    const recovery = await f.call('finishFlapsRun', request);
    expect(recovery.state.player).toMatchObject({ feathers: 1, flaps: { completedRuns: 1 } });
    const newKey = await f.call('finishFlapsRun', operation({ runId: start.result.runId, score: 0, endReason: 'crash' }));
    expect(newKey.result).toEqual(recovery.result);
    expect((await f.call('finishFlapsRun', operation({ runId: start.result.runId, score: 0, endReason: 'bounds' }))).error.code).toBe('ATTEMPT_ALREADY_FINISHED');
  });

  it('new starts cancel unfinished runs, expiry refuses rewards, and abandoned receipts cannot revive runs', async () => {
    const f = fixture(); await f.initial();
    const op = operation(); const first = await f.call('startFlapsRun', op); const second = await f.call('startFlapsRun', operation());
    f.advance(2000);
    expect((await f.call('finishFlapsRun', operation({ runId: first.result.runId, score: 0, endReason: 'crash' }))).error.code).toBe('ATTEMPT_CANCELLED');
    expect((await f.call('startFlapsRun', op)).result).toEqual(first.result);
    f.advance(BALANCE.miniGameAttemptTtlMs);
    expect((await f.call('finishFlapsRun', operation({ runId: second.result.runId, score: 0, endReason: 'crash' }))).error.code).toBe('ATTEMPT_EXPIRED');
    expect((await f.call('bootstrap')).state.player.feathers).toBe(0);
  });

  it('prunes expired attempts without pruning replay-safe receipts or allowing second rewards', async () => {
    const f = fixture(); await f.initial();
    const start = await f.call('startFlapsRun', operation()); f.advance(2000);
    const oldFinish = operation({ runId: start.result.runId, score: 0, endReason: 'crash' });
    const finish = await f.call('finishFlapsRun', oldFinish);
    for (let index = 0; index < 100; index += 1) {
      f.advance(60000);
      expect((await f.call('startFlapsRun', operation())).ok).toBe(true);
    }
    const row = await f.store.read('101');
    expect(row.state.attempts.length).toBeLessThanOrEqual(11);
    expect(Object.hasOwn(row.state.receipts, oldFinish.operationId)).toBe(true);
    const retry = await f.call('finishFlapsRun', oldFinish);
    expect(retry.result).toEqual(finish.result);
    expect(retry.state.player.feathers).toBe(1);
    expect((await f.call('finishFlapsRun', operation({ runId: start.result.runId, score: 0, endReason: 'crash' }))).error.code).toBe('ATTEMPT_NOT_FOUND');
  });

  it('refuses forged IDs, reward fields and legacy grain economy', async () => {
    const f = fixture(); await f.initial(); await f.initial(202); const start = await f.call('startFlapsRun', operation());
    f.advance(2000);
    expect((await f.call('finishFlapsRun', operation({ runId: start.result.runId, score: 0, endReason: 'crash' }), 202)).error.code).toBe('ATTEMPT_NOT_FOUND');
    for (const extra of [{ rewarded: true }, { telegramId: '202' }, { configVersion: 'evil' }, { chickId: start.result.chickId }, { rewardNextAt: 0 }]) {
      expect((await f.call('finishFlapsRun', operation({ runId: start.result.runId, score: 0, endReason: 'crash', ...extra }))).error.code).toBe('INVALID_REQUEST');
    }
    expect((await f.call('startMiniGame', operation())).error.code).toBe('GAME_REPLACED');
    expect((await f.call('finishMiniGame', operation({ attemptId: 'anything', score: 0 }))).error.code).toBe('GAME_REPLACED');
    expect((await f.call('bootstrap')).state.player.feathers).toBe(0);
    expect((await f.call('bootstrap', {}, 202)).state.player.flaps.bestScore).toBe(0);
  });
});

describe('explicit release reset boundary and new-player onboarding', () => {
  it('refuses old schemas without deletion, reinterpretation or implicit resets on bootstrap', async () => {
    const f = fixture(); await f.initial(); await f.seedFeathers(42);
    const row = await f.store.read('101'); row.state.schemaVersion = 1;
    await f.store.compareAndSwap('101', row.revision, row.state);
    const before = await f.store.read('101');
    for (const method of ['bootstrap', 'getHome', 'startFlapsRun']) {
      expect((await f.call(method, method === 'startFlapsRun' ? operation() : {})).error.code).toBe('RESET_REQUIRED');
      expect(await f.store.read('101')).toEqual(before);
    }
  });

  it('same Telegram accounts after addressed SQL deletion receive exactly one new egg and zero progress', async () => {
    const f = fixture(); const old = await Promise.all([101, 202, 303].map((owner) => f.initial(owner)));
    await f.seedFeathers(50); const run = await f.call('startFlapsRun', operation()); f.advance(2000);
    await f.call('finishFlapsRun', operation({ runId: run.result.runId, score: 0, endReason: 'crash' }));
    // Local SQLite mirrors the authorized live operation's exact addressed scope.
    f.sqlite.exec('DELETE FROM chipper_players');
    for (const owner of [101, 202, 303]) {
      const boots = await Promise.all(Array.from({ length: 5 }, () => f.call('bootstrap', {}, owner)));
      expect(boots.every((result) => result.ok)).toBe(true);
      expect(new Set(boots.map((result) => result.state.egg.id)).size).toBe(1);
      expect(boots[0].state).toMatchObject({ chicks: [], player: { feathers: 0, activeChickId: null, onboarding: 'egg', careRewardAt: null, miniGameRewardAt: null,
        flaps: { bestScore: 0, completedRuns: 0, lastPlayedAt: null } }, egg: { kind: 'starter' } });
      const hatched = await f.call('hatchEgg', operation({ eggId: boots[0].state.egg.id }), owner);
      expect(hatched.state.chicks[0].appearanceVersion).toBe(2);
      expect(validGenes(hatched.state.chicks[0].genes)).toBe(true);
      expect(old.includes(hatched.result.chickId)).toBe(false);
      const row = await f.store.read(String(owner));
      expect(row.state.schemaVersion).toBe(2);
      expect(Object.keys(row.state.receipts)).toHaveLength(1);
      expect(row.state.attempts).toEqual([]);
      expect(row.state.chicks[0].careMilestones).toEqual([]);
    }
  });
});
