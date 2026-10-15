import { TOWER_CONFIG, stepTower, generateTowerMap, createTowerState } from '../../../tgcloud/lib/towerRules.js';
import type { TowerMap, TowerState } from './types';
export { TOWER_CONFIG, applyTowerCommand, stepTower, generateTowerMap, replayTowerCheckpoint, towerStateHash, towerRewardAmount, towerLevelStats, towerWaveStats, towerEnemyPosition } from '../../../tgcloud/lib/towerRules.js';
export function newTowerState(seed: number): TowerState { return createTowerState(seed) as TowerState; }
/** Device refresh only controls interpolation; bounded integer 50 ms ticks determine combat. */
export function advanceTower(state: TowerState, accumulator: number, deltaMs: number, map: TowerMap = generateTowerMap(state.seed)): { state: TowerState; accumulator: number; steps: number } {
  if (!Number.isFinite(deltaMs) || deltaMs < 0 || state.phase !== 'wave') return { state, accumulator: 0, steps: 0 };
  let remaining = accumulator + Math.min(deltaMs, 100), steps = 0;
  while (remaining + 1e-8 >= TOWER_CONFIG.stepMs && state.phase === 'wave') {
    stepTower(state, map); remaining -= TOWER_CONFIG.stepMs; steps++;
  }
  return { state, accumulator: state.phase === 'wave' ? Math.max(0, remaining) : 0, steps };
}
export const TOWER_BACK_EVENT = 'chipper:tower-back';
