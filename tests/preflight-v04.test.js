import { constants } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { fixture } from './helpers.js';
import { preflightV04, PREFLIGHT_TOWER_VERSION } from '../scripts/lib/preflight-v04.js';
import { PRESERVED_V02_RELEASE } from '../scripts/lib/preflight-v03.js';
import { createTowerState, TOWER_CONFIG } from '../tgcloud/lib/towerRules.js';

async function setup() {
  const f = fixture(); await f.initial(101); await f.initial(202);
  f.sqlite.exec(`CREATE TABLE chipper_release_operations (
    release_key TEXT PRIMARY KEY,status TEXT NOT NULL,prepared_at INTEGER NOT NULL,completed_at INTEGER,
    planned_legacy_players INTEGER NOT NULL,remaining_legacy_players INTEGER NOT NULL,
    app_id INTEGER NOT NULL,bot_username TEXT NOT NULL,source_sha TEXT NOT NULL)`);
  f.sqlite.prepare('INSERT INTO chipper_release_operations VALUES(?,?,?,?,?,?,?,?,?)').run(...Object.values(PRESERVED_V02_RELEASE));
  const api = { async getMe() { return { id: 8924974998, username: 'chipperhatcherybot', is_bot: true }; } };
  const log = [];
  const database = { async get(query, params) { log.push(query); return f.database.get(query, params); },
    async run() { throw new Error('Read-only preflight must never call run'); } };
  return { ...f, api, database, log,
    inspect(input) { return preflightV04({ database, api }, input); },
    run(actor = 101) {
      const runId = randomUUID(); const seed = 17; const checkpoint = createTowerState(seed);
      f.sqlite.prepare(`INSERT INTO chipper_tower_runs(run_id,telegram_id,revision,seed,config_version,status,verified_wave,
        checkpoint_json,created_at,expires_at,last_activity_at,start_operation_id)
        VALUES(?,?,0,?,?,'active',0,?,?,?,?,?)`).run(runId, actor, seed, TOWER_CONFIG.version, JSON.stringify(checkpoint), f.now, f.now + 86400000, f.now, randomUUID());
      return { runId, checkpoint };
    },
    restrict() {
      f.sqlite.setAuthorizer((action) => [constants.SQLITE_INSERT, constants.SQLITE_UPDATE, constants.SQLITE_DELETE,
        constants.SQLITE_CREATE_TABLE, constants.SQLITE_DROP_TABLE, constants.SQLITE_PRAGMA,
        constants.SQLITE_TRANSACTION].includes(action) ? constants.SQLITE_DENY : constants.SQLITE_OK);
    },
  };
}

async function sealed(f, { paid = false, finished = false } = {}) {
  const run = f.run(); const result = { gameId: 'nest-defense', runId: run.runId, verifiedWave: 0, score: 0, rewardAmount: 0 };
  f.sqlite.prepare(`UPDATE chipper_tower_runs SET status=?,finish_reason='retire',last_operation_id=?,last_fingerprint=?,
    checkpoint_json=?,result_json=? WHERE run_id=?`).run(finished ? 'finished' : 'settling', randomUUID(), 'safe-finish-fingerprint',
    finished ? '{}' : JSON.stringify(run.checkpoint), finished ? JSON.stringify(result) : null, run.runId);
  if (paid) {
    const owner = await f.store.read('101'); owner.state.towerReceipts = { [run.runId]: result };
    await f.store.compareAndSwap('101', owner.revision, owner.state);
  }
  return { ...run, result };
}

describe('v0.4 read-only cloud preparation against real SQLite', () => {
  it('validates current schema/indices/checkpoint and preserved ownership without any write', async () => {
    const f = await setup(); f.run();
    const playersBefore = f.sqlite.prepare('SELECT * FROM chipper_players').all();
    const runsBefore = f.sqlite.prepare('SELECT * FROM chipper_tower_runs').all();
    f.restrict(); const result = await f.inspect({ requireTowerSchema: true });
    expect(result).toMatchObject({ ready: true, appId: 8924974998, bot: '@chipperhatcherybot', players: 2, chicks: 2,
      socialSchemaReady: true, towerSchemaReady: true, towerIndicesReady: true, towerRuns: 1, towerActive: 1,
      towerSettling: 0, towerSettlingPending: 0, towerFinished: 0, towerExpired: 0,
      towerCheckpointIntegrity: true, towerPaymentFenceIntegrity: true, databaseWrites: 0, releaseReceiptUnchanged: true });
    expect(f.log.every((query) => /^(SELECT|WITH)\b/.test(query))).toBe(true);
    expect(f.sqlite.prepare('SELECT * FROM chipper_players').all()).toEqual(playersBefore);
    expect(f.sqlite.prepare('SELECT * FROM chipper_tower_runs').all()).toEqual(runsBefore);
    expect(JSON.stringify(result)).not.toMatch(/telegram_id|state_json|checkpoint_json|genes|run_id|token|Private/);
    expect(PREFLIGHT_TOWER_VERSION).toBe(TOWER_CONFIG.configVersion);
  });

  it('permits pre-migration absence but strict post-migration probe requires the additive table', async () => {
    const f = await setup(); f.sqlite.exec('DROP TABLE chipper_tower_runs'); f.restrict();
    expect(await f.inspect()).toMatchObject({ ready: true, towerSchemaReady: false, towerRuns: 0, towerIndicesReady: false });
    await expect(f.inspect({ requireTowerSchema: true })).rejects.toThrow('PREFLIGHT_TOWER_MIGRATION_REQUIRED');
  });

  it.each(['chipper_tower_start_key', 'chipper_tower_one_active', 'chipper_tower_owner_status'])('requires exact known additive index %s', async (index) => {
    const f = await setup(); f.sqlite.exec(`DROP INDEX ${index}`);
    await expect(f.inspect()).rejects.toThrow('PREFLIGHT_TOWER_INDICES_INVALID');
  });

  it('rejects same-named index that lost unique or active/settling predicate semantics', async () => {
    const f = await setup(); f.sqlite.exec('DROP INDEX chipper_tower_one_active; CREATE UNIQUE INDEX chipper_tower_one_active ON chipper_tower_runs(telegram_id)');
    await expect(f.inspect()).rejects.toThrow('PREFLIGHT_TOWER_INDICES_INVALID');
  });

  it('retains all baseline identity/receipt/social guards', async () => {
    const f = await setup(); f.api.getMe = async () => ({ id: 999, username: 'wrongbot', is_bot: true });
    await expect(f.inspect()).rejects.toThrow('PREFLIGHT_BOT_IDENTITY_MISMATCH'); expect(f.log).toEqual([]);
    f.api.getMe = async () => ({ id: 8924974998, username: 'chipperhatcherybot', is_bot: true });
    f.sqlite.exec('DROP TABLE chipper_friendships');
    await expect(f.inspect()).rejects.toThrow('PREFLIGHT_SOCIAL_MIGRATION_REQUIRED');
  });

  it.each([{ gene: 'seed', value: -1 }, { gene: 'verified_wave', value: 3 }, { gene: 'config_version', value: 'future-rules' },
    { gene: 'telegram_id', value: 999 }, { gene: 'checkpoint_json', value: 'private-invalid-json' }])('refuses corrupt row field $gene without leaking details', async ({ gene, value }) => {
    const f = await setup(); const run = f.run();
    f.sqlite.prepare(`UPDATE chipper_tower_runs SET ${gene}=? WHERE run_id=?`).run(value, run.runId);
    await expect(f.inspect()).rejects.toThrow(/PREFLIGHT_TOWER_(ROWS|CHECKPOINT)_INVALID/);
  });

  it.each([{ hp: -1 }, { hp: 99 }, { phase: 'fake' }, { tick: -5 }, { wave: 99 }, { seed: 888 }, { towers: {} }, { enemies: Array(49).fill({}) }])('refuses invalid persisted checkpoint $hp $phase $tick $wave', async (change) => {
    const f = await setup(); const run = f.run();
    f.sqlite.prepare('UPDATE chipper_tower_runs SET checkpoint_json=? WHERE run_id=?').run(JSON.stringify({ ...run.checkpoint, ...change }), run.runId);
    await expect(f.inspect()).rejects.toThrow('PREFLIGHT_TOWER_CHECKPOINT_INVALID');
  });

  it('reports unpaid settling as recoverable pending, and paid settling as consistent post-CAS recovery', async () => {
    const unpaid = await setup(); await sealed(unpaid);
    expect(await unpaid.inspect()).toMatchObject({ towerSettling: 1, towerSettlingPending: 1, towerPaymentFenceIntegrity: true });
    const paid = await setup(); await sealed(paid, { paid: true });
    expect(await paid.inspect()).toMatchObject({ towerSettling: 1, towerSettlingPending: 0, towerPaymentFenceIntegrity: true });
  });

  it.each([{ towers: [{ type: 'fake', x: 1, y: 1, level: 1, invested: 40, cooldown: 0 }] },
    { towers: Array(2).fill({ type: 'beak', x: 1, y: 1, level: 1, invested: 40, cooldown: 0 }) },
    { enemies: [{ type: 'crawler', id: 1, hp: -1, maxHp: 32, progress: 0, slowTicks: 0 }] },
    { spawn: { total: 5, remaining: 4, emitted: 0, nextTick: 0 } }])('rejects invalid checkpoint entities or spawn counters', async (change) => {
    const f = await setup(); const run = f.run();
    f.sqlite.prepare('UPDATE chipper_tower_runs SET checkpoint_json=? WHERE run_id=?').run(JSON.stringify({ ...run.checkpoint, ...change }), run.runId);
    await expect(f.inspect()).rejects.toThrow('PREFLIGHT_TOWER_CHECKPOINT_INVALID');
  });

  it('requires permanent owner fence for finished run and matching result, with compact checkpoint', async () => {
    const f = await setup(); const run = await sealed(f, { paid: true, finished: true });
    expect(await f.inspect()).toMatchObject({ towerFinished: 1, towerPaymentFenceIntegrity: true });
    f.sqlite.prepare('UPDATE chipper_tower_runs SET result_json=? WHERE run_id=?').run(JSON.stringify({ ...run.result, rewardAmount: 4 }), run.runId);
    await expect(f.inspect()).rejects.toThrow('PREFLIGHT_TOWER_PAYMENT_FENCE_INVALID');
  });

  it('detects finished-without-payment, orphan payment fence, and fence on active run', async () => {
    const missing = await setup(); await sealed(missing, { finished: true });
    await expect(missing.inspect()).rejects.toThrow('PREFLIGHT_TOWER_PAYMENT_FENCE_INVALID');
    const orphan = await setup(); const owner = await orphan.store.read('101');
    owner.state.towerReceipts = { [randomUUID()]: { runId: 'orphan' } }; await orphan.store.compareAndSwap('101', owner.revision, owner.state);
    await expect(orphan.inspect()).rejects.toThrow('PREFLIGHT_TOWER_PAYMENT_FENCE_INVALID');
    const active = await setup(); const run = active.run(); const a = await active.store.read('101');
    a.state.towerReceipts = { [run.runId]: { runId: run.runId, gameId: 'nest-defense', verifiedWave: 0, score: 0, rewardAmount: 0 } };
    await active.store.compareAndSwap('101', a.revision, a.state);
    await expect(active.inspect()).rejects.toThrow('PREFLIGHT_TOWER_PAYMENT_FENCE_INVALID');
  });

  it('SQL capability errors return fixed safe codes and invalid arguments perform no DB reads', async () => {
    const f = await setup();
    await expect(f.inspect({ requireTowerSchema: 'yes' })).rejects.toThrow('PREFLIGHT_INVALID_REQUEST');
    await expect(f.inspect({ apply: true })).rejects.toThrow('PREFLIGHT_INVALID_REQUEST'); expect(f.log).toEqual([]);
    const original = f.database.get;
    f.database.get = async (query, params) => { if (query.includes('sqlite_schema')) throw new Error('private SQL detail'); return original(query, params); };
    await expect(f.inspect()).rejects.toThrow('PREFLIGHT_SQL_TOWER_INDICES');
  });
});
