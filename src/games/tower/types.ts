export type TowerType = 'beak' | 'seed' | 'frost';
export type EnemyType = 'crawler' | 'dasher' | 'brute';
export interface TowerCell { x: number; y: number }
export type TowerCommand = { type: 'place'; x: number; y: number; towerType: TowerType } | { type: 'upgrade' | 'sell'; x: number; y: number } | { type: 'startWave' };
export interface Tower extends TowerCell { type: TowerType; level: number; invested: number; cooldown: number; shot: { tick: number; x: number; y: number } | null }
export interface TowerEnemy { id: number; type: EnemyType; hp: number; maxHp: number; progress: number; slowTicks: number }
export interface TowerState {
  seed: number; configVersion: string; tick: number; phase: 'build' | 'wave' | 'defeat'; wave: number;
  completedWave: number; hp: number; coins: number; towers: Tower[]; enemies: TowerEnemy[];
  spawn: { total: number; remaining: number; emitted: number; nextTick: number }; nextEnemyId: number;
}
export interface TowerMap { seed: number; width: number; height: number; path: TowerCell[]; buildable: TowerCell[]; obstacles: (TowerCell & { kind: string })[]; entrance: TowerCell; nest: TowerCell }
export interface TowerRunDTO {
  runId: string; revision: number; seed: number; configVersion: string; status: 'active' | 'settling' | 'finished' | 'expired';
  verifiedWave: number; checkpoint: TowerState | null; result?: TowerGameResult; startedAt: number; expiresAt: number;
}
export interface TowerCheckpointInput {
  operationId: string; runId: string; revision: number; commands: TowerCommand[]; ticks: number; expectedHash: string;
}
export interface TowerFinishInput { operationId: string; runId: string; endReason: 'retire' | 'defeat' }
export interface TowerGameResult {
  gameId: string; score: number; verifiedWave: number; bestScore: number; previousBest: number; newBest: boolean;
  rewarded: boolean; rewardAmount: number; rewardNextAt: number | null; reason: string; runId: string;
}
export interface TowerPreferences { sound: boolean; haptics: boolean; reducedMotion: boolean }
