import { forwardRef, useImperativeHandle, useRef, type SyntheticEvent } from 'react';
import { ChickArt, type ChickArtHandle } from '../components/ChickArt';
import type { PublicChick } from '../types';
import { projectPair } from './guestWorld';
import type { WorldFrame } from './worldEngine';

export interface GuestChickProps { chick: PublicChick; displayName: string; frame: WorldFrame; size: number; animate: boolean; phase: string }
export interface GuestChickHandle { update: (frame: WorldFrame, phase: string) => void }

/** No button, focus target, Touchy Feel handler or foreign mutation is present. */
export const GuestChick = forwardRef<GuestChickHandle, GuestChickProps>(function GuestChick({ chick, displayName, frame, size, animate, phase }, ref) {
  const actor = useRef<HTMLDivElement>(null), shadow = useRef<HTMLDivElement>(null), art = useRef<ChickArtHandle>(null);
  useImperativeHandle(ref, () => ({ update(next, nextPhase) {
    const p = projectPair(next.position, 'guest');
    if (actor.current) {
      actor.current.style.left = `${p.x}%`; actor.current.style.top = `${p.y}%`;
      actor.current.style.transform = `translate(-50%, -88.125%) scale(${p.scale})`;
      actor.current.dataset.phase = nextPhase;
    }
    if (shadow.current) {
      shadow.current.style.left = `${p.x}%`; shadow.current.style.top = `${p.y}%`;
      shadow.current.style.transform = `translate(-50%, -50%) scale(${p.scale})`;
    }
    art.current?.update({ phase: next.phase, motion: next.motion, gaze: next.gaze });
  } }));
  const projected = projectPair(frame.position, 'guest');
  const blockPointer = (event: SyntheticEvent) => { event.stopPropagation(); };
  return <>
    <div className="world-shadow world-guest-shadow" ref={shadow} style={{ left: `${projected.x}%`, top: `${projected.y}%`, width: size * .37,
      height: Math.max(5, size * .035), opacity: projected.shadowOpacity, transform: `translate(-50%, -50%) scale(${projected.scale})` }} aria-hidden="true" />
    <div className="world-guest" ref={actor} role="group" aria-label={`Гость: ${chick.name} · ${displayName}`} data-read-only="true" data-phase={phase}
      onPointerDown={blockPointer} onPointerMove={blockPointer} onPointerUp={blockPointer} onClick={blockPointer}
      style={{ left: `${projected.x}%`, top: `${projected.y}%`, width: size, height: size,
        transform: `translate(-50%, -88.125%) scale(${projected.scale})` }}>
      <ChickArt ref={art} chick={chick} pose={animate ? frame.pose : 'look'} direction={frame.direction} phase={animate ? frame.phase : 0}
        reaction={frame.reaction} gaze={frame.gaze} animate={animate} shadow={false} size={size} />
    </div>
    <span className="world-guest-label" title={`${chick.name} · ${displayName}`}>Гость · {chick.name}</span>
  </>;
});
