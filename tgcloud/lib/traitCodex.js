/** Persistent discovery of the actual V2 generator vocabulary. No SDK or UI. */
import { CHICK_PRESETS, GENE_OPTIONS, validGenes } from './chickGenes.js';

export const TRAIT_CODEX_VERSION = 1;

const CATEGORY_LABELS = Object.freeze({
  headShape: 'Голова', bodyShape: 'Тело', eyeStyle: 'Глаза', beakShape: 'Клюв',
  legShape: 'Лапки', wingShape: 'Крылья', tailShape: 'Хвост', crestShape: 'Хохолок',
  pattern: 'Оперение', palette: 'Палитра',
});
const LABELS = Object.freeze({
  headShape: ['Круглая', 'Овальная', 'Пушистая', 'Вытянутая', 'Широкая'],
  bodyShape: ['Грушевидное', 'Компактное', 'Овальное', 'Крепкое'],
  eyeStyle: ['Большие', 'Маленькие', 'Любопытные', 'Сонные'],
  beakShape: ['Треугольный', 'Короткий', 'Широкий', 'Изогнутый'],
  legShape: ['Короткие', 'Тонкие', 'Крепкие'],
  wingShape: ['Закруглённые', 'Заострённые', 'Пушистые', 'Маленькие'],
  tailShape: ['Короткий', 'Веерный', 'Завитой', 'Перистый'],
  crestShape: ['Без хохолка', 'Маленький', 'Пучок', 'Три пёрышка', 'Взъерошенный'],
  pattern: ['Однотонное', 'Светлая грудка', 'Пятнистое', 'Полосатое', 'Крапчатое', 'Двухцветное'],
});

// Membership comes from the server generator; labels describe that membership.
// Adding an option without metadata is a visible failure rather than a silent
// fabricated trait. Existing category:value IDs never depend on array offsets.
export const TRAIT_TAXONOMY = Object.freeze([
  ...Object.entries(GENE_OPTIONS).map(([category, options]) => {
    if (!CATEGORY_LABELS[category] || LABELS[category]?.length !== options.length) {
      throw new Error(`Trait metadata does not match generator category ${category}`);
    }
    return Object.freeze({ id: category, label: CATEGORY_LABELS[category], traits: Object.freeze(options.map((value, index) =>
      Object.freeze({ id: `${category}:${value}`, category, value, label: LABELS[category][index] }))) });
  }),
  Object.freeze({ id: 'palette', label: CATEGORY_LABELS.palette, traits: Object.freeze(CHICK_PRESETS.map((preset) =>
    Object.freeze({ id: `palette:${preset.id}`, category: 'palette', value: preset.id, label: preset.name,
      swatch: Object.freeze([preset.colors.body, preset.colors.head, preset.colors.wing, preset.colors.belly]) }))) }),
]);
const TRAIT_IDS = Object.freeze(TRAIT_TAXONOMY.flatMap((category) => category.traits.map((trait) => trait.id)));
const TRAIT_ID_SET = new Set(TRAIT_IDS);
const COLOR_FIELDS = ['body', 'head', 'wing', 'belly', 'tail', 'marking', 'beak', 'legs'];

/** Palette identity includes the generator's deliberate solid-colour change. */
function paletteFor(chick) {
  const preset = CHICK_PRESETS.find((entry) => entry.id === chick.appearanceId);
  if (!preset) return null;
  const colors = { ...preset.colors };
  if (chick.genes.pattern === 'solid') {
    for (const field of ['head', 'wing', 'belly', 'tail', 'marking']) colors[field] = colors.body;
  }
  if (!COLOR_FIELDS.every((field) => chick.genes.colors[field].toLowerCase() === colors[field].toLowerCase())) return null;
  // Common palettes cannot produce these patterns; do not imply that such a
  // corrupt/legacy sample was produced by the current authoritative generator.
  if (preset.rarity === 'common' && ['striped', 'speckled'].includes(chick.genes.pattern)) return null;
  return preset;
}

function chickTraitIds(chick) {
  // A future schema is not the current taxonomy. Skip without rerolling or
  // borrowing the renderer's neutral fallback genes.
  if (chick?.appearanceVersion !== 2 || !validGenes(chick.genes)) return [];
  const ids = Object.keys(GENE_OPTIONS).map((category) => `${category}:${chick.genes[category]}`);
  const preset = paletteFor(chick);
  if (preset) ids.push(`palette:${preset.id}`);
  return ids;
}

function savedIds(state) {
  const discovery = state?.player?.discoveredTraits;
  if (discovery?.version !== TRAIT_CODEX_VERSION || !Array.isArray(discovery.ids)) return [];
  // Current version cannot grow without bound through duplicates/unknown IDs.
  return TRAIT_IDS.filter((id) => discovery.ids.includes(id));
}

function unionDiscovery(state, added) {
  if (!state?.player) return false;
  const current = state.player.discoveredTraits;
  // Preserve an unknown future discovery schema verbatim. No downgrade and no
  // interpretation of future IDs using today's morphology vocabulary.
  if (current && current.version !== TRAIT_CODEX_VERSION) return false;
  const union = new Set(savedIds(state));
  for (const id of added) if (TRAIT_ID_SET.has(id)) union.add(id);
  const discovery = { version: TRAIT_CODEX_VERSION, ids: TRAIT_IDS.filter((id) => union.has(id)) };
  if (JSON.stringify(current) === JSON.stringify(discovery)) return false;
  state.player.discoveredTraits = discovery;
  return true;
}

/** Call only with an authoritative received chick, in hatch/gift owner CAS. */
export function discoverChickTraits(state, chick) {
  return unionDiscovery(state, chickTraitIds(chick));
}

/** Backfill only current ownership; transfer history is deliberately not guessed. */
export function discoverOwnedTraits(state) {
  return unionDiscovery(state, (state?.chicks ?? []).flatMap(chickTraitIds));
}

/** Authenticated own summary, not a social/public DTO. Never reveals chicks. */
export function traitCodexStatus(state) {
  const discoveredIds = savedIds(state);
  const storedVersion = state?.player?.discoveredTraits?.version;
  const version = Number.isSafeInteger(storedVersion) && storedVersion > 0 ? storedVersion : TRAIT_CODEX_VERSION;
  return { version, discoveredIds, total: TRAIT_IDS.length, found: discoveredIds.length };
}

export function traitCodexCatalog(state) {
  return { ...traitCodexStatus(state), categories: TRAIT_TAXONOMY };
}
