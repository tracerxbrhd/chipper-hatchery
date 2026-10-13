import type { ChickGenesV2, Stage } from '../types';

export interface Point { x: number; y: number }
export interface ShapeGeometry { path: string; center: Point; width: number; height: number }
export interface ChickGeometry {
  body: ShapeGeometry; head: ShapeGeometry; neckPath: string;
  anchors: Record<'neck' | 'headCenter' | 'eyeLeft' | 'eyeRight' | 'beakRoot' | 'crestRoot' |
    'wingRootLeft' | 'wingRootRight' | 'tailRoot' | 'legRootLeft' | 'legRootRight' |
    'footContactLeft' | 'footContactRight' | 'groundContact', Point>;
  legLength: number; eyeRadius: number; legWidth: number;
}

export const GROUND_CONTACT: Point = { x: 160, y: 282 };
export const VIEWBOX = { width: 320, height: 320 } as const;
const STAGES = {
  baby: { bodyWidth: 108, bodyHeight: 96, headWidth: 94, headHeight: 86, neck: .52, leg: .76 },
  teen: { bodyWidth: 127, bodyHeight: 108, headWidth: 84, headHeight: 82, neck: .65, leg: .91 },
  adult: { bodyWidth: 144, bodyHeight: 118, headWidth: 76, headHeight: 77, neck: .76, leg: 1.04 },
} as const;
const HEAD_PROPORTIONS = { round: [1, 1], oval: [.88, 1.13], puffed: [1.12, 1.04], tall: [.79, 1.25], wide: [1.2, .82] } as const;
const BODY_PROPORTIONS = { pear: [1, 1], compact: [.9, .8], oval: [1.11, .82], stocky: [1.1, 1.05] } as const;
const LEG_LENGTH = { stubby: 21, slender: 41, sturdy: 28 } as const;
const LEG_WIDTH = { stubby: 4.1, slender: 3.4, sturdy: 6.3 } as const;
const r = (value: number) => Number(value.toFixed(3));

/** Path coordinates are normalized by half-width/half-height; one shared frame. */
function pathFrom(normalized: string, center: Point, width: number, height: number): string {
  let coordinate = 0;
  return normalized.replace(/-?(?:\d*\.)?\d+/g, (value) => {
    const axis = coordinate++ % 2;
    return String(r(Number(value) * (axis === 0 ? width / 2 : height / 2) + (axis === 0 ? center.x : center.y)));
  });
}

const HEAD_PATHS = {
  round: 'M0 -1C.58 -1 1 -.57 1 0C1 .59 .59 1 0 1C-.58 1 -1 .6 -1 0C-1 -.57 -.58 -1 0 -1Z',
  oval: 'M.06 -1C.7 -.97 1 -.49 .99 .07C.98 .68 .49 1 -.06 1C-.71 .96 -1 .46 -.99 -.07C-.97 -.7 -.47 -1 .06 -1Z',
  puffed: 'M0 -.98C.22 -1.04 .48 -.9 .58 -.8C.9 -.84 1.05 -.51 .97 -.26C1.08 -.03 1.03 .3 .89 .47C.88 .79 .56 .95 .29 .93C.03 1.07 -.3 1.03 -.45 .91C-.76 .92 -1 .63 -.96 .36C-1.08 .08 -1 -.25 -.9 -.4C-.88 -.72 -.56 -.89 -.32 -.89C-.21 -1.01 -.11 -1 0 -.98Z',
  tall: 'M0 -1C.55 -1 .83 -.62 .89 -.12C1.08 .28 .93 .78 .43 .94C-.12 1.12 -.69 .9 -.84 .48C-1.05 .04 -.95 -.52 -.67 -.81C-.49 -.98 -.23 -1 0 -1Z',
  wide: 'M-.05 -.98C.51 -1 1.02 -.64 1.01 -.09C1.05 .4 .68 .86 .23 .94C-.32 1.09 -.85 .88 -.98 .37C-1.12 -.12 -.89 -.68 -.45 -.87C-.31 -.98 -.16 -.99 -.05 -.98Z',
} as const;
const BODY_PATHS = {
  pear: 'M.12 -1C.6 -1 .75 -.59 .85 -.23C1.11 .22 .93 .78 .4 .95C-.12 1.14 -.78 .93 -.94 .46C-1.13 -.03 -.83 -.42 -.65 -.63C-.49 -.83 -.24 -1 .12 -1Z',
  compact: 'M-.17 -.94C.48 -1.08 .96 -.7 1 -.18C1.15 .35 .69 .92 .14 1C-.46 1.07 -.98 .64 -1 .08C-1.07 -.47 -.75 -.85 -.17 -.94Z',
  oval: 'M0 -1C.56 -1 1 -.56 1 0C1 .54 .55 1 0 1C-.55 1 -1 .54 -1 0C-1 -.56 -.56 -1 0 -1Z',
  stocky: 'M-.48 -.9C-.03 -1.08 .54 -1.02 .78 -.65C1.02 -.36 1.07 .35 .81 .7C.54 1.07 -.2 1.12 -.61 .87C-1 .65 -1.12 .09 -.94 -.38C-.83 -.69 -.66 -.83 -.48 -.9Z',
} as const;

export function buildGeometry(genes: ChickGenesV2, stage: Stage, facingBlend = 0): ChickGeometry {
  const facing = Math.max(0, Math.min(1, facingBlend));
  const age = STAGES[stage];
  const [headW, headH] = HEAD_PROPORTIONS[genes.headShape];
  const [bodyW, bodyH] = BODY_PROPORTIONS[genes.bodyShape];
  const legLength = LEG_LENGTH[genes.legShape] * age.leg;
  const bodyWidth = age.bodyWidth * bodyW * (1 - facing * .12);
  const bodyHeight = age.bodyHeight * bodyH;
  const bodyCenter = { x: 143 + facing * 17, y: GROUND_CONTACT.y - legLength + 9 - bodyHeight / 2 };
  const headWidth = age.headWidth * headW;
  const headHeight = age.headHeight * headH;
  const sideHeadX = 177 + (stage === 'adult' ? 4 : 0);
  const headCenter = { x: sideHeadX + (160 - sideHeadX) * facing, y: bodyCenter.y - bodyHeight * age.neck };
  const neck = { x: bodyCenter.x + bodyWidth * .2 * (1 - facing), y: bodyCenter.y - bodyHeight * .25 };
  const rootY = GROUND_CONTACT.y - legLength;
  const anchors: ChickGeometry['anchors'] = {
    neck, headCenter,
    eyeLeft: { x: headCenter.x + headWidth * .07, y: headCenter.y - headHeight * .075 },
    eyeRight: { x: headCenter.x + headWidth * .33, y: headCenter.y - headHeight * .055 },
    beakRoot: { x: headCenter.x + headWidth * .455, y: headCenter.y + headHeight * .15 },
    crestRoot: { x: headCenter.x - headWidth * .06, y: headCenter.y - headHeight * .455 },
    wingRootLeft: { x: bodyCenter.x - bodyWidth * (.1 + facing * .2), y: bodyCenter.y - bodyHeight * .24 },
    wingRootRight: { x: bodyCenter.x + bodyWidth * (.2 + facing * .1), y: bodyCenter.y - bodyHeight * (.26 - facing * .02) },
    tailRoot: { x: bodyCenter.x - bodyWidth * .38, y: bodyCenter.y - bodyHeight * .07 },
    legRootLeft: { x: bodyCenter.x - bodyWidth * .17, y: rootY },
    legRootRight: { x: bodyCenter.x + bodyWidth * .2, y: rootY },
    footContactLeft: { x: bodyCenter.x - bodyWidth * .17, y: GROUND_CONTACT.y },
    footContactRight: { x: bodyCenter.x + bodyWidth * .2, y: GROUND_CONTACT.y },
    groundContact: { ...GROUND_CONTACT },
  };
  const neckPath = `M${r(neck.x - bodyWidth * .19)} ${r(neck.y)}Q${r(headCenter.x - headWidth * .42)} ${r(headCenter.y + headHeight * .25)} ${r(headCenter.x - headWidth * .32)} ${r(headCenter.y)}L${r(headCenter.x + headWidth * .3)} ${r(headCenter.y + headHeight * .14)}Q${r(headCenter.x + headWidth * .14)} ${r(neck.y)} ${r(neck.x + bodyWidth * .15)} ${r(neck.y + bodyHeight * .2)}Z`;
  return {
    body: { path: pathFrom(BODY_PATHS[genes.bodyShape], bodyCenter, bodyWidth, bodyHeight), center: bodyCenter, width: bodyWidth, height: bodyHeight },
    head: { path: pathFrom(HEAD_PATHS[genes.headShape], headCenter, headWidth, headHeight), center: headCenter, width: headWidth, height: headHeight },
    neckPath, anchors, legLength, eyeRadius: headWidth * (genes.eyeStyle === 'small' ? .098 : genes.eyeStyle === 'big' ? .155 : .135),
    legWidth: LEG_WIDTH[genes.legShape] * (stage === 'baby' ? .82 : 1),
  };
}

/** Conservative inner ellipse, contained by every registered head silhouette. */
export function insideHeadSafeArea(shape: ShapeGeometry, point: Point, margin = 0): boolean {
  const rx = shape.width * .46 - margin;
  const ry = shape.height * .46 - margin;
  return ((point.x - shape.center.x) / rx) ** 2 + ((point.y - shape.center.y) / ry) ** 2 <= 1;
}
