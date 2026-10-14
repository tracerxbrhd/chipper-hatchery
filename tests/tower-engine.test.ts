import { describe, expect, it } from 'vitest';
import { advanceTower, applyTowerCommand, generateTowerMap, newTowerState, replayTowerCheckpoint, stepTower, TOWER_CONFIG, towerLevelStats, towerRewardAmount, towerStateHash, towerWaveStats } from '../src/games/tower/engine';
import { TowerCheckpointJournal } from '../src/games/tower/checkpoints';
import type { TowerCommand, TowerMap, TowerRunDTO, TowerState } from '../src/games/tower/types';

function runDto(state: TowerState, revision = 0): TowerRunDTO { return { runId: 'test-run', revision, seed: state.seed, configVersion: state.configVersion, checkpoint: structuredClone(state), status: 'active', verifiedWave: state.completedWave, startedAt: 1000, expiresAt: 86401000 }; }
function spotsByCoverage(map: TowerMap) {
  return map.buildable.toSorted((a, b) => map.path.filter(p => (p.x - b.x) ** 2 + (p.y - b.y) ** 2 <= 5).length - map.path.filter(p => (p.x - a.x) ** 2 + (p.y - a.y) ** 2 <= 5).length);
}
function purchases(state: TowerState, map: TowerMap): TowerCommand[] {
  const commands: TowerCommand[] = [], spots = spotsByCoverage(map);
  while (state.coins >= 40 && state.towers.length < spots.length) {
    const spot = spots.find(p => !state.towers.some(t => t.x === p.x && t.y === p.y))!;
    const command: TowerCommand = { type: 'place', ...spot, towerType: 'beak' }; applyTowerCommand(state, command); commands.push(command);
  }
  for (const tower of state.towers) while (tower.level < 3 && state.coins >= (tower.level === 1 ? 28 : 44)) {
    const command: TowerCommand = { type: 'upgrade', x: tower.x, y: tower.y }; applyTowerCommand(state, command); commands.push(command);
  }
  return commands;
}
function firstWave(seed = 1): TowerState {
  const state = newTowerState(seed), map = generateTowerMap(seed);
  purchases(state, map); applyTowerCommand(state, { type: 'startWave' }); return state;
}

describe('Nest Defense canonical deterministic engine', () => {
  it('uses one pure frozen integer configuration shared with verifier', () => {
    expect(TOWER_CONFIG.configVersion).toBe('nest-defense-1'); expect(TOWER_CONFIG.stepMs).toBe(50);
    expect(Object.isFrozen(TOWER_CONFIG)).toBe(true); expect(Object.isFrozen(TOWER_CONFIG.towers)).toBe(true);
    expect(Object.keys(TOWER_CONFIG.towers)).toEqual(['beak', 'seed', 'frost']); expect(Object.keys(TOWER_CONFIG.enemies)).toEqual(['crawler', 'dasher', 'brute']);
    expect(newTowerState(1)).toMatchObject({ hp: 10, coins: 120, phase: 'build', completedWave: 0 });
  });
  it('1000 seeded maps always provide continuous winding unique paths and reachable build sites', () => {
    const geometries = new Set<string>();
    for (let seed = 0; seed < 1000; seed++) {
      const map = generateTowerMap(seed), pathKeys = new Set(map.path.map(p => `${p.x},${p.y}`));
      expect(map).toEqual(generateTowerMap(seed)); expect(map.width).toBe(10); expect(map.height).toBe(14);
      expect(pathKeys.size).toBe(map.path.length); expect(map.path.length).toBeGreaterThanOrEqual(30);
      expect(map.path.length).toBeLessThanOrEqual(65); expect(map.entrance.y).toBe(0); expect(map.nest.y).toBe(13);
      let turns = 0, previousDirection = '';
      map.path.forEach((cell, index) => {
        expect(cell.x).toBeGreaterThanOrEqual(0); expect(cell.x).toBeLessThan(10); expect(cell.y).toBeGreaterThanOrEqual(0); expect(cell.y).toBeLessThan(14);
        if (!index) return; const before = map.path[index - 1], direction = `${cell.x - before.x},${cell.y - before.y}`;
        expect(Math.abs(cell.x - before.x) + Math.abs(cell.y - before.y)).toBe(1);
        if (previousDirection && direction !== previousDirection) turns++; previousDirection = direction;
      });
      expect(turns).toBeGreaterThanOrEqual(8); expect(map.buildable.length).toBeGreaterThan(30);
      for (const site of map.buildable) { expect(pathKeys.has(`${site.x},${site.y}`)).toBe(false); expect(site.x).toBeGreaterThan(0); expect(site.x).toBeLessThan(9); expect(site.y).toBeGreaterThan(0); expect(site.y).toBeLessThan(13); }
      expect(map.buildable.filter(site => map.path.slice(0, 14).some(p => Math.abs(site.x - p.x) + Math.abs(site.y - p.y) <= 2)).length).toBeGreaterThanOrEqual(5);
      for (const prop of map.obstacles) expect(pathKeys.has(`${prop.x},${prop.y}`)).toBe(false);
      geometries.add(JSON.stringify(map.path));
    }
    expect(geometries.size).toBeGreaterThan(500);
  }, 20000);
  it('seed validation refuses nonintegers and out of range values without random fallback', () => {
    for (const seed of [-1, 4294967296, 1.5, NaN, Infinity]) expect(() => generateTowerMap(seed)).toThrow();
    expect(generateTowerMap(0)).toEqual(generateTowerMap(0)); expect(generateTowerMap(4294967295).path.length).toBeGreaterThan(30);
  });
  it('path, borders, props and occupied sites cannot be purchased', () => {
    const state = newTowerState(4), map = generateTowerMap(4);
    for (const cell of [map.path[8], { x: 0, y: 3 }, { x: -1, y: 5 }, { x: 5, y: 14 }]) {
      const before = structuredClone(state); expect(() => applyTowerCommand(state, { type: 'place', ...cell, towerType: 'beak' })).toThrow(); expect(state).toEqual(before);
    }
    const cell = map.buildable[0]; applyTowerCommand(state, { type: 'place', ...cell, towerType: 'beak' });
    expect(() => applyTowerCommand(state, { type: 'place', ...cell, towerType: 'beak' })).toThrow(); expect(state.coins).toBe(80);
  });
  it('two upgrades, three distinct tower profiles and 65% sale cannot generate coins', () => {
    for (const type of ['beak', 'seed', 'frost'] as const) {
      const state = newTowerState(7), cell = generateTowerMap(7).buildable[0]; state.coins = 500;
      applyTowerCommand(state, { type: 'place', ...cell, towerType: type });
      const first = towerLevelStats(type, 1); applyTowerCommand(state, { type: 'upgrade', ...cell }); applyTowerCommand(state, { type: 'upgrade', ...cell });
      expect(state.towers[0].level).toBe(3); expect(towerLevelStats(type, 3).damage).toBeGreaterThan(first.damage);
      expect(() => applyTowerCommand(state, { type: 'upgrade', ...cell })).toThrow();
      const invested = state.towers[0].invested; applyTowerCommand(state, { type: 'sell', ...cell });
      expect(state.coins).toBe(500 - invested + Math.floor(invested * .65)); expect(state.coins).toBeLessThan(500); expect(state.towers).toHaveLength(0);
    }
    expect(towerLevelStats('seed').splash).toBeGreaterThan(0); expect(towerLevelStats('frost').slow).toBeGreaterThan(0); expect(towerLevelStats('beak').splash).toBe(0);
  });
  it('rejects insufficient funds, unknown commands/fields and all in-wave construction', () => {
    const state = newTowerState(5), cell = generateTowerMap(5).buildable[0]; state.coins = 0;
    for (const command of [{ type: 'place', ...cell, towerType: 'beak' }, { type: 'setHp', hp: 999 }, { type: 'startWave', wave: 999 }, { type: 'place', ...cell, towerType: 'laser' }]) expect(() => applyTowerCommand(state, command)).toThrow();
    expect(state.coins).toBe(0); applyTowerCommand(state, { type: 'startWave' });
    for (const type of ['place', 'upgrade', 'sell', 'startWave']) expect(() => applyTowerCommand(state, { type, ...cell, towerType: 'beak' })).toThrow();
  });
  it('30/60/120 Hz advance exactly the same 50 ms battle steps', () => {
    const states = [30, 60, 120].map(fps => {
      const state = firstWave(3), map = generateTowerMap(3); let accumulator = 0;
      for (let frame = 0; frame < fps * 4; frame++) { const advanced = advanceTower(state, accumulator, 1000 / fps, map); accumulator = advanced.accumulator; }
      return state;
    });
    expect(states[0]).toEqual(states[1]); expect(states[1]).toEqual(states[2]); expect(states[0].tick).toBe(80);
    for (const delta of [NaN, Infinity, -1]) expect(advanceTower(structuredClone(states[0]), 0, delta).steps).toBe(0);
    expect(advanceTower(firstWave(), 0, 30000).steps).toBe(2);
  });
  it('no build/defeat ticks and no hidden-clock catchup means paused nests do not lose health', () => {
    const state = newTowerState(1); const before = structuredClone(state); stepTower(state); expect(state).toEqual(before);
    applyTowerCommand(state, { type: 'startWave' }); const start = structuredClone(state); expect(advanceTower(state, 0, 0).steps).toBe(0); expect(state).toEqual(start);
    state.phase = 'defeat'; const dead = structuredClone(state); stepTower(state); expect(state).toEqual(dead);
  });
  it('splash damages a group and slow never freezes or compounds multipliers', () => {
    const seed = 2, map = generateTowerMap(seed), state = newTowerState(seed), site = map.buildable.find(p => map.path.slice(0, 10).some(q => (p.x - q.x) ** 2 + (p.y - q.y) ** 2 <= 4))!;
    state.coins = 300; applyTowerCommand(state, { type: 'place', ...site, towerType: 'seed' });
    const closest = map.path.findIndex(p => (p.x - site.x) ** 2 + (p.y - site.y) ** 2 <= 4);
    state.phase = 'wave'; state.wave = 3; state.spawn.remaining = 0;
    state.enemies = [1, 2].map(id => ({ id, type: 'crawler' as const, hp: 100, maxHp: 100, progress: closest * 1000 + id * 30, slowTicks: 0 }));
    stepTower(state, map); expect(state.enemies[0].hp).toBeLessThan(100); expect(state.enemies[1].hp).toBeLessThan(100);
    state.towers[0].type = 'frost'; state.towers[0].cooldown = 0; stepTower(state, map);
    const slowed = state.enemies.find(enemy => enemy.slowTicks > 0)!; expect(slowed).toBeDefined();
    const progress = slowed.progress; stepTower(state, map); expect(slowed.progress).toBeGreaterThan(progress); expect(slowed.progress - progress).toBeLessThan(TOWER_CONFIG.enemies.crawler.speed + 1);
  });
  it('defeated current wave never becomes completed or rewards a client wave', () => {
    const state = newTowerState(1), map = generateTowerMap(1); state.completedWave = 2; state.wave = 3; state.phase = 'wave'; state.hp = 1;
    state.spawn.remaining = 0; state.enemies = [{ id: 1, type: 'brute', hp: 100, maxHp: 100, progress: (map.path.length - 1) * 1000 - 1, slowTicks: 0 }];
    stepTower(state, map); expect(state.hp).toBe(0); expect(state.phase).toBe('defeat'); expect(state.completedWave).toBe(2); expect(towerRewardAmount(state.completedWave)).toBe(0);
  });
  it('ordinary greedy building reaches first ten on 20 maps, without perfect inputs or losing HP', () => {
    for (let seed = 0; seed < 20; seed++) {
      const state = newTowerState(seed), map = generateTowerMap(seed);
      for (let wave = 0; wave < 10; wave++) {
        purchases(state, map); applyTowerCommand(state, { type: 'startWave' }); let ticks = 0;
        while (state.phase === 'wave' && ticks++ < 1200) stepTower(state, map);
        expect(state.phase).toBe('build'); expect(state.completedWave).toBe(wave + 1); expect(state.hp).toBe(10);
      }
    }
  });
  it('canonical checkpoint replay proves 25 full waves and every reward tier from actual combat', () => {
    let verified = newTowerState(429496729); const played = structuredClone(verified), map = generateTowerMap(played.seed);
    for (let wave = 1; wave <= 25; wave++) {
      const commands = purchases(played, map); commands.push({ type: 'startWave' }); applyTowerCommand(played, { type: 'startWave' });
      let ticks = 0; while (played.phase === 'wave' && ticks < 1200) { stepTower(played, map); ticks++; }
      const result = replayTowerCheckpoint(verified, commands, ticks) as TowerState;
      expect(result).toEqual(played); expect(towerStateHash(result)).toBe(towerStateHash(played)); expect(verified.completedWave).toBe(wave - 1);
      expect(result.completedWave).toBe(wave); verified = result;
      expect(towerRewardAmount(wave)).toBe(wave >= 25 ? 4 : wave >= 15 ? 3 : wave >= 8 ? 2 : wave >= 3 ? 1 : 0);
    }
    expect(verified.hp).toBe(10); expect(verified.completedWave).toBe(25); expect(verified.tick).toBe(6752);
  });
  it('rejected checkpoints never partially mutate authoritative state', () => {
    const state = newTowerState(1), cell = generateTowerMap(1).buildable[0], before = structuredClone(state);
    expect(() => replayTowerCheckpoint(state, [{ type: 'place', ...cell, towerType: 'beak' }, { type: 'sell', x: 999, y: 0 }], 0)).toThrow(); expect(state).toEqual(before);
    expect(() => replayTowerCheckpoint(state, [{ type: 'startWave' }], 1201)).toThrow(); expect(state).toEqual(before);
    expect(() => replayTowerCheckpoint(state, Array.from({ length: 65 }, () => ({ type: 'startWave' })), 0)).toThrow();
    expect(() => replayTowerCheckpoint(state, [], 1)).toThrow(); expect(() => replayTowerCheckpoint(state, [], .5)).toThrow();
  });
  it('waves 25/100/1000 and huge wave stats are integer safe, endless and memory bounded', () => {
    for (const wave of [25, 100, 1000, 1000000, Number.MAX_SAFE_INTEGER - 1]) {
      const stats = towerWaveStats(wave); for (const number of Object.values(stats)) expect(Number.isSafeInteger(number)).toBe(true);
      const state = newTowerState(9), map = generateTowerMap(9); state.wave = wave - 1; applyTowerCommand(state, { type: 'startWave' }); expect(state.wave).toBe(wave);
      for (let step = 0; step < 1200 && state.phase === 'wave'; step++) { stepTower(state, map); expect(state.enemies.length).toBeLessThanOrEqual(48); }
      expect(state.phase === 'wave' || state.phase === 'defeat' || state.phase === 'build').toBe(true);
      expect(Number.isSafeInteger(state.coins)).toBe(true); expect(state.coins).toBeGreaterThanOrEqual(0); expect(state.hp).toBeGreaterThanOrEqual(0);
      for (const enemy of state.enemies) for (const field of [enemy.hp, enemy.maxHp, enemy.progress, enemy.id]) expect(Number.isSafeInteger(field)).toBe(true);
      expect(JSON.stringify(state).length).toBeLessThan(32768);
    }
    expect(towerRewardAmount(1000)).toBe(4); expect(towerWaveStats(1000).hpScale).toBeGreaterThan(towerWaveStats(100).hpScale);
  });
  it('lost network acknowledgement retains exact immutable batch key/actions/ticks until restored', () => {
    const state = newTowerState(8), journal = new TowerCheckpointJournal(runDto(state)), cell = generateTowerMap(8).buildable[0];
    journal.command({ type: 'place', ...cell, towerType: 'beak' }); journal.command({ type: 'startWave' });
    const advanced = advanceTower(journal.state, 0, 100); journal.stepped(advanced.steps);
    const batch = journal.prepare(() => 'same-operation')!; expect(journal.prepare(() => 'wrong-operation')).toBe(batch);
    expect(batch.ticks).toBe(2); expect(batch.operationId).toBe('same-operation'); expect(() => journal.command({ type: 'startWave' })).toThrow();
    const server = replayTowerCheckpoint(state, batch.commands, batch.ticks) as TowerState; expect(towerStateHash(server)).toBe(batch.expectedHash);
    journal.acknowledge(runDto(server, 1)); expect(journal.pending).toBeNull(); expect(journal.hasChanges).toBe(false); expect(journal.state).toEqual(server); expect(journal.run.revision).toBe(1);
  });
  it('command journal fences the 64-command maximum before changing money or towers', () => {
    const state = newTowerState(1); state.coins = 100000;
    const map = generateTowerMap(1), journal = new TowerCheckpointJournal(runDto(state));
    for (const cell of map.buildable.slice(0, 64)) journal.command({ type: 'place', ...cell, towerType: 'beak' });
    expect(journal.unsavedCommands).toBe(64);
    const before = structuredClone(journal.state);
    expect(() => journal.command({ type: 'startWave' })).toThrow(); expect(journal.state).toEqual(before);
    const batch = journal.prepare(() => 'batch-limit')!;
    expect(batch.commands).toHaveLength(64); expect(replayTowerCheckpoint(state, batch.commands, batch.ticks)).toEqual(journal.state);
    journal.acknowledge(runDto(journal.state, 1)); journal.command({ type: 'startWave' });
    stepTower(journal.state, map); journal.stepped(1);
    expect(() => journal.command({ type: 'sell', ...map.buildable[0] })).toThrow();
  });
  it('checkpoint payload remains under 32 KiB with a full 65-tower board and capped 48 enemies', () => {
    const state = newTowerState(1), map = generateTowerMap(1); state.coins = 100000;
    for (const cell of map.buildable) { applyTowerCommand(state, { type: 'place', ...cell, towerType: 'beak' }); applyTowerCommand(state, { type: 'upgrade', ...cell }); applyTowerCommand(state, { type: 'upgrade', ...cell }); }
    state.enemies = Array.from({ length: 48 }, (_, id) => ({ id, type: 'brute', hp: 100000, maxHp: 100000, progress: 1000 * id, slowTicks: 32 }));
    expect(JSON.stringify(state).length).toBeLessThan(32768); expect(JSON.stringify(state).length).toBeLessThan(20000);
  });
});
