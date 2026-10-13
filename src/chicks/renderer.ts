import type { ChickGenesV2, Stage } from '../types';
import { poseFrame } from './animation';
import { buildGeometry, type ChickGeometry, type Point, type ShapeGeometry } from './geometry';
import { genesFor, getAppearanceLabel, POSE_LABELS, STAGE_LABELS, type ChickDirection, type ChickPose, type ChickVisual } from './models';

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
const outline = 'stroke="#333b34" stroke-opacity=".26" stroke-width="1.35" stroke-linejoin="round"';

export function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!);
}

/** Four actual wing contours, normalized around a shoulder at (0,0). */
const WINGS = {
  rounded: 'M0 0C22 -6 46 7 42 28C37 47 16 53 4 34C14 38 23 29 23 22C15 29 7 24 5 16C11 16 13 9 0 0Z',
  pointed: 'M0 0C18 -8 42 5 49 39C34 42 10 32 5 16C18 23 24 20 28 17C18 13 10 8 0 0Z',
  fluffy: 'M0 0C15 -7 39 2 42 20C55 26 43 43 33 38C33 51 16 47 13 37C3 43 -4 28 3 22C-7 15 -7 6 0 0Z',
  small: 'M0 0C13 -2 26 6 23 19C21 28 7 31 3 21C10 21 15 17 16 13C9 14 5 10 0 0Z',
} as const;
const TAILS = {
  short: 'M6 15C-9 18 -31 5 -32 -10C-20 -16 -3 -10 9 -2Z',
  fan: 'M7 18C-11 22 -42 11 -47 -1C-50 -14 -32 -13 -23 -4C-44 -27 -29 -39 -18 -24C-14 -42 1 -31 -1 -12C11 -17 19 -8 7 18Z',
  curled: 'M8 16C-20 21 -43 3 -43 -18C-43 -34 -24 -39 -13 -30C-5 -21 -9 -9 -19 -9C-30 -9 -31 -20 -24 -24C-36 -27 -37 -8 -24 0C-15 7 -3 6 8 0Z',
  feathery: 'M6 16C-6 18 -37 15 -48 5C-39 -5 -23 -4 -18 0C-29 -11 -42 -24 -40 -32C-25 -34 -12 -16 -6 -9C-10 -22 -9 -36 -1 -38C7 -29 7 -10 9 -2Z',
} as const;
const CRESTS = {
  none: '',
  tiny: 'M-9 6Q-11 -8 2 -12Q9 -13 6 -7Q2 0 10 5Z',
  tuft: 'M-14 7C-22 -3 -24 -18 -17 -21C-8 -20 -4 -7 -3 -2C-3 -18 8 -27 15 -21C22 -14 10 -2 10 7Z',
  'three-feather': 'M-17 7Q-29 -7 -22 -17Q-14 -23 -9 -8Q-14 -27 -3 -28Q7 -27 4 -10Q14 -23 23 -17Q25 -8 11 8Z',
  messy: 'M-17 7Q-27 -2 -23 -13Q-14 -14 -9 -3Q-16 -20 -6 -25Q4 -26 3 -11Q16 -29 24 -20Q25 -9 12 0Q26 -5 28 3L9 8Z',
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

function leg(root: Point, foot: Point, width: number, color: string, far: boolean, bodyOffset: number): string {
  const hip = { x: root.x, y: root.y + bodyOffset };
  const knee = { x: (hip.x + foot.x) / 2 - 2, y: (hip.y + foot.y) / 2 };
  const toe = width > 5 ? 11 : 8;
  const d = `M${n(hip.x)} ${n(hip.y - 4)}L${n(knee.x)} ${n(knee.y)}L${n(foot.x)} ${n(foot.y)}M${n(foot.x - toe * .75)} ${n(foot.y)}L${n(foot.x + toe)} ${n(foot.y)}M${n(foot.x)} ${n(foot.y)}L${n(foot.x + 4)} ${n(foot.y - 3)}`;
  return path(d, 'none', `stroke="${color}" stroke-width="${n(width)}" stroke-linecap="round" stroke-linejoin="round" opacity="${far ? .72 : 1}" class="chick-v2-leg${far ? ' chick-v2-leg--far' : ''}"`);
}

function beak(genes: ChickGenesV2, root: Point, front: number, open: boolean, size: number): string {
  const shape = {
    triangle: 'M-4 -7L18 0L-4 8Z',
    short: 'M-4 -5Q5 -10 12 -1Q6 8 -4 6Z',
    wide: 'M-5 -8Q10 -9 20 -2Q11 10 -5 9Z',
    curved: 'M-4 -8Q16 -10 20 3Q16 10 9 12Q12 4 -4 7Z',
  }[genes.beakShape];
  const d = front > .7 ? 'M-10 -5Q0 -11 10 -5L1 10Q0 12 -1 10Z' : shape;
  const mouth = path(front > .7 ? 'M-6 0Q0 3 6 0' : 'M-2 0L10 1', 'none', 'stroke="#5e503b" stroke-width="1.35" stroke-linecap="round"');
  return group((open ? ellipse(2, 3, 7, 5, '#5e503b') : '') + path(d, genes.colors.beak, outline) + mouth,
    `transform="${move(root)} scale(${n(size)})" class="chick-v2-beak"`);
}

function eye(center: Point, radius: number, horizontal: number, closed: boolean, genes: ChickGenesV2, far = false, look = false, gaze?: Point): string {
  if (closed) return path(`M${n(center.x - radius * .7)} ${n(center.y)}Q${n(center.x)} ${n(center.y + radius * .6)} ${n(center.x + radius * .7)} ${n(center.y)}`, 'none', 'stroke="#f7f1e3" stroke-width="4.5" stroke-linecap="round"')
    + path(`M${n(center.x - radius * .7)} ${n(center.y)}Q${n(center.x)} ${n(center.y + radius * .6)} ${n(center.x + radius * .7)} ${n(center.y)}`, 'none', 'stroke="#303632" stroke-width="2.2" stroke-linecap="round"');
  const curious = genes.eyeStyle === 'curious';
  const r = radius * (far ? .66 : 1);
  const pupilX = center.x + r * (gaze ? Math.max(-1, Math.min(1, gaze.x)) * .25 : look ? 0 : .16);
  const pupilY = center.y + (gaze ? Math.max(-1, Math.min(1, gaze.y)) * r * .22 : curious && !far ? -r * .07 : r * .03);
  let contents = ellipse(center.x, center.y, r * horizontal, r * (curious ? 1.07 : 1), '#fffdf3', 'stroke="#303632" stroke-width="1.35"');
  contents += ellipse(pupilX, pupilY, r * .46 * horizontal, r * .49, '#292f2b');
  contents += ellipse(pupilX + r * .14, pupilY - r * .19, Math.max(1, r * .13), Math.max(1, r * .13), '#fffef9');
  if (genes.eyeStyle === 'sleepy') contents += path(`M${n(center.x - r * horizontal)} ${n(center.y - r * .07)}Q${n(center.x)} ${n(center.y - r * 1.75)} ${n(center.x + r * horizontal)} ${n(center.y - r * .07)}Z`, genes.colors.head);
  return group(contents, `class="chick-v2-eye${far ? ' chick-v2-eye--far' : ''}" style="transform-origin:${n(center.x)}px ${n(center.y)}px"`);
}

export interface ChickMarkup { markup: string; geometry: ChickGeometry; label: string; genes: ChickGenesV2; pose: ChickPose }

/** The React portrait and Flaps images literally share this generated markup. */
export function buildChickMarkup(options: ChickRenderOptions = {}): ChickMarkup {
  const genes = genesFor(options.chick);
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
  const wing = group(path(WINGS[genes.wingShape], colors.wing, outline) + (genes.pattern === 'solid' ? '' : path('M12 12Q25 10 31 24', 'none', `stroke="${colors.marking}" stroke-width="2.2" stroke-linecap="round" opacity=".46"`)),
    `transform="${joint(a.wingRootLeft, frame.wingAngle)} scale(${n(wingScale)})" class="chick-v2-wing"`);
  const farWingScale = wingScale * (.7 + front * .3);
  const farWing = group(path(WINGS[genes.wingShape], colors.wing, outline), `transform="${joint(a.wingRootRight, -frame.wingAngle * .7)} scale(${n(farWingScale * (1 - front * 2))} ${n(farWingScale)})" opacity="${n(.68 + front * .32)}" class="chick-v2-wing--far"`);
  const tail = group(path(TAILS[genes.tailShape], colors.tail, outline), `transform="${joint(a.tailRoot, frame.tailAngle)} scale(${n(stage === 'baby' ? .82 : stage === 'teen' ? .95 : 1.04)})" opacity="${n(1 - front * .7)}" class="chick-v2-tail"`);
  const nearRadius = geometry.eyeRadius;
  const headContents = path(head.path, colors.head, outline) + markings(head, genes, headClip, true)
    + (CRESTS[genes.crestShape] ? group(path(CRESTS[genes.crestShape], colors.head, outline), `transform="${move(a.crestRoot)} scale(${n(crestScale)})" class="chick-v2-crest"`) : '')
    + eye(eyeRight, nearRadius, lerp(.76, 1, front), frame.closedEyes, genes, front < .7, front > .7, gaze)
    + eye(eyeLeft, nearRadius, 1, frame.closedEyes, genes, false, front > .7, gaze)
    + beak(genes, beakRoot, front, frame.openBeak, head.width / 87)
    + (genes.detailVariant === 3 ? path(`M${n(head.center.x - head.width * .18)} ${n(head.center.y + head.height * .21)}l5 3m-2 -7l5 3`, 'none', `stroke="${colors.beak}" stroke-width="2.4" stroke-linecap="round" opacity=".7"`) : '');
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
  let torso = tail + group(farWing, `opacity="${n(1 - front)}"`) + path(body.path, colors.body, outline) + markings(body, genes, bodyClip)
    + path(movingNeck, colors.head)
    + group(headContents, `transform="${headTransform}" class="chick-v2-head"`)
    + (front > 0 ? group(farWing, `opacity="${n(front)}"`) : '') + wing;
  torso = group(torso, `class="chick-v2-breath" style="transform-origin:${n(a.neck.x)}px ${n(a.neck.y)}px"`);
  bird += group(torso, `transform="translate(0 ${n(frame.bodyOffset)})" class="chick-v2-upper-body"`);
  const shadow = options.shadow === false || pose === 'flap' || pose === 'hit' || pose === 'held' ? '' : ellipse(160, 284, body.width * .4, 6, '#292f2a', 'opacity=".13" class="chick-shadow"');
  const grain = pose === 'feed' ? group(ellipse(236, 280, 3, 1.9, '#b49560') + ellipse(247, 277, 2.8, 1.7, '#b49560') + ellipse(245, 286, 2.3, 1.5, '#b49560'), 'class="chick-v2-grain"') : '';
  const sleep = pose === 'sleep' ? group(path('M250 128h10l-10 10h10M268 108h7l-7 7h7', 'none', `stroke="${colors.legs}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"`), 'class="chick-sleep-marks"') : '';
  const shell = pose === 'hatch' ? group(path('M94 255L107 247L120 262L135 251L151 263L167 251L184 263L200 250L220 257Q209 293 157 294Q107 290 94 255Z', '#ece7da', outline) + path('M98 255L76 263L79 274L102 269Z', '#ece7da', outline) + path('M223 249L241 244L249 257L231 264Z', '#ece7da', outline), 'class="chick-v2-shell"') : '';
  const spark = pose === 'grow' || pose === 'play' ? path('M55 139v8m-4 -4h8M260 91v8m-4 -4h8', 'none', `stroke="${colors.beak}" stroke-width="2.3" stroke-linecap="round" class="chick-sparkles"`) : '';
  const defs = `<defs><clipPath id="${bodyClip}">${path(body.path, '#fff')}</clipPath><clipPath id="${headClip}">${path(head.path, '#fff')}</clipPath></defs>`;
  return {
    markup: defs + shadow + group(group(bird + grain, `transform="${mirror}"`) + shell, 'class="chick-v2-character"') + sleep + spark,
    geometry, genes, pose, label: `${getAppearanceLabel(options.chick)} — ${STAGE_LABELS[stage].toLowerCase()}. ${POSE_LABELS[pose]}.`,
  };
}

/** Self-contained XML: safe for Image, SVG data URLs and deterministic sprite caches. */
export function renderChickSvg(options: ChickRenderOptions): string {
  const { markup, label } = buildChickMarkup(options);
  const size = options.size ?? 320;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(size)}" height="${n(size)}" viewBox="0 0 320 320" fill="none"><title>${escapeXml(label)}</title>${markup}</svg>`;
}
