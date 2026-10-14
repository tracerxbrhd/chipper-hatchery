import { DatabaseSync } from 'node:sqlite';
import { afterAll, describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { BALANCE, clone, reconcileState } from '../tgcloud/lib/domain.js';
import { createTowerState, generateTowerMap, TOWER_CONFIG } from '../tgcloud/lib/towerRules.js';
import { TOWER_LIMITS } from '../tgcloud/lib/towerService.js';
import { fixture, operation } from './helpers.js';

const measurements = {
  measuredAt: new Date().toISOString(),
  sourceRevision: process.env.CHIPPER_STORAGE_SHA ?? 'v0.4 working tree',
  runtime: { node: process.version, sqlite: null },
  scope: 'Local real SQLite and deterministic Node tests. Not Telegram cloud CPU, Android FPS or a production capacity claim.',
  flaps: [], giftLookup: [], compaction: null, tower: null,
};
const bytes = value => Buffer.byteLength(JSON.stringify(value), 'utf8');
function rounded(value) { return Math.round(value * 1000) / 1000; }

afterAll(() => {
  if (process.env.CHIPPER_STORAGE_CAPTURE === '1') {
    mkdirSync('DOCS/qa/0.4', { recursive: true });
    writeFileSync('DOCS/qa/0.4/storage-perf.json', `${JSON.stringify(measurements, null, 2)}\n`);
  }
});

describe('v0.4 replay-safe storage and measured local query costs', () => {
  it('measures 100/1000 real completed Flaps rounds without pruning permanent receipts', async () => {
    const f = fixture(); await f.initial();
    measurements.runtime.sqlite = f.sqlite.prepare('SELECT sqlite_version() AS version').get().version;
    const baseline = await f.store.read('101');
    const baselineBytes = bytes(baseline.state);
    const timer = performance.now();
    for (let round = 1; round <= 1000; round++) {
      f.advance(60_000);
      const started = await f.call('startFlapsRun', operation());
      expect(started.ok).toBe(true);
      f.advance(BALANCE.miniGameMinDurationMs);
      const finished = await f.call('finishFlapsRun', operation({ runId: started.result.runId, score: 0, endReason: 'bounds' }));
      expect(finished.ok).toBe(true);
      if (round === 100 || round === 1000) {
        const { state } = await f.store.read('101');
        const record = {
          completedRounds: round, aggregateBytes: bytes(state), baselineBytes,
          receipts: Object.keys(state.receipts).length, receiptBytes: bytes(state.receipts),
          retainedAttempts: state.attempts.length, attemptBytes: bytes(state.attempts),
          totalServiceCalls: 2 * round, elapsedMs: rounded(performance.now() - timer),
        };
        measurements.flaps.push(record);
        expect(record.receipts).toBe(Object.keys(baseline.state.receipts).length + 2 * round);
        // Attempt TTL can bound snapshots, but never the replay fences.
        expect(record.retainedAttempts).toBeLessThanOrEqual(11);
        expect(record.aggregateBytes).toBeGreaterThan(record.receiptBytes);
        expect(state.player.games['chippster-flaps'].completedRuns).toBe(round);
      }
    }
    expect(measurements.flaps[1].receiptBytes).toBeGreaterThan(measurements.flaps[0].receiptBytes * 9);
    f.sqlite.close();
  }, 120000);

  it('compacts expired terminal chick payload while preserving IDs/results and old/new-key replay fences', async () => {
    const f = fixture(); await f.initial();
    const startRequest = operation();
    const start = await f.call('startFlapsRun', startRequest);
    f.advance(BALANCE.miniGameMinDurationMs);
    const finishRequest = operation({ runId: start.result.runId, score: 0, endReason: 'bounds' });
    const finish = await f.call('finishFlapsRun', finishRequest);
    const before = await f.store.read('101');
    f.advance(BALANCE.miniGameAttemptTtlMs + 1);
    const compact = reconcileState(clone(before.state), f.now);
    const beforeAttempt = before.state.attempts[0], compactAttempt = compact.attempts[0];
    expect(beforeAttempt.chick).toBeTruthy();
    expect(compactAttempt.chick).toBeUndefined();
    expect(compactAttempt.id).toBe(beforeAttempt.id);
    expect(compactAttempt.chickId).toBe(beforeAttempt.chickId);
    expect(compactAttempt.result).toEqual(beforeAttempt.result);
    expect(compact.receipts).toEqual(before.state.receipts);
    const compactedRead = await f.call('getHome');
    expect(compactedRead.ok).toBe(true);
    const oldStartReplay = await f.call('startFlapsRun', startRequest);
    expect(oldStartReplay.result).toEqual(start.result);
    const oldFinishReplay = await f.call('finishFlapsRun', finishRequest);
    expect(oldFinishReplay.result).toEqual(finish.result);
    const freshKeyReplay = await f.call('finishFlapsRun', operation({ runId: start.result.runId, score: 0, endReason: 'bounds' }));
    expect(freshKeyReplay.result).toEqual(finish.result);
    expect(freshKeyReplay.state.player.feathers).toBe(1);
    expect((await f.call('finishFlapsRun', operation({ runId: start.result.runId, score: 1, endReason: 'bounds' }))).error.code).toBe('ATTEMPT_ALREADY_FINISHED');
    await f.call('startFlapsRun', operation());
    // After a fresh start prunes expired attempt bodies, permanent old receipts
    // still work and a fresh operation cannot recreate the removed run.
    expect((await f.call('finishFlapsRun', finishRequest)).state.player.feathers).toBe(1);
    const missingFresh = await f.call('finishFlapsRun', operation({ runId: start.result.runId, score: 0, endReason: 'bounds' }));
    expect(missingFresh.error.code).toBe('ATTEMPT_NOT_FOUND');
    const { state } = await f.store.read('101');
    expect(state.player.feathers).toBe(1);
    expect(state.receipts[startRequest.operationId].result.chick).toEqual(start.result.chick);
    measurements.compaction = {
      aggregateBeforeBytes: bytes(before.state), aggregateAfterBytes: bytes(compact),
      attemptBeforeBytes: bytes(beforeAttempt), attemptAfterBytes: bytes(compactAttempt),
      savedBytesPerExpiredAttempt: bytes(beforeAttempt) - bytes(compactAttempt),
      permanentReceiptsPreserved: true, terminalIdsAndResultsPreserved: true,
      oldStartAndFinishReplayPreserved: true, freshKeyCannotPayAgain: true,
      limitation: 'Permanent start receipts retain original bird snapshots; this compacts only duplicated terminal attempt visual payload, not total receipt growth.',
    };
    expect(measurements.compaction.savedBytesPerExpiredAttempt).toBeGreaterThan(0);
    f.sqlite.close();
  });

  it('records the current gift incoming JSON scan versus a test-only indexed read model for 100/1000 players', async () => {
    const f = fixture(); await f.initial();
    const base = (await f.store.read('101')).state;
    const target = '101';
    const productionQuery = `SELECT telegram_id, revision, state_json FROM chipper_players p
      WHERE telegram_id = :actorId OR EXISTS (
        SELECT 1 FROM json_each(p.state_json, '$.gifts') g
        WHERE json_extract(g.value, '$.recipientId') = :actorText
      )`;
    const indexedComparison = `SELECT telegram_id, revision, state_json FROM chipper_players
      WHERE telegram_id = :actorId OR telegram_id IN (
        SELECT sender_id FROM synthetic_gift_read_model WHERE recipient_id = :actorText
      )`;
    const params = { ':actorId': Number(target), ':actorText': target };
    for (const playerCount of [100, 1000]) {
      const sqlite = new DatabaseSync(':memory:');
      sqlite.exec(`CREATE TABLE chipper_players(telegram_id INTEGER PRIMARY KEY,revision INTEGER NOT NULL,state_json TEXT NOT NULL);
        CREATE TABLE synthetic_gift_read_model(recipient_id TEXT NOT NULL,sender_id INTEGER NOT NULL,gift_id TEXT NOT NULL,
          PRIMARY KEY(recipient_id,sender_id,gift_id));`);
      const insertPlayer = sqlite.prepare('INSERT INTO chipper_players VALUES(?,0,?)');
      const insertReadModel = sqlite.prepare('INSERT INTO synthetic_gift_read_model VALUES(?,?,?)');
      let aggregateBytes = 0;
      for (let index = 0; index < playerCount; index++) {
        const senderId = index === 0 ? 101 : 10000 + index;
        const state = clone(base);
        state.player.telegramId = String(senderId);
        state.gifts = Array.from({ length: 5 }, (_, giftIndex) => {
          const recipientId = index % 10 === 0 && giftIndex === 0 ? target : String(20000 + index);
          const giftId = `synthetic-${senderId}-${giftIndex}`;
          insertReadModel.run(recipientId, senderId, giftId);
          return { giftId, recipientId, status: 'accepted', createdAt: f.now, expiresAt: f.now + 86400000,
            completedAt: f.now, chick: { ...clone(base.chicks[0]), id: `synthetic-bird-${senderId}-${giftIndex}` } };
        });
        aggregateBytes += bytes(state);
        insertPlayer.run(senderId, JSON.stringify(state));
      }
      const current = sqlite.prepare(productionQuery), comparison = sqlite.prepare(indexedComparison);
      const expectedRows = playerCount / 10;
      expect(current.all(params).map(row => row.telegram_id).sort((a, b) => a - b))
        .toEqual(comparison.all(params).map(row => row.telegram_id).sort((a, b) => a - b));
      expect(current.all(params)).toHaveLength(expectedRows);
      function timing(statement) {
        const samples = [];
        for (let repetition = 0; repetition < 20; repetition++) {
          const started = performance.now();
          statement.all(params);
          samples.push(performance.now() - started);
        }
        samples.sort((a, b) => a - b);
        return { repetitions: samples.length, medianMs: rounded(samples[Math.floor(samples.length / 2)]), minMs: rounded(samples[0]), maxMs: rounded(samples.at(-1)) };
      }
      const record = {
        players: playerCount, giftsPerPlayer: 5, totalSyntheticAggregateBytes: aggregateBytes, averageAggregateBytes: Math.round(aggregateBytes / playerCount),
        matchingSenderRows: expectedRows, productionQuery: timing(current), indexedComparison: timing(comparison),
        productionPlan: sqlite.prepare(`EXPLAIN QUERY PLAN ${productionQuery}`).all(params).map(row => row.detail),
        indexedPlan: sqlite.prepare(`EXPLAIN QUERY PLAN ${indexedComparison}`).all(params).map(row => row.detail),
        ownerLookupPlan: sqlite.prepare('EXPLAIN QUERY PLAN SELECT revision,state_json FROM chipper_players WHERE telegram_id=:actorId').all({ ':actorId': 101 }).map(row => row.detail),
        limitation: 'Synthetic local five-entry history only. Existing production query scans player JSON. Indexed comparison is a test-only recipient read model, not a deployed migration or capacity guarantee.',
      };
      measurements.giftLookup.push(record);
      expect(record.productionPlan.some(detail => detail.includes('SCAN p'))).toBe(true);
      expect(record.ownerLookupPlan.some(detail => detail.includes('INTEGER PRIMARY KEY'))).toBe(true);
      expect(record.indexedPlan.some(detail => detail.includes('recipient_id=?'))).toBe(true);
      sqlite.close();
    }
    f.sqlite.close();
  });

  it('measures maximum-shape TD checkpoint memory without a whole transcript in player JSON', () => {
    const state = createTowerState(42);
    const map = generateTowerMap(42);
    state.towers = map.buildable.map((cell, index) => ({ ...cell, type: ['beak', 'seed', 'frost'][index % 3], level: 3,
      invested: 200, cooldown: 1, shot: { x: 2000, y: 3000, tick: 1 } }));
    state.enemies = Array.from({ length: TOWER_CONFIG.maxEnemies }, (_, index) => ({ id: index + 1, type: 'brute', hp: 99999,
      maxHp: 99999, progress: 1000, slowTicks: 0 }));
    const maximumShapeBytes = bytes(state);
    expect(maximumShapeBytes).toBeLessThan(TOWER_LIMITS.maxBytes);
    expect(TOWER_LIMITS.maxCommands).toBe(64);
    expect(TOWER_LIMITS.maxTicks).toBe(1200);
    measurements.tower = {
      initialCheckpointBytes: bytes(createTowerState(42)), maximumShapeBytes,
      allBuildableTilesOccupied: map.buildable.length, enemies: TOWER_CONFIG.maxEnemies,
      maximumAcceptedCommandBatch: TOWER_LIMITS.maxCommands, maximumAcceptedTicks: TOWER_LIMITS.maxTicks,
      maximumAcceptedBatchBytes: TOWER_LIMITS.maxBytes,
      storage: 'One compact checkpoint in separate chipper_tower_runs; terminal checkpoint cleared only after payment fence; no full action transcript in permanent player JSON.',
      limitation: 'Maximum-shape synthetic checkpoint, not a real solvable wave or cloud CPU/FPS benchmark.',
    };
  });
});
