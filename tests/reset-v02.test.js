import { DatabaseSync, constants } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { resetGameV02, RESET_BOT_ID, RESET_BOT_USERNAME, RESET_RELEASE_KEY } from '../scripts/lib/reset-v02.js';
import { createGameService } from '../tgcloud/lib/service.js';
import { createSqliteStore } from '../tgcloud/lib/store.js';

const sourceSha = '0123456789abcdef0123456789abcdef01234567';
const args = (mode = 'apply') => ({ mode, releaseKey: RESET_RELEASE_KEY, sourceSha });
const markerDdl = `CREATE TABLE chipper_release_operations (
  release_key TEXT PRIMARY KEY NOT NULL, status TEXT NOT NULL CHECK(status IN ('prepared', 'completed')),
  prepared_at INTEGER NOT NULL, completed_at INTEGER,
  planned_legacy_players INTEGER NOT NULL CHECK(planned_legacy_players >= 0),
  remaining_legacy_players INTEGER NOT NULL CHECK(remaining_legacy_players >= 0),
  app_id INTEGER NOT NULL, bot_username TEXT NOT NULL, source_sha TEXT NOT NULL)`;

function resetFixture({ wrongIdentity = false, yielding = false, marker = true, restricted = false, gameplayBudget = false } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE chipper_players (telegram_id INTEGER PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 0, state_json TEXT NOT NULL);
    CREATE TABLE unrelated_configuration (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO unrelated_configuration VALUES ('preserve', 'untouched');`);
  // Current gameplay requires the preserved 0.3 limits migration. The reset
  // algorithm itself remains tested against its original minimal schema.
  if (gameplayBudget) sqlite.exec("CREATE TABLE chipper_social_limits (key TEXT PRIMARY KEY, window_start INTEGER NOT NULL, count INTEGER NOT NULL, seen_json TEXT NOT NULL DEFAULT '{}')");
  if (marker) sqlite.exec(markerDdl); // Represents the supported additive migration.
  if (restricted) {
    sqlite.setAuthorizer((action, table) => {
      const denied = [constants.SQLITE_PRAGMA, constants.SQLITE_CREATE_TABLE, constants.SQLITE_CREATE_TRIGGER,
        constants.SQLITE_DROP_TABLE, constants.SQLITE_DROP_TRIGGER, constants.SQLITE_ALTER_TABLE,
        constants.SQLITE_TRANSACTION, constants.SQLITE_SAVEPOINT];
      return denied.includes(action) || (action === constants.SQLITE_READ && /^sqlite_(master|schema)$/.test(table ?? ''))
        ? constants.SQLITE_DENY : constants.SQLITE_OK;
    });
  }
  const log = [];
  let lostResponse = null;
  let failBefore = null;
  const before = async () => { if (yielding) await new Promise(resolve => setImmediate(resolve)); };
  const kind = query => query.startsWith('DELETE FROM chipper_players') ? 'delete'
    : query.startsWith('INSERT INTO chipper_release_operations') ? 'prepare'
      : query.startsWith('UPDATE chipper_release_operations') ? 'complete' : null;
  const database = {
    async get(query, params = {}) { await before(); log.push({ type: 'read', query }); return sqlite.prepare(query).get(params) ?? null; },
    async run(query, params = {}) {
      await before(); log.push({ type: 'write', query });
      const operation = kind(query);
      if (operation && failBefore === operation) { failBefore = null; throw new Error('simulated write denied before execution'); }
      const statement = sqlite.prepare(query);
      let result;
      if (/\bRETURNING\b/i.test(query)) {
        const rows = statement.all(params); result = { rows, rowsAffected: rows.length, lastInsertRowid: 0 };
      } else {
        const changed = statement.run(params); result = { rows: [], rowsAffected: changed.changes, lastInsertRowid: changed.lastInsertRowid };
      }
      if (operation && lostResponse === operation) { lostResponse = null; throw new Error('response lost after committed statement'); }
      return result;
    },
  };
  const api = { async getMe() { return { is_bot: true, id: wrongIdentity ? 123 : RESET_BOT_ID, username: RESET_BOT_USERNAME }; } };
  const options = { database, api, now: () => 1791810000000 };
  const seed = (id, state, revision = 9) => sqlite.prepare('INSERT INTO chipper_players VALUES (?, ?, ?)').run(id, revision, typeof state === 'string' ? state : JSON.stringify(state));
  const oldState = id => ({
    schemaVersion: 1,
    player: { telegramId: String(id), feathers: 100, onboardingCompleted: true, activeChickId: 'old-bird', miniGameRewardAt: 1791810000000 },
    chicks: [{ id: 'old-bird', name: 'Old', appearanceId: 'coal' }], eggs: [{ id: 'old-egg' }],
    attempts: [{ id: 'old-game' }], receipts: { 'old-operation': { rewarded: true } },
  });
  return { sqlite, database, log, options, seed, oldState,
    seedOld(id = 101) { seed(id, oldState(id)); },
    seedV2(id = 202) { seed(id, { schemaVersion: 2, player: { telegramId: String(id), feathers: 7 }, chicks: [], eggs: [], attempts: [], receipts: {} }); },
    loseResponse(operation) { lostResponse = operation; }, failBefore(operation) { failBefore = operation; },
    writes() { return log.filter(entry => entry.type === 'write'); },
    receipt() { return sqlite.prepare('SELECT * FROM chipper_release_operations WHERE release_key = ?').get(RESET_RELEASE_KEY); },
  };
}
const prepare = f => resetGameV02(f.options, args('prepare'));
const apply = f => resetGameV02(f.options, args());

describe('restricted SQL one-time Chipper 0.2 recovery on real SQLite', () => {
  it('diagnoses direct-table and JSON access without catalog, PRAGMA or DDL privileges', async () => {
    const f = resetFixture({ marker: false, restricted: true }); f.seedOld();
    expect(() => f.sqlite.prepare('SELECT name FROM sqlite_master').all()).toThrow(/prohibited|authorized/);
    expect(() => f.sqlite.prepare('PRAGMA table_info(chipper_players)').all()).toThrow(/authorized/);
    const result = await resetGameV02(f.options, args('diagnose'));
    expect(result).toMatchObject({ mode: 'diagnose', appId: RESET_BOT_ID, bot: '@chipperhatcherybot', players: 1,
      legacyPlayers: 1, currentV2Players: 0, jsonFunctionsReady: true, receiptTableReady: false, receipt: null });
    expect(f.writes()).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('old-bird');
    expect(f.log.every(entry => !/sqlite_master|sqlite_schema|PRAGMA|CREATE|DROP|BEGIN|COMMIT/i.test(entry.query))).toBe(true);
  });

  it('dry-run, prepare and apply refuse a missing additive receipt migration', async () => {
    const f = resetFixture({ marker: false }); f.seedOld();
    for (const mode of ['dry-run', 'prepare', 'apply']) await expect(resetGameV02(f.options, args(mode))).rejects.toThrow('RESET_RECEIPT_TABLE_MISSING');
    expect(f.writes()).toEqual([]);
    expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM chipper_players').get().n).toBe(1);
    const jsonDenied = resetFixture(); jsonDenied.seedOld();
    jsonDenied.sqlite.setAuthorizer((action, _table, name) => action === constants.SQLITE_FUNCTION && name?.startsWith('json_') ? constants.SQLITE_DENY : constants.SQLITE_OK);
    await expect(resetGameV02(jsonDenied.options, args('diagnose'))).rejects.toThrow('RESET_SQL_JSON_PROBE');
    expect(jsonDenied.writes()).toEqual([]);
  });

  it('diagnose and dry-run remain completely read-only when the receipt table exists', async () => {
    const f = resetFixture({ restricted: true }); f.seedOld(); f.seedV2();
    for (const mode of ['diagnose', 'dry-run']) {
      const result = await resetGameV02(f.options, args(mode));
      expect(result).toMatchObject({ players: 2, legacyPlayers: 1, currentV2Players: 1, alreadyApplied: false, receiptTableReady: true });
    }
    expect(f.writes()).toEqual([]);
    expect(f.receipt()).toBeUndefined();
  });

  it('prepare claims one fixed pending receipt and never deletes any game data', async () => {
    const f = resetFixture({ restricted: true }); f.seedOld(); f.seedOld(303); f.seedV2();
    const before = f.sqlite.prepare('SELECT * FROM chipper_players ORDER BY telegram_id').all();
    const result = await prepare(f);
    expect(result).toMatchObject({ prepared: true, alreadyApplied: false, currentPlayers: 3, receipt: {
      status: 'prepared', completed_at: null, planned_legacy_players: 2, remaining_legacy_players: 2, source_sha: sourceSha } });
    expect(f.sqlite.prepare('SELECT * FROM chipper_players ORDER BY telegram_id').all()).toEqual(before);
    expect(f.writes().every(entry => entry.query.startsWith('INSERT INTO chipper_release_operations'))).toBe(true);
  });

  it('repeated and concurrent preparations preserve the first receipt and source SHA', async () => {
    const f = resetFixture({ yielding: true }); f.seedOld();
    await Promise.all(Array.from({ length: 8 }, () => prepare(f)));
    const initial = f.receipt();
    await resetGameV02({ ...f.options, now: () => 1791810001000 }, { ...args('prepare'), sourceSha: 'f'.repeat(40) });
    expect(f.receipt()).toEqual(initial);
    expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM chipper_release_operations').get().n).toBe(1);
    expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM chipper_players').get().n).toBe(1);
  });

  it('apply requires an explicitly prepared receipt', async () => {
    const f = resetFixture(); f.seedOld();
    await expect(apply(f)).rejects.toThrow('RESET_NOT_PREPARED');
    expect(f.writes()).toEqual([]);
  });

  it('deletes only complete legacy aggregates and preserves all V2 and unrelated data', async () => {
    const f = resetFixture({ restricted: true }); f.seedOld(); f.seedOld(303); f.seedV2();
    const v2 = f.sqlite.prepare('SELECT * FROM chipper_players WHERE telegram_id = 202').get();
    await prepare(f); const result = await apply(f);
    expect(result).toMatchObject({ applied: true, alreadyApplied: false, currentPlayers: 1, legacyPlayers: 0, currentV2Players: 1,
      receipt: { status: 'completed', planned_legacy_players: 2, remaining_legacy_players: 0 } });
    expect(f.sqlite.prepare('SELECT * FROM chipper_players').all()).toEqual([v2]);
    expect(f.sqlite.prepare('SELECT * FROM unrelated_configuration').all()).toEqual([{ key: 'preserve', value: 'untouched' }]);
    expect(result.receipt).not.toHaveProperty('deleted_players');
  });

  it('supports an empty beta database without changing new-account semantics', async () => {
    const f = resetFixture({ restricted: true }); await prepare(f);
    expect(await apply(f)).toMatchObject({ applied: true, currentPlayers: 0, receipt: { planned_legacy_players: 0, status: 'completed' } });
  });

  it('completed receipts skip all writes even if a legacy row is later injected', async () => {
    const f = resetFixture(); f.seedOld(); await prepare(f); await apply(f); f.seedOld(404); f.seedV2();
    f.log.length = 0;
    for (const mode of ['prepare', 'apply']) expect(await resetGameV02(f.options, args(mode))).toMatchObject({ alreadyApplied: true, currentPlayers: 2 });
    expect(f.writes()).toEqual([]);
    expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM chipper_players').get().n).toBe(2);
  });

  it('recovers a lost prepare response through the same pending receipt', async () => {
    const f = resetFixture(); f.seedOld(); f.loseResponse('prepare');
    await expect(prepare(f)).rejects.toThrow('RESET_SQL_PREPARE_CLAIM: response lost');
    const first = f.receipt();
    expect((await prepare(f)).receipt).toEqual(first);
    expect(await apply(f)).toMatchObject({ applied: true, receipt: { planned_legacy_players: 1 } });
  });

  it('recovers a committed DELETE with a lost response while preserving V2 created afterward', async () => {
    const f = resetFixture(); f.seedOld(); await prepare(f); f.loseResponse('delete');
    await expect(apply(f)).rejects.toThrow('RESET_SQL_LEGACY_DELETE: response lost');
    expect(f.receipt().status).toBe('prepared');
    expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM chipper_players').get().n).toBe(0);
    f.seedV2(); const v2 = f.sqlite.prepare('SELECT * FROM chipper_players').get();
    expect(await apply(f)).toMatchObject({ applied: true, currentPlayers: 1, receipt: { status: 'completed', planned_legacy_players: 1 } });
    expect(f.sqlite.prepare('SELECT * FROM chipper_players').get()).toEqual(v2);
  });

  it('resumes after receipt completion is denied without repeating a destructive all-player wipe', async () => {
    const f = resetFixture(); f.seedOld(); await prepare(f); f.failBefore('complete');
    await expect(apply(f)).rejects.toThrow('RESET_SQL_COMPLETE_RECEIPT: simulated write denied');
    expect(f.receipt().status).toBe('prepared'); f.seedV2();
    expect(await apply(f)).toMatchObject({ currentV2Players: 1, receipt: { status: 'completed', remaining_legacy_players: 0 } });
  });

  it('recovers a lost completion response with no further DELETE or UPDATE', async () => {
    const f = resetFixture(); f.seedOld(); await prepare(f); f.loseResponse('complete');
    await expect(apply(f)).rejects.toThrow('RESET_SQL_COMPLETE_RECEIPT: response lost');
    expect(f.receipt().status).toBe('completed'); f.seedV2(); f.log.length = 0;
    expect(await apply(f)).toMatchObject({ applied: false, alreadyApplied: true, currentPlayers: 1 });
    expect(f.writes()).toEqual([]);
  });

  it('simultaneous apply callers complete one receipt and preserve V2 data', async () => {
    const f = resetFixture({ yielding: true, restricted: true }); f.seedOld(); f.seedOld(303); f.seedV2(); await prepare(f);
    const results = await Promise.all(Array.from({ length: 8 }, () => apply(f)));
    expect(results.filter(result => result.applied)).toHaveLength(1);
    expect(f.receipt()).toMatchObject({ status: 'completed', planned_legacy_players: 2, remaining_legacy_players: 0 });
    expect(f.sqlite.prepare('SELECT telegram_id FROM chipper_players').all()).toEqual([{ telegram_id: 202 }]);
  });

  it('keeps gameplay untouched when DELETE is denied by the actual SQLite authorizer', async () => {
    const f = resetFixture(); f.seedOld(); await prepare(f);
    f.sqlite.setAuthorizer(action => action === constants.SQLITE_DELETE ? constants.SQLITE_DENY : constants.SQLITE_OK);
    await expect(apply(f)).rejects.toThrow('RESET_SQL_LEGACY_DELETE');
    expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM chipper_players').get().n).toBe(1);
    expect(f.receipt().status).toBe('prepared');
  });

  it('diagnostic SELECT success never substitutes for INSERT capability', async () => {
    const f = resetFixture(); f.seedOld();
    expect((await resetGameV02(f.options, args('diagnose'))).receiptTableReady).toBe(true);
    f.sqlite.setAuthorizer(action => action === constants.SQLITE_INSERT ? constants.SQLITE_DENY : constants.SQLITE_OK);
    await expect(prepare(f)).rejects.toThrow('RESET_SQL_PREPARE_CLAIM');
    expect(f.receipt()).toBeUndefined();
  });

  it('rejects a foreign bot before reading or writing any database query', async () => {
    const f = resetFixture({ wrongIdentity: true }); f.seedOld();
    await expect(prepare(f)).rejects.toThrow('RESET_BOT_IDENTITY_MISMATCH');
    expect(f.log).toEqual([]);
  });

  it('requires the exact username and is_bot identity in addition to the numeric ID', async () => {
    for (const identity of [{ id: RESET_BOT_ID, username: 'otherbot', is_bot: true }, { id: RESET_BOT_ID, username: RESET_BOT_USERNAME, is_bot: false }]) {
      const f = resetFixture(); f.options.api = { async getMe() { return identity; } };
      await expect(prepare(f)).rejects.toThrow('RESET_BOT_IDENTITY_MISMATCH'); expect(f.log).toEqual([]);
    }
  });

  it('requires explicit mode, fixed release key, immutable write source SHA and valid time', async () => {
    const f = resetFixture(); f.seedOld();
    await expect(resetGameV02(f.options, {})).rejects.toThrow('RESET_MODE_REQUIRED');
    await expect(resetGameV02(f.options, { ...args(), releaseKey: 'another-release' })).rejects.toThrow('RESET_RELEASE_KEY_MISMATCH');
    await expect(resetGameV02(f.options, { ...args(), sourceSha: 'latest' })).rejects.toThrow('RESET_SOURCE_SHA_REQUIRED');
    await expect(resetGameV02({ ...f.options, now: () => NaN }, args('prepare'))).rejects.toThrow('RESET_TIME_INVALID');
    expect(f.writes()).toEqual([]);
  });

  it.each([
    ['malformed JSON', '{'],
    ['unknown version', { schemaVersion: 3, player: { telegramId: '101' } }],
    ['string version', { schemaVersion: '1', player: { telegramId: '101' } }],
    ['missing version', { player: { telegramId: '101' } }],
    ['wrong owner', { schemaVersion: 1, player: { telegramId: '999' } }],
    ['numeric owner', { schemaVersion: 1, player: { telegramId: 101 } }],
    ['missing owner', { schemaVersion: 1, player: {} }],
    ['nonobject root', []],
  ])('rejects %s before any write', async (_name, state) => {
    const f = resetFixture(); f.seed(101, state); f.seedOld(303);
    await expect(prepare(f)).rejects.toThrow('RESET_INVALID_GAME_DATA');
    expect(f.writes()).toEqual([]);
    expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM chipper_players').get().n).toBe(2);
  });

  it('rejects invalid revisions and nonpositive Telegram IDs before any write', async () => {
    for (const [id, revision] of [[101, -1], [101, 'bad'], [101, 9007199254740992], [0, 9]]) {
      const f = resetFixture(); f.seed(id, f.oldState(id), revision);
      await expect(prepare(f)).rejects.toThrow('RESET_INVALID_GAME_DATA'); expect(f.writes()).toEqual([]);
    }
  });

  it('unknown schema columns fail as an actionable receipt read error without raw DDL fallback', async () => {
    const f = resetFixture({ marker: false }); f.seedOld(); f.sqlite.exec('CREATE TABLE chipper_release_operations (release_key TEXT PRIMARY KEY)');
    await expect(prepare(f)).rejects.toThrow('RESET_SQL_RECEIPT_READ'); expect(f.writes()).toEqual([]);
    const denied = resetFixture(); denied.seedOld();
    denied.sqlite.setAuthorizer((action, table) => action === constants.SQLITE_READ && table === 'chipper_release_operations' ? constants.SQLITE_DENY : constants.SQLITE_OK);
    await expect(resetGameV02(denied.options, args('diagnose'))).rejects.toThrow('RESET_SQL_RECEIPT_READ');
    expect(denied.writes()).toEqual([]);
  });

  it('receipt identity or metadata corruption blocks further writes', async () => {
    for (const corrupt of ["app_id = 123", "source_sha = 'bad'", 'remaining_legacy_players = -1', 'remaining_legacy_players = 2', "status = 'completed', completed_at = prepared_at - 1, remaining_legacy_players = 0"]) {
      const f = resetFixture(); f.seedOld(); await prepare(f);
      if (corrupt.includes('remaining')) f.sqlite.exec('PRAGMA ignore_check_constraints = ON');
      f.sqlite.exec(`UPDATE chipper_release_operations SET ${corrupt}`); f.log.length = 0;
      await expect(apply(f)).rejects.toThrow(/RESET_RECEIPT_IDENTITY_MISMATCH|RESET_RECEIPT_INVALID/);
      expect(f.writes()).toEqual([]);
    }
  });

  it('uses the pending-status SQL fence to stop a late caller after concurrent completion', async () => {
    const f = resetFixture(); f.seedOld(); await prepare(f);
    const original = f.database.run;
    f.database.run = async (query, params) => {
      if (query.startsWith('DELETE FROM chipper_players')) {
        f.sqlite.exec('DELETE FROM chipper_players'); f.seedV2();
        f.sqlite.exec("UPDATE chipper_release_operations SET status = 'completed', completed_at = prepared_at, remaining_legacy_players = 0");
      }
      return original(query, params);
    };
    expect(await apply(f)).toMatchObject({ applied: false, alreadyApplied: true, currentV2Players: 1 });
  });

  it('refuses to complete when a legacy writer creates an old save during recovery', async () => {
    const f = resetFixture(); f.seedOld(); await prepare(f); const original = f.database.run;
    f.database.run = async (query, params) => {
      const result = await original(query, params);
      if (query.startsWith('DELETE FROM chipper_players')) f.seedOld(404);
      return result;
    };
    await expect(apply(f)).rejects.toThrow('RESET_LEGACY_PLAYERS_REMAIN');
    expect(f.receipt().status).toBe('prepared');
  });

  it('same former Telegram accounts restart onboarding, zero progress, starter egg and stable V2 hatch', async () => {
    const f = resetFixture({ restricted: true, gameplayBudget: true }); f.seedOld(); f.seedOld(303); await prepare(f); await apply(f);
    const service = createGameService({ store: createSqliteStore(f.database), now: () => 1791810000000, random: () => 0.1, id: randomUUID });
    for (const id of [101, 303]) {
      const ctx = { initData: { user: { id } } };
      const bootstrap = await service.call('bootstrap', {}, ctx);
      expect(bootstrap.ok).toBe(true);
      expect(bootstrap.state.player).toMatchObject({ feathers: 0, onboarding: 'egg', miniGameRewardAt: null, flaps: { bestScore: 0, completedRuns: 0 } });
      expect(bootstrap.state.chicks).toHaveLength(0); expect(bootstrap.state.egg.kind).toBe('starter');
      expect(bootstrap.state.egg.id).not.toBe('old-egg');
      const hatch = await service.call('hatchEgg', { operationId: randomUUID(), eggId: bootstrap.state.egg.id }, ctx);
      expect(hatch.ok).toBe(true); expect(hatch.state.chicks[0].appearanceVersion).toBe(2);
      expect(hatch.state.chicks[0].id).not.toBe('old-bird');
      const state = await createSqliteStore(f.database).read(String(id));
      expect(state.state.attempts).toHaveLength(0); expect(state.state.receipts['old-operation']).toBeUndefined();
      const beforeReplay = JSON.stringify(state);
      expect((await apply(f)).alreadyApplied).toBe(true);
      expect(JSON.stringify(await createSqliteStore(f.database).read(String(id)))).toBe(beforeReplay);
    }
  });
});
