import { createWorldModel, greetWorldChick, lookWorldChick, setWorldTarget, stepWorld, worldFrame, type WorldFrame, type WorldModel } from './worldEngine';
import { clamp, projectWorld, worldPointFromPointer, type WorldPoint, type WorldProjection } from './worldMath';

export type GuestPhase = 'approach' | 'greet' | 'look' | 'together' | 'apart' | 'idle';
export interface GuestWorldModel { actor: WorldModel; phase: GuestPhase; time: number; phaseAt: number; cycle: number }
const PHASES: GuestPhase[] = ['approach', 'greet', 'look', 'together', 'apart', 'idle'];
const DURATIONS = [2.4, .9, 2, 3, 2.8, 2];

/** Separate horizontal lanes keep both silhouettes visible even during own drag. */
export function projectPair(point: WorldPoint, role: 'owner' | 'guest'): WorldProjection {
  const projected = projectWorld(point);
  return { ...projected, x: role === 'owner' ? 28 + (projected.x - 50) * .3 : 72 + (projected.x - 50) * .25 };
}

export function pairOwnerPointFromPointer(x: number, y: number, width: number, height: number): WorldPoint | null {
  // Inverse of the owner's projection. The right-hand guest lane is not a
  // movement target, including empty pixels within the guest's SVG viewBox.
  return worldPointFromPointer(((x / width * 100 - 28) / .3 + 50) / 100 * width, y, width, height);
}

export function createGuestWorld(seed: number): GuestWorldModel {
  const actor = createWorldModel(seed);
  actor.position = { u: .67, v: .57 }; actor.direction = 'left'; actor.decisionAt = Infinity;
  return { actor, phase: 'approach', time: 0, phaseAt: -1, cycle: 0 };
}

/** Pure decorative clock: it contains no care, owner identity or API callback. */
export function stepGuestWorld(model: GuestWorldModel, elapsedSeconds: number, owner: WorldFrame, stride: number): WorldFrame {
  const dt = Number.isFinite(elapsedSeconds) ? clamp(elapsedSeconds, 0, .05) : 0;
  model.time += dt;
  if (model.phaseAt < 0 || model.time - model.phaseAt >= DURATIONS[model.cycle % PHASES.length]) {
    if (model.phaseAt >= 0) model.cycle += 1;
    model.phase = PHASES[model.cycle % PHASES.length]; model.phaseAt = model.time;
    model.actor.target = null; model.actor.mode = 'idle'; model.actor.stateTime = 0;
    if (model.phase === 'approach') setWorldTarget(model.actor, { u: .29, v: clamp(owner.position.v, .4, .68) });
    else if (model.phase === 'apart') setWorldTarget(model.actor, { u: .69, v: .57 });
    else if (model.phase === 'greet') greetWorldChick(model.actor);
    else if (model.phase === 'look') { model.actor.mode = 'look'; model.actor.direction = 'left'; }
    else model.actor.direction = 'left';
  }
  model.actor.decisionAt = Infinity;
  lookWorldChick(model.actor, -1, clamp((owner.position.v - model.actor.position.v) * 2, -.5, .5));
  const frame = stepWorld(model.actor, dt, false, stride);
  // Idle pair phase still faces the host even after a short look/greet ends.
  if (!frame.moving && model.phase !== 'greet') model.actor.direction = 'left';
  return worldFrame(model.actor);
}
