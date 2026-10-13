import { FLAPS_CONFIG as C, type FlapsEndReason } from './config';

export interface Obstacle {
  id: number;
  x: number;
  gapY: number;
  gapHeight: number;
  scored: boolean;
}
export interface FlapsState {
  phase: 'ready' | 'playing' | 'crashed';
  y: number;
  velocity: number;
  time: number;
  distance: number;
  score: number;
  obstacles: Obstacle[];
  randomState: number;
  nextObstacleId: number;
  endReason: FlapsEndReason | null;
}

export function seedFromRun(runId: string): number {
  let value = 2166136261;
  for (let i = 0; i < runId.length; i++) value = Math.imul(value ^ runId.charCodeAt(i), 16777619);
  return value >>> 0;
}

/** Local seeded generator: presentation only; never affects server genes or rewards. */
function random(seed: number): [number, number] {
  const next = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return [next / 4294967296, next];
}

export function gapHeight(score: number): number {
  return Math.max(C.minimumGap, C.initialGap - Math.max(0, score) * C.gapPerPoint);
}
export function scrollSpeed(score: number): number {
  return Math.min(C.maxSpeed, C.baseSpeed + Math.max(0, score) * C.speedPerPoint);
}

export function nextObstacle(state: FlapsState, x: number, previousY: number): Obstacle {
  const [roll, seed] = random(state.randomState);
  state.randomState = seed;
  const height = gapHeight(state.score);
  const margin = height / 2 + 42;
  const target = previousY + (roll * 2 - 1) * C.maxGapShift;
  const center = Math.min(C.ground - margin, Math.max(C.ceiling + margin, target));
  return { id: state.nextObstacleId++, x, gapY: center, gapHeight: height, scored: false };
}

export function createFlapsState(seed: string | number): FlapsState {
  const state: FlapsState = {
    phase: 'ready', y: C.birdStartY, velocity: 0, time: 0, distance: 0, score: 0,
    obstacles: [], randomState: typeof seed === 'string' ? seedFromRun(seed) : seed >>> 0,
    nextObstacleId: 1, endReason: null,
  };
  // First gate is centered: the opening can be learnt before random variation begins.
  state.obstacles.push({ id: state.nextObstacleId++, x: C.firstObstacleX, gapY: C.birdStartY, gapHeight: C.initialGap, scored: false });
  state.obstacles.push(nextObstacle(state, C.firstObstacleX + C.obstacleSpacing, C.birdStartY));
  return state;
}

/** Setting, rather than adding, impulse makes rapid taps bounded. Ready tap does one flap. */
export function flap(state: FlapsState): FlapsState {
  if (state.phase === 'crashed') return state;
  return { ...state, phase: 'playing', velocity: C.flapVelocity };
}

export function circleHitsRect(x: number, y: number, radius: number, left: number, top: number, width: number, height: number): boolean {
  const nearestX = Math.max(left, Math.min(x, left + width));
  const nearestY = Math.max(top, Math.min(y, top + height));
  return (x - nearestX) ** 2 + (y - nearestY) ** 2 <= radius ** 2;
}

export function hitsObstacle(y: number, obstacle: Obstacle): boolean {
  const topEnd = obstacle.gapY - obstacle.gapHeight / 2;
  const bottomStart = obstacle.gapY + obstacle.gapHeight / 2;
  return circleHitsRect(C.birdX, y, C.birdRadius, obstacle.x, C.ceiling, C.obstacleWidth, topEnd - C.ceiling)
    || circleHitsRect(C.birdX, y, C.birdRadius, obstacle.x, bottomStart, C.obstacleWidth, C.ground - bottomStart);
}

/** Fixed model step. It returns a fresh snapshot; previous frames are never changed. */
export function stepFlaps(previous: FlapsState): FlapsState {
  if (previous.phase !== 'playing') return previous;
  const dt = C.fixedStep;
  const speed = scrollSpeed(previous.score);
  const velocity = previous.velocity + C.gravity * dt;
  const y = previous.y + velocity * dt;
  const state: FlapsState = {
    ...previous, y, velocity, time: previous.time + dt, distance: previous.distance + speed * dt,
    obstacles: previous.obstacles.map(item => ({ ...item, x: item.x - speed * dt })),
  };
  if (y - C.birdRadius <= C.ceiling || y + C.birdRadius >= C.ground) {
    return { ...state, phase: 'crashed', endReason: 'bounds' };
  }
  if (state.obstacles.some(item => hitsObstacle(y, item))) {
    return { ...state, phase: 'crashed', endReason: 'crash' };
  }
  for (const obstacle of state.obstacles) {
    if (!obstacle.scored && obstacle.x + C.obstacleWidth < C.birdX - C.birdRadius) {
      obstacle.scored = true;
      state.score++;
    }
  }
  state.obstacles = state.obstacles.filter(item => item.x + C.obstacleWidth > -32);
  while (state.obstacles.at(-1)!.x < C.width + C.obstacleSpacing) {
    const last = state.obstacles.at(-1)!;
    state.obstacles.push(nextObstacle(state, last.x + C.obstacleSpacing, last.gapY));
  }
  return state;
}

export interface FrameState { state: FlapsState; accumulator: number; steps: number }
/** Delta cap prevents catch-up through background time; caller resets accumulator on pause. */
export function advanceFlaps(state: FlapsState, accumulator: number, deltaSeconds: number): FrameState {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) return { state, accumulator, steps: 0 };
  let remaining = accumulator + Math.min(deltaSeconds, C.maxFrameDelta);
  let steps = 0;
  while (remaining + 1e-10 >= C.fixedStep && state.phase === 'playing') {
    state = stepFlaps(state);
    remaining -= C.fixedStep;
    steps++;
  }
  return { state, accumulator: state.phase === 'playing' ? Math.max(0, remaining) : 0, steps };
}
