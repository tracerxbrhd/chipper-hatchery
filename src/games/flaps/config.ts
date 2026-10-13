/** One world coordinate system, independent of CSS pixels and display refresh rate. */
export const FLAPS_CONFIG = Object.freeze({
  configVersion: 'flaps-1',
  width: 360,
  height: 640,
  fixedStep: 1 / 60,
  gravity: 1300,
  flapVelocity: -380,
  baseSpeed: 135,
  maxSpeed: 165,
  speedPerPoint: 0.75,
  obstacleWidth: 64,
  initialGap: 184,
  minimumGap: 156,
  gapPerPoint: 0.6,
  obstacleSpacing: 232,
  firstObstacleX: 450,
  maxGapShift: 72,
  birdX: 106,
  birdStartY: 320,
  birdRadius: 14,
  ceiling: 12,
  ground: 620,
  maxFrameDelta: 0.1,
});

export type FlapsEndReason = 'crash' | 'bounds';
