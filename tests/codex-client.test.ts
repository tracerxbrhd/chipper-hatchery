import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TraitCodex } from '../src/codex/TraitCodex';
import { TRAIT_TAXONOMY, codexPreview } from '../src/codex/registry';
import { validGenes, CHICK_PRESETS } from '../tgcloud/lib/chickGenes.js';

describe('Codex presentation contract', () => {
  it('catalog samples use valid current baby genes without rerolling a saved or future bird', () => {
    for (const category of TRAIT_TAXONOMY) for (const trait of category.traits) {
      const sample = codexPreview(trait);
      expect(sample.stage).toBe('baby');
      expect(sample.appearanceVersion).toBe(2);
      expect(validGenes(sample.genes)).toBe(true);
      expect(sample.id).toBeUndefined();
      expect(sample.name).toBeUndefined();
      if (sample.genes?.pattern === 'solid') expect(sample.genes.colors.head).toBe(sample.genes.colors.body);
      if (category.id === 'palette') expect(sample.genes?.colors.body).toBe(CHICK_PRESETS.find((preset) => preset.id === trait.value)?.colors.body);
      else expect((sample.genes as unknown as Record<string, unknown>)[category.id]).toBe(trait.value);
    }
  });

  it('renders all 51 locked variants and 10 categories as unknown with accessible progress', () => {
    const markup = renderToStaticMarkup(createElement(TraitCodex, { codex: { version: 1, discoveredIds: [], total: 51, found: 0 } }));
    expect(markup.match(/class="codex-category"/g)).toHaveLength(10);
    expect(markup.match(/class="codex-trait locked"/g)).toHaveLength(51);
    expect(markup).toContain('aria-valuenow="0"');
    expect(markup).toContain('aria-valuemax="51"');
    expect(markup).toContain('Неизвестный признак');
    expect(markup).not.toContain('class="codex-trait found"');
  });

  it('found cards highlight only canonical discoveries and do not treat summary numbers as unlock input', () => {
    const markup = renderToStaticMarkup(createElement(TraitCodex, { codex: { version: 1,
      discoveredIds: ['headShape:round', 'palette:mist-blue', 'palette:fake', 'headShape:round'], total: 999, found: 999 } }));
    expect(markup.match(/class="codex-trait found"/g)).toHaveLength(2);
    expect(markup.match(/class="codex-trait locked"/g)).toHaveLength(49);
    expect(markup).toContain('aria-valuenow="2"');
    expect(markup).toContain('Круглая');
    expect(markup).toContain('Голубой туман');
    expect(markup).toContain('data-reduced-motion="true"');
    expect(markup).toContain('data-testid="codex-total">2<small> / 51</small>');
    expect(markup).toContain('aria-valuemax="51"');
    expect(markup).not.toMatch(/aria-value(?:now|max)="999"/);
  });

  it('missing/unknown schema shows refresh message and cannot reinterpret future IDs', () => {
    for (const codex of [undefined, { version: 2, discoveredIds: ['headShape:round'], total: 51, found: 1 }]) {
      const markup = renderToStaticMarkup(createElement(TraitCodex, { codex }));
      expect(markup).toContain('Откройте игру заново');
      expect(markup.match(/class="codex-trait locked"/g)).toHaveLength(51);
      expect(markup).toContain('aria-valuenow="0"');
    }
  });
});
