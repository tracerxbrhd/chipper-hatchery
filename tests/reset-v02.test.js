import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { resetGameV02, RESET_BOT_ID, RESET_BOT_USERNAME, RESET_RELEASE_KEY } from '../scripts/lib/reset-v02.js';
import { createGameService } from '../tgcloud/lib/service.js';
import { createSqliteStore } from '../tgcloud/lib/store.js';

const sourceSha = '0123456789abcdef0123456789abcdef01234567';
const args = (mode = 'apply') => ({ mode, releaseKey: RESET_RELEASE_KEY, sourceSha });

function resetFixture({ wrongIdentity = false, yielding = false } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE chipper_players (telegram_id INTEGER PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 0, state_json TEXT NOT NULL);
    CREATE TABLE unrelated_configuration (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO unrelated_configuration VALUES ('preserve', 'untouched');`);
  const log = [];
  let loseReceiptResponse = false;
  const before = async () => { if (yielding) await new Promise(resolve => setImmediate(resolve)); };
  const database = {
    async all(query, params = {}) { await before(); return sqlite.prepare(query).all(params); },
    async get(query, params = {}) { await before(); return sqlite.prepare(query).get(params) ?? null; },
    async run(query, params = {}) {
      await before(); log.push(query);
      const statement = sqlite.prepare(query);
      if (/\bRETURNING\b/i.test(query)) {
        const rows = statement.all(params);
        if (loseReceiptResponse && query.includes('INSERT INTO chipper_release_operations')) {
          loseReceiptResponse = false; throw new Error('response lost after atomic reset');
        }
        return { rows, rowsAffected: rows.length, lastInsertRowid: 0 };
      }
      const result = statement.run(params);
      return { rows: [], rowsAffected: result.changes, lastInsertRowid: result.lastInsertRowid };
    },
  };
  const api = { async getMe() { return { is_bot: true, id: wrongIdentity ? 123 : RESET_BOT_ID, username: RESET_BOT_USERNAME }; } };
  const options = { database, api, now: () => 1791810000000 };
  const seedOld = (id = 101) => sqlite.prepare('INSERT INTO chipper_players VALUES (?, 9, ?)').run(id, JSON.stringify({
    schemaVersion: 1,
    player: { telegramId: String(id), feathers: 100, onboardingCompleted: true, activeChickId: 'old-bird', miniGameRewardAt: 1791810000000 },
    chicks: [{ id: 'old-bird', name: 'Old', appearanceId: 'coal' }],
    eggs: [{ id: 'old-egg' }],
    attempts: [{ id: 'old-game' }],
    receipts: { 'old-operation': { rewarded: true } },
  }));
  return { sqlite, database, log, options, seedOld, loseResponse() { loseReceiptResponse = true; } };
}

describe('authorized one-time Chipper 0.2 reset on real SQLite', () => {
  it('prepare proves table/trigger capability without clearing players or inserting a receipt', async () => {
    const f = resetFixture(); f.seedOld(101); f.seedOld(202);
    const before = f.sqlite.prepare('SELECT * FROM chipper_players ORDER BY telegram_id').all();
    const result = await resetGameV02(f.options, args('prepare'));
    expect(result).toMatchObject({ mode: 'prepare', prepared: true, alreadyApplied: false, currentPlayers: 2, receipt: null });
    expect(f.sqlite.prepare('SELECT * FROM chipper_players ORDER BY telegram_id').all()).toEqual(before);
    expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM chipper_release_operations').get().n).toBe(0);
    expect(f.sqlite.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='chipper_v02_reset_once' AND type='trigger'").get().n).toBe(1);
    expect(f.sqlite.prepare('SELECT * FROM unrelated_configuration').all()).toEqual([{ key: 'preserve', value: 'untouched' }]);
    expect(f.log.some(query => query.startsWith('INSERT INTO chipper_release_operations'))).toBe(false);
  });

  it('repeated prepare remains non-destructive, then apply commits exactly one reset', async () => {
    const f = resetFixture(); f.seedOld();
    await resetGameV02(f.options, args('prepare')); await resetGameV02(f.options, args('prepare'));
    expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM chipper_players').get().n).toBe(1);
    expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM chipper_release_operations').get().n).toBe(0);
    const result = await resetGameV02(f.options, args());
    expect(result).toMatchObject({ applied: true, currentPlayers: 0, receipt: { deleted_players: 1 } });
    expect((await resetGameV02(f.options, args())).alreadyApplied).toBe(true);
    expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM chipper_release_operations').get().n).toBe(1);
  });

  it('prepare after completed reset takes no action and keeps new players', async () => {
    const f = resetFixture(); f.seedOld(); await resetGameV02(f.options, args()); f.seedOld(303);
    f.log.length = 0;
    const result = await resetGameV02(f.options, args('prepare'));
    expect(result).toMatchObject({ mode: 'prepare', prepared: false, alreadyApplied: true, currentPlayers: 1 });
    expect(f.log).toEqual([]);
  });

  it('failed trigger capability preparation leaves gameplay intact and no completed receipt', async () => {
    const f = resetFixture(); f.seedOld(); const original = f.database.run;
    f.database.run = async (query, params) => {
      if (query.startsWith('CREATE TRIGGER')) throw new Error('CREATE TRIGGER not permitted by runtime');
      return original(query, params);
    };
    await expect(resetGameV02(f.options, args('prepare'))).rejects.toThrow('CREATE TRIGGER not permitted by runtime');
    expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM chipper_players').get().n).toBe(1);
    expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM chipper_release_operations').get().n).toBe(0);
    expect(f.sqlite.prepare('SELECT * FROM unrelated_configuration').all()).toEqual([{ key: 'preserve', value: 'untouched' }]);
  });

  it('prepare rejects a foreign bot and unknown Chipper schema before any writes', async () => {
    const foreign = resetFixture({ wrongIdentity: true }); foreign.seedOld();
    await expect(resetGameV02(foreign.options, args('prepare'))).rejects.toThrow('RESET_BOT_IDENTITY_MISMATCH');
    expect(foreign.log).toEqual([]);
    const unknown = resetFixture(); unknown.seedOld(); unknown.sqlite.exec('CREATE TABLE chipper_rewards (id INTEGER PRIMARY KEY)');
    await expect(resetGameV02(unknown.options, args('prepare'))).rejects.toThrow('RESET_UNKNOWN_GAME_TABLE');
    expect(unknown.log).toEqual([]);
  });

  it('dry-run confirms target and schema without any writes or exposing player records', async () => {
    const f = resetFixture(); f.seedOld();
    const result = await resetGameV02(f.options, args('dry-run'));
    expect(result).toMatchObject({ mode: 'dry-run', appId: RESET_BOT_ID, bot: '@chipperhatcherybot', players: 1, alreadyApplied: false });
    expect(f.log).toEqual([]); expect(JSON.stringify(result)).not.toContain('old-bird');
  });

  it('rejects a different bot before reading or deleting data', async () => {
    const f = resetFixture({ wrongIdentity: true }); f.seedOld();
    await expect(resetGameV02(f.options, args())).rejects.toThrow('RESET_BOT_IDENTITY_MISMATCH');
    expect(f.log).toEqual([]);
    expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM chipper_players').get().n).toBe(1);
  });

  it('requires explicit mode, fixed release key, and an immutable source SHA for apply', async () => {
    const f = resetFixture(); f.seedOld();
    await expect(resetGameV02(f.options, {})).rejects.toThrow('RESET_MODE_REQUIRED');
    await expect(resetGameV02(f.options, { ...args(), releaseKey: 'another-release' })).rejects.toThrow('RESET_RELEASE_KEY_MISMATCH');
    await expect(resetGameV02(f.options, { ...args(), sourceSha: 'latest' })).rejects.toThrow('RESET_SOURCE_SHA_REQUIRED');
    expect(f.log).toEqual([]);
  });

  it('atomically clears every player aggregate and preserves unrelated configuration', async () => {
    const f = resetFixture(); f.seedOld(101); f.seedOld(202); f.seedOld(303);
    const result = await resetGameV02(f.options, args());
    expect(result).toMatchObject({ applied: true, alreadyApplied: false, currentPlayers: 0, receipt: { deleted_players: 3, app_id: RESET_BOT_ID, source_sha: sourceSha } });
    expect(f.sqlite.prepare('SELECT * FROM unrelated_configuration').all()).toEqual([{ key: 'preserve', value: 'untouched' }]);
    expect(f.sqlite.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='trigger'").get().n).toBe(0);
    expect(f.log.filter(query => query.startsWith('INSERT INTO chipper_release_operations'))).toHaveLength(1);
  });

  it('does not delete new users on a repeated reset or subsequent deploy', async () => {
    const f = resetFixture(); f.seedOld(); await resetGameV02(f.options, args());
    f.seedOld(404);
    const repeat = await resetGameV02(f.options, args());
    expect(repeat).toMatchObject({ applied: false, alreadyApplied: true, currentPlayers: 1 });
    expect(f.sqlite.prepare('SELECT telegram_id FROM chipper_players').get().telegram_id).toBe(404);
    expect(f.log.filter(query => query.startsWith('INSERT INTO chipper_release_operations'))).toHaveLength(1);
  });

  it('recovers a lost post-commit response without deleting newly created users', async () => {
    const f = resetFixture(); f.seedOld(); f.loseResponse();
    await expect(resetGameV02(f.options, args())).rejects.toThrow('response lost after atomic reset');
    expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM chipper_players').get().n).toBe(0);
    f.seedOld(404);
    const retry = await resetGameV02(f.options, args());
    expect(retry.alreadyApplied).toBe(true); expect(retry.currentPlayers).toBe(1);
    expect(f.sqlite.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='trigger'").get().n).toBe(0);
  });

  it('simultaneous reset callers commit one receipt and one deletion', async () => {
    const f = resetFixture({ yielding: true }); f.seedOld(); f.seedOld(202);
    const results = await Promise.all(Array.from({ length: 8 }, () => resetGameV02(f.options, args())));
    expect(results.filter(result => result.applied)).toHaveLength(1);
    expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM chipper_release_operations').get().n).toBe(1);
    expect(f.sqlite.prepare('SELECT deleted_players FROM chipper_release_operations').get().deleted_players).toBe(2);
  });

  it('refuses unexpected player columns before a destructive operation', async () => {
    const f = resetFixture(); f.seedOld(); f.sqlite.exec('ALTER TABLE chipper_players ADD COLUMN unknown TEXT');
    await expect(resetGameV02(f.options, args())).rejects.toThrow('RESET_SCHEMA_MISMATCH');
    expect(f.log).toEqual([]);
  });

  it('refuses delete triggers that could modify unrelated resources', async () => {
    const f = resetFixture(); f.seedOld();
    f.sqlite.exec('CREATE TRIGGER unsafe_cleanup AFTER DELETE ON chipper_players BEGIN DELETE FROM unrelated_configuration; END');
    await expect(resetGameV02(f.options, args())).rejects.toThrow('RESET_UNKNOWN_TRIGGER');
    expect(f.log).toEqual([]);
  });

  it('rejects a different existing marker schema', async () => {
    const f = resetFixture();
    f.sqlite.exec('CREATE TABLE chipper_release_operations (release_key TEXT PRIMARY KEY)');
    await expect(resetGameV02(f.options, args())).rejects.toThrow('RESET_SCHEMA_MISMATCH');
    expect(f.log).toEqual([]);
  });

  it('requires a reviewed plan when another Chipper progress table is present', async () => {
    const f = resetFixture(); f.seedOld(); f.sqlite.exec('CREATE TABLE chipper_achievements (player_id INTEGER, achievement TEXT)');
    expect((await resetGameV02(f.options, args('dry-run'))).tables).toContain('chipper_achievements');
    await expect(resetGameV02(f.options, args())).rejects.toThrow('RESET_UNKNOWN_GAME_TABLE');
    expect(f.log).toEqual([]);
  });

  it('rejects an actual foreign key on the target table', async () => {
    const f = resetFixture();
    f.sqlite.exec('DROP TABLE chipper_players; CREATE TABLE chipper_players (telegram_id INTEGER PRIMARY KEY REFERENCES unrelated_configuration(key), revision INTEGER NOT NULL DEFAULT 0, state_json TEXT NOT NULL)');
    await expect(resetGameV02(f.options, args())).rejects.toThrow('RESET_FOREIGN_KEYS_UNSUPPORTED');
    expect(f.log).toEqual([]);
  });

  it('refuses an unexpected trigger under the reset helper name', async () => {
    const f = resetFixture(); f.seedOld();
    f.sqlite.exec('CREATE TRIGGER chipper_v02_reset_once AFTER INSERT ON unrelated_configuration BEGIN DELETE FROM chipper_players; END');
    await expect(resetGameV02(f.options, args())).rejects.toThrow('RESET_TRIGGER_MISMATCH');
    expect(f.log).toEqual([]);
  });

  it('rolls back both marker and deletion when the atomic trigger statement fails', async () => {
    const f = resetFixture(); f.seedOld();
    const original = f.database.run;
    f.database.run = async (query, params) => {
      if (query.startsWith('INSERT INTO chipper_release_operations')) {
        f.sqlite.exec("CREATE TRIGGER fail_atomic_reset AFTER INSERT ON chipper_release_operations BEGIN SELECT RAISE(ABORT, 'simulated failure'); END");
      }
      return original(query, params);
    };
    await expect(resetGameV02(f.options, args())).rejects.toThrow('simulated failure');
    expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM chipper_players').get().n).toBe(1);
    expect(f.sqlite.prepare('SELECT COUNT(*) AS n FROM chipper_release_operations').get().n).toBe(0);
  });

  it('the same Telegram accounts restart onboarding, zero balances, starter egg and fresh V2 hatch', async () => {
    const f = resetFixture(); f.seedOld(101); f.seedOld(202);
    await resetGameV02(f.options, args());
    const service = createGameService({ store: createSqliteStore(f.database), now: () => 1791810000000, random: () => 0.1, id: randomUUID });
    for (const id of [101, 202]) {
      const ctx = { initData: { user: { id } } };
      const bootstrap = await service.call('bootstrap', {}, ctx);
      expect(bootstrap.ok).toBe(true);
      expect(bootstrap.state.player.feathers).toBe(0);
      expect(bootstrap.state.player.onboarding).toBe('egg');
      expect(bootstrap.state.chicks).toHaveLength(0);
      expect(bootstrap.state.egg.kind).toBe('starter');
      expect(bootstrap.state.egg.id).not.toBe('old-egg');
      const hatch = await service.call('hatchEgg', { operationId: randomUUID(), eggId: bootstrap.state.egg.id }, ctx);
      expect(hatch.ok).toBe(true);
      expect(hatch.state.chicks[0].appearanceVersion).toBe(2);
      expect(hatch.state.chicks[0].id).not.toBe('old-bird');
      const state = await createSqliteStore(f.database).read(String(id));
      expect(state.state.attempts).toHaveLength(0);
      expect(state.state.receipts['old-operation']).toBeUndefined();
      expect(state.state.player.miniGameRewardAt).toBeNull();
    }
  });
});
