import { constants } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { fixture } from './helpers.js';
import { clone } from '../tgcloud/lib/domain.js';
import { preflightV03, PRESERVED_V02_RELEASE } from '../scripts/lib/preflight-v03.js';

async function setup({ restrict = true } = {}) {
  const f = fixture(); await f.initial(101); await f.initial(202);
  f.sqlite.exec(`CREATE TABLE chipper_release_operations (
    release_key TEXT PRIMARY KEY,status TEXT NOT NULL,prepared_at INTEGER NOT NULL,completed_at INTEGER,
    planned_legacy_players INTEGER NOT NULL,remaining_legacy_players INTEGER NOT NULL,
    app_id INTEGER NOT NULL,bot_username TEXT NOT NULL,source_sha TEXT NOT NULL)`);
  f.sqlite.prepare('INSERT INTO chipper_release_operations VALUES(?,?,?,?,?,?,?,?,?)').run(...Object.values(PRESERVED_V02_RELEASE));
  const before = f.sqlite.prepare('SELECT * FROM chipper_players ORDER BY telegram_id').all();
  const receipt = f.sqlite.prepare('SELECT * FROM chipper_release_operations').all();
  if (restrict) f.sqlite.setAuthorizer((action, table) => {
    const writes = [constants.SQLITE_INSERT, constants.SQLITE_UPDATE, constants.SQLITE_DELETE,
      constants.SQLITE_CREATE_TABLE, constants.SQLITE_DROP_TABLE, constants.SQLITE_PRAGMA,
      constants.SQLITE_TRANSACTION];
    return writes.includes(action) || (action === constants.SQLITE_READ && /^sqlite_(master|schema)$/.test(table ?? ''))
      ? constants.SQLITE_DENY : constants.SQLITE_OK;
  });
  let botCalls = 0;
  const api = { async getMe() { botCalls += 1; return { id: 8924974998, username: 'chipperhatcherybot', is_bot: true }; } };
  const log = [];
  const database = { async get(query, params) { log.push(query); return f.database.get(query, params); },
    async run() { throw new Error('Read-only preflight must never call run'); } };
  return { ...f, api, database, before, receipt, log, get botCalls() { return botCalls; },
    inspect(input) { return preflightV03({ database, api }, input); } };
}

describe('v0.3 read-only preflight against actual SQLite', () => {
  it('proves JSON/MATERIALIZED compatibility and exact preserved receipt with writes/catalog denied', async () => {
    const f = await setup(); const result = await f.inspect({ requireSocialSchema: true });
    expect(result).toEqual({ ready: true, appId: 8924974998, bot: '@chipperhatcherybot', players: 2, chicks: 2,
      duplicateChickIds: 0, jsonFunctionsReady: true, materializedCteReady: true, releaseReceiptUnchanged: true,
      preservedRelease: 'chipper-v0.2-clean-start', socialSchemaReady: true, databaseWrites: 0 });
    expect(f.botCalls).toBe(1);
    expect(f.log.every((query) => /^(SELECT|WITH)\b/.test(query))).toBe(true);
    expect(f.sqlite.prepare('SELECT * FROM chipper_players ORDER BY telegram_id').all()).toEqual(f.before);
    expect(f.sqlite.prepare('SELECT * FROM chipper_release_operations').all()).toEqual(f.receipt);
    expect(JSON.stringify(result)).not.toMatch(/telegram_id|state_json|genes|display_name|receipt_json|token/);
  });

  it('refuses wrong Bot/App before every database read', async () => {
    const f = await setup(); f.api.getMe = async () => ({ id: 999, username: 'chipperhatcherybot', is_bot: true });
    await expect(f.inspect()).rejects.toThrow('PREFLIGHT_BOT_IDENTITY_MISMATCH'); expect(f.log).toEqual([]);
  });

  it('refuses duplicate authoritative bird owners', async () => {
    const f = await setup({ restrict: false }); const source = await f.store.read('101'); const target = await f.store.read('202');
    target.state.chicks.push(clone(source.state.chicks[0])); await f.store.compareAndSwap('202', target.revision, target.state);
    await expect(f.inspect()).rejects.toThrow('PREFLIGHT_DUPLICATE_CHICK_OWNER');
  });

  it('refuses duplicate chick entries in one collection as well', async () => {
    const f = await setup({ restrict: false }); const source = await f.store.read('101'); source.state.chicks.push(clone(source.state.chicks[0]));
    await f.store.compareAndSwap('101', source.revision, source.state);
    await expect(f.inspect()).rejects.toThrow('PREFLIGHT_DUPLICATE_CHICK_OWNER');
  });

  it.each(['not-json', JSON.stringify({ schemaVersion: 2, player: { telegramId: '202' }, chicks: [] }),
    JSON.stringify({ schemaVersion: 3, player: { telegramId: '101' }, chicks: [] })])('refuses malformed/foreign/unknown saved state', async (value) => {
    const f = await setup({ restrict: false }); f.sqlite.prepare('UPDATE chipper_players SET state_json=? WHERE telegram_id=101').run(value);
    await expect(f.inspect()).rejects.toThrow(/PREFLIGHT_INVALID_PLAYER_ROWS|PREFLIGHT_INVALID_OWNERSHIP/);
  });

  it('completed clean-start fence rejects legacy state without deleting it', async () => {
    const f = await setup({ restrict: false }); const source = await f.store.read('101'); source.state.schemaVersion = 1;
    await f.store.compareAndSwap('101', source.revision, source.state);
    await expect(f.inspect()).rejects.toThrow('PREFLIGHT_LEGACY_AFTER_COMPLETED_RELEASE');
    expect((await f.store.read('101')).state.schemaVersion).toBe(1);
  });

  it('refuses an active chick that is not in its owner collection', async () => {
    const f = await setup({ restrict: false }); const source = await f.store.read('101'); source.state.player.activeChickId = 'unknown';
    await f.store.compareAndSwap('101', source.revision, source.state);
    await expect(f.inspect()).rejects.toThrow('PREFLIGHT_ACTIVE_CHICK_NOT_OWNED');
  });

  it.each(Object.keys(PRESERVED_V02_RELEASE))('refuses changed immutable v0.2 receipt field %s', async (key) => {
    const f = await setup({ restrict: false });
    const changed = typeof PRESERVED_V02_RELEASE[key] === 'number' ? PRESERVED_V02_RELEASE[key] + 1 : 'altered';
    f.sqlite.prepare(`UPDATE chipper_release_operations SET ${key}=?`).run(changed);
    await expect(f.inspect()).rejects.toThrow('PREFLIGHT_V02_RECEIPT_CHANGED');
  });

  it('diagnoses absent additive social schema before migration, requires it afterward', async () => {
    const f = await setup({ restrict: false }); f.sqlite.exec('DROP TABLE chipper_friendships');
    expect((await f.inspect()).socialSchemaReady).toBe(false);
    await expect(f.inspect({ requireSocialSchema: true })).rejects.toThrow('PREFLIGHT_SOCIAL_MIGRATION_REQUIRED');
  });

  it('fails closed when MATERIALIZED syntax or JSON functions are denied', async () => {
    const f = await setup(); const original = f.database.get;
    f.database.get = async (query, params) => { if (query.includes('MATERIALIZED')) throw new Error('unsupported syntax and private details'); return original(query, params); };
    await expect(f.inspect()).rejects.toThrow('PREFLIGHT_SQL_MATERIALIZED_CTE');
    f.database.get = async () => { throw new Error('private database detail'); };
    await expect(f.inspect()).rejects.toThrow('PREFLIGHT_SQL_JSON_PROBE');
  });
});
