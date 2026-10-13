import { describe, expect, it } from 'vitest';
import { BALANCE, APPEARANCES, normalizeName, selectAppearance } from '../tgcloud/lib/domain.js';
import { fixture, operation } from './helpers';

describe('GDD balance and V2 appearance presets', () => {
  it('has exact baseline and 12 original coherent palette presets', () => {
    expect(BALANCE).toMatchObject({ eggCost: 6, sleepDurationMs: 2700000, incubationMs: 10800000, careCooldownMs: 14400000, rewardCooldownMs: 72000000, miniGameMinDurationMs: 2000, minNeed: 35 });
    expect(APPEARANCES).toHaveLength(12);
    for (const [rarity, count, weight] of [['common', 6, 70], ['uncommon', 4, 25], ['rare', 2, 5]]) {
      const entries = APPEARANCES.filter(a => a.rarity === rarity);
      expect(entries).toHaveLength(count); expect(entries.reduce((s, a) => s + a.weight, 0)).toBeCloseTo(weight);
    }
  });
  it.each([[0, 'common'], [.699999, 'common'], [.7, 'uncommon'], [.949999, 'uncommon'], [.95, 'rare'], [.999999, 'rare']])('selects the correct rarity at %s', (roll, rarity) => expect(selectAppearance(() => roll).rarity).toBe(rarity));
  it('reaches every appearance with deterministic midpoint draws', () => {
    let start = 0; const selected = [];
    for (const appearance of APPEARANCES) { selected.push(selectAppearance(() => (start + appearance.weight / 2) / 100).id); start += appearance.weight; }
    expect(selected).toEqual(APPEARANCES.map(a => a.id));
  });
  it.each([NaN, -1, 1, Infinity])('rejects invalid server RNG %s', roll => expect(() => selectAppearance(() => roll)).toThrow());
  it('normalizes Unicode names and rejects control or misleading text', () => {
    expect(normalizeName('  Ёжик  🐥 ')).toBe('Ёжик 🐥'); expect(normalizeName('е\u0308')).toBe('ё');
    for (const name of ['', 'x'.repeat(21), '\nЦып', '\u202eЦып', '\u200b', '\u200d', '\u200c', '\u061c', '\u00ad']) expect(() => normalizeName(name)).toThrow();
    expect(normalizeName('👨‍👩‍👧‍👦')).toBe('👨‍👩‍👧‍👦');
    expect(normalizeName('<img src=x>')).toBe('<img src=x>'); // Rendered as React text, never HTML.
  });
});

describe('care, server clock, growth and offline state', () => {
  it('U14 applies hourly decay exactly and floors all needs at 35 after months', async () => {
    const f = fixture(); await f.initial(); f.advance(BALANCE.hourMs);
    let r = await f.call('getHome'); expect(r.state.chicks[0]).toMatchObject({ hunger: 63.8, mood: 59.1, energy: 68.9 });
    f.advance(180 * 24 * BALANCE.hourMs); r = await f.call('getHome');
    expect(r.state.chicks[0]).toMatchObject({ hunger: 35, mood: 35, energy: 35 });
    expect(r.state.chicks).toHaveLength(1);
  });
  it('care has 4-hour cooldowns, caps needs, and requires one bird within 30 minutes', async () => {
    const f = fixture(); const chickId = await f.initial();
    let r = await f.call('careAction', operation({ chickId, action: 'feed' })); expect(r.state.chicks[0].hunger).toBe(95);
    r = await f.call('careAction', operation({ chickId, action: 'feed' })); expect(r.error.code).toBe('CARE_COOLDOWN');
    f.advance(31 * 60000); r = await f.call('careAction', operation({ chickId, action: 'play' })); expect(r.result.rewarded).toBe(false);
    f.advance(4 * BALANCE.hourMs); await f.call('careAction', operation({ chickId, action: 'feed' }));
    r = await f.call('careAction', operation({ chickId, action: 'play' })); expect(r.state.chicks[0].hunger).toBe(100); expect(r.state.player.feathers).toBe(1);
    expect(r.state.chicks[0].careMilestones).toHaveLength(1);
  });
  it('growth requires calendar age plus three correctly spaced care milestones', async () => {
    const f = fixture(); const chickId = await f.initial();
    const cycle = async () => { await f.call('careAction', operation({ chickId, action: 'feed' })); return f.call('careAction', operation({ chickId, action: 'play' })); };
    await cycle(); f.advance(4 * BALANCE.hourMs); let r = await cycle(); expect(r.state.chicks[0].careMilestones).toHaveLength(1);
    f.advance(16 * BALANCE.hourMs); r = await f.call('getHome'); expect(r.state.chicks[0].stage).toBe('teen');
    await cycle(); f.advance(20 * BALANCE.hourMs); await cycle(); f.advance(32 * BALANCE.hourMs);
    r = await f.call('getHome'); expect(r.state.chicks[0].stage).toBe('adult'); expect(r.state.chicks[0].careMilestones).toHaveLength(3);
  });
  it('calendar time alone never grows an uncared-for bird', async () => {
    const f = fixture(); await f.initial(); f.advance(100 * BALANCE.hourMs);
    expect((await f.call('getHome')).state.chicks[0].stage).toBe('baby');
  });
  it('U12 sleep persists, cannot be extended, blocks care, and completes at 45 minutes', async () => {
    const f = fixture(); const chickId = await f.initial();
    let r = await f.call('careAction', operation({ chickId, action: 'sleep' })); const until = r.state.chicks[0].sleepUntil;
    f.advance(10 * 60000); r = await f.call('careAction', operation({ chickId, action: 'sleep' })); expect(r.state.chicks[0].sleepUntil).toBe(until);
    r = await f.call('careAction', operation({ chickId, action: 'feed' })); expect(r.error.code).toBe('CHICK_SLEEPING');
    f.advance(35 * 60000); r = await f.call('bootstrap'); expect(r.state.chicks[0].sleepUntil).toBe(null); expect(r.state.chicks[0].energy).toBe(100);
  });
  it('C13 inactive birds freeze needs and sleep finishes while resting', async () => {
    const f = fixture(); const first = await f.initial(); await f.seedFeathers(6);
    const bought = await f.call('buyEgg', operation()); f.advance(BALANCE.incubationMs);
    const hatch = await f.call('hatchEgg', operation({ eggId: bought.state.egg.id })); const second = hatch.result.chickId;
    await f.call('careAction', operation({ chickId: first, action: 'sleep' }));
    await f.call('activateChick', operation({ chickId: second }));
    const before = (await f.call('getHome')).state.chicks.find(c => c.id === first);
    f.advance(100 * BALANCE.hourMs);
    const after = (await f.call('getHome')).state.chicks.find(c => c.id === first);
    expect(after.hunger).toBe(before.hunger); expect(after.mood).toBe(before.mood); expect(after.energy).toBe(100); expect(after.sleepUntil).toBe(null);
    await f.call('activateChick', operation({ chickId: first })); f.advance(BALANCE.hourMs);
    const active = (await f.call('getHome')).state.chicks.find(c => c.id === first); expect(active.hunger).toBeCloseTo(before.hunger - 1.2);
  });
  it('U11 keeps appearance and ID stable across retries and different RNG', async () => {
    const f = fixture(); f.roll(.999); const r = await f.call('bootstrap'); const request = operation({ eggId: r.state.egg.id });
    const hatched = await f.call('hatchEgg', request); f.roll(0);
    const repeat = await f.call('hatchEgg', operation({ eggId: r.state.egg.id }));
    expect(repeat.state.chicks[0].appearanceId).toBe('amber-night'); expect(repeat.result.chickId).toBe(hatched.result.chickId);
  });
});
