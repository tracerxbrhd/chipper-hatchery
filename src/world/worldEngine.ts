import { boundWorldPoint, moveWorldPoint, WORLD_BOUNDS, WORLD_FOOD, WORLD_HOME, worldDistance, type WorldPoint } from './worldMath';

export type ComicMode = 'sneeze' | 'startle' | 'stretch' | 'shake' | 'stumble';
export type WorldMode = 'idle' | 'turn' | 'walk' | 'look' | 'preen' | 'peck' | 'yawn' | 'tap' | 'stroke' | 'held' | 'land' | 'feed' | 'play' | 'sleep' | 'wake' | 'grow' | ComicMode;
export type WorldPose = WorldMode;
export type WorldDirection = 'left' | 'right' | 'front';
export interface WorldModel {
  position: WorldPoint;
  target: WorldPoint | null;
  mode: WorldMode;
  direction: WorldDirection;
  time: number;
  stateTime: number;
  gait: number;
  decisionAt: number;
  randomState: number;
  feeding: boolean;
  reaction: number;
  lift: number;
  liftTarget: number;
  velocity: WorldPoint;
  gaze: { x: number; y: number };
  /** Presentation only, derived once from identity. Never persisted or rewarded. */
  personality: ComicMode;
  ambientWalk: boolean;
}
export interface WorldFrame { position: WorldPoint; mode: WorldMode; pose: WorldPose; direction: WorldDirection; phase: number; moving: boolean; reaction: number; lift: number; motion: number; gaze: { x: number; y: number } }

const TURN_SECONDS = .32;
const WALK_SPEED = .17;
const STRIDE_LENGTH = .075;
export const COMIC_DURATIONS: Record<ComicMode, number> = { sneeze: 1.35, startle: .95, stretch: 2.1, shake: 1.15, stumble: 1.2 };
// Matches visualDetailsFor's dreamer/nosy/wiggler/dandy/clumsy order.
const COMIC_MODES: ComicMode[] = ['stretch', 'startle', 'shake', 'sneeze', 'stumble'];
export function personalityForSeed(seed: number): ComicMode { return COMIC_MODES[(seed >>> 0) % COMIC_MODES.length]; }

function random(model: WorldModel): number {
  model.randomState = (Math.imul(model.randomState, 1664525) + 1013904223) >>> 0;
  return model.randomState / 4294967296;
}

function changeMode(model: WorldModel, mode: WorldMode) {
  model.mode = mode;
  model.stateTime = 0;
}

function rest(model: WorldModel) {
  model.target = null;
  model.feeding = false;
  model.ambientWalk = false;
  model.lift = 0; model.liftTarget = 0; model.velocity = { u: 0, v: 0 };
  changeMode(model, 'idle');
  model.decisionAt = model.time + 5 + random(model) * 7;
}

export function createWorldModel(seed: number): WorldModel {
  const model: WorldModel = { position: { ...WORLD_HOME }, target: null, mode: 'idle', direction: 'right', time: 0, stateTime: 0, gait: 0, decisionAt: 0, randomState: seed >>> 0, feeding: false,
    reaction: -1, lift: 0, liftTarget: 0, velocity: { u: 0, v: 0 }, gaze: { x: 0, y: 0 }, personality: personalityForSeed(seed), ambientWalk: false };
  model.decisionAt = 3 + random(model) * 3;
  return model;
}

/** Care/sleep own the actor. Rapid taps can replace a walk goal, but cannot cancel care. */
export function setWorldTarget(model: WorldModel, target: WorldPoint): boolean {
  if (['feed', 'play', 'sleep', 'wake', 'grow', 'held', 'land'].includes(model.mode)) return false;
  const goal = boundWorldPoint(target);
  if (worldDistance(model.position, goal) < .012) {
    model.target = null;
    model.direction = 'front';
    changeMode(model, 'look');
    return true;
  }
  model.target = goal;
  model.ambientWalk = false;
  const direction = goal.u < model.position.u ? 'left' : 'right';
  const turning = direction !== model.direction;
  model.direction = direction;
  changeMode(model, turning ? 'turn' : 'walk');
  return true;
}

export function greetWorldChick(model: WorldModel): boolean {
  if (['feed', 'play', 'sleep', 'wake', 'grow', 'held', 'land'].includes(model.mode)) return false;
  model.target = null;
  model.direction = 'front';
  model.reaction = (model.reaction + 1 + Math.floor(random(model) * 2)) % 3;
  changeMode(model, 'tap');
  return true;
}

export function strokeWorldChick(model: WorldModel): boolean {
  if (['feed', 'play', 'sleep', 'wake', 'grow', 'held', 'land'].includes(model.mode)) return false;
  model.target = null;
  changeMode(model, 'stroke');
  return true;
}

export function pickupWorldChick(model: WorldModel, lift: number): boolean {
  if (['feed', 'play', 'sleep', 'wake', 'grow', 'held', 'land'].includes(model.mode)) return false;
  model.target = { ...model.position }; model.feeding = false;
  model.liftTarget = Math.max(0, Number.isFinite(lift) ? lift : 0);
  model.velocity = { u: 0, v: 0 };
  changeMode(model, 'held');
  return true;
}

export function dragWorldChick(model: WorldModel, target: WorldPoint, lift: number): boolean {
  if (model.mode !== 'held') return false;
  model.target = boundWorldPoint(target);
  model.liftTarget = Math.max(0, Number.isFinite(lift) ? lift : 0);
  return true;
}

export function releaseWorldChick(model: WorldModel): boolean {
  if (model.mode !== 'held') return false;
  model.target = null; model.liftTarget = 0; model.velocity = { u: 0, v: 0 };
  changeMode(model, 'land');
  return true;
}

/** Cancellation is immediate: nothing held survives background, sleep or unmount. */
export function cancelWorldTouch(model: WorldModel) {
  if (['held', 'land', 'stroke', 'tap'].includes(model.mode)) rest(model);
}

export function lookWorldChick(model: WorldModel, x: number, y: number) {
  if (['sleep', 'feed', 'play', 'grow'].includes(model.mode)) return;
  model.gaze = { x: Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0, y: Number.isFinite(y) ? Math.max(-1, Math.min(1, y)) : 0 };
}

export function startWorldCare(model: WorldModel, action: 'feed' | 'play'): boolean {
  if (model.mode === 'sleep') return false;
  model.lift = 0; model.liftTarget = 0; model.velocity = { u: 0, v: 0 };
  model.target = action === 'feed' ? { ...WORLD_FOOD } : null;
  model.feeding = false;
  if (action === 'feed') model.direction = WORLD_FOOD.u < model.position.u ? 'left' : 'right';
  else model.direction = 'front';
  changeMode(model, action);
  return true;
}

export function startWorldGrowth(model: WorldModel): boolean {
  if (['sleep', 'feed', 'play', 'wake'].includes(model.mode)) return false;
  model.target = null;
  changeMode(model, 'grow');
  return true;
}

function autonomousDecision(model: WorldModel) {
  const choice = random(model);
  if (choice < .43) {
    const angle = random(model) * Math.PI * 2;
    const radius = .35 + random(model) * .5;
    setWorldTarget(model, { u: WORLD_BOUNDS.u + Math.cos(angle) * WORLD_BOUNDS.radiusU * radius, v: WORLD_BOUNDS.v + Math.sin(angle) * WORLD_BOUNDS.radiusV * radius });
    model.ambientWalk = true;
  } else {
    model.direction = choice < .88 ? 'front' : model.direction;
    // A favourite action is more likely, but every bird can perform all actions.
    const comic = choice > .73 ? random(model) < .58 ? model.personality : COMIC_MODES[Math.floor(random(model) * COMIC_MODES.length)] : null;
    changeMode(model, comic ?? (choice < .59 ? 'look' : choice < .64 ? 'preen' : choice < .69 ? 'peck' : 'yawn'));
  }
}

/** Small, bounded deltas prevent background catch-up. Server sleeping always wins. */
export function stepWorld(model: WorldModel, elapsedSeconds: number, sleeping: boolean, strideLength = STRIDE_LENGTH): WorldFrame {
  const dt = Number.isFinite(elapsedSeconds) ? Math.min(.05, Math.max(0, elapsedSeconds)) : 0;
  const stride = Number.isFinite(strideLength) && strideLength > 0 ? strideLength : STRIDE_LENGTH;
  model.time += dt;
  model.stateTime += dt;
  if (sleeping) {
    if (model.mode !== 'sleep') changeMode(model, 'sleep');
    model.target = null;
    model.feeding = false;
    model.lift = 0; model.liftTarget = 0; model.velocity = { u: 0, v: 0 };
    return worldFrame(model);
  }
  if (model.mode === 'sleep') changeMode(model, 'wake');
  if (model.mode === 'held') {
    const goal = model.target ?? model.position;
    // Critically damped local spring; small substeps remain stable at 30/60/120 Hz.
    const substeps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / substeps;
    for (let i = 0; i < substeps; i++) {
      model.velocity.u += ((goal.u - model.position.u) * 170 - model.velocity.u * 26) * h;
      model.velocity.v += ((goal.v - model.position.v) * 170 - model.velocity.v * 26) * h;
      model.position = boundWorldPoint({ u: model.position.u + model.velocity.u * h, v: model.position.v + model.velocity.v * h });
      model.lift += (model.liftTarget - model.lift) * Math.min(1, 18 * h);
    }
  } else if (model.mode === 'land') {
    model.lift = Math.max(0, model.lift * Math.exp(-22 * dt) - 30 * dt);
    if (model.stateTime >= .42) rest(model);
  } else if (model.mode === 'wake' && model.stateTime >= .65) rest(model);
  else if (model.mode === 'grow' && model.stateTime >= 1.5) rest(model);
  else if (model.mode === 'turn' && model.stateTime >= TURN_SECONDS) changeMode(model, 'walk');
  else if (model.mode === 'walk' && model.target) {
    const move = moveWorldPoint(model.position, model.target, WALK_SPEED * dt);
    model.position = move.point;
    model.gait = (model.gait + move.distance / stride) % 1;
    if (move.arrived) {
      const stumble = model.ambientWalk && model.personality === 'stumble' && random(model) < .55;
      rest(model);
      if (stumble) changeMode(model, 'stumble');
    }
  } else if (model.mode === 'feed') {
    if (model.target) {
      const move = moveWorldPoint(model.position, model.target, WALK_SPEED * dt);
      model.position = move.point;
      model.gait = (model.gait + move.distance / stride) % 1;
      if (move.arrived) { model.target = null; model.feeding = true; model.stateTime = 0; }
    } else if (model.stateTime > 2.2) rest(model);
  } else if (model.mode === 'play' && model.stateTime > 1.8) rest(model);
  else if (model.mode === 'look' && model.stateTime > 1.4) rest(model);
  else if (model.mode === 'preen' && model.stateTime > 1.9) rest(model);
  else if (model.mode === 'tap' && model.stateTime > .65) rest(model);
  else if (model.mode === 'stroke' && model.stateTime > .85) rest(model);
  else if (model.mode === 'peck' && model.stateTime > 1.1) rest(model);
  else if (model.mode === 'yawn' && model.stateTime > 1.6) rest(model);
  else if (model.mode in COMIC_DURATIONS && model.stateTime >= COMIC_DURATIONS[model.mode as ComicMode]) rest(model);
  else if (model.mode === 'idle' && model.time >= model.decisionAt) autonomousDecision(model);
  return worldFrame(model);
}

export function worldFrame(model: WorldModel): WorldFrame {
  const moving = model.mode === 'walk' || (model.mode === 'feed' && model.target !== null);
  const pose: WorldPose = moving ? 'walk' : model.mode;
  const duration = model.mode in COMIC_DURATIONS ? COMIC_DURATIONS[model.mode as ComicMode] : model.mode === 'turn' ? TURN_SECONDS : model.mode === 'wake' ? .65 : model.mode === 'grow' ? 1.5 : model.mode === 'look' ? 1.4 : model.mode === 'preen' ? 1.9 : model.mode === 'tap' ? .65 : model.mode === 'land' ? .42 : model.mode === 'peck' ? 1.1 : model.mode === 'yawn' ? 1.6 : null;
  const phase = moving ? model.gait : duration !== null ? Math.min(1, model.stateTime / duration) : (model.stateTime / (model.mode === 'sleep' ? 4.5 : model.mode === 'feed' ? .75 : model.mode === 'play' ? .6 : 3.7)) % 1;
  return { position: { ...model.position }, mode: model.mode, pose, direction: model.direction, phase, moving,
    reaction: model.reaction, lift: model.lift, motion: Math.max(-1, Math.min(1, model.velocity.u * 3)), gaze: { ...model.gaze } };
}
