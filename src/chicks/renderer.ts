import type { ChickGenesV2, Stage } from '../types';
import { poseFrame } from './animation';
import { buildGeometry, type ChickGeometry, type Point, type ShapeGeometry } from './geometry';
import { CHICK_VISUAL_VERSION, genesFor, getAppearanceLabel, POSE_LABELS, STAGE_LABELS, visualDetailsFor, type ChickDirection, type ChickPose, type ChickVisual, type ChickVisualDetails } from './models';

export interface ChickRenderOptions {
  chick?: ChickVisual; stage?: Stage; pose?: ChickPose; direction?: ChickDirection;
  phase?: number; shadow?: boolean; size?: number; id?: string; blink?: boolean;
  reaction?: number; motion?: number; gaze?: Point;
}
const n = (value: number) => Number(value.toFixed(3));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const path = (d: string, fill: string, extra = '') => `<path d="${d}" fill="${fill}" ${extra}/>`;
const ellipse = (x: number, y: number, rx: number, ry: number, fill: string, extra = '') => `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(rx)}" ry="${n(ry)}" fill="${fill}" ${extra}/>`;
const group = (contents: string, attributes = '') => `<g ${attributes}>${contents}</g>`;
const move = (point: Point) => `translate(${n(point.x)} ${n(point.y)})`;
const joint = (point: Point, angle: number) => `${move(point)} rotate(${n(angle)})`;
const outline = 'stroke="#293149" stroke-opacity=".82" stroke-width="2.1" stroke-linejoin="round"';
const ink = 'stroke="#293149" stroke-linecap="round" stroke-linejoin="round"';

/** Cosmetic shading, never a rewrite of any historical color zone. No SVG filters. */
function tint(color: string, target: string, amount: number): string {
  const source = Number.parseInt(color.slice(1), 16); const dest = Number.parseInt(target.slice(1), 16);
  return `#${[16, 8, 0].map((shift) => Math.round(lerp((source >> shift) & 255, (dest >> shift) & 255, amount)).toString(16).padStart(2, '0')).join('')}`;
}

export function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!);
}

/** Four actual wing contours, normalized around a shoulder at (0,0). */
const WINGS = {
  rounded: 'M0 0C20 -12 41 3 41 21C54 32 46 46 33 39C42 55 24 60 18 43C20 57 5 53 3 37C-7 26 -8 11 0 0Z',
  pointed: 'M0 0C16 -12 39 4 48 29L60 47Q46 51 31 33L44 54Q28 53 17 35L25 49Q6 43 3 21C-4 13 -5 5 0 0Z',
  fluffy: 'M0 0C14 -12 31 -3 34 10C50 6 54 22 42 26C59 34 46 50 35 40C39 57 20 59 16 44C6 57 -8 44 1 33C-14 32 -14 15 -3 14C-10 8 -7 1 0 0Z',
  small: 'M0 0C11 -8 25 0 27 13C39 20 29 30 20 23C26 38 11 38 7 26C-5 30 -9 15 -2 10C-6 5 -4 2 0 0Z',
} as const;
const TAILS = {
  short: 'M6 15C-9 18 -31 5 -32 -10C-20 -16 -3 -10 9 -2Z',
  fan: 'M7 18C-11 22 -42 11 -47 -1C-50 -14 -32 -13 -23 -4C-44 -27 -29 -39 -18 -24C-14 -42 1 -31 -1 -12C11 -17 19 -8 7 18Z',
  curled: 'M8 16C-20 21 -43 3 -43 -18C-43 -34 -24 -39 -13 -30C-5 -21 -9 -9 -19 -9C-30 -9 -31 -20 -24 -24C-36 -27 -37 -8 -24 0C-15 7 -3 6 8 0Z',
  feathery: 'M6 16C-6 18 -37 15 -48 5C-39 -5 -23 -4 -18 0C-29 -11 -42 -24 -40 -32C-25 -34 -12 -16 -6 -9C-10 -22 -9 -36 -1 -38C7 -29 7 -10 9 -2Z',
} as const;
const CRESTS = {
  none: '',
  tiny: 'M-10 6Q-20 -11 -5 -16Q7 -18 5 -11Q-5 -9 0 -3Q9 -15 15 -7Q18 1 8 8Z',
  tuft: 'M-15 8C-33 -2 -29 -27 -19 -30C-6 -31 -16 -15 -4 -8C-10 -33 4 -44 12 -35C20 -24 0 -11 9 -6C18 -23 32 -17 25 -7L12 9Z',
  'three-feather': 'M-19 8Q-41 -10 -29 -25Q-18 -35 -11 -10Q-23 -43 -9 -44Q8 -45 2 -14Q20 -41 32 -28Q39 -15 14 10Z',
  messy: 'M-19 8Q-40 0 -34 -14Q-20 -25 -14 -8Q-30 -34 -15 -39Q-1 -43 -4 -20Q3 -49 18 -42Q28 -33 11 -15Q35 -35 39 -19Q43 -9 19 -3Q38 -8 40 7L11 13Z',
} as const;

function markings(shape: ShapeGeometry, genes: ChickGenesV2, clip: string, head = false): string {
  const { center: c, width: w, height: h } = shape;
  const color = genes.colors.marking;
  const k = genes.detailVariant;
  let content = '';
  switch (genes.pattern) {
    case 'belly-patch':
      if (!head) content = path(`M${n(c.x + w * .2)} ${n(c.y - h * .04)}C${n(c.x + w * .6)} ${n(c.y - h * .16)} ${n(c.x + w * .49)} ${n(c.y + h * .64)} ${n(c.x + w * .09)} ${n(c.y + h * .52)}C${n(c.x - w * .24)} ${n(c.y + h * .43)} ${n(c.x - w * .18)} ${n(c.y + h * .1)} ${n(c.x + w * .2)} ${n(c.y - h * .04)}Z`, genes.colors.belly);
      break;
    case 'spotted':
      if (head) content = ellipse(c.x - w * .2, c.y - h * .19, w * .16, h * .21, color);
      else content = ellipse(c.x + w * .27, c.y + h * .12, w * .16, h * .2, color) + ellipse(c.x - w * .2, c.y + h * .27, w * .12, h * .11, color) + ellipse(c.x - w * .15, c.y - h * .32, w * .13, h * .12, color);
      break;
    case 'striped':
      content = [0, 1, 2].map((i) => path(`M${n(c.x - w * .55)} ${n(c.y + (i - 1) * h * .23)}L${n(c.x + w * .55)} ${n(c.y + (i - 1) * h * .23 - h * .16)}`, 'none', `stroke="${color}" stroke-width="${n(h * (head ? .055 : .075))}" stroke-linecap="round" opacity="${head ? .7 : .9}"`)).join('');
      break;
    case 'speckled':
      content = (head ? [[-.22, -.28], [-.3, .05], [-.05, -.34]] : [[-.29, -.24], [.12, -.32], [.33, -.1], [.3, .23], [-.15, .3], [.02, .08]])
        .map(([x, y], index) => ellipse(c.x + w * (x + k * .009), c.y + h * y, w * (index % 2 ? .045 : .06), h * .05, color)).join('');
      break;
    case 'split':
      content = path(`M${n(c.x - w)} ${n(c.y - h)}L${n(c.x + w * .06)} ${n(c.y - h)}Q${n(c.x + w * .31)} ${n(c.y)} ${n(c.x - w * .03)} ${n(c.y + h)}L${n(c.x - w)} ${n(c.y + h)}Z`, head ? genes.colors.belly : color);
      break;
  }
  return content ? group(content, `clip-path="url(#${clip})" class="chick-v2-pattern"`) : '';
}

function featherFinish(shape: ShapeGeometry, clip: string, color: string, details: ChickVisualDetails, head = false): string {
  const { center: c, width: w, height: h } = shape;
  const rim = path(shape.path, 'none', `stroke="${tint(color, '#fff5cf', .72)}" stroke-width="6" opacity=".38" transform="translate(2 3)"`);
  const shine = path(`M${n(c.x - w * .31)} ${n(c.y - h * .18)}Q${n(c.x - w * .37)} ${n(c.y - h * .32)} ${n(c.x - w * .16)} ${n(c.y - h * .36)}`, 'none', `stroke="${tint(color, '#fff4d5', .8)}" stroke-width="4" opacity=".5" stroke-linecap="round"`);
  const feathers = (head ? [[-.35, .05], [-.3, .27]] : [[-.22, -.26], [.1, .22], [-.27, .3]])
    .map(([x, y], index) => path(`M${n(c.x + w * x - 3)} ${n(c.y + h * y)}q${index % 2 ? 2 : 4} 6 7 1`, 'none', `stroke="${tint(color, '#fff7dc', .66)}" opacity=".52" stroke-width="1.8" stroke-linecap="round"`)).join('');
  const flecks = head || details.featherStyle === 0 ? '' : ellipse(c.x - w * .1, c.y + h * .34, 1.5, 2, '#fff0cb', 'opacity=".6"') + ellipse(c.x - w * .15, c.y + h * .28, 1, 1.5, '#fff0cb', 'opacity=".6"');
  return group(rim + shine + feathers + flecks, `clip-path="url(#${clip})" class="chick-v3-feather-finish"`);
}

function cheek(shape: ShapeGeometry, genes: ChickGenesV2, details: ChickVisualDetails): string {
  const x = shape.center.x + shape.width * .05; const y = shape.center.y + shape.height * .23;
  const color = details.cheekStyle === 1 ? '#f2b06f' : details.cheekStyle === 2 ? '#c49fdf' : '#ef9caa';
  return ellipse(x, y, shape.width * .1, shape.height * .055, color, 'opacity=".67" transform="rotate(-10 ' + n(x) + ' ' + n(y) + ')"')
    + [0, 1, 2].map((i) => ellipse(x - shape.width * .055 + i * 4, y - 1 + (i % 2) * 2, 1.1, 1.4, tint(genes.colors.head, '#293149', .58))).join('');
}

function leg(root: Point, foot: Point, width: number, color: string, far: boolean, bodyOffset: number): string {
  const hip = { x: root.x, y: root.y + bodyOffset };
  const knee = { x: (hip.x + foot.x) / 2 + (far ? 4 : -6), y: (hip.y + foot.y) / 2 };
  const toe = width > 5 ? 11 : 8;
  const d = `M${n(hip.x)} ${n(hip.y - 4)}Q${n(knee.x - 3)} ${n(knee.y)} ${n(knee.x)} ${n(knee.y + 3)}L${n(foot.x)} ${n(foot.y)}M${n(foot.x - toe * .75)} ${n(foot.y)}Q${n(foot.x)} ${n(foot.y - 2)} ${n(foot.x + toe)} ${n(foot.y)}M${n(foot.x)} ${n(foot.y)}L${n(foot.x + toe * .7)} ${n(foot.y - 4)}`;
  return path(d, 'none', `stroke="${color}" stroke-width="${n(width)}" stroke-linecap="round" stroke-linejoin="round" opacity="${far ? .72 : 1}" class="chick-v2-leg${far ? ' chick-v2-leg--far' : ''}" data-rig="${far ? 'right-leg' : 'left-leg'}"`);
}

function beak(genes: ChickGenesV2, root: Point, front: number, open: boolean, size: number, details: ChickVisualDetails): string {
  const shape = {
    triangle: 'M-7 -9Q0 -14 5 -6L24 2Q9 4 5 12L-6 7Z',
    short: 'M-7 -7Q-3 -15 8 -8Q18 -13 18 -3Q21 8 7 11Q1 7 -6 9Z',
    wide: 'M-8 -8Q5 -16 23 -7Q35 -6 31 4Q20 11 5 11Q-6 17 -8 -8Z',
    curved: 'M-7 -8Q10 -18 25 -5Q35 11 20 20Q24 7 11 7Q-1 14 -6 8Z',
  }[genes.beakShape];
  const d = front > .7 ? 'M-14 -8Q-5 -16 3 -9Q13 -15 17 -4Q18 5 8 8Q7 18 -2 15L-6 6Q-16 6 -14 -8Z' : shape;
  const mouth = path(front > .7 ? 'M-9 1Q-2 7 10 -1' : 'M-3 2Q8 8 20 1', 'none', `${ink} stroke-width="1.7"`);
  const openMouth = group(ellipse(front > .7 ? 1 : 10, 10, 9, 9, '#432e45', outline)
    + ellipse(front > .7 ? 2 : 11, 14, 5, 2.4, '#ed9d9f'), `data-rig="beak-mouth" opacity="${open ? 1 : 0}"`);
  return group(openMouth + path(d, genes.colors.beak, outline)
    + path(front > .7 ? 'M-9 -6Q-4 -10 0 -6' : 'M-3 -6Q5 -11 12 -6', 'none', 'stroke="#fff4cc" stroke-opacity=".65" stroke-width="2.2" stroke-linecap="round"')
    + mouth + ellipse(front > .7 ? -4 : 8, -3, 1.15, 1.6, '#53445a'),
    `transform="${move(root)} rotate(${details.beakTilt}) scale(${n(size)})" class="chick-v2-beak"`);
}

function eye(center: Point, radius: number, horizontal: number, closed: boolean, genes: ChickGenesV2, details: ChickVisualDetails,
  far = false, look = false, gaze?: Point, slot = 'left', eyelid = 0, offset: Point = { x: 0, y: 0 }, browAngle = 0): string {
  const curious = genes.eyeStyle === 'curious';
  const r = radius * (far ? .66 : 1);
  const x = center.x; const y = center.y + (far ? r * .05 : -details.asymmetry * r * .09);
  const rx = r * horizontal; const ry = r * (curious && !far ? 1.07 : far ? .91 : 1);
  const pupilX = x + r * (gaze ? Math.max(-1, Math.min(1, gaze.x)) * .25 : look ? -.06 : far ? -.1 : .22) + offset.x;
  const pupilY = y + (gaze ? Math.max(-1, Math.min(1, gaze.y)) * r * .22 : curious && !far ? -r * .15 : r * .12) + offset.y;
  const eyePath = `M${n(x - rx)} ${n(y)}C${n(x - rx * 1.03)} ${n(y - ry * .65)} ${n(x - rx * .3)} ${n(y - ry * 1.12)} ${n(x + rx * .29)} ${n(y - ry * .93)}C${n(x + rx * 1.15)} ${n(y - ry * .8)} ${n(x + rx * 1.04)} ${n(y + ry * .35)} ${n(x + rx * .73)} ${n(y + ry * .72)}C${n(x + rx * .25)} ${n(y + ry * 1.18)} ${n(x - rx)} ${n(y + ry)} ${n(x - rx)} ${n(y)}Z`;
  const pupilRadius = genes.eyeStyle === 'small' ? .32 : details.pupilStyle === 1 ? .45 : .53;
  let contents = path(eyePath, '#fff9e9', `${ink} stroke-width="1.7"`)
    + ellipse(pupilX, pupilY, r * pupilRadius * (details.pupilStyle === 2 ? .72 : 1), r * pupilRadius, '#272b42')
    + ellipse(pupilX + r * .13, pupilY - r * .2, Math.max(.9, r * .135), Math.max(.9, r * .135), '#ffffff');
  // Heavy upper lids and skewed brows make saved eyeStyle variants visibly different.
  const sleepy = genes.eyeStyle === 'sleepy' ? .48 : 0;
  const lid = Math.max(sleepy, eyelid);
  contents += path(`M${n(x - rx)} ${n(y - ry * .12)}Q${n(x)} ${n(y - ry * 1.76)} ${n(x + rx)} ${n(y - ry * .12)}Q${n(x)} ${n(y + ry * .4)} ${n(x - rx)} ${n(y - ry * .12)}Z`, tint(genes.colors.head, '#7c618d', .15),
    `data-rig="eye-lid" opacity="${n(lid)}" ${ink} stroke-width="1.3"`);
  const closedPath = path(`M${n(x - rx * .8)} ${n(y)}Q${n(x)} ${n(y + ry * .55)} ${n(x + rx * .8)} ${n(y - ry * .05)}`, 'none', 'stroke="#f7f1e3" stroke-width="5.5" stroke-linecap="round"')
    + path(`M${n(x - rx * .8)} ${n(y)}Q${n(x)} ${n(y + ry * .55)} ${n(x + rx * .8)} ${n(y - ry * .05)}`, 'none', `${ink} stroke-width="2.4"`);
  const browY = y - ry * 1.22;
  const brow = path(`M${n(x - rx * .76)} ${n(browY + (far ? -2 : 2))}Q${n(x - rx * .1)} ${n(browY - (curious ? 6 : 2))} ${n(x + rx * .55)} ${n(browY + (far ? 3 : -1))}`, 'none',
    `${ink} stroke-width="3.7" transform="rotate(${n(details.eyeTilt * (far ? -.5 : 1) + browAngle)} ${n(x)} ${n(browY)})" data-rig="brow-${slot}"`);
  return group(group(contents, `class="chick-v2-eye${far ? ' chick-v2-eye--far' : ''}" data-rig="eye-open" opacity="${closed ? 0 : 1}" style="transform-origin:${n(x)}px ${n(y)}px"`)
    + group(closedPath, `data-rig="eye-closed" opacity="${closed ? 1 : 0}"`) + brow,
  `data-rig="eye-${slot}"`);
}

export interface ChickMarkup { markup: string; geometry: ChickGeometry; label: string; genes: ChickGenesV2; pose: ChickPose; visual: ChickVisualDetails }

/** The React portrait and Flaps images literally share this generated markup. */
export function buildChickMarkup(options: ChickRenderOptions = {}): ChickMarkup {
  const genes = genesFor(options.chick);
  const visual = visualDetailsFor(options.chick);
  const stage = options.chick?.stage ?? options.stage ?? 'baby';
  const pose = options.pose ?? 'idle';
  const direction = options.direction ?? 'right';
  const phase = options.phase ?? (pose === 'hatch' || pose === 'grow' ? 1 : 0);
  const base = buildGeometry(genes, stage);
  const baseFrame = poseFrame(base, pose, phase, options.reaction);
  const front = direction === 'front' ? 1 : baseFrame.front;
  const geometry = front > 0 ? buildGeometry(genes, stage, front) : base;
  const frame = poseFrame(geometry, pose, phase, options.reaction);
  if (pose === 'held') {
    const motion = Math.max(-1, Math.min(1, Number.isFinite(options.motion) ? options.motion! : 0));
    frame.headAngle -= motion * 7; frame.wingAngle -= Math.abs(motion) * 14; frame.tailAngle -= motion * 14;
  }
  frame.closedEyes ||= options.blink === true;
  const { body, head, anchors: a } = geometry;
  const colors = genes.colors;
  const id = (options.id ?? 'chipper-sprite').replace(/[^a-zA-Z0-9_-]/g, '');
  const bodyClip = `${id}-body`;
  const headClip = `${id}-head`;
  // During turn, the face passes through a genuine symmetric front expression.
  const reverse = pose === 'turn' && direction !== 'front'
    ? direction === 'left' ? phase >= .5 : phase < .5
    : direction === 'left';
  const mirror = reverse ? 'translate(320 0) scale(-1 1)' : '';
  const gaze = options.gaze ? { x: options.gaze.x * (reverse ? -1 : 1), y: options.gaze.y } : undefined;
  if (gaze && ['idle', 'look', 'tap'].includes(pose)) frame.headAngle += Math.max(-1, Math.min(1, gaze.y)) * 4;
  const eyeLeft = { x: lerp(a.eyeLeft.x, head.center.x - head.width * .18, front), y: a.eyeLeft.y };
  const eyeRight = { x: lerp(a.eyeRight.x, head.center.x + head.width * .18, front), y: a.eyeRight.y };
  const beakRoot = { x: lerp(a.beakRoot.x, head.center.x, front), y: lerp(a.beakRoot.y, head.center.y + head.height * .19, front) };
  const wingScale = body.width / 110;
  const crestScale = head.width / 91;
  const wing = group(path(WINGS[genes.wingShape], colors.wing, outline) + path('M7 9Q19 4 27 16M13 23Q22 21 28 28', 'none', `stroke="${tint(colors.wing, '#fff2c8', .65)}" stroke-width="2.2" stroke-linecap="round" opacity=".55"`),
    `transform="${joint(a.wingRootLeft, frame.wingAngle)} scale(${n(wingScale)})" class="chick-v2-wing" data-rig="wing"`);
  const farWingScale = wingScale * (.7 + front * .3);
  const farWing = group(path(WINGS[genes.wingShape], colors.wing, outline), `transform="${joint(a.wingRootRight, -frame.wingAngle * .7)} scale(${n(farWingScale * (1 - front * 2))} ${n(farWingScale)})" opacity="${n(.68 + front * .32)}" class="chick-v2-wing--far" data-rig="far-wing"`);
  const tail = group(path(TAILS[genes.tailShape], colors.tail, outline) + path('M-5 6Q-20 1 -28 -11', 'none', `stroke="${tint(colors.tail, '#fff5d8', .7)}" stroke-width="2.5" stroke-linecap="round" opacity=".45"`), `transform="${joint(a.tailRoot, frame.tailAngle)} scale(${n(stage === 'baby' ? .82 : stage === 'teen' ? .95 : 1.04)})" opacity="${n(1 - front * .7)}" class="chick-v2-tail" data-rig="tail"`);
  const nearRadius = geometry.eyeRadius;
  const eyeOffset = { x: frame.eyeOffsetX, y: frame.eyeOffsetY };
  const scruff = path(`M${n(head.center.x - head.width * .43)} ${n(head.center.y - head.height * .1)}l-9 -6m10 15l-12 2M${n(head.center.x + head.width * .38)} ${n(head.center.y + head.height * .24)}l9 4`, 'none', `stroke="${tint(colors.head, '#fff0cc', .48)}" stroke-width="2" stroke-linecap="round"`);
  const headContents = path(head.path, colors.head, outline) + markings(head, genes, headClip, true) + featherFinish(head, headClip, colors.head, visual, true)
    + (CRESTS[genes.crestShape] ? group(path(CRESTS[genes.crestShape], colors.head, outline)
      + path('M-9 -4Q-18 -16 -16 -23', 'none', `stroke="${tint(colors.head, '#fff2cb', .7)}" stroke-width="2.5" opacity=".55" stroke-linecap="round"`), `transform="${move(a.crestRoot)} rotate(${visual.asymmetry * 9}) scale(${n(crestScale)})" class="chick-v2-crest"`) : '')
    + scruff + cheek(head, genes, visual)
    + eye(eyeRight, nearRadius, lerp(.76, 1, front), frame.closedEyes, genes, visual, front < .7, front > .7, gaze, 'right', frame.eyelid, eyeOffset, frame.browAngle)
    + eye(eyeLeft, nearRadius, 1, frame.closedEyes, genes, visual, false, front > .7, gaze, 'left', frame.eyelid, eyeOffset, frame.browAngle)
    + beak(genes, beakRoot, front, frame.openBeak, head.width / 87, visual);
  const headTransform = `translate(${n(frame.headOffsetX)} ${n(frame.headOffset)}) rotate(${n(frame.headAngle)} ${n(a.neck.x)} ${n(a.neck.y)})`;
  const angle = frame.headAngle * Math.PI / 180;
  const collar = { x: head.center.x - head.width * .15, y: head.center.y + head.height * .22 };
  const dx = collar.x - a.neck.x;
  const dy = collar.y - a.neck.y;
  const collarX = a.neck.x + dx * Math.cos(angle) - dy * Math.sin(angle) + frame.headOffsetX;
  const collarY = a.neck.y + dx * Math.sin(angle) + dy * Math.cos(angle) + frame.headOffset;
  const neckWidth = head.width * .31;
  const movingNeck = `M${n(a.neck.x - body.width * .18)} ${n(a.neck.y + body.height * .13)}Q${n(a.neck.x - 2)} ${n(a.neck.y - 12)} ${n(collarX - neckWidth * .5)} ${n(collarY - 8)}L${n(collarX + neckWidth * .5)} ${n(collarY + 10)}Q${n(a.neck.x + body.width * .21)} ${n(a.neck.y + body.height * .13)} ${n(a.neck.x + body.width * .14)} ${n(a.neck.y + body.height * .32)}Z`;
  let bird = leg(a.legRootRight, frame.rightFoot, geometry.legWidth * .9, colors.legs, true, frame.bodyOffset)
    + leg(a.legRootLeft, frame.leftFoot, geometry.legWidth, colors.legs, false, frame.bodyOffset);
  let torso = tail + group(farWing, `opacity="${n(1 - front)}"`) + path(body.path, colors.body, `${outline} class="chick-v2-body"`) + markings(body, genes, bodyClip) + featherFinish(body, bodyClip, colors.body, visual)
    + path(movingNeck, colors.head, 'data-rig="neck"')
    + group(headContents, `transform="${headTransform}" class="chick-v2-head" data-rig="head"`)
    + (front > 0 ? group(farWing, `opacity="${n(front)}"`) : '') + wing;
  torso = group(torso, `class="chick-v2-breath" data-rig="breath" style="transform-origin:${n(a.neck.x)}px ${n(a.neck.y)}px"`);
  const bodyTransform = `translate(0 ${n(frame.bodyOffset)}) translate(${n(body.center.x)} ${n(body.center.y)}) rotate(${n(frame.bodyAngle)}) scale(${n(frame.bodyScaleX)} ${n(frame.bodyScaleY)}) translate(${-n(body.center.x)} ${-n(body.center.y)})`;
  bird += group(torso, `transform="${bodyTransform}" class="chick-v2-upper-body" data-rig="body"`);
  const shadow = options.shadow === false || pose === 'flap' || pose === 'hit' || pose === 'held' ? '' : ellipse(160, 284, body.width * .4, 6, '#292f2a', 'opacity=".13" class="chick-shadow"');
  const grain = pose === 'feed' ? group(ellipse(236, 280, 3, 1.9, '#b49560') + ellipse(247, 277, 2.8, 1.7, '#b49560') + ellipse(245, 286, 2.3, 1.5, '#b49560'), 'class="chick-v2-grain"') : '';
  const sleep = pose === 'sleep' ? group(path('M250 128h10l-10 10h10M268 108h7l-7 7h7', 'none', `stroke="${colors.legs}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"`), 'class="chick-sleep-marks"') : '';
  const shell = pose === 'hatch' ? group(path('M94 255L107 247L120 262L135 251L151 263L167 251L184 263L200 250L220 257Q209 293 157 294Q107 290 94 255Z', '#ece7da', outline) + path('M98 255L76 263L79 274L102 269Z', '#ece7da', outline) + path('M223 249L241 244L249 257L231 264Z', '#ece7da', outline), 'class="chick-v2-shell"') : '';
  const spark = pose === 'grow' || pose === 'play' ? path('M55 139v8m-4 -4h8M260 91v8m-4 -4h8', 'none', `stroke="${colors.beak}" stroke-width="2.3" stroke-linecap="round" class="chick-sparkles"`) : '';
  const defs = `<defs><clipPath id="${bodyClip}">${path(body.path, '#fff')}</clipPath><clipPath id="${headClip}">${path(head.path, '#fff')}</clipPath></defs>`;
  return {
    markup: defs + shadow + group(group(bird + grain, `transform="${mirror}" data-rig="mirror"`) + shell, `class="chick-v2-character chick-v3-character" data-visual-version="${CHICK_VISUAL_VERSION}" data-personality="${visual.personality}"`) + sleep + spark,
    geometry, genes, pose, visual, label: `${getAppearanceLabel(options.chick)} — ${STAGE_LABELS[stage].toLowerCase()}. ${visual.personalityLabel}. ${POSE_LABELS[pose]}.`,
  };
}

/** Self-contained XML: safe for Image, SVG data URLs and deterministic sprite caches. */
export function renderChickSvg(options: ChickRenderOptions): string {
  const { markup, label } = buildChickMarkup(options);
  const size = options.size ?? 320;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(size)}" height="${n(size)}" viewBox="0 0 320 320" fill="none" data-visual-version="${CHICK_VISUAL_VERSION}" data-appearance-version="2"><title>${escapeXml(label)}</title>${markup}</svg>`;
}
