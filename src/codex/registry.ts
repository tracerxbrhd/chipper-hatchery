import type { ChickGenesV2 } from '../types';
import type { ChickVisual } from '../chicks/models';
import { CHICK_PRESETS, generateGenes } from '../../tgcloud/lib/chickGenes.js';
import { TRAIT_TAXONOMY as SERVER_TAXONOMY } from '../../tgcloud/lib/traitCodex.js';

export interface CodexTrait { id: string; category: string; value: string; label: string; swatch?: readonly string[] }
export interface CodexCategory { id: string; label: string; traits: readonly CodexTrait[] }
export const TRAIT_TAXONOMY: readonly CodexCategory[] = SERVER_TAXONOMY;
export interface TraitCodexProgress { version: number; discoveredIds: string[]; total: number; found: number }

/** Illustrative baby sample, never an owned bird or a future growth preview. */
export function codexPreview(trait: CodexTrait): ChickVisual {
  const preset = CHICK_PRESETS.find((entry) => entry.id === (trait.category === 'palette' ? trait.value : 'mist-blue'))!;
  const genes = generateGenes(preset, () => .3) as ChickGenesV2;
  if (trait.category !== 'palette') {
    // The category/value pair comes exclusively from the authoritative registry.
    Object.assign(genes, { [trait.category]: trait.value });
    if (genes.pattern === 'solid') {
      for (const key of ['head', 'wing', 'belly', 'tail', 'marking'] as const) genes.colors[key] = genes.colors.body;
    }
  }
  return { stage: 'baby', appearanceVersion: 2, genes };
}
