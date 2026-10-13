import type { Chick, ChickGenesV2, Rarity } from '../types';
import { CHICK_PRESETS } from '../../tgcloud/lib/chickGenes.js';
import { SHAPES } from './models';

/** DEV/QA only: no economic generator or synthetic identity in the live bundle. */
export function previewChick(index: number): Chick {
  const palette = CHICK_PRESETS[index % CHICK_PRESETS.length]!;
  const genes = { geneSchemaVersion: 1, colors: { ...palette.colors }, detailVariant: index % 4 } as ChickGenesV2;
  for (const [key, values] of Object.entries(SHAPES)) {
    const field = key as keyof typeof SHAPES;
    // Different periods make a coherent, repeatable catalogue, not a seed-only save.
    Object.assign(genes, { [field]: values[(index + Math.floor(index / values.length)) % values.length] });
  }
  if (genes.pattern === 'solid') {
    for (const field of ['head', 'wing', 'belly', 'tail', 'marking'] as const) genes.colors[field] = genes.colors.body;
  }
  return {
    id: `dev-bird-${index}`, appearanceVersion: 2, appearanceId: palette.id,
    rarity: palette.rarity as Rarity, genes, stage: 'baby', name: `Птенец ${index + 1}`, bornAt: 0,
    hunger: 90, mood: 90, energy: 90, lastFeedAt: null, lastPlayAt: null, sleepUntil: null, careMilestones: [],
  };
}

export const PREVIEW_CHICKS = Array.from({ length: 30 }, (_, index) => previewChick(index));
