import type { Chick, ChickGenesV2, Stage } from '../types';

export const SHAPES = {
  headShape: ['round', 'oval', 'puffed', 'tall', 'wide'],
  bodyShape: ['pear', 'compact', 'oval', 'stocky'],
  eyeStyle: ['big', 'small', 'curious', 'sleepy'],
  beakShape: ['triangle', 'short', 'wide', 'curved'],
  legShape: ['stubby', 'slender', 'sturdy'],
  wingShape: ['rounded', 'pointed', 'fluffy', 'small'],
  tailShape: ['short', 'fan', 'curled', 'feathery'],
  crestShape: ['none', 'tiny', 'tuft', 'three-feather', 'messy'],
  pattern: ['solid', 'belly-patch', 'spotted', 'striped', 'speckled', 'split'],
} as const;

/** Used only on broken/unknown saves. Never re-rolls identity on the client. */
export const NEUTRAL_GENES: ChickGenesV2 = {
  geneSchemaVersion: 1, headShape: 'round', bodyShape: 'pear', eyeStyle: 'curious',
  beakShape: 'short', legShape: 'slender', wingShape: 'rounded', tailShape: 'short',
  crestShape: 'tiny', pattern: 'belly-patch', detailVariant: 0,
  colors: { body: '#353634', head: '#353634', wing: '#52544e', belly: '#e5dfd0',
    tail: '#353634', marking: '#e5dfd0', beak: '#c8a46b', legs: '#8b7d66' },
};

export type ChickPose = 'idle' | 'walk' | 'turn' | 'look' | 'preen' | 'peck' | 'yawn' | 'tap' | 'stroke' | 'held' | 'land' | 'feed' | 'play' | 'sleep' | 'wake' | 'flap' | 'hit' | 'hatch' | 'grow';
export type ChickDirection = 'left' | 'right' | 'front';
export type ChickVisual = Pick<Chick, 'stage'> & Partial<Pick<Chick, 'genes' | 'appearanceVersion' | 'id' | 'name'>>;
export const STAGE_LABELS: Record<Stage, string> = { baby: 'Птенец', teen: 'Подросток', adult: 'Взрослая птица' };
export const POSE_LABELS: Record<ChickPose, string> = {
  idle: 'Спокойно стоит', walk: 'Гуляет', turn: 'Поворачивается', look: 'Присматривается', preen: 'Чистит перышки',
  feed: 'Клюёт корм', play: 'Играет', sleep: 'Спит', wake: 'Просыпается',
  flap: 'Летит', hit: 'Останавливает полёт', hatch: 'Вылупляется', grow: 'Подрастает',
  peck: 'Исследует поляну', yawn: 'Зевает', tap: 'Отвечает на касание', stroke: 'Радуется поглаживанию', held: 'На руках', land: 'Мягко приземляется',
};

export function isValidGenes(value: unknown): value is ChickGenesV2 {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (record.geneSchemaVersion !== 1 || !Number.isInteger(record.detailVariant) || Number(record.detailVariant) < 0 || Number(record.detailVariant) > 3) return false;
  for (const [key, choices] of Object.entries(SHAPES)) {
    if (!(choices as readonly unknown[]).includes(record[key])) return false;
  }
  if (!record.colors || typeof record.colors !== 'object') return false;
  const colors = record.colors as Record<string, unknown>;
  return ['body', 'head', 'wing', 'belly', 'tail', 'marking', 'beak', 'legs'].every((key) =>
    typeof colors[key] === 'string' && /^#[0-9a-f]{6}$/i.test(colors[key] as string));
}

export function genesFor(chick?: ChickVisual): ChickGenesV2 {
  return isValidGenes(chick?.genes) ? chick.genes : NEUTRAL_GENES;
}

/** The geometry fingerprint also gives each bird a stable micro-motion tempo. */
export function geneFingerprint(genes: ChickGenesV2): number {
  const text = JSON.stringify(genes);
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}

export function getAppearanceLabel(chick?: ChickVisual): string {
  const genes = genesFor(chick);
  const shapes = { round: 'Круглоголовый', oval: 'Овальноголовый', puffed: 'Пушистоголовый', tall: 'Длинноголовый', wide: 'Широкоголовый' };
  const patterns = { solid: 'однотонный', 'belly-patch': 'со светлой грудкой', spotted: 'пятнистый', striped: 'полосатый', speckled: 'крапчатый', split: 'двухцветный' };
  return `${shapes[genes.headShape]}, ${patterns[genes.pattern]}`;
}
