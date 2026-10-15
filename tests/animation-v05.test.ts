import { describe, expect, test } from 'vitest';
import { poseFrame } from '../src/chicks/animation';
import { buildGeometry } from '../src/chicks/geometry';
import { NEUTRAL_GENES, SHAPES, visualDetailsFor } from '../src/chicks/models';
import { COMIC_DURATIONS, createWorldModel, personalityForSeed, startWorldCare, stepWorld, type ComicMode } from '../src/world/worldEngine';
import { isInsideWorld } from '../src/world/worldMath';

const comics = Object.keys(COMIC_DURATIONS) as ComicMode[];
describe('0.5 expressive presentation and deterministic personality', () => {
  test('each comic has a distinct trajectory, recovery and finite anatomy in all ages', () => {
    for (const stage of ['baby', 'teen', 'adult'] as const) for (const legShape of SHAPES.legShape) {
      const geometry = buildGeometry({ ...NEUTRAL_GENES, legShape }, stage);
      const signatures = comics.map(pose => {
        const frames = Array.from({ length: 41 }, (_, i) => poseFrame(geometry, pose, i / 40));
        for (const frame of frames) {
          for (const value of Object.values(frame)) if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true);
          expect(frame.bodyScaleX).toBeGreaterThan(.8); expect(frame.bodyScaleY).toBeGreaterThan(.8);
          expect(frame.leftFoot.y).toBeLessThanOrEqual(282); expect(frame.rightFoot.y).toBeLessThanOrEqual(282);
        }
        const last = frames.at(-1)!;
        expect(last.bodyOffset).toBeCloseTo(0); expect(last.bodyAngle).toBeCloseTo(0);
        expect(last.bodyScaleX).toBeCloseTo(1); expect(last.bodyScaleY).toBeCloseTo(1);
        return JSON.stringify(frames.map(f => [f.headAngle, f.bodyScaleY, f.wingAngle, f.leftFoot.y]));
      });
      expect(new Set(signatures).size).toBe(comics.length);
    }
  });
  test('hop anticipates takeoff and follows with an airborne arc and squash on landing', () => {
    const g = buildGeometry(NEUTRAL_GENES, 'baby');
    const anticipation = poseFrame(g, 'play', .1), flight = poseFrame(g, 'play', .45), landing = poseFrame(g, 'play', .88);
    expect(anticipation.bodyScaleY).toBeLessThan(1); expect(anticipation.leftFoot.y).toBe(282);
    expect(flight.bodyOffset).toBeLessThan(-20); expect(flight.leftFoot.y).toBeLessThan(260);
    expect(flight.wingAngle).toBeLessThan(-40); expect(landing.bodyScaleY).toBeLessThan(1);
    expect(landing.leftFoot.y).toBe(282);
  });
  test('visible personality agrees with stable comic inclinations, including gifted identity', () => {
    const expected = { dreamer: 'stretch', nosy: 'startle', wiggler: 'shake', dandy: 'sneeze', clumsy: 'stumble' };
    for (let i = 0; i < 50; i++) {
      const bird = { id: `original-${i}`, genes: NEUTRAL_GENES, stage: 'baby' as const };
      const visual = visualDetailsFor(bird);
      expect(personalityForSeed(visual.fingerprint)).toBe(expected[visual.personality]);
      expect(visualDetailsFor({ ...bird, stage: 'adult' }).fingerprint).toBe(visual.fingerprint);
      expect(createWorldModel(visual.fingerprint).personality).toBe(personalityForSeed(visual.fingerprint));
    }
  });
  test('comic actions yield to care and server sleep and finish without authoritative progress', () => {
    for (const pose of comics) {
      const model = createWorldModel(41); model.mode = pose;
      expect(startWorldCare(model, 'feed')).toBe(true); expect(model.mode).toBe('feed');
      model.mode = pose; stepWorld(model, .05, true); expect(model.mode).toBe('sleep');
      expect(model.target).toBeNull(); expect(model.lift).toBe(0);
      const local = createWorldModel(41); local.mode = pose;
      for (let i = 0; i <= Math.ceil(COMIC_DURATIONS[pose] * 120); i++) stepWorld(local, 1 / 120, false);
      expect(local.mode).toBe('idle');
      expect(isInsideWorld(local.position)).toBe(true);
      expect(Object.keys(local)).not.toEqual(expect.arrayContaining(['feathers', 'careMilestones', 'receipts']));
    }
  });
  test('ambient behaviour exercises every comic over bounded deterministic long play', () => {
    const found = new Set<string>();
    for (let seed = 0; seed < 6; seed++) {
      const model = createWorldModel(seed);
      for (let i = 0; i < 15 * 60 * 20; i++) {
        const frame = stepWorld(model, .05, false);
        if (comics.includes(frame.mode as ComicMode)) found.add(frame.mode);
        expect(isInsideWorld(frame.position)).toBe(true);
      }
    }
    expect([...found].sort()).toEqual([...comics].sort());
  });
});
