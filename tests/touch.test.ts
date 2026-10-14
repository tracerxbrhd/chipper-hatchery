import { describe, expect, test } from 'vitest';
import { beginTouch, finishTouch, holdTouch, HOLD_MS, moveTouch } from '../src/world/touchGestures';
import { cancelWorldTouch, createWorldModel, dragWorldChick, greetWorldChick, pickupWorldChick, releaseWorldChick, startWorldCare, stepWorld, strokeWorldChick } from '../src/world/worldEngine';
import { isInsideWorld, WORLD_HOME } from '../src/world/worldMath';
import { buildGeometry } from '../src/chicks/geometry';
import { poseFrame } from '../src/chicks/animation';
import { NEUTRAL_GENES, SHAPES, type ChickPose } from '../src/chicks/models';
import { renderChickSvg } from '../src/chicks/renderer';

const point = { x: 30, y: 40 };
function run(model: ReturnType<typeof createWorldModel>, seconds: number) {
  for (let i = 0; i < Math.ceil(seconds * 120); i++) stepWorld(model, 1 / 120, false);
}

describe('Touchy Feel pointer recognizer', () => {
  test('short stationary tap is separate from 250ms stationary pickup', () => {
    const short = beginTouch(7, point, 100);
    expect(holdTouch(short, 100 + HOLD_MS - 1)).toBe(false);
    expect(finishTouch(short)).toBe('tap');
    expect(holdTouch(short, 100 + HOLD_MS)).toBe(true);
    expect(finishTouch(short)).toBe('land');
  });
  test('early body stroke permanently cancels pickup, even after a long pause', () => {
    const session = beginTouch(7, point, 100);
    expect(moveTouch(session, { x: 35, y: 40 })).toBe('hold');
    expect(moveTouch(session, { x: 30, y: 40 })).toBe('stroke');
    expect(holdTouch(session, 1000)).toBe(false);
    expect(finishTouch(session)).toBe('stroke');
  });
  test('movement after stationary hold is a carry rather than a stroke', () => {
    const session = beginTouch(7, point, 100);
    holdTouch(session, 400);
    expect(moveTouch(session, { x: 70, y: 90 })).toBe('drag');
    expect(finishTouch(session)).toBe('land');
  });
});

describe('Local actor compositor and carry spring', () => {
  test('tap reactions never immediately repeat or walk; no reward or care state exists', () => {
    const model = createWorldModel(8);
    let previous = -1;
    for (let i = 0; i < 30; i++) {
      expect(greetWorldChick(model)).toBe(true);
      expect(model.reaction).not.toBe(previous); previous = model.reaction;
      expect(model.position).toEqual(WORLD_HOME); expect(model.target).toBeNull();
      expect(model.mode).toBe('tap');
    }
    expect(Object.keys(model)).not.toEqual(expect.arrayContaining(['feathers', 'careCycles', 'miniGameRewardAt']));
  });
  test('pickup dangles above an unchanged plane then smoothly lands at one bounded owner-local point', () => {
    const model = createWorldModel(8);
    expect(pickupWorldChick(model, 38)).toBe(true);
    run(model, .25);
    expect(model.lift).toBeGreaterThan(30);
    expect(model.position).toEqual(WORLD_HOME);
    expect(dragWorldChick(model, { u: 999, v: -99 }, 60)).toBe(true);
    const immediately = { ...model.position };
    stepWorld(model, 1 / 60, false);
    expect(model.position).not.toEqual(immediately);
    for (let i = 0; i < 120; i++) { stepWorld(model, 1 / 120, false); expect(isInsideWorld(model.position)).toBe(true); }
    expect(releaseWorldChick(model)).toBe(true);
    const contact = { ...model.position };
    run(model, .5);
    expect(model.mode).toBe('idle'); expect(model.lift).toBe(0); expect(model.position).toEqual(contact);
  });
  test('server sleep interrupts lift and rejects all touch, preserving its position', () => {
    const model = createWorldModel(8);
    pickupWorldChick(model, 38); run(model, .25);
    const position = { ...model.position };
    stepWorld(model, .05, true);
    expect(model.mode).toBe('sleep'); expect(model.lift).toBe(0); expect(model.position).toEqual(position);
    expect(pickupWorldChick(model, 38)).toBe(false);
    expect(strokeWorldChick(model)).toBe(false); expect(greetWorldChick(model)).toBe(false);
  });
  test('care owns its pose; pointer cancellation immediately removes lift/inertia', () => {
    const model = createWorldModel(8);
    startWorldCare(model, 'feed');
    expect(pickupWorldChick(model, 38)).toBe(false); expect(strokeWorldChick(model)).toBe(false);
    cancelWorldTouch(model); expect(model.mode).toBe('feed');
    run(model, 4);
    pickupWorldChick(model, 38); run(model, .25);
    cancelWorldTouch(model);
    expect(model.mode).toBe('idle'); expect(model.lift).toBe(0); expect(model.velocity).toEqual({ u: 0, v: 0 });
  });
  test('damped drag remains stable at 30/60/120 Hz and malformed values remain finite', () => {
    const positions = [30, 60, 120].map(fps => {
      const model = createWorldModel(8); pickupWorldChick(model, 38);
      dragWorldChick(model, { u: .68, v: .53 }, 40);
      for (let i = 0; i < fps; i++) stepWorld(model, 1 / fps, false);
      return model.position;
    });
    for (const position of positions) { expect(position.u).toBeCloseTo(positions[0].u, 4); expect(position.v).toBeCloseTo(positions[0].v, 4); }
    const model = createWorldModel(8); pickupWorldChick(model, NaN); dragWorldChick(model, { u: Infinity, v: NaN }, Infinity);
    stepWorld(model, Infinity, false);
    expect(model.position).toEqual(WORLD_HOME); expect(model.lift).toBe(0);
  });
});

describe('Anatomy of tactile expressions', () => {
  test('all 180 head/body/leg extremes and three ages have finite held/stroke/tap/land joints', () => {
    const poses: ChickPose[] = ['held', 'stroke', 'tap', 'land', 'peck', 'yawn'];
    for (const headShape of SHAPES.headShape) for (const bodyShape of SHAPES.bodyShape) for (const legShape of SHAPES.legShape)
      for (const stage of ['baby', 'teen', 'adult'] as const) {
        const genes = { ...NEUTRAL_GENES, headShape, bodyShape, legShape };
        const geometry = buildGeometry(genes, stage);
        for (const pose of poses) for (const phase of [0, .25, .5, .75, 1]) {
          const frame = poseFrame(geometry, pose, phase, 2);
          expect(renderChickSvg({ chick: { stage, genes }, pose, phase, motion: 1 })).not.toMatch(/NaN|Infinity|undefined/);
          if (pose === 'held') {
            expect(frame.leftFoot.y - geometry.anchors.legRootLeft.y).toBeCloseTo(geometry.legLength * 1.1);
            expect(frame.leftFoot.y).toBeLessThan(320); expect(frame.rightFoot.y).toBeLessThan(320);
          } else {
            expect(frame.leftFoot.y).toBe(282); expect(frame.rightFoot.y).toBe(282);
            expect(geometry.body.center.y + geometry.body.height / 2 + frame.bodyOffset).toBeLessThanOrEqual(282);
          }
          if (pose === 'stroke') expect(frame.closedEyes).toBe(true);
        }
      }
  });
});
