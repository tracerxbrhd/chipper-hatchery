import { boundWorldPoint, moveWorldPoint, WORLD_BOUNDS, WORLD_FOOD, WORLD_HOME, worldDistance, type WorldPoint } from './worldMath';

export type WorldMode = 'idle' | 'turn' | 'walk' | 'look' | 'preen' | 'feed' | 'play' | 'sleep' | 'wake' | 'grow';
export type WorldPose = 'idle' | 'turn' | 'walk' | 'look' | 'preen' | 'feed' | 'play' | 'sleep' | 'wake' | 'grow';
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
}
export interface WorldFrame { position: WorldPoint; mode: WorldMode; pose: WorldPose; direction: WorldDirection; phase: number; moving: boolean }

const TURN_SECONDS = .32;
const WALK_SPEED = .17;
const STRIDE_LENGTH = .075;

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
  changeMode(model, 'idle');
  model.decisionAt = model.time + 5 + random(model) * 7;
}

export function createWorldModel(seed: number): WorldModel {
  const model: WorldModel = { position: { ...WORLD_HOME }, target: null, mode: 'idle', direction: 'right', time: 0, stateTime: 0, gait: 0, decisionAt: 0, randomState: seed >>> 0, feeding: false };
  model.decisionAt = 3 + random(model) * 3;
  return model;
}

/** Care/sleep own the actor. Rapid taps can replace a walk goal, but cannot cancel care. */
export function setWorldTarget(model: WorldModel, target: WorldPoint): boolean {
  if (['feed', 'play', 'sleep', 'wake', 'grow'].includes(model.mode)) return false;
  const goal = boundWorldPoint(target);
  if (worldDistance(model.position, goal) < .012) {
    model.target = null;
    model.direction = 'front';
    changeMode(model, 'look');
    return true;
  }
  model.target = goal;
  const direction = goal.u < model.position.u ? 'left' : 'right';
  const turning = direction !== model.direction;
  model.direction = direction;
  changeMode(model, turning ? 'turn' : 'walk');
  return true;
}

export function greetWorldChick(model: WorldModel): boolean {
  if (['feed', 'play', 'sleep', 'wake', 'grow'].includes(model.mode)) return false;
  model.target = null;
  model.direction = 'front';
  changeMode(model, 'play');
  return true;
}

export function startWorldCare(model: WorldModel, action: 'feed' | 'play'): boolean {
  if (model.mode === 'sleep') return false;
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
  if (choice < .6) {
    const angle = random(model) * Math.PI * 2;
    const radius = .35 + random(model) * .5;
    setWorldTarget(model, { u: WORLD_BOUNDS.u + Math.cos(angle) * WORLD_BOUNDS.radiusU * radius, v: WORLD_BOUNDS.v + Math.sin(angle) * WORLD_BOUNDS.radiusV * radius });
  } else {
    model.direction = choice < .85 ? 'front' : model.direction;
    changeMode(model, choice < .85 ? 'look' : 'preen');
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
    return worldFrame(model);
  }
  if (model.mode === 'sleep') changeMode(model, 'wake');
  if (model.mode === 'wake' && model.stateTime >= .65) rest(model);
  else if (model.mode === 'grow' && model.stateTime >= 1.5) rest(model);
  else if (model.mode === 'turn' && model.stateTime >= TURN_SECONDS) changeMode(model, 'walk');
  else if (model.mode === 'walk' && model.target) {
    const move = moveWorldPoint(model.position, model.target, WALK_SPEED * dt);
    model.position = move.point;
    model.gait = (model.gait + move.distance / stride) % 1;
    if (move.arrived) rest(model);
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
  else if (model.mode === 'idle' && model.time >= model.decisionAt) autonomousDecision(model);
  return worldFrame(model);
}

export function worldFrame(model: WorldModel): WorldFrame {
  const moving = model.mode === 'walk' || (model.mode === 'feed' && model.target !== null);
  const pose: WorldPose = moving ? 'walk' : model.mode;
  const duration = model.mode === 'turn' ? TURN_SECONDS : model.mode === 'wake' ? .65 : model.mode === 'grow' ? 1.5 : model.mode === 'look' ? 1.4 : model.mode === 'preen' ? 1.9 : null;
  const phase = moving ? model.gait : duration !== null ? Math.min(1, model.stateTime / duration) : (model.stateTime / (model.mode === 'sleep' ? 4.5 : model.mode === 'feed' ? .75 : model.mode === 'play' ? .6 : 3.7)) % 1;
  return { position: { ...model.position }, mode: model.mode, pose, direction: model.direction, phase, moving };
}
