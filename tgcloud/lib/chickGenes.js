/** Original V2 morphology vocabulary. Concrete traits are saved at hatch. */
export const GENE_OPTIONS = Object.freeze({
  headShape: ['round', 'oval', 'puffed', 'tall', 'wide'],
  bodyShape: ['pear', 'compact', 'oval', 'stocky'],
  eyeStyle: ['big', 'small', 'curious', 'sleepy'],
  beakShape: ['triangle', 'short', 'wide', 'curved'],
  legShape: ['stubby', 'slender', 'sturdy'],
  wingShape: ['rounded', 'pointed', 'fluffy', 'small'],
  tailShape: ['short', 'fan', 'curled', 'feathery'],
  crestShape: ['none', 'tiny', 'tuft', 'three-feather', 'messy'],
  pattern: ['solid', 'belly-patch', 'spotted', 'striped', 'speckled', 'split'],
});

const palette = (body, head, wing, belly, tail, marking, beak = '#c7a575', legs = '#82786a') =>
  Object.freeze({ body, head, wing, belly, tail, marking, beak, legs });

/** Twelve new coherent palettes; no original 0.1 appearance geometry or IDs. */
export const CHICK_PRESETS = Object.freeze([
  { id: 'graphite-linen', name: 'Графит и лён', rarity: 'common', colors: palette('#303431', '#303431', '#535c52', '#eeebe0', '#303431', '#b9c0aa') },
  { id: 'warm-linen', name: 'Тёплый лён', rarity: 'common', colors: palette('#e7e2d5', '#f6f2e9', '#cec6b6', '#f6f2e9', '#b7ae9e', '#78796e') },
  { id: 'sage-stone', name: 'Шалфей', rarity: 'common', colors: palette('#a7af95', '#d2d5bd', '#7f8e7b', '#e3e6d7', '#768573', '#4a5747') },
  { id: 'oat-biscuit', name: 'Овсяное печенье', rarity: 'common', colors: palette('#cbb99b', '#e3d3b8', '#a89478', '#f1e6d4', '#9d8970', '#665f53') },
  { id: 'ink-ivory', name: 'Тушь и сливки', rarity: 'common', colors: palette('#353b3d', '#ece9df', '#50595d', '#e5ded1', '#353b3d', '#e7e4d8') },
  { id: 'moss-pebble', name: 'Мох и камень', rarity: 'common', colors: palette('#6d796e', '#b8c0b4', '#4f5e53', '#dedfcf', '#4f5e53', '#c7caae') },
  { id: 'terracotta-cream', name: 'Терракота', rarity: 'uncommon', colors: palette('#b78069', '#dcc0a4', '#925d4d', '#ece1cc', '#795749', '#f0dcc5') },
  { id: 'mist-blue', name: 'Голубой туман', rarity: 'uncommon', colors: palette('#839aab', '#cedbdd', '#587687', '#e5edeb', '#4e6c7e', '#e0e7dc') },
  { id: 'lavender-slate', name: 'Лавандовый сланец', rarity: 'uncommon', colors: palette('#8d879e', '#c8bccb', '#68657d', '#e3dce3', '#5f5e73', '#e9e1db') },
  { id: 'rose-cocoa', name: 'Роза и какао', rarity: 'uncommon', colors: palette('#c09a97', '#dfc3bd', '#896c68', '#edddd2', '#755e59', '#63514d') },
  { id: 'moon-opal', name: 'Лунный опал', rarity: 'rare', colors: palette('#dce2d4', '#faf4e8', '#a9c3bc', '#f1dfc0', '#93aca8', '#788982', '#cda566', '#807c70') },
  { id: 'amber-night', name: 'Янтарная ночь', rarity: 'rare', colors: palette('#3b3c43', '#b49c64', '#626170', '#dfc690', '#353641', '#e4cc94', '#d0a467', '#8f8778') },
].map((entry) => Object.freeze({ ...entry, weight: entry.rarity === 'common' ? 70 / 6 : entry.rarity === 'uncommon' ? 25 / 4 : 5 / 2 })));

/** draw is validated by the domain; all enumerated combinations share anchors. */
export function generateGenes(preset, draw) {
  const genes = { geneSchemaVersion: 1 };
  for (const [field, choices] of Object.entries(GENE_OPTIONS)) {
    const allowed = field === 'pattern' && preset.rarity === 'common'
      ? ['solid', 'belly-patch', 'spotted', 'split'] : choices;
    genes[field] = allowed[Math.floor(draw() * allowed.length)];
  }
  genes.colors = { ...preset.colors };
  // Solid means one feather colour; feet and facial accents remain readable.
  if (genes.pattern === 'solid') {
    for (const field of ['head', 'wing', 'belly', 'tail', 'marking']) genes.colors[field] = genes.colors.body;
  }
  genes.detailVariant = Math.floor(draw() * 4);
  return genes;
}

export function validGenes(genes) {
  return genes?.geneSchemaVersion === 1
    && Object.entries(GENE_OPTIONS).every(([key, options]) => options.includes(genes[key]))
    && Number.isInteger(genes.detailVariant) && genes.detailVariant >= 0 && genes.detailVariant <= 3
    && ['body', 'head', 'wing', 'belly', 'tail', 'marking', 'beak', 'legs']
      .every((key) => /^#[0-9a-f]{6}$/i.test(genes.colors?.[key] ?? ''));
}
