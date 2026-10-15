import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { fixture, ctx, operation } from './helpers.js';
import { createTowerService, TOWER_LIMITS } from '../tgcloud/lib/towerService.js';
import { applyTowerCommand, generateTowerMap, stepTower, towerStateHash } from '../tgcloud/lib/towerRules.js';

export async function towerFixture() {
  const f = fixture(); await f.initial();
  let failure = null;
  const runSql = f.database.run;
  f.database.run = async (query, params) => {
    if (failure?.when === 'before' && failure.pattern.test(query)) { failure = null; throw new Error('Injected SQL interruption'); }
    const result = await runSql(query, params);
    if (failure?.when === 'after' && failure.pattern.test(query) && result.rowsAffected) { failure = null; throw new Error('Injected lost response'); }
    return result;
  };
  const options = { database: f.database, store: f.store, gameService: f.service,
    now: () => f.now, random: () => .1, id: randomUUID };
  let tower = createTowerService(options);
  return { ...f, get now() { return f.now; },
    restart() { tower = createTowerService(options); },
    fail(when, pattern) { failure = { when, pattern }; },
    async tower(method, input = {}, owner = 101) { return tower.call(method, input, ctx(owner)); },
    async start() {
      const request = operation(); const response = await tower.call('startTowerRun', request, ctx());
      expect(response.ok).toBe(true); return { request, run: response.result.run };
    },
  };
}

/** Real legal strategy, not forged HP/coins/waves. Submitted commands are the
 * same buy/upgrade/start operations available to a player. Every tick is replayed
 * by production server code, with a controlled monotonic server clock. */
export async function playWaves(f, initialRun, count) {
  let run = initialRun; const map = generateTowerMap(run.seed);
  const spots = [...map.buildable].map(cell => ({ ...cell,
    coverage: map.path.filter(point => (point.x - cell.x) ** 2 + (point.y - cell.y) ** 2 <= 2.45 ** 2).length,
  })).sort((a, b) => b.coverage - a.coverage);
  for (let wave = run.verifiedWave + 1; wave <= count; wave++) {
    const predicted = structuredClone(run.checkpoint); const commands = [];
    const command = value => { applyTowerCommand(predicted, value); commands.push(value); };
    for (const cell of spots) {
      if (predicted.coins < 40) break;
      if (!predicted.towers.some(tower => tower.x === cell.x && tower.y === cell.y)) command({ type: 'place', x: cell.x, y: cell.y, towerType: 'beak' });
    }
    for (const tower of predicted.towers) {
      while (tower.level < 3 && predicted.coins >= [28, 44][tower.level - 1]) command({ type: 'upgrade', x: tower.x, y: tower.y });
    }
    command({ type: 'startWave' }); let ticks = 0;
    while (predicted.phase === 'wave' && ticks < TOWER_LIMITS.maxTicks) { stepTower(predicted, map); ticks++; }
    expect(predicted.phase).toBe('build'); expect(predicted.completedWave).toBe(wave);
    f.advance(ticks * 50);
    const accepted = await f.tower('checkpointTowerRun', operation({ runId: run.runId, revision: run.revision,
      commands, ticks, expectedHash: towerStateHash(predicted) }));
    expect(accepted.ok, JSON.stringify(accepted)).toBe(true);
    run = accepted.result.run; expect(run.checkpoint).toEqual(predicted);
  }
  return run;
}

