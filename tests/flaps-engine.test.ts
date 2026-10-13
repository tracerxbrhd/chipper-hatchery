import { describe, expect, it } from 'vitest';
import { FLAPS_CONFIG as C } from '../src/games/flaps/config';
import { advanceFlaps, circleHitsRect, createFlapsState, flap, gapHeight, hitsObstacle, nextObstacle, scrollSpeed, seedFromRun, stepFlaps, type FlapsState } from '../src/games/flaps/engine';
import { isFlapKey, isFlapPointer } from '../src/games/flaps/input';

function safeState(): FlapsState {
  const state = flap(createFlapsState('safe'));
  state.y = 320; state.velocity = 0;
  return state;
}
function pilot(state: FlapsState): FlapsState {
  const gate = state.obstacles.find(item => item.x + C.obstacleWidth >= C.birdX - C.birdRadius) ?? state.obstacles.at(-1)!;
  if (state.y > gate.gapY + 7 && state.velocity > -30) return flap(state);
  return state;
}

describe('Chippster Flaps fixed-step engine', () => {
  it('has an exact immutable versioned configuration matching the server', () => {
    expect(C.configVersion).toBe('flaps-1'); expect(C.gravity).toBe(1300);
    expect(C.flapVelocity).toBe(-380); expect(C.obstacleSpacing).toBe(232);
    expect(gapHeight(0)).toBe(184); expect(gapHeight(1000)).toBe(156);
    expect(scrollSpeed(0)).toBe(135); expect(scrollSpeed(1000)).toBe(165);
    expect(Object.isFrozen(C)).toBe(true);
  });
  it('ready has no physics, danger or score before its first intentional tap', () => {
    const state = createFlapsState('one');
    expect(stepFlaps(state)).toBe(state);
    expect(advanceFlaps(state, 0, 60).state).toBe(state);
    expect(state.phase).toBe('ready'); expect(state.score).toBe(0);
    expect(state.obstacles[0].x).toBeGreaterThan(C.width);
    expect(state.obstacles[0].gapY).toBe(C.birdStartY);
  });
  it('first tap starts with exactly one impulse and taps cannot stack velocity', () => {
    const first = flap(createFlapsState('one'));
    expect(first.phase).toBe('playing'); expect(first.velocity).toBe(C.flapVelocity);
    expect(flap(flap(first)).velocity).toBe(C.flapVelocity);
    const next = stepFlaps(first);
    expect(next.velocity).toBeCloseTo(C.flapVelocity + C.gravity / 60);
    expect(next.y).toBeCloseTo(C.birdStartY + next.velocity / 60);
    expect(first.y).toBe(C.birdStartY);
    expect(first.obstacles[0].x).toBe(C.firstObstacleX);
  });
  it('circle/AABB collision uses the intended smaller body hitbox including corners', () => {
    expect(circleHitsRect(0, 0, 1, 1, 1, 1, 1)).toBe(false);
    expect(circleHitsRect(0, 0, Math.sqrt(2), 1, 1, 1, 1)).toBe(true);
    expect(circleHitsRect(10, 10, 2, 9, 9, 4, 4)).toBe(true);
    const gate = { id: 1, x: C.birdX - 10, gapY: 320, gapHeight: 184, scored: false };
    expect(hitsObstacle(320, gate)).toBe(false);
    expect(hitsObstacle(240, gate)).toBe(true);
    expect(hitsObstacle(400, gate)).toBe(true);
  });
  it('ceiling and ground both end the round, which stays terminal on repeated frames or taps', () => {
    for (const y of [C.ceiling + C.birdRadius, C.ground - C.birdRadius]) {
      const state = safeState(); state.y = y;
      if (y < 100) state.velocity = -200;
      const end = stepFlaps(state);
      expect(end.phase).toBe('crashed'); expect(end.endReason).toBe('bounds');
      expect(stepFlaps(end)).toBe(end); expect(flap(end)).toBe(end);
    }
  });
  it('colliding gate ends as crash and scores no point in the collision frame', () => {
    const state = safeState();
    state.obstacles = [{ id: 1, x: C.birdX - 40, gapY: 150, gapHeight: 184, scored: false }];
    const end = stepFlaps(state);
    expect(end.phase).toBe('crashed'); expect(end.endReason).toBe('crash'); expect(end.score).toBe(0);
  });
  it('a safely passed trailing edge adds exactly one score, never every frame', () => {
    let state = safeState();
    state.obstacles[0].x = C.birdX - C.birdRadius - C.obstacleWidth - 1;
    state = stepFlaps(state); expect(state.score).toBe(1);
    for (let i = 0; i < 8; i++) state = stepFlaps(state);
    expect(state.score).toBe(1); expect(state.obstacles[0].scored).toBe(true);
  });
  it('an obstacle is not scored merely when its front or center passes', () => {
    const state = safeState(); state.obstacles[0].x = C.birdX - 10;
    expect(stepFlaps(state).score).toBe(0);
  });
  it('seeded identical runs are reproducible and unrelated run ids vary', () => {
    expect(seedFromRun('abc')).toBe(seedFromRun('abc'));
    expect(createFlapsState('abc')).toEqual(createFlapsState('abc'));
    expect(createFlapsState('abc').obstacles[1].gapY).not.toBe(createFlapsState('def').obstacles[1].gapY);
  });
  it('30/60/120 FPS give the same fixed-step model without React or device pixels', () => {
    const states = [30, 60, 120].map(fps => {
      let state = safeState(); let accumulator = 0;
      for (let frame = 0; frame < fps * .5; frame++) {
        const advanced = advanceFlaps(state, accumulator, 1 / fps);
        state = advanced.state; accumulator = advanced.accumulator;
      }
      return state;
    });
    expect(states[0]).toEqual(states[1]); expect(states[1]).toEqual(states[2]);
    expect(states[0].time).toBeCloseTo(.5);
  });
  it('background deltas are capped and invalid timing cannot corrupt model coordinates', () => {
    const state = safeState();
    expect(advanceFlaps(state, 0, 120).steps).toBe(6);
    for (const delta of [-1, NaN, Infinity]) {
      expect(advanceFlaps(state, 0, delta).state).toBe(state);
    }
    // Resume resets the accumulator and timestamp in the UI; a zero frame causes no jump.
    expect(advanceFlaps(state, 0, 0).state).toBe(state);
  });
  it('thousands of seeded gates keep bounded, reachable spacing and margins at peak difficulty', () => {
    for (let seed = 0; seed < 50; seed++) {
      const state = createFlapsState(seed); state.score = 500;
      let previousY = 320;
      for (let i = 0; i < 100; i++) {
        const gate = nextObstacle(state, 450 + i * C.obstacleSpacing, previousY);
        expect(Math.abs(gate.gapY - previousY)).toBeLessThanOrEqual(C.maxGapShift);
        expect(gate.gapY - gate.gapHeight / 2).toBeGreaterThanOrEqual(C.ceiling + 42);
        expect(gate.gapY + gate.gapHeight / 2).toBeLessThanOrEqual(C.ground - 42);
        expect(gate.gapHeight).toBeGreaterThanOrEqual(156);
        previousY = gate.gapY;
      }
    }
  });
  it('a bounded human-like flap controller can traverse diverse seeds at maximum difficulty', () => {
    for (let seed = 1; seed <= 30; seed++) {
      let state = flap(createFlapsState(seed)); state.score = 60;
      // The initial gates have a wider opening; future gates use the final narrow configuration.
      for (let tick = 0; tick < 60 * 90 && state.phase === 'playing' && state.score < 100; tick++) {
        state = stepFlaps(pilot(state));
      }
      expect(state.phase, `seed ${seed}, y ${state.y}, score ${state.score}`).toBe('playing');
      expect(state.score).toBe(100);
      expect(state.obstacles.length).toBeLessThanOrEqual(5);
    }
  });
});

describe('Chippster Flaps scoped input policy', () => {
  it('accepts primary touches/pen/left mouse only', () => {
    expect(isFlapPointer({ isPrimary: true, button: 0, pointerType: 'touch' })).toBe(true);
    expect(isFlapPointer({ isPrimary: true, button: 0, pointerType: 'pen' })).toBe(true);
    expect(isFlapPointer({ isPrimary: true, button: 0, pointerType: 'mouse' })).toBe(true);
    expect(isFlapPointer({ isPrimary: false, button: 0, pointerType: 'touch' })).toBe(false);
    expect(isFlapPointer({ isPrimary: true, button: 2, pointerType: 'mouse' })).toBe(false);
  });
  it('accepts an intentional Space/Up, and rejects repeat/shortcuts/unrelated keys', () => {
    const base = { key: ' ', repeat: false, altKey: false, ctrlKey: false, metaKey: false };
    expect(isFlapKey(base)).toBe(true); expect(isFlapKey({ ...base, key: 'ArrowUp' })).toBe(true);
    for (const invalid of [{ repeat: true }, { altKey: true }, { ctrlKey: true }, { metaKey: true }, { key: 'Escape' }, { key: 'a' }]) {
      expect(isFlapKey({ ...base, ...invalid })).toBe(false);
    }
  });
});
