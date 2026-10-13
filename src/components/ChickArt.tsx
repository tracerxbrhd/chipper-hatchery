import { useId, useSyncExternalStore, type CSSProperties } from 'react';
import type { Stage } from '../types';
import { buildChickMarkup } from '../chicks/renderer';
import { geneFingerprint, type ChickDirection, type ChickPose, type ChickVisual } from '../chicks/models';
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
  animate?: boolean; mood?: number; size?: number; className?: string; reducedMotion?: boolean;
}

const visibilityListeners = new Set<() => void>();
const onVisibilityChange = () => visibilityListeners.forEach((listener) => listener());
function subscribeVisibility(listener: () => void): () => void {
  if (visibilityListeners.size === 0) document.addEventListener('visibilitychange', onVisibilityChange);
  visibilityListeners.add(listener);
  return () => {
    visibilityListeners.delete(listener);
    if (visibilityListeners.size === 0) document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
const readHidden = () => document.hidden;
const readServerHidden = () => true;
const stateToPose: Record<ChickArtState, ChickPose> = {
  idle: 'idle', happy: 'play', feed: 'feed', play: 'play', sleepy: 'look', sleep: 'sleep', hatch: 'hatch', grow: 'grow',
};

/** One original V2 renderer for portraits, world and Flaps. */
export function ChickArt({ chick, stage = 'baby', state = 'idle', pose, direction = 'right', phase, shadow = true,
  animate = true, size = 280, className = '', reducedMotion = false }: ChickArtProps) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const hidden = useSyncExternalStore(subscribeVisibility, readHidden, readServerHidden);
  const initial = buildChickMarkup({ chick, stage, pose: pose ?? stateToPose[state], direction, phase, shadow, id });
  const fingerprint = geneFingerprint(initial.genes);
  // World updates replace the inner SVG. A clocked joint blink survives those updates,
  // while stationary portraits can use their CSS timing without any extra RAF.
  const blinkPeriod = 2700 + fingerprint % 4500;
  const blinkTime = (Date.now() + fingerprint % 1300) % blinkPeriod;
  const blink = animate && !reducedMotion && !hidden && phase !== undefined
    && (blinkTime < 105 || (fingerprint % 3 === 0 && blinkTime > 195 && blinkTime < 270));
  const rendered = blink ? buildChickMarkup({ chick, stage, pose: pose ?? stateToPose[state], direction, phase, shadow, id, blink }) : initial;
  const style = {
    '--chick-blink-duration': `${3.2 + (fingerprint % 4800) / 1000}s`,
    '--chick-blink-delay': `${-(fingerprint % 2400) / 1000}s`,
    '--chick-breathe-duration': `${3.6 + (fingerprint % 1700) / 1000}s`,
  } as CSSProperties;
  return <svg
    className={`chick-art chick-art--v2 chick-art--${rendered.pose} chick-art--${chick?.stage ?? stage} ${className}`.trim()}
    width={size} height={size} viewBox="0 0 320 320" fill="none" style={style}
    role="img" aria-label={rendered.label} data-appearance-version="2" data-stage={chick?.stage ?? stage}
    data-head={rendered.genes.headShape} data-body={rendered.genes.bodyShape} data-pattern={rendered.genes.pattern}
    data-state={state} data-pose={rendered.pose} data-direction={direction}
    data-controlled={phase !== undefined ? 'true' : undefined}
    data-paused={hidden ? 'true' : undefined}
    data-reduced-motion={reducedMotion || !animate ? 'true' : undefined}
    dangerouslySetInnerHTML={{ __html: rendered.markup }}
  />;
}
