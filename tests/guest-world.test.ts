import { describe, expect, it } from 'vitest';
import { createGuestWorld, pairOwnerPointFromPointer, projectPair, stepGuestWorld } from '../src/world/guestWorld';
import { createWorldModel, worldFrame } from '../src/world/worldEngine';
import { boundWorldPoint, isInsideWorld } from '../src/world/worldMath';

describe('guest local-only pair choreography', () => {
  it('F09 runs the full bounded approach/greet/look/together/apart cycle without editing host', () => {
    const owner = worldFrame(createWorldModel(12)); const before = structuredClone(owner);
    const guest = createGuestWorld(99); const phases = new Set<string>(); const poses = new Set<string>();
    for (let tick = 0; tick < 120 * 180; tick++) {
      const next = stepGuestWorld(guest, 1 / 120, owner, .05);
      phases.add(guest.phase); poses.add(next.pose);
      expect(isInsideWorld(next.position)).toBe(true);
      expect(next.lift).toBe(0);
      expect(projectPair(next.position, 'guest').x - projectPair(owner.position, 'owner').x).toBeGreaterThan(35);
    }
    expect([...phases].sort()).toEqual(['apart', 'approach', 'greet', 'idle', 'look', 'together']);
    expect(poses.has('tap')).toBe(true); expect(poses.has('walk')).toBe(true);
    expect(owner).toEqual(before);
    expect(JSON.stringify(guest)).not.toContain('feathers');
    expect(JSON.stringify(guest)).not.toContain('careMilestones');
    expect(Object.keys(guest)).toHaveLength(5);
  });
  it('F10 projected lanes never collide, including own drag at every world boundary', () => {
    for (let index = 0; index < 360; index++) {
      const angle = index * Math.PI / 180;
      const own = boundWorldPoint({ u: .5 + Math.cos(angle), v: .53 + Math.sin(angle) });
      for (const guest of [{ u: .29, v: .57 }, { u: .69, v: .57 }]) {
        expect(projectPair(guest, 'guest').x - projectPair(own, 'owner').x).toBeGreaterThan(30);
      }
    }
  });
  it('owner ground pointer mapping round-trips and guest lane never moves the own chick', () => {
    for (const [width, height] of [[320, 110], [360, 300], [430, 600]]) {
      for (const point of [{ u: .5, v: .62 }, { u: .3, v: .4 }, { u: .6, v: .3 }]) {
        const projected = projectPair(point, 'owner');
        const restored = pairOwnerPointFromPointer(projected.x * width / 100, projected.y * height / 100, width, height)!;
        expect(restored.u).toBeCloseTo(point.u, 10); expect(restored.v).toBeCloseTo(point.v, 10);
      }
      expect(pairOwnerPointFromPointer(width * .72, height * .73, width, height)).toBeNull();
    }
  });
  it('no real-time catch-up or invalid delta advances a hidden guest', () => {
    const guest = createGuestWorld(99); const own = worldFrame(createWorldModel(12));
    stepGuestWorld(guest, 10_000, own, .05); expect(guest.time).toBe(.05);
    stepGuestWorld(guest, NaN, own, .05); expect(guest.time).toBe(.05);
    stepGuestWorld(guest, -500, own, .05); expect(guest.time).toBe(.05);
  });
});
