/** Reproducible, isolated local smoke. Never connects to Telegram/cloud. */
import { performance } from 'node:perf_hooks';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fixture, operation } from '../tests/helpers.js';
import { createTowerState, generateTowerMap, applyTowerCommand, stepTower, replayTowerCheckpoint, towerStateHash } from '../tgcloud/lib/towerRules.js';

const f = fixture(); await f.initial(); let firstStart, firstFinish;
for (let index = 0; index < 100; index++) {
  f.advance(61000);
  const startRequest = operation(), start = await f.call('startFlapsRun', startRequest);
  if (!start.ok) throw new Error(start.error.code);
  f.advance(2000);
  const finishRequest = operation({ runId: start.result.runId, score: 0, endReason: 'bounds' });
  const finish = await f.call('finishFlapsRun', finishRequest);
  if (!finish.ok) throw new Error(finish.error.code);
  if (!index) { firstStart = startRequest; firstFinish = finishRequest; }
}
const aggregate = (await f.store.read('101')).state;
const aggregateBytes = Buffer.byteLength(JSON.stringify(aggregate)), beforeBalance = aggregate.player.feathers;
await f.call('startFlapsRun', firstStart); await f.call('finishFlapsRun', firstFinish);
const afterReplay = (await f.store.read('101')).state;
if (afterReplay.player.feathers !== beforeBalance || afterReplay.attempts.length !== aggregate.attempts.length || afterReplay.player.flaps.completedRuns !== 100) throw new Error('Replay regression');
for (let owner = 1001; owner <= 1100; owner++) await f.initial(owner);
const query = "SELECT telegram_id FROM chipper_players p WHERE telegram_id = :actor OR EXISTS (SELECT 1 FROM json_each(p.state_json,'$.gifts') g WHERE json_extract(g.value,'$.recipientId')=:text)";
const parameters = { ':actor': 101, ':text': '101' };
const plan = f.sqlite.prepare('EXPLAIN QUERY PLAN ' + query).all(parameters).map(row => row.detail);
const scan = [];
for (let index = 0; index < 50; index++) { const start = performance.now(); f.sqlite.prepare(query).all(parameters); scan.push(performance.now() - start); }
scan.sort((a, b) => a - b);

const seed = Math.floor(.1 * 4294967296), state = createTowerState(seed), map = generateTowerMap(seed);
const spots = [...map.buildable].sort((a, b) => {
  const coverage = cell => map.path.filter(point => (point.x - cell.x) ** 2 + (point.y - cell.y) ** 2 <= 2.45 ** 2).length;
  return coverage(b) - coverage(a);
});
const replay = []; let maxBytes = 0, totalTicks = 0, maxCommands = 0;
for (let wave = 1; wave <= 25; wave++) {
  const previous = structuredClone(state), commands = [];
  const command = value => { applyTowerCommand(state, value); commands.push(value); };
  for (const cell of spots) {
    if (state.coins < 40) break;
    if (!state.towers.some(tower => tower.x === cell.x && tower.y === cell.y)) command({ type: 'place', ...cell, towerType: 'beak' });
  }
  for (const tower of state.towers) while (tower.level < 3 && state.coins >= [28, 44][tower.level - 1]) command({ type: 'upgrade', x: tower.x, y: tower.y });
  command({ type: 'startWave' }); let ticks = 0;
  while (state.phase === 'wave' && ticks < 1200) { stepTower(state, map); ticks++; }
  if (state.completedWave !== wave) throw new Error(`Strategy could not complete wave ${wave}`);
  const start = performance.now(), verified = replayTowerCheckpoint(previous, commands, ticks);
  replay.push(performance.now() - start);
  if (towerStateHash(verified) !== towerStateHash(state)) throw new Error('Replay mismatch');
  maxBytes = Math.max(maxBytes, Buffer.byteLength(JSON.stringify(state)));
  totalTicks += ticks; maxCommands = Math.max(maxCommands, commands.length);
}
replay.sort((a, b) => a - b);
const result = {
  evidence: 'Node24 local CPU / in-memory real SQLite; synthetic records, not production-scale cloud or physical Android performance', runtime: process.version,
  flaps: { completedRuns: 100, aggregateBytes, permanentOperationReceipts: Object.keys(aggregate.receipts).length,
    retainedRecentAttempts: aggregate.attempts.length, terminalVisualPayloadsRemaining: aggregate.attempts.filter(value => value.chick).length,
    replayedOriginalStartAndFinishWithoutAdditionalEffect: true,
    limitation: 'Permanent operation receipts remain unbounded; their original start result retains the bird snapshot for exact replay.' },
  giftIncomingLookup: { players: 101, samples: 50, p50Ms: scan[25], p95Ms: scan[47], maxMs: scan[49], queryPlan: plan,
    limitation: 'Existing correlated json_each remains a scan. No production-scale claim or index migration.' },
  towerReplay: { legalWaves: 25, totalSimulatedTicks: totalTicks, samples: replay.length, p50Ms: replay[12], p95Ms: replay[23], maxMs: replay[24],
    maxCheckpointBytes: maxBytes, maxCommandsObserved: maxCommands, commandsPerBatchLimit: 64, ticksPerBatchLimit: 1200,
    limitation: 'Measured one legal seeded strategy; platform V8 CPU limit remains a live preflight check. Permanent compact claim/start fences remain unbounded; checkpoint transcripts do not enter player JSON.' },
};
const directory = process.env.CHIPPER_CAPTURE_QA === '1' ? 'DOCS/qa/0.4' : 'test-results/qa/0.4';
mkdirSync(directory, { recursive: true }); writeFileSync(`${directory}/backend-perf.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
