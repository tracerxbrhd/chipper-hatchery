import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { createGameService } from '../tgcloud/lib/service.js';
import { createSqliteStore } from '../tgcloud/lib/store.js';

export const ctx = (id = 101) => ({ initData: { user: { id } } });
export const operation = (params = {}) => ({ ...params, operationId: randomUUID() });
export function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE chipper_players (telegram_id INTEGER PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 0, state_json TEXT NOT NULL)');
  // Additive v0.3 schema in real SQLite. Existing gameplay fixtures keep their
  // identities/data; social QA uses the same statements as the SDK adapter.
  sqlite.exec(`
    CREATE TABLE chipper_social_profiles (
      telegram_id INTEGER PRIMARY KEY, public_id TEXT NOT NULL UNIQUE,
      revision INTEGER NOT NULL DEFAULT 0, display_name TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'private', collection_visibility TEXT NOT NULL DEFAULT 'private',
      invite_token TEXT UNIQUE, share_token TEXT UNIQUE,
      receipts_json TEXT NOT NULL DEFAULT '{}', updated_at INTEGER NOT NULL
    );
    CREATE TABLE chipper_friendships (
      pair_key TEXT PRIMARY KEY, friendship_id TEXT NOT NULL UNIQUE, low_id INTEGER NOT NULL, high_id INTEGER NOT NULL,
      requested_by INTEGER NOT NULL, status TEXT NOT NULL,
      low_blocked INTEGER NOT NULL DEFAULT 0, high_blocked INTEGER NOT NULL DEFAULT 0,
      revision INTEGER NOT NULL DEFAULT 0, receipts_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE chipper_social_limits (
      key TEXT PRIMARY KEY, window_start INTEGER NOT NULL, count INTEGER NOT NULL,
      seen_json TEXT NOT NULL DEFAULT '{}'
    );
  `);
  sqlite.exec(`CREATE TABLE chipper_tower_runs (
    run_id TEXT PRIMARY KEY NOT NULL, telegram_id INTEGER NOT NULL, revision INTEGER NOT NULL DEFAULT 0,
    seed INTEGER NOT NULL, config_version TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('active','settling','finished','expired')),
    verified_wave INTEGER NOT NULL DEFAULT 0, checkpoint_json TEXT NOT NULL,
    created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, last_activity_at INTEGER NOT NULL,
    start_operation_id TEXT NOT NULL, last_operation_id TEXT, last_fingerprint TEXT, finish_reason TEXT, result_json TEXT
  );
  CREATE UNIQUE INDEX chipper_tower_start_key ON chipper_tower_runs(telegram_id,start_operation_id);
  CREATE UNIQUE INDEX chipper_tower_one_active ON chipper_tower_runs(telegram_id) WHERE status IN ('active','settling');
  CREATE INDEX chipper_tower_owner_status ON chipper_tower_runs(telegram_id,status,last_activity_at);`);
  let time = 1791810000000;
  let roll = .1;
  let failAfterCommit = false;
  const yieldRequest = () => new Promise(resolve => setImmediate(resolve));
  const database = {
    async get(sql, params) { await yieldRequest(); return sqlite.prepare(sql).get(params ?? {}) ?? null; },
    async all(sql, params) { await yieldRequest(); return sqlite.prepare(sql).all(params ?? {}); },
    async run(sql, params) {
      await yieldRequest();
      const statement = sqlite.prepare(sql);
      if (/\bRETURNING\b/i.test(sql)) {
        const rows = statement.all(params ?? {});
        if (failAfterCommit && rows.length && /UPDATE\s+chipper_players/i.test(sql)) { failAfterCommit = false; throw new Error('lost response after commit'); }
        return { rows, rowsAffected: rows.length, lastInsertRowid: 0 };
      }
      const result = statement.run(params ?? {});
      return { rows: [], rowsAffected: result.changes, lastInsertRowid: result.lastInsertRowid };
    },
  };
  const store = createSqliteStore(database);
  const service = createGameService({ store, now: () => time, random: () => roll, id: randomUUID });
  return {
    service, sqlite, store, database,
    get now() { return time; },
    advance(ms) { time += ms; },
    roll(value) { roll = value; },
    loseNextResponse() { failAfterCommit = true; },
    async call(method, params = {}, owner = 101) { return service.call(method, params, ctx(owner)); },
    async initial(owner = 101) {
      const boot = await service.call('bootstrap', {}, ctx(owner));
      if (!boot.ok) throw new Error(JSON.stringify(boot));
      const hatch = await service.call('hatchEgg', operation({ eggId: boot.state.egg.id }), ctx(owner));
      if (!hatch.ok) throw new Error(JSON.stringify(hatch));
      await service.call('completeOnboarding', operation(), ctx(owner));
      return hatch.state.chicks[0].id;
    },
    async seedFeathers(amount, owner = 101) {
      const row = await store.read(String(owner)); row.state.player.feathers = amount;
      await store.compareAndSwap(String(owner), row.revision, row.state);
    },
  };
}
