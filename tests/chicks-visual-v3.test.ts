import { describe, expect, it } from 'vitest';
import { GENE_OPTIONS } from '../tgcloud/lib/chickGenes.js';
import { CHICK_VISUAL_VERSION, geneFingerprint, SHAPES, visualDetailsFor } from '../src/chicks/models';
import { PREVIEW_CHICKS } from '../src/chicks/previewFixtures';
import { buildChickMarkup, renderChickSvg } from '../src/chicks/renderer';

describe('visualVersion 3 historical identity contract', () => {
  it('does not change the attainable gene vocabulary or any saved bird record', () => {
    expect(CHICK_VISUAL_VERSION).toBe(3);
    expect(SHAPES).toEqual(GENE_OPTIONS);
    for (const bird of PREVIEW_CHICKS) {
      const original = structuredClone(bird);
      for (const stage of ['baby', 'teen', 'adult'] as const) {
        const output = buildChickMarkup({ chick: { ...bird, stage } });
        expect(output.genes).toBe(bird.genes);
        expect(output.visual).toEqual(visualDetailsFor(bird));
        expect(output.markup).toContain('data-visual-version="3"');
      }
      expect(bird).toEqual(original);
      expect(bird.appearanceVersion).toBe(2);
      expect(bird.genes.geneSchemaVersion).toBe(1);
    }
  });

  it('keeps cosmetics and personality stable after rename, growth, gift and reordered JSON', () => {
    for (const bird of PREVIEW_CHICKS) {
      const reorderedGenes = Object.fromEntries(Object.entries(bird.genes).reverse()) as typeof bird.genes;
      reorderedGenes.colors = Object.fromEntries(Object.entries(bird.genes.colors).reverse()) as typeof bird.genes.colors;
      expect(geneFingerprint(reorderedGenes)).toBe(geneFingerprint(bird.genes));
      const recipientView = { id: bird.id, name: 'Новое имя', stage: 'adult' as const, genes: reorderedGenes, appearanceVersion: 2 as const };
      expect(visualDetailsFor(recipientView)).toEqual(visualDetailsFor(bird));
      expect(renderChickSvg({ chick: recipientView })).toBe(renderChickSvg({ chick: { ...bird, stage: 'adult' } }));
    }
  });

  it('gives identical genes different deterministic decorative identities without new genes', () => {
    const original = PREVIEW_CHICKS[0]!;
    const siblings = Array.from({ length: 24 }, (_, index) => ({ ...original, id: `sibling-${index}` }));
    expect(new Set(siblings.map((bird) => JSON.stringify(visualDetailsFor(bird)))).size).toBe(24);
    expect(new Set(siblings.map((bird) => visualDetailsFor(bird).personality)).size).toBe(5);
    expect(new Set(siblings.map((bird) => renderChickSvg({ chick: bird })))).size).toBe(24);
    expect(siblings.every((bird) => bird.genes === original.genes)).toBe(true);
  });

  it('exports well-formed bounded vector artwork and the complete low-cost animation rig', () => {
    for (const bird of PREVIEW_CHICKS) {
      const svg = renderChickSvg({ chick: bird });
      expect(svg.length).toBeLessThan(30000);
      expect(svg).not.toMatch(/<filter|<animate|<image|NaN|Infinity|undefined/);
      for (const rig of ['mirror', 'body', 'breath', 'head', 'neck', 'wing', 'tail', 'left-leg', 'right-leg', 'eye-left', 'eye-right', 'eye-open', 'eye-closed', 'eye-lid', 'beak-mouth']) {
        expect(svg).toContain(`data-rig="${rig}"`);
      }
      // SVG data URLs are XML, where duplicate attributes make the entire image fail.
      for (const tag of svg.matchAll(/<[a-z][^>]*>/g)) {
        const attributes = [...tag[0].matchAll(/([a-z][a-z0-9:-]*)="[^"]*"/g)].map((match) => match[1]);
        expect(new Set(attributes).size, tag[0]).toBe(attributes.length);
      }
    }
  });
});
