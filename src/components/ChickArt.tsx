import { forwardRef, memo, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useSyncExternalStore, type CSSProperties } from 'react';
import { poseFrame } from '../chicks/animation';
import type { ChickGeometry, Point } from '../chicks/geometry';
import type { Stage } from '../types';
import { webApp } from '../api/telegram';
import { buildChickMarkup } from '../chicks/renderer';
import { visualDetailsFor, type ChickDirection, type ChickPose, type ChickVisual } from '../chicks/models';
import '../art.css';

export { getAppearanceLabel } from '../chicks/models';
export const APPEARANCE_LABELS: Record<string, string> = {
  'graphite-linen': 'Графит и лён', 'warm-linen': 'Тёплый лён', 'sage-stone': 'Шалфей',
  'oat-biscuit': 'Овсяное печенье', 'ink-ivory': 'Тушь и сливки', 'moss-pebble': 'Мох и камень',
  'terracotta-cream': 'Терракота', 'mist-blue': 'Голубой туман', 'lavender-slate': 'Лавандовый сланец',
  'rose-cocoa': 'Роза и какао', 'moon-opal': 'Лунный опал', 'amber-night': 'Янтарная ночь',
};
export type ChickArtState = 'idle' | 'happy' | 'feed' | 'play' | 'sleepy' | 'sleep' | 'hatch' | 'grow';
export type ChickArtStage = Stage;
export interface ChickArtProps {
  chick?: ChickVisual;
  /** Transitional call compatibility; never invokes the removed 0.1 renderer. */
  appearanceId?: string; stage?: Stage; state?: ChickArtState;
  pose?: ChickPose; direction?: ChickDirection; phase?: number; shadow?: boolean;
  reaction?: number; motion?: number; gaze?: { x: number; y: number };
  animate?: boolean; mood?: number; size?: number; className?: string; reducedMotion?: boolean;
}

const visibilityListeners = new Set<() => void>();
const onVisibilityChange = () => visibilityListeners.forEach((listener) => listener());
let nativeInactive = false;
let stopHostSubscription = () => {};
function subscribeVisibility(listener: () => void): () => void {
  if (visibilityListeners.size === 0) {
    document.addEventListener('visibilitychange', onVisibilityChange);
    const app = webApp();
    nativeInactive = app?.isActive === false;
    const activated = () => { nativeInactive = false; onVisibilityChange(); };
    const deactivated = () => { nativeInactive = true; onVisibilityChange(); };
    app?.onEvent('activated', activated);
    app?.onEvent('deactivated', deactivated);
    stopHostSubscription = () => { app?.offEvent('activated', activated); app?.offEvent('deactivated', deactivated); };
  }
  visibilityListeners.add(listener);
  return () => {
    visibilityListeners.delete(listener);
    if (visibilityListeners.size === 0) {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      stopHostSubscription();
      nativeInactive = false;
    }
  };
}
const readHidden = () => document.hidden || nativeInactive || webApp()?.isActive === false;
const readServerHidden = () => true;
const stateToPose: Record<ChickArtState, ChickPose> = {
  idle: 'idle', happy: 'play', feed: 'feed', play: 'play', sleepy: 'look', sleep: 'sleep', hatch: 'hatch', grow: 'grow',
};

export interface ChickRigUpdate {
  phase: number; motion?: number; gaze?: Point;
}
export interface ChickArtHandle { update: (frame: ChickRigUpdate) => void }
const n = (value: number) => Number(value.toFixed(3));
const move = (point: Point) => `translate(${n(point.x)} ${n(point.y)})`;
const boundedAxis = (value: number | undefined) => Number.isFinite(value) ? Math.max(-1, Math.min(1, value!)) : 0;

/** The save/geometry contract stays V2. Only a small fixed rig is updated in place. */

export const ChickArt = memo(forwardRef<ChickArtHandle, ChickArtProps>(function ChickArt({ chick, stage = 'baby', state = 'idle', pose, direction = 'right', phase, shadow = true,
  animate = true, size = 280, className = '', reducedMotion = false, reaction, motion, gaze }, ref) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const svg = useRef<SVGSVGElement>(null);
  const hidden = useSyncExternalStore(subscribeVisibility, readHidden, readServerHidden);
  const selectedPose = pose ?? stateToPose[state];
  const fingerprint = visualDetailsFor(chick).fingerprint;
  const identity = `${chick?.id ?? ''}:${chick?.stage ?? stage}:${fingerprint}`;
  // No phase/motion/gaze dependency: an idle frame must never recreate its SVG tree.
  // Turns use the true frontal anatomy, with mirrored/recovering motion in the rig.
  const rendered = useMemo(() => buildChickMarkup({ chick, stage, pose: selectedPose, direction,
    phase: selectedPose === 'turn' ? .5 : 0, shadow, id, reaction }),
  [identity, selectedPose, direction, shadow, id, reaction]);
  const rig = useRef<Map<string, SVGElement[]>>(new Map());
  const browBases = useRef<Map<SVGElement, [number, number, number]>>(new Map());
  const current = useRef({ selectedPose, direction, reaction, animate, hidden, reducedMotion, rendered });
  current.current = { selectedPose, direction, reaction, animate, hidden, reducedMotion, rendered };

  const update = (next: ChickRigUpdate) => {
    const c = current.current;
    if (!svg.current || c.hidden) return;
    const geometry: ChickGeometry = c.rendered.geometry;
    const { head, body, anchors: a } = geometry;
    // Callers may supply a changing phase while motion is off. Keep a meaningful
    // still pose even then; direct pointer interaction remains available.
    const stillPhase = ['hatch', 'grow', 'wake'].includes(c.selectedPose) ? 1
      : ['feed', 'preen', 'look', 'tap', 'stroke', 'land', 'stretch'].includes(c.selectedPose) ? .5 : 0;
    const phase = c.reducedMotion || !c.animate ? stillPhase : next.phase;
    const f = poseFrame(geometry, c.selectedPose, phase, c.reaction);
    const reverse = c.selectedPose === 'turn' && c.direction !== 'front'
      ? c.direction === 'left' ? phase >= .5 : phase < .5 : c.direction === 'left';
    const gazeX = boundedAxis(next.gaze?.x) * (reverse ? -1 : 1), gazeY = boundedAxis(next.gaze?.y);
    const motion = boundedAxis(next.motion);
    if (c.selectedPose === 'held') {
      f.headAngle -= motion * 7; f.wingAngle -= Math.abs(motion) * 14; f.tailAngle -= motion * 14;
    }
    if (['idle', 'look', 'tap'].includes(c.selectedPose)) f.headAngle += gazeY * 4;
    const set = (key: string, name: string, value: string) => rig.current.get(key)?.forEach(node => node.setAttribute(name, value));
    set('mirror', 'transform', reverse ? 'translate(320 0) scale(-1 1)' : '');
    const pelvis = body.center;
    set('body', 'transform', `translate(0 ${n(f.bodyOffset)}) translate(${n(pelvis.x)} ${n(pelvis.y)}) rotate(${n(f.bodyAngle)}) scale(${n(f.bodyScaleX)} ${n(f.bodyScaleY)}) translate(${-n(pelvis.x)} ${-n(pelvis.y)})`);
    set('head', 'transform', `translate(${n(f.headOffsetX)} ${n(f.headOffset)}) rotate(${n(f.headAngle)} ${n(a.neck.x)} ${n(a.neck.y)})`);
    const wingScale = body.width / 110;
    const front = c.direction === 'front' || c.selectedPose === 'turn' ? 1 : c.selectedPose === 'look' ? Math.sin(.5 * Math.PI) * .88 : 0;
    set('wing', 'transform', `${move(a.wingRootLeft)} rotate(${n(f.wingAngle)}) scale(${n(wingScale)})`);
    const farScale = wingScale * (.7 + front * .3);
    set('far-wing', 'transform', `${move(a.wingRootRight)} rotate(${n(-f.wingAngle * .7)}) scale(${n(farScale * (1 - front * 2))} ${n(farScale)})`);
    set('tail', 'transform', `${move(a.tailRoot)} rotate(${n(f.tailAngle)}) scale(${(chick?.stage ?? stage) === 'baby' ? .82 : (chick?.stage ?? stage) === 'teen' ? .95 : 1.04})`);
    const legPath = (root: Point, foot: Point, width: number, far = false) => {
      const hip = { x: root.x, y: root.y + f.bodyOffset }, knee = { x: (root.x + foot.x) / 2 + (far ? 4 : -6), y: (hip.y + foot.y) / 2 };
      const toe = width > 5 ? 11 : 8;
      return `M${n(hip.x)} ${n(hip.y - 4)}Q${n(knee.x - 3)} ${n(knee.y)} ${n(knee.x)} ${n(knee.y + 3)}L${n(foot.x)} ${n(foot.y)}M${n(foot.x - toe * .75)} ${n(foot.y)}Q${n(foot.x)} ${n(foot.y - 2)} ${n(foot.x + toe)} ${n(foot.y)}M${n(foot.x)} ${n(foot.y)}L${n(foot.x + toe * .7)} ${n(foot.y - 4)}`;
    };
    set('left-leg', 'd', legPath(a.legRootLeft, f.leftFoot, geometry.legWidth));
    set('right-leg', 'd', legPath(a.legRootRight, f.rightFoot, geometry.legWidth * .9, true));
    // Reconnect the collar to the posed head; no gaps even during feed/preen.
    const angle = f.headAngle * Math.PI / 180, collar = { x: head.center.x - head.width * .15, y: head.center.y + head.height * .22 };
    const dx = collar.x - a.neck.x, dy = collar.y - a.neck.y;
    const x = a.neck.x + dx * Math.cos(angle) - dy * Math.sin(angle) + f.headOffsetX;
    const y = a.neck.y + dx * Math.sin(angle) + dy * Math.cos(angle) + f.headOffset;
    set('neck', 'd', `M${n(a.neck.x - body.width * .18)} ${n(a.neck.y + body.height * .13)}Q${n(a.neck.x - 2)} ${n(a.neck.y - 12)} ${n(x - head.width * .155)} ${n(y - 8)}L${n(x + head.width * .155)} ${n(y + 10)}Q${n(a.neck.x + body.width * .21)} ${n(a.neck.y + body.height * .13)} ${n(a.neck.x + body.width * .14)} ${n(a.neck.y + body.height * .32)}Z`);
    const blinkPeriod = 2700 + fingerprint % 4500, blinkTime = (performance.now() + fingerprint % 1300) % blinkPeriod;
    const blink = c.animate && !c.reducedMotion && (blinkTime < 105 || (fingerprint % 3 === 0 && blinkTime > 195 && blinkTime < 270));
    const closed = f.closedEyes || blink;
    set('eye-open', 'opacity', closed ? '0' : '1'); set('eye-closed', 'opacity', closed ? '1' : '0');
    set('beak-mouth', 'opacity', f.openBeak ? '1' : '0');
    set('eye-lid', 'opacity', String(Math.max(f.eyelid, c.rendered.genes.eyeStyle === 'sleepy' ? .48 : 0)));
    set('eye-left', 'transform', `translate(${n(f.eyeOffsetX + gazeX * 1.8)} ${n(f.eyeOffsetY + gazeY * 1.5)})`);
    set('eye-right', 'transform', `translate(${n(f.eyeOffsetX * .65 + gazeX * 1.2)} ${n(f.eyeOffsetY * .8 + gazeY * 1.2)})`);
    for (const [node, [angle, x, y]] of browBases.current) node.setAttribute('transform', `rotate(${n(angle + f.browAngle)} ${x} ${y})`);
  };
  useImperativeHandle(ref, () => ({ update }));
  useLayoutEffect(() => {
    rig.current = new Map();
    browBases.current = new Map();
    svg.current?.querySelectorAll<SVGElement>('[data-rig]').forEach(node => {
      const key = node.dataset.rig!;
      rig.current.set(key, [...(rig.current.get(key) ?? []), node]);
      if (key.startsWith('brow-')) {
        const values = node.getAttribute('transform')?.match(/-?[\d.]+/g)?.map(Number);
        if (values?.length === 3) browBases.current.set(node, values as [number, number, number]);
      }
    });
  }, [rendered.markup]);
  useLayoutEffect(() => {
    if (phase !== undefined) update({ phase, motion, gaze });
  }, [rendered.markup, phase, motion, gaze?.x, gaze?.y, hidden, animate, reducedMotion]);
  const style = {
    '--chick-blink-duration': `${3.2 + (fingerprint % 4800) / 1000}s`,
    '--chick-blink-delay': `${-(fingerprint % 2400) / 1000}s`,
    '--chick-breathe-duration': `${3.6 + (fingerprint % 1700) / 1000}s`,
  } as CSSProperties;
  return <svg ref={svg}
    className={`chick-art chick-art--v2 chick-art--v3 chick-art--${rendered.pose} chick-art--${chick?.stage ?? stage} ${className}`.trim()}
    width={size} height={size} viewBox="0 0 320 320" fill="none" style={style}
    role="img" aria-label={chick?.name ? `${chick.name}. ${rendered.label}` : rendered.label} data-appearance-version="2" data-visual-version="3" data-stage={chick?.stage ?? stage}
    data-head={rendered.genes.headShape} data-body={rendered.genes.bodyShape} data-pattern={rendered.genes.pattern}
    data-state={state} data-pose={rendered.pose} data-direction={direction}
    data-reaction={reaction}
    data-controlled={phase !== undefined ? 'true' : undefined}
    data-paused={hidden || !animate ? 'true' : undefined}
    data-reduced-motion={reducedMotion || !animate ? 'true' : undefined}
    dangerouslySetInnerHTML={{ __html: rendered.markup }}
  />;
}));
