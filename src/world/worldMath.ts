/** Presentation-only coordinates. No world movement changes the player's save. */
export interface WorldPoint { u: number; v: number }
export interface WorldProjection { x: number; y: number; scale: number; shadowOpacity: number }

// Include the largest V2 tail/head in the margin: contact must not reach the scene edge.
export const WORLD_BOUNDS = { u: .5, v: .53, radiusU: .23, radiusV: .33 } as const;
export const WORLD_HOME: WorldPoint = { u: .5, v: .62 };
export const WORLD_FOOD: WorldPoint = { u: .64, v: .67 };

const finite = (value: number, fallback: number) => Number.isFinite(value) ? value : fallback;
export const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

export function isInsideWorld(point: WorldPoint): boolean {
  if (!Number.isFinite(point.u) || !Number.isFinite(point.v)) return false;
  const du = (point.u - WORLD_BOUNDS.u) / WORLD_BOUNDS.radiusU;
  const dv = (point.v - WORLD_BOUNDS.v) / WORLD_BOUNDS.radiusV;
  return du * du + dv * dv <= 1 + 1e-10;
}

/** An ellipse is convex: every point on a straight walk between valid goals stays inside it. */
export function boundWorldPoint(point: WorldPoint): WorldPoint {
  const du = (finite(point.u, WORLD_HOME.u) - WORLD_BOUNDS.u) / WORLD_BOUNDS.radiusU;
  const dv = (finite(point.v, WORLD_HOME.v) - WORLD_BOUNDS.v) / WORLD_BOUNDS.radiusV;
  const radius = Math.hypot(du, dv);
  const factor = radius > 1 ? 1 / radius : 1;
  return { u: WORLD_BOUNDS.u + du * factor * WORLD_BOUNDS.radiusU, v: WORLD_BOUNDS.v + dv * factor * WORLD_BOUNDS.radiusV };
}

/** Percentages share an origin for feet, shadow, props, and tap targets. */
export function projectWorld(point: WorldPoint): WorldProjection {
  const bounded = boundWorldPoint(point);
  return { x: 11 + bounded.u * 78, y: 55 + bounded.v * 31, scale: .74 + bounded.v * .28, shadowOpacity: .12 + bounded.v * .08 };
}

/** Taps outside the visible walking surface are deliberately ignored. */
export function worldPointFromPointer(x: number, y: number, width: number, height: number): WorldPoint | null {
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  const point = { u: (x / width - .11) / .78, v: (y / height - .55) / .31 };
  return isInsideWorld(point) ? point : null;
}

export function worldDistance(a: WorldPoint, b: WorldPoint): number {
  // Depth is foreshortened on the ground plane.
  return Math.hypot(b.u - a.u, (b.v - a.v) * .48);
}

export function moveWorldPoint(from: WorldPoint, to: WorldPoint, distance: number): { point: WorldPoint; distance: number; arrived: boolean } {
  const goal = boundWorldPoint(to);
  const total = worldDistance(from, goal);
  const travelled = Math.min(total, Math.max(0, finite(distance, 0)));
  const fraction = total <= 1e-8 ? 1 : travelled / total;
  return { point: boundWorldPoint({ u: from.u + (goal.u - from.u) * fraction, v: from.v + (goal.v - from.v) * fraction }), distance: travelled, arrived: total <= travelled + 1e-8 };
}

/** Hash is only used to vary local idle behaviour, never to generate persisted genes. */
export function worldSeed(id: string): number {
  let hash = 2166136261;
  for (const character of id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}
