import { describe, expect, test } from 'vitest';
import { boundWorldPoint, isInsideWorld, moveWorldPoint, projectWorld, WORLD_FOOD, WORLD_HOME, worldDistance, worldPointFromPointer, worldSeed } from '../src/world/worldMath';
import { createWorldModel, greetWorldChick, setWorldTarget, startWorldCare, startWorldGrowth, stepWorld, worldFrame, type WorldModel } from '../src/world/worldEngine';
import { gaitFoot } from '../src/chicks/animation';

function run(model: WorldModel, seconds: number, sleeping = false, fps = 60) {
  for (let i = 0; i < seconds * fps; i++) stepWorld(model, 1 / fps, sleeping);
  return worldFrame(model);
}

describe('2.5D ground and contact math', () => {
  test('every extreme point is bounded inside the walking ellipse', () => {
    for (let i = -30; i <= 30; i++) for (let j = -30; j <= 30; j++) {
      const point = boundWorldPoint({ u: i / 7, v: j / 7 });
      expect(isInsideWorld(point)).toBe(true);
      const projection = projectWorld(point);
      expect(projection.x).toBeGreaterThan(20);
      expect(projection.x).toBeLessThan(80);
      expect(projection.y).toBeGreaterThan(60);
      expect(projection.y).toBeLessThan(83);
    }
  });
  test('invalid input degrades to finite contact coordinates', () => {
    expect(boundWorldPoint({ u: NaN, v: Infinity })).toEqual(WORLD_HOME);
    expect(isInsideWorld({ u: NaN, v: .5 })).toBe(false);
    expect(isInsideWorld({ u: .5, v: Infinity })).toBe(false);
    expect(worldPointFromPointer(0, 0, 0, 100)).toBeNull();
    expect(worldPointFromPointer(NaN, 0, 100, 100)).toBeNull();
  });
  test('screen-to-plane taps round-trip at any supported screen size', () => {
    for (const [width, height] of [[320, 160], [360, 300], [430, 600]]) {
      for (const point of [WORLD_HOME, WORLD_FOOD, { u: .3, v: .4 }, { u: .6, v: .26 }]) {
        const projection = projectWorld(point);
        const tapped = worldPointFromPointer(projection.x * width / 100, projection.y * height / 100, width, height);
        expect(tapped?.u).toBeCloseTo(point.u, 10);
        expect(tapped?.v).toBeCloseTo(point.v, 10);
      }
    }
  });
  test('sky, instructions and scene edges cannot create a walk target', () => {
    expect(worldPointFromPointer(160, 30, 320, 300)).toBeNull();
    expect(worldPointFromPointer(160, 299, 320, 300)).toBeNull();
    expect(worldPointFromPointer(0, 210, 320, 300)).toBeNull();
    expect(worldPointFromPointer(319, 210, 320, 300)).toBeNull();
  });
  test('depth changes size and grounded shadow together', () => {
    const far = projectWorld({ u: .5, v: .21 });
    const near = projectWorld({ u: .5, v: .85 });
    expect(near.x).toEqual(far.x);
    expect(near.y).toBeGreaterThan(far.y);
    expect(near.scale).toBeGreaterThan(far.scale);
    expect(near.shadowOpacity).toBeGreaterThan(far.shadowOpacity);
  });
  test('valid endpoints produce a continuous in-bounds path and exact arrival', () => {
    const start = boundWorldPoint({ u: .1, v: .2 });
    const goal = boundWorldPoint({ u: .9, v: .8 });
    let position = start;
    let total = 0;
    for (let i = 0; i < 100; i++) {
      const step = moveWorldPoint(position, goal, .01);
      expect(isInsideWorld(step.point)).toBe(true);
      expect(worldDistance(position, step.point)).toBeLessThanOrEqual(.010000001);
      total += step.distance;
      position = step.point;
    }
    expect(position.u).toBeCloseTo(goal.u, 10);
    expect(position.v).toBeCloseTo(goal.v, 10);
    expect(total).toBeCloseTo(worldDistance(start, goal), 10);
  });
  test('movement never overshoots, including zero-distance and invalid deltas', () => {
    const goal = { u: .6, v: .5 };
    expect(moveWorldPoint(WORLD_HOME, goal, 30).point).toEqual(goal);
    expect(moveWorldPoint(WORLD_HOME, WORLD_HOME, .2).arrived).toBe(true);
    expect(moveWorldPoint(WORLD_HOME, goal, NaN).distance).toBe(0);
    expect(moveWorldPoint(WORLD_HOME, goal, -.5).distance).toBe(0);
  });
});

describe('Living World priority and behaviour', () => {
  test('tap walk gets to its target with a synchronised travelling gait', () => {
    const model = createWorldModel(10);
    const goal = { u: .69, v: .42 };
    expect(setWorldTarget(model, goal)).toBe(true);
    const before = model.gait;
    run(model, .4);
    expect(model.gait).not.toEqual(before);
    expect(worldFrame(model).pose).toBe('walk');
    run(model, 2);
    expect(model.position.u).toBeCloseTo(goal.u, 10);
    expect(model.position.v).toBeCloseTo(goal.v, 10);
    expect(model.mode).toBe('idle');
  });
  test('facing reverses through a short turn before movement', () => {
    const model = createWorldModel(1);
    setWorldTarget(model, { u: .26, v: .55 });
    expect(model.mode).toBe('turn');
    expect(model.direction).toBe('left');
    run(model, .15);
    expect(model.position).toEqual(WORLD_HOME);
    expect(worldFrame(model).phase).toBeGreaterThan(.3);
    expect(worldFrame(model).phase).toBeLessThan(.7);
    run(model, .3);
    expect(model.mode).toBe('walk');
    expect(model.position.u).toBeLessThan(WORLD_HOME.u);
  });
  test('fast repeated taps only keep the newest bounded goal', () => {
    const model = createWorldModel(1);
    for (let i = 0; i < 1000; i++) setWorldTarget(model, { u: i % 2 ? -5 : 5, v: i / 100 });
    expect(isInsideWorld(model.target!)).toBe(true);
    for (let i = 0; i < 600; i++) { stepWorld(model, 1 / 60, false); expect(isInsideWorld(model.position)).toBe(true); }
  });
  test('feeding cancels walking, reaches food, pecks, then returns to idle', () => {
    const model = createWorldModel(1);
    setWorldTarget(model, { u: .23, v: .4 });
    startWorldCare(model, 'feed');
    expect(model.mode).toBe('feed');
    expect(setWorldTarget(model, { u: .2, v: .5 })).toBe(false);
    run(model, 1.1);
    expect(model.position).toEqual(WORLD_FOOD);
    expect(worldFrame(model).pose).toBe('feed');
    run(model, 2.3);
    expect(model.mode).toBe('idle');
  });
  test('play overrides food and cannot be interrupted by a ground or bird tap', () => {
    const model = createWorldModel(1);
    startWorldCare(model, 'feed');
    startWorldCare(model, 'play');
    expect(model.target).toBeNull();
    expect(model.mode).toBe('play');
    expect(setWorldTarget(model, WORLD_FOOD)).toBe(false);
    expect(greetWorldChick(model)).toBe(false);
    run(model, 2);
    expect(model.mode).toBe('idle');
  });
  test.each(['walk', 'feed', 'play'] as const)('server sleep overrides %s with no displacement or local reward', action => {
    const model = createWorldModel(1);
    if (action === 'walk') setWorldTarget(model, WORLD_FOOD);
    else startWorldCare(model, action);
    const position = { ...model.position };
    run(model, 10, true);
    expect(model.mode).toBe('sleep');
    expect(model.position).toEqual(position);
    expect(model.target).toBeNull();
    expect(startWorldCare(model, 'feed')).toBe(false);
    expect(setWorldTarget(model, WORLD_FOOD)).toBe(false);
    expect(greetWorldChick(model)).toBe(false);
    expect(Object.keys(model)).not.toContain('feathers');
  });
  test('wake only starts after authoritative sleep ends', () => {
    const model = createWorldModel(1);
    run(model, 1, true);
    const next = stepWorld(model, 0, false);
    expect(next.pose).toBe('wake');
    expect(setWorldTarget(model, WORLD_FOOD)).toBe(false);
    run(model, .7);
    expect(model.mode).toBe('idle');
    expect(setWorldTarget(model, WORLD_FOOD)).toBe(true);
  });
  test('growth stays anchored, yields to care/sleep and ends in idle', () => {
    const model = createWorldModel(1);
    setWorldTarget(model, WORLD_FOOD);
    expect(startWorldGrowth(model)).toBe(true);
    expect(model.target).toBeNull();
    expect(worldFrame(model).pose).toBe('grow');
    const contact = { ...model.position };
    run(model, .75);
    expect(model.position).toEqual(contact);
    expect(worldFrame(model).phase).toBeCloseTo(.5, 8);
    expect(setWorldTarget(model, WORLD_FOOD)).toBe(false);
    run(model, .8);
    expect(model.mode).toBe('idle');
    startWorldCare(model, 'feed');
    expect(startWorldGrowth(model)).toBe(false);
    stepWorld(model, 0, true);
    expect(startWorldGrowth(model)).toBe(false);
  });
  test('two-minute idle varies walk, look and preen without escaping the world', () => {
    const model = createWorldModel(worldSeed('living-chick'));
    const modes = new Set<string>();
    for (let i = 0; i < 120 * 60; i++) {
      const frame = stepWorld(model, 1 / 60, false);
      modes.add(frame.mode);
      expect(isInsideWorld(frame.position)).toBe(true);
    }
    expect(modes.has('walk')).toBe(true);
    expect(modes.has('look')).toBe(true);
    expect(modes.has('preen')).toBe(true);
    expect(worldDistance(model.position, WORLD_HOME)).toBeGreaterThan(.03);
  });
  test('local bird IDs vary idle while the same ID stays reproducible', () => {
    const first = createWorldModel(worldSeed('a'));
    const repeat = createWorldModel(worldSeed('a'));
    const another = createWorldModel(worldSeed('b'));
    run(first, 60); run(repeat, 60); run(another, 60);
    expect(first).toEqual(repeat);
    expect(first.position).not.toEqual(another.position);
  });
  test('30/60/120 Hz walking has frame-rate independent ground arrival', () => {
    const outcomes = [30, 60, 120].map(fps => {
      const model = createWorldModel(1);
      setWorldTarget(model, { u: .74, v: .61 });
      run(model, 1, false, fps);
      return model;
    });
    for (const model of outcomes) {
      expect(model.position.u).toBeCloseTo(outcomes[0].position.u, 9);
      expect(model.position.v).toBeCloseTo(outcomes[0].position.v, 9);
      expect(worldDistance(model.position, WORLD_HOME)).toBeCloseTo(.17, 9);
    }
    expect(outcomes[0].gait).toBeCloseTo(outcomes[2].gait, 6);
  });
  test('planted feet stay at the same screen point on short and large viewports', () => {
    for (const [width, birdSize] of [[320, 110], [320, 180], [430, 300]]) {
      const model = createWorldModel(1);
      setWorldTarget(model, { u: .7, v: WORLD_HOME.v });
      const initial = projectWorld(model.position);
      const spriteScale = birdSize * initial.scale / 320;
      const stride = spriteScale * (16 / .6) / (width * .78);
      const initialFoot = gaitFoot({ x: 0, y: 282 }, model.gait, 16);
      stepWorld(model, 1 / 240, false, stride);
      const moved = projectWorld(model.position);
      const planted = gaitFoot({ x: 0, y: 282 }, model.gait, 16);
      const originalScreenFoot = initial.x * width / 100 + initialFoot.x * spriteScale;
      const movedScreenFoot = moved.x * width / 100 + planted.x * spriteScale;
      expect(movedScreenFoot).toBeCloseTo(originalScreenFoot, 9);
      expect(planted.y).toEqual(282);
    }
  });
  test('a resumed hidden scene never catches up a large time gap', () => {
    const model = createWorldModel(1);
    setWorldTarget(model, WORLD_FOOD);
    stepWorld(model, 300, false);
    expect(worldDistance(model.position, WORLD_HOME)).toBeLessThanOrEqual(.008500001);
    expect(model.time).toEqual(.05);
    stepWorld(model, NaN, false);
    expect(model.time).toEqual(.05);
  });
});
