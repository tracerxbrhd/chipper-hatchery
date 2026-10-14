import { describe, expect, it } from 'vitest';
import { CHICK_PRESETS, GENE_OPTIONS, generateGenes } from '../tgcloud/lib/chickGenes.js';
import { TRAIT_TAXONOMY, discoverChickTraits, discoverOwnedTraits, traitCodexCatalog, traitCodexStatus } from '../tgcloud/lib/traitCodex.js';

const stateWith = (...chicks) => ({ player: { telegramId: '101', feathers: 7 }, chicks });
const bird = (preset = CHICK_PRESETS[0], draw = () => .3) => ({ id: 'real-server-bird', appearanceVersion: 2,
  appearanceId: preset.id, rarity: preset.rarity, genes: generateGenes(preset, draw) });

describe('Codex canonical attainable taxonomy', () => {
  it('derives all 9 morphology categories and 12 palettes from generator registries with stable IDs', () => {
    expect(TRAIT_TAXONOMY).toHaveLength(10);
    for (const [category, values] of Object.entries(GENE_OPTIONS)) {
      const entry = TRAIT_TAXONOMY.find((item) => item.id === category);
      expect(entry.traits.map((trait) => trait.value)).toEqual(values);
      expect(entry.traits.map((trait) => trait.id)).toEqual(values.map((value) => `${category}:${value}`));
    }
    const palettes = TRAIT_TAXONOMY.find((entry) => entry.id === 'palette');
    expect(palettes.traits.map((trait) => trait.value)).toEqual(CHICK_PRESETS.map((preset) => preset.id));
    expect(palettes.traits.every((trait) => trait.label && trait.swatch.every((color) => /^#[0-9a-f]{6}$/.test(color)))).toBe(true);
    const ids = TRAIT_TAXONOMY.flatMap((category) => category.traits.map((trait) => trait.id));
    expect(ids).toHaveLength(51);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.isFrozen(TRAIT_TAXONOMY)).toBe(true);
    expect(TRAIT_TAXONOMY.every((category) => Object.isFrozen(category) && Object.isFrozen(category.traits))).toBe(true);
  });

  it('every catalog ID is actually generated, including solid palette transformations', () => {
    let seed = 0x31a733;
    const draw = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const state = stateWith();
    for (const preset of CHICK_PRESETS) {
      for (let index = 0; index < 400; index += 1) discoverChickTraits(state, bird(preset, draw));
      const solid = bird(preset, () => 0);
      expect(solid.genes.colors.belly).toBe(solid.genes.colors.body);
      const onlySolid = stateWith(solid);
      discoverOwnedTraits(onlySolid);
      expect(traitCodexStatus(onlySolid).discoveredIds).toContain(`palette:${preset.id}`);
    }
    expect(traitCodexStatus(state)).toMatchObject({ found: 51, total: 51 });
  });

  it('palette ID requires exact generated colors and recognized identity, with case-insensitive hex', () => {
    const valid = bird(CHICK_PRESETS[6]);
    for (const key of Object.keys(valid.genes.colors)) valid.genes.colors[key] = valid.genes.colors[key].toUpperCase();
    const state = stateWith(valid);
    discoverOwnedTraits(state);
    expect(traitCodexStatus(state).discoveredIds).toContain('palette:terracotta-cream');
    const fake = bird(CHICK_PRESETS[7]); fake.genes.colors.head = '#000000';
    const altered = stateWith(fake);
    discoverOwnedTraits(altered);
    expect(traitCodexStatus(altered).found).toBe(9);
    expect(traitCodexStatus(altered).discoveredIds.some((id) => id.startsWith('palette:'))).toBe(false);
    const unknown = bird(); unknown.appearanceId = 'future-palette';
    const future = stateWith(unknown); discoverOwnedTraits(future);
    expect(traitCodexStatus(future).found).toBe(9);
  });

  it('does not expose impossible common striped/speckled palette samples as generated palettes', () => {
    for (const pattern of ['striped', 'speckled']) {
      const sample = bird(); sample.genes.pattern = pattern;
      const state = stateWith(sample); discoverOwnedTraits(state);
      expect(traitCodexStatus(state).discoveredIds).not.toContain(`palette:${sample.appearanceId}`);
    }
  });
});

describe('Codex discovery is a bounded permanent union', () => {
  it('backfills current ownership once without modifying chick, identity or economy', () => {
    const sample = bird(); const before = JSON.stringify(sample);
    const state = stateWith(sample);
    expect(discoverOwnedTraits(state)).toBe(true);
    expect(traitCodexStatus(state)).toMatchObject({ version: 1, found: 10, total: 51 });
    expect(discoverOwnedTraits(state)).toBe(false);
    expect(JSON.stringify(sample)).toBe(before);
    expect(state.player).toMatchObject({ telegramId: '101', feathers: 7 });
  });

  it('retains discoveries after gifting all birds with a trait and unions accepted gifts', () => {
    const sender = stateWith(bird()); discoverOwnedTraits(sender);
    const senderIds = traitCodexStatus(sender).discoveredIds;
    const transferred = sender.chicks.pop();
    expect(discoverOwnedTraits(sender)).toBe(false);
    expect(traitCodexStatus(sender).discoveredIds).toEqual(senderIds);
    const receiver = stateWith(bird(CHICK_PRESETS[7], () => .9)); discoverOwnedTraits(receiver);
    const before = traitCodexStatus(receiver).discoveredIds;
    receiver.chicks.push(transferred); discoverChickTraits(receiver, transferred);
    for (const id of [...before, ...senderIds]) expect(traitCodexStatus(receiver).discoveredIds).toContain(id);
    expect(discoverChickTraits(receiver, transferred)).toBe(false);
  });

  it('deduplicates and drops unknown current-version IDs so state growth is bounded', () => {
    const state = stateWith(bird());
    state.player.discoveredTraits = { version: 1, ids: Array(10000).fill('headShape:round').concat('feathers:unlimited', 'palette:fake') };
    discoverOwnedTraits(state);
    expect(state.player.discoveredTraits.ids.length).toBeLessThanOrEqual(51);
    expect(state.player.discoveredTraits.ids).not.toContain('feathers:unlimited');
    expect(state.player.discoveredTraits.ids).not.toContain('palette:fake');
  });

  it('skips unknown or invalid genes without fallback, crash, or modifying the save', () => {
    const good = bird(); const future = bird(); future.genes.geneSchemaVersion = 2;
    const invalid = bird(); invalid.genes.headShape = 'impossible';
    const legacy = bird(); legacy.appearanceVersion = 1;
    const state = stateWith(good, future, invalid, legacy);
    const before = JSON.stringify(state.chicks);
    discoverOwnedTraits(state);
    expect(traitCodexStatus(state).discoveredIds).toEqual(traitCodexStatus(Object.assign(stateWith(good), { player: state.player })).discoveredIds);
    expect(traitCodexStatus(state).found).toBe(10);
    expect(JSON.stringify(state.chicks)).toBe(before);
  });

  it('preserves an unknown future discovery schema verbatim instead of downgrading IDs', () => {
    const state = stateWith(bird());
    state.player.discoveredTraits = { version: 2, ids: ['headShape:unknown-future'], other: 'retained' };
    const before = JSON.stringify(state);
    expect(discoverOwnedTraits(state)).toBe(false);
    expect(discoverChickTraits(state, state.chicks[0])).toBe(false);
    expect(JSON.stringify(state)).toBe(before);
    expect(traitCodexStatus(state)).toMatchObject({ version: 2, discoveredIds: [], found: 0 });
  });

  it('own catalog contains fixed taxonomy and discovery summary only, without private chick data', () => {
    const sample = bird(); sample.name = 'Private name'; sample.hunger = 54;
    const state = stateWith(sample); discoverOwnedTraits(state);
    const catalog = traitCodexCatalog(state);
    expect(Object.keys(catalog).sort()).toEqual(['categories', 'discoveredIds', 'found', 'total', 'version']);
    expect(JSON.stringify(catalog)).not.toContain('Private name');
    expect(JSON.stringify(catalog)).not.toContain('telegramId');
    expect(JSON.stringify(catalog)).not.toContain('hunger');
    expect(JSON.stringify(catalog)).not.toContain(sample.id);
  });
});
