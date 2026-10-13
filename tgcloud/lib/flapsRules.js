/** Immutable server plausibility model for the matching client physics. */
export const FLAPS_CONFIG = Object.freeze({
  configVersion: 'flaps-1',
  width: 360, height: 640, fixedStep: 1 / 60,
  gravity: 1300, flapVelocity: -380,
  baseSpeed: 135, maxSpeed: 165, speedPerPoint: 0.75,
  obstacleWidth: 64, initialGap: 184, minimumGap: 156, gapPerPoint: 0.6,
  obstacleSpacing: 232, firstObstacleX: 450, maxGapShift: 72,
  birdX: 106, birdStartY: 320, birdRadius: 14,
  ceiling: 12, ground: 620, maxFrameDelta: 0.1,
});

/** An upper bound, not an anti-cheat claim: scores have no reward multiplier. */
export function maximumPlausibleScore(elapsedMs) {
  const distance = Math.max(0, elapsedMs) / 1000 * FLAPS_CONFIG.maxSpeed;
  const firstPassDistance = FLAPS_CONFIG.firstObstacleX + FLAPS_CONFIG.obstacleWidth - FLAPS_CONFIG.birdX + FLAPS_CONFIG.birdRadius;
  return Math.max(0, Math.floor((distance - firstPassDistance) / FLAPS_CONFIG.obstacleSpacing) + 1);
}
