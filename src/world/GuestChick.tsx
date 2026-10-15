import type { SyntheticEvent } from 'react';
import { ChickArt } from '../components/ChickArt';
import type { PublicChick } from '../types';
import { projectPair } from './guestWorld';
import type { WorldFrame } from './worldEngine';

export interface GuestChickProps { chick: PublicChick; displayName: string; frame: WorldFrame; size: number; animate: boolean; phase: string }

/** No button, focus target, Touchy Feel handler or foreign mutation is present. */
export function GuestChick({ chick, displayName, frame, size, animate, phase }: GuestChickProps) {
  const projected = projectPair(frame.position, 'guest');
  const blockPointer = (event: SyntheticEvent) => { event.stopPropagation(); };
  return <>
    <div className="world-shadow world-guest-shadow" style={{ left: `${projected.x}%`, top: `${projected.y}%`, width: size * .37,
      height: Math.max(5, size * .035), opacity: projected.shadowOpacity, transform: `translate(-50%, -50%) scale(${projected.scale})` }} aria-hidden="true" />
    <div className="world-guest" role="group" aria-label={`Гость: ${chick.name} · ${displayName}`} data-read-only="true" data-phase={phase}
      onPointerDown={blockPointer} onPointerMove={blockPointer} onPointerUp={blockPointer} onClick={blockPointer}
      style={{ left: `${projected.x}%`, top: `${projected.y}%`, width: size, height: size,
        transform: `translate(-50%, -88.125%) scale(${projected.scale})` }}>
      <ChickArt chick={chick} pose={animate ? frame.pose : 'look'} direction={frame.direction} phase={animate ? frame.phase : 0}
        reaction={frame.reaction} gaze={frame.gaze} animate={animate} shadow={false} size={size} />
    </div>
    <span className="world-guest-label" title={`${chick.name} · ${displayName}`}>Гость · {chick.name}</span>
  </>;
}
