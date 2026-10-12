import { describe, expect, it } from 'vitest';
import { fixture, operation } from './helpers';
import { BALANCE } from '../tgcloud/lib/domain.js';

describe('actual local SQLite aggregate CAS under interleaved requests', () => {
  it('C01/C04/U10 ten simultaneous bootstrap/hatch requests create one starter and one bird', async () => {
    const f = fixture(); const boots = await Promise.all(Array.from({ length: 10 }, () => f.call('bootstrap')));
    expect(boots.every(r => r.ok)).toBe(true); expect(new Set(boots.map(r => r.state.egg.id)).size).toBe(1);
    const results = await Promise.all(Array.from({ length: 10 }, () => f.call('hatchEgg', operation({ eggId: boots[0].state.egg.id }))));
    expect(results.every(r => r.ok)).toBe(true); expect(new Set(results.map(r => r.result.chickId)).size).toBe(1);
    const row = await f.store.read('101'); expect(row.state.eggs).toHaveLength(1); expect(row.state.chicks).toHaveLength(1); expect(row.state.telemetry.totals.first_hatch).toBe(1);
  });
  it('C03 concurrent distinct purchases spend once and have one occupied slot', async () => {
    const f = fixture(); await f.initial(); await f.seedFeathers(12);
    const results = await Promise.all(Array.from({ length: 10 }, () => f.call('buyEgg', operation())));
    expect(results.filter(r => r.ok)).toHaveLength(1); expect(results.filter(r => !r.ok).every(r => r.error.code === 'INCUBATOR_BUSY')).toBe(true);
    const r = await f.call('getIncubator'); expect(r.state.player.feathers).toBe(6); expect(r.state.egg.kind).toBe('ordinary');
  });
  it('C02 ten identical finish rewards commit once; fresh operation keys cannot reward twice', async () => {
    const f = fixture(); await f.initial(); const s = await f.call('startMiniGame', operation()); f.advance(25000);
    const finish = operation({ attemptId: s.result.attemptId, score: 8 });
    const results = await Promise.all(Array.from({ length: 10 }, () => f.call('finishMiniGame', finish))); expect(results.every(r => r.ok && r.result.rewarded)).toBe(true);
    await Promise.all(Array.from({ length: 10 }, () => f.call('finishMiniGame', operation({ attemptId: s.result.attemptId, score: 8 }))));
    const r = await f.call('getHome'); expect(r.state.player.feathers).toBe(1); expect((await f.store.read('101')).state.telemetry.totals.minigame_finished).toBe(1);
  });
  it('C05/C12 lost response after successful purchase recovers using the same receipt', async () => {
    const f = fixture(); await f.initial(); await f.seedFeathers(12); const request = operation(); f.loseNextResponse();
    const lost = await f.call('buyEgg', request); expect(lost.ok).toBe(false); expect(lost.error.retryable).toBe(true);
    const recovered = await f.call('buyEgg', request); expect(recovered.ok).toBe(true); expect(recovered.state.player.feathers).toBe(6);
    expect(recovered.result.eggId).toBe(recovered.state.egg.id); expect((await f.store.read('101')).state.eggs).toHaveLength(2);
  });
  it('lost hatch response never rerolls appearance or duplicates a bird', async () => {
    const f = fixture(); const boot = await f.call('bootstrap'); const request = operation({ eggId: boot.state.egg.id }); f.roll(.96); f.loseNextResponse();
    expect((await f.call('hatchEgg', request)).ok).toBe(false); f.roll(0); const repeat = await f.call('hatchEgg', request);
    expect(repeat.state.chicks).toHaveLength(1); expect(repeat.state.chicks[0].rarity).toBe('rare');
  });
  it('U08 rapid activation does not change feathers or care cooldowns', async () => {
    const f = fixture(); const first = await f.initial(); await f.seedFeathers(6); const buy = await f.call('buyEgg', operation()); f.advance(BALANCE.incubationMs);
    const hatch = await f.call('hatchEgg', operation({ eggId: buy.state.egg.id })); const second = hatch.result.chickId;
    await f.call('careAction', operation({ chickId: first, action: 'feed' }));
    const initial = await f.call('getHome');
    const switches = await Promise.all(Array.from({ length: 10 }, (_, i) => f.call('activateChick', operation({ chickId: i % 2 ? first : second })))); expect(switches.every(r => r.ok)).toBe(true);
    const r = await f.call('getHome'); expect(r.state.player.feathers).toBe(initial.state.player.feathers); expect(r.state.chicks.find(c => c.id === first).lastFeedAt).toBe(initial.state.chicks[0].lastFeedAt);
    expect(r.state.chicks.filter(c => c.id === r.state.player.activeChickId)).toHaveLength(1);
  });
  it('concurrent feed and play count exactly one cycle', async () => {
    const f = fixture(); const chickId = await f.initial();
    const results = await Promise.all(['feed', 'play', 'feed', 'play'].map(action => f.call('careAction', operation({ chickId, action }))));
    expect(results.filter(r => r.ok)).toHaveLength(2); const r = await f.call('getHome'); expect(r.state.player.feathers).toBe(1); expect(r.state.chicks[0].careMilestones).toHaveLength(1);
  });
});
