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
  baby: { bodyWidth: 105, bodyHeight: 87, headWidth: 116, headHeight: 101, neck: .56, leg: .7 },
  teen: { bodyWidth: 118, bodyHeight: 111, headWidth: 101, headHeight: 96, neck: .58, leg: 1.07 },
  adult: { bodyWidth: 149, bodyHeight: 116, headWidth: 98, headHeight: 90, neck: .68, leg: .98 },
} as const;
const HEAD_PROPORTIONS = { round: [1, 1], oval: [.86, 1.08], puffed: [1.09, 1.02], tall: [.82, 1.19], wide: [1.16, .85] } as const;
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
  round: 'M-.18 -.99C.18 -1.13 .7 -.94 .82 -.65C.92 -.47 .8 -.38 .94 -.15C1.17 .16 .97 .63 .63 .72C.53 1.04 .12 .99 -.15 .92C-.49 1.04 -.94 .81 -.95 .44C-1.19 .19 -1.03 -.18 -.87 -.42C-.93 -.75 -.57 -1.01 -.18 -.99Z',
  oval: 'M-.24 -.98C.18 -1.12 .64 -.91 .69 -.54C.71 -.31 1.03 -.18 .98 .18C1.1 .52 .82 .82 .49 .82C.3 1.07 -.19 1.04 -.38 .84C-.73 .95 -1.02 .62 -.97 .31C-1.13 .08 -.97 -.28 -.77 -.45C-.83 -.78 -.54 -1 -.24 -.98Z',
  puffed: 'M-.12 -.91C.05 -1.11 .36 -1.04 .46 -.84C.75 -.95 1.04 -.72 .93 -.47C1.18 -.4 1.15 -.06 .99 .09C1.16 .36 .94 .64 .7 .65C.75 .94 .4 1.09 .17 .92C-.02 1.12 -.37 1.06 -.45 .87C-.77 .99 -1.07 .73 -.95 .45C-1.2 .35 -1.17 .02 -.98 -.15C-1.12 -.44 -.85 -.73 -.62 -.65C-.69 -.97 -.3 -1.13 -.12 -.91Z',
  tall: 'M-.21 -1C.09 -1.1 .53 -.96 .62 -.66C.76 -.43 .62 -.2 .84 -.03C1.08 .16 1.1 .56 .81 .72C.68 1.05 .24 1.09 -.04 .9C-.42 1.08 -.88 .85 -.91 .51C-1.12 .23 -.91 -.14 -.82 -.36C-.9 -.73 -.6 -.98 -.21 -1Z',
  wide: 'M-.39 -.92C-.03 -1.13 .3 -.87 .53 -.91C.81 -.95 1.08 -.64 .96 -.38C1.17 -.1 1.02 .26 .85 .39C.92 .74 .57 .97 .26 .89C.05 1.1 -.3 .98 -.47 .83C-.85 .9 -1.1 .62 -.98 .32C-1.17 .08 -1.04 -.3 -.88 -.45C-.93 -.77 -.66 -.97 -.39 -.92Z',
} as const;
const BODY_PATHS = {
  pear: 'M.03 -1C.51 -1.04 .69 -.63 .79 -.35C1.03 -.2 .88 -.06 1 .12C1.12 .49 .79 .87 .43 .91C.26 1.06 -.07 .99 -.16 .96C-.56 1.1 -.95 .87 -.96 .51C-1.13 .28 -1.04 -.1 -.83 -.24C-.96 -.39 -.74 -.54 -.64 -.58C-.53 -.88 -.23 -1.03 .03 -1Z',
  compact: 'M-.28 -.92C.14 -1.14 .65 -.92 .75 -.62C.97 -.56 1.09 -.22 .95 -.02C1.1 .21 .98 .59 .74 .7C.5 .99 .2 .92 -.01 .99C-.31 1.08 -.62 .91 -.72 .78C-1.05 .7 -1.12 .3 -.97 .12C-1.1 -.13 -.89 -.5 -.73 -.55C-.73 -.83 -.49 -.97 -.28 -.92Z',
  oval: 'M-.13 -.98C.31 -1.12 .83 -.89 .92 -.57C1.1 -.37 1.04 -.07 .97 .07C1.12 .39 .88 .71 .57 .8C.27 1.08 -.19 .99 -.38 .89C-.78 .94 -1.08 .64 -1 .32C-1.15 .05 -.95 -.33 -.78 -.48C-.76 -.8 -.43 -1.02 -.13 -.98Z',
  stocky: 'M-.56 -.87C-.33 -1.08 .15 -.98 .34 -.96C.7 -1.08 .96 -.73 .91 -.46C1.12 -.23 1.01 .08 .98 .29C1.06 .63 .75 .92 .44 .89C.17 1.07 -.17 1.04 -.35 .93C-.7 1.01 -.98 .72 -.94 .46C-1.14 .23 -1.08 -.13 -.91 -.3C-.99 -.56 -.8 -.86 -.56 -.87Z',
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
    eyeLeft: { x: headCenter.x + headWidth * .005, y: headCenter.y - headHeight * .08 },
    // The far socket remains inside the narrow tall head's upper cheek, including AA stroke margin.
    eyeRight: { x: headCenter.x + headWidth * .26, y: headCenter.y - headHeight * .035 },
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
    neckPath, anchors, legLength, eyeRadius: headWidth * (genes.eyeStyle === 'small' ? .123 : genes.eyeStyle === 'big' ? .18 : .158),
    legWidth: LEG_WIDTH[genes.legShape] * (stage === 'baby' ? .82 : 1),
  };
}

/** Conservative inner ellipse, contained by every registered head silhouette. */
export function insideHeadSafeArea(shape: ShapeGeometry, point: Point, margin = 0): boolean {
  const rx = shape.width * .46 - margin;
  const ry = shape.height * .46 - margin;
  return ((point.x - shape.center.x) / rx) ** 2 + ((point.y - shape.center.y) / ry) ** 2 <= 1;
}
