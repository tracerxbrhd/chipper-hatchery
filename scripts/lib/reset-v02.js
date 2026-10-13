// This module is intentionally outside tgcloud: it is never deployed. The CLI
// wrapper embeds it into one temporary local endpoint for `tgcloud run` only.
export const RESET_RELEASE_KEY = 'chipper-v0.2-clean-start';
export const RESET_BOT_ID = 8924974998;
export const RESET_BOT_USERNAME = 'chipperhatcherybot';
export const RESET_TRIGGER_NAME = 'chipper_v02_reset_once';

const markerTable = 'chipper_release_operations';
const triggerSql = `CREATE TRIGGER ${RESET_TRIGGER_NAME}
AFTER INSERT ON ${markerTable}
WHEN NEW.release_key = '${RESET_RELEASE_KEY}'
BEGIN
  DELETE FROM chipper_players;
END`;

function fail(code) { throw new Error(code); }
function normalized(sql) { return sql.replace(/\s+/g, ' ').replace(/;\s*$/, '').trim().toLowerCase(); }

async function columns(database, tableName, expected) {
  const actual = await database.all(`PRAGMA table_info(${tableName})`);
  if (actual.length !== expected.length || expected.some(([name, type, primaryKey, notNull], index) => {
    const column = actual[index];
    return column.name !== name || column.type.toUpperCase() !== type || column.pk !== primaryKey || (notNull && column.notnull !== 1);
  })) fail('RESET_SCHEMA_MISMATCH');
  const foreignKeys = await database.all(`PRAGMA foreign_key_list(${tableName})`);
  if (foreignKeys.length) fail('RESET_FOREIGN_KEYS_UNSUPPORTED');
}

const markerColumns = [
  ['release_key', 'TEXT', 1, true],
  ['completed_at', 'INTEGER', 0, true],
  ['deleted_players', 'INTEGER', 0, true],
  ['app_id', 'INTEGER', 0, true],
  ['bot_username', 'TEXT', 0, true],
  ['source_sha', 'TEXT', 0, true],
];

async function inspect(database) {
  const objects = await database.all("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE type IN ('table', 'trigger') ORDER BY name");
  const players = objects.find(object => object.name === 'chipper_players' && object.type === 'table');
  if (!players) fail('RESET_PLAYERS_TABLE_MISSING');
  await columns(database, 'chipper_players', [
    ['telegram_id', 'INTEGER', 1, false],
    ['revision', 'INTEGER', 0, true],
    ['state_json', 'TEXT', 0, true],
  ]);
  const marker = objects.find(object => object.name === markerTable && object.type === 'table');
  if (marker) await columns(database, markerTable, markerColumns);
  const triggers = objects.filter(object => object.type === 'trigger');
  for (const trigger of triggers) {
    if (trigger.name === RESET_TRIGGER_NAME) {
      if (trigger.tbl_name !== markerTable || normalized(trigger.sql) !== normalized(triggerSql)) fail('RESET_TRIGGER_MISMATCH');
    } else if (trigger.tbl_name === 'chipper_players' || trigger.tbl_name === markerTable || /\bchipper_players\b|\bchipper_release_operations\b/i.test(trigger.sql ?? '')) {
      fail('RESET_UNKNOWN_TRIGGER');
    }
  }
  // Do not return row contents or Telegram IDs. Only aggregate counts and schema
  // names are necessary to review the intended operation.
  const count = await database.get('SELECT COUNT(*) AS count FROM chipper_players');
  const receipt = marker ? await database.get(
    `SELECT release_key, completed_at, deleted_players, app_id, bot_username, source_sha FROM ${markerTable} WHERE release_key = :releaseKey`,
    { ':releaseKey': RESET_RELEASE_KEY },
  ) : null;
  if (receipt && (receipt.app_id !== RESET_BOT_ID || receipt.bot_username !== RESET_BOT_USERNAME)) fail('RESET_RECEIPT_IDENTITY_MISMATCH');
  return { count: count.count, receipt, triggerPresent: triggers.some(trigger => trigger.name === RESET_TRIGGER_NAME), tables: objects.filter(object => object.type === 'table').map(object => object.name) };
}

/** Runs only through the administrative CLI, never a deployed Mini App route. */
export async function resetGameV02({ database, api, now = Date.now }, input = {}) {
  if (!['dry-run', 'prepare', 'apply'].includes(input.mode)) fail('RESET_MODE_REQUIRED');
  if (input.releaseKey !== RESET_RELEASE_KEY) fail('RESET_RELEASE_KEY_MISMATCH');
  if (input.mode !== 'dry-run' && !/^[a-f0-9]{40}$/.test(input.sourceSha ?? '')) fail('RESET_SOURCE_SHA_REQUIRED');
  const me = await api.getMe();
  if (me.id !== RESET_BOT_ID || me.username !== RESET_BOT_USERNAME || me.is_bot !== true) fail('RESET_BOT_IDENTITY_MISMATCH');
  const identity = { appId: RESET_BOT_ID, bot: `@${RESET_BOT_USERNAME}` };
  const before = await inspect(database);
  if (input.mode === 'dry-run') return { mode: 'dry-run', ...identity, tables: before.tables, players: before.count, alreadyApplied: Boolean(before.receipt), receipt: before.receipt };
  if (before.tables.some(name => name.startsWith('chipper_') && name !== 'chipper_players' && name !== markerTable)) fail('RESET_UNKNOWN_GAME_TABLE');
  if (before.receipt) {
    if (input.mode === 'prepare') return { mode: 'prepare', ...identity, prepared: false, alreadyApplied: true, receipt: before.receipt, currentPlayers: before.count };
    // A lost post-commit response must never make a second reset delete players
    // created after the first reset. Cleaning the known temporary trigger is safe.
    if (before.triggerPresent) await database.run(`DROP TRIGGER ${RESET_TRIGGER_NAME}`);
    return { mode: 'apply', ...identity, applied: false, alreadyApplied: true, receipt: before.receipt, currentPlayers: before.count };
  }
  // Supported raw SDK SQL: no assumptions about undocumented db.transaction or
  // a made-up SQL CLI. The trigger lets the INSERT and targeted DELETE share one
  // SQLite statement transaction, including on lost responses and concurrent runs.
  await database.run(`CREATE TABLE IF NOT EXISTS ${markerTable} (
    release_key TEXT PRIMARY KEY NOT NULL,
    completed_at INTEGER NOT NULL,
    deleted_players INTEGER NOT NULL CHECK (deleted_players >= 0),
    app_id INTEGER NOT NULL,
    bot_username TEXT NOT NULL,
    source_sha TEXT NOT NULL
  )`);
  await columns(database, markerTable, markerColumns);
  await database.run(triggerSql.replace('CREATE TRIGGER', 'CREATE TRIGGER IF NOT EXISTS'));
  // Recheck an existing trigger before any deletion; IF NOT EXISTS must not hide
  // an unrelated object under the chosen name.
  const prepared = await inspect(database);
  if (input.mode === 'prepare') {
    // Capability probe before publishing V2: the exact trigger is installed but
    // never fired, so existing 0.1 saves and the release receipt remain untouched.
    return { mode: 'prepare', ...identity, prepared: !prepared.receipt, alreadyApplied: Boolean(prepared.receipt), receipt: prepared.receipt, currentPlayers: prepared.count };
  }
  const inserted = await database.run(`INSERT INTO ${markerTable}
    (release_key, completed_at, deleted_players, app_id, bot_username, source_sha)
    VALUES (:releaseKey, :completedAt, (SELECT COUNT(*) FROM chipper_players), :appId, :botUsername, :sourceSha)
    ON CONFLICT (release_key) DO NOTHING
    RETURNING release_key, completed_at, deleted_players, app_id, bot_username, source_sha`, {
    ':releaseKey': RESET_RELEASE_KEY,
    ':completedAt': now(),
    ':appId': RESET_BOT_ID,
    ':botUsername': RESET_BOT_USERNAME,
    ':sourceSha': input.sourceSha,
  });
  const after = await inspect(database);
  if (!after.receipt) fail('RESET_RECEIPT_MISSING');
  if (after.triggerPresent) await database.run(`DROP TRIGGER IF EXISTS ${RESET_TRIGGER_NAME}`);
  return { mode: 'apply', ...identity, applied: inserted.rows.length === 1, alreadyApplied: inserted.rows.length === 0, receipt: after.receipt, currentPlayers: after.count };
}
