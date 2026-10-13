// Embedded by the CLI wrapper into a temporary local module for tgcloud run.
// Never imported by deployed gameplay. Schema changes belong to tgcloud migrate.
export const RESET_RELEASE_KEY = 'chipper-v0.2-clean-start';
export const RESET_BOT_ID = 8924974998;
export const RESET_BOT_USERNAME = 'chipperhatcherybot';

const markerTable = 'chipper_release_operations';
const receiptColumns = 'release_key, status, prepared_at, completed_at, planned_legacy_players, remaining_legacy_players, app_id, bot_username, source_sha';
const legacyPredicate = "json_extract(state_json, '$.schemaVersion') = 1";
function fail(code) { throw new Error(code); }
function whole(value) { return Number.isSafeInteger(value) && value >= 0; }
async function read(database, step, query, params) {
  try { return await database.get(query, params); }
  catch (error) { throw new Error(`RESET_SQL_${step}: ${error?.message ?? 'query failed'}`); }
}
async function write(database, step, query, params) {
  try { return await database.run(query, params); }
  catch (error) { throw new Error(`RESET_SQL_${step}: ${error?.message ?? 'query failed'}`); }
}

async function receipt(database) {
  let found;
  try {
    found = await read(database, 'RECEIPT_READ', `SELECT ${receiptColumns} FROM ${markerTable} WHERE release_key = :releaseKey`, { ':releaseKey': RESET_RELEASE_KEY });
  } catch (error) {
    // A missing additive migration is diagnosable. Authorization, unknown
    // columns and every other error remain hard blockers, never permission proof.
    if (/no such table:\s*(?:main\.)?chipper_release_operations\b/i.test(error?.message ?? '')) return { missing: true, value: null };
    throw error;
  }
  if (found) {
    if (found.app_id !== RESET_BOT_ID || found.bot_username !== RESET_BOT_USERNAME) fail('RESET_RECEIPT_IDENTITY_MISMATCH');
    if (found.release_key !== RESET_RELEASE_KEY || !['prepared', 'completed'].includes(found.status)
      || !whole(found.prepared_at) || !whole(found.planned_legacy_players) || !whole(found.remaining_legacy_players)
      || found.remaining_legacy_players > found.planned_legacy_players
      || !/^[a-f0-9]{40}$/.test(found.source_sha ?? '')
      || (found.status === 'prepared' && found.completed_at !== null)
      || (found.status === 'completed' && (!whole(found.completed_at) || found.completed_at < found.prepared_at || found.remaining_legacy_players !== 0))) fail('RESET_RECEIPT_INVALID');
  }
  return { missing: false, value: found ?? null };
}

async function inspectPlayers(database) {
  // These queries return aggregate counts only. No IDs or saved game contents
  // leave the database. They explicitly exercise the required JSON functions.
  const json = await read(database, 'JSON_PROBE', `SELECT json_valid('{"schemaVersion":1}') AS valid,
    json_extract('{"schemaVersion":1}', '$.schemaVersion') AS version,
    json_type('{"schemaVersion":1}', '$.schemaVersion') AS type`);
  if (json?.valid !== 1 || json.version !== 1 || json.type !== 'integer') fail('RESET_JSON_PROBE_INVALID');
  const basic = await read(database, 'PLAYERS_READ', `SELECT COUNT(*) AS players,
    COALESCE(SUM(CASE WHEN typeof(telegram_id) != 'integer' OR telegram_id <= 0
      OR telegram_id > 9007199254740991 OR typeof(revision) != 'integer' OR revision < 0 OR revision > 9007199254740991
      OR typeof(state_json) != 'text' OR json_valid(state_json) != 1 THEN 1 ELSE 0 END), 0) AS invalidRows
    FROM chipper_players`);
  if (!whole(basic?.players) || !whole(basic?.invalidRows)) fail('RESET_QUERY_RESULT_INVALID');
  if (basic.invalidRows) fail('RESET_INVALID_GAME_DATA');
  // Never evaluate json_extract on malformed JSON. SQL missing/type mismatches
  // are counted as invalid rather than silently escaping the deletion filter.
  const versions = await read(database, 'VERSIONS_READ', `SELECT
    COALESCE(SUM(CASE WHEN json_type(state_json, '$') != 'object'
      OR COALESCE(json_type(state_json, '$.schemaVersion'), '') != 'integer'
      OR COALESCE(json_extract(state_json, '$.schemaVersion'), -1) NOT IN (1, 2)
      OR COALESCE(json_type(state_json, '$.player.telegramId'), '') != 'text'
      OR COALESCE(json_extract(state_json, '$.player.telegramId'), '') != CAST(telegram_id AS TEXT)
      THEN 1 ELSE 0 END), 0) AS invalidRows,
    COALESCE(SUM(CASE WHEN ${legacyPredicate} THEN 1 ELSE 0 END), 0) AS legacyPlayers,
    COALESCE(SUM(CASE WHEN json_extract(state_json, '$.schemaVersion') = 2 THEN 1 ELSE 0 END), 0) AS currentV2Players
    FROM chipper_players`);
  if (!whole(versions?.invalidRows) || !whole(versions?.legacyPlayers) || !whole(versions?.currentV2Players)) fail('RESET_QUERY_RESULT_INVALID');
  if (versions.invalidRows) fail('RESET_INVALID_GAME_DATA');
  return { players: basic.players, legacyPlayers: versions.legacyPlayers, currentV2Players: versions.currentV2Players };
}

/** Administrative CLI only. One logical version-fenced reset, resumable by DML.
 * DELETE and receipt completion are separate statements: we do not claim an
 * atomic multi-statement transaction. A pending receipt survives interruptions;
 * replay can only delete V1 rows, never V2 progress. A completed receipt disables
 * every subsequent DELETE, even if someone later injects a legacy row.
 */
export async function resetGameV02({ database, api, now = Date.now }, input = {}) {
  if (!['diagnose', 'dry-run', 'prepare', 'apply'].includes(input.mode)) fail('RESET_MODE_REQUIRED');
  if (input.releaseKey !== RESET_RELEASE_KEY) fail('RESET_RELEASE_KEY_MISMATCH');
  if (['prepare', 'apply'].includes(input.mode) && !/^[a-f0-9]{40}$/.test(input.sourceSha ?? '')) fail('RESET_SOURCE_SHA_REQUIRED');
  const me = await api.getMe();
  if (me.id !== RESET_BOT_ID || me.username !== RESET_BOT_USERNAME || me.is_bot !== true) fail('RESET_BOT_IDENTITY_MISMATCH');
  const identity = { appId: RESET_BOT_ID, bot: `@${RESET_BOT_USERNAME}` };
  const before = await inspectPlayers(database);
  const found = await receipt(database);
  if (input.mode === 'diagnose') return {
    mode: 'diagnose', ...identity, ...before, jsonFunctionsReady: true, receiptTableReady: !found.missing,
    alreadyApplied: found.value?.status === 'completed', receipt: found.value,
  };
  if (found.missing) fail('RESET_RECEIPT_TABLE_MISSING');
  if (input.mode === 'dry-run') return {
    mode: 'dry-run', ...identity, ...before, jsonFunctionsReady: true, receiptTableReady: true,
    alreadyApplied: found.value?.status === 'completed', receipt: found.value,
  };
  if (found.value?.status === 'completed') return {
    mode: input.mode, ...identity, prepared: false, applied: false, alreadyApplied: true,
    receipt: found.value, currentPlayers: before.players, legacyPlayers: before.legacyPlayers, currentV2Players: before.currentV2Players,
    blocked: before.legacyPlayers > 0, blockedCode: before.legacyPlayers > 0 ? 'RESET_LEGACY_AFTER_COMPLETION' : null,
  };
  const timestamp = now();
  if (!whole(timestamp)) fail('RESET_TIME_INVALID');
  if (input.mode === 'prepare') {
    await write(database, 'PREPARE_CLAIM', `INSERT INTO ${markerTable} (${receiptColumns})
      VALUES (:releaseKey, 'prepared', :preparedAt, NULL,
        (SELECT COUNT(*) FROM chipper_players WHERE ${legacyPredicate}),
        (SELECT COUNT(*) FROM chipper_players WHERE ${legacyPredicate}), :appId, :botUsername, :sourceSha)
      ON CONFLICT (release_key) DO NOTHING`, {
      ':releaseKey': RESET_RELEASE_KEY, ':preparedAt': timestamp, ':appId': RESET_BOT_ID,
      ':botUsername': RESET_BOT_USERNAME, ':sourceSha': input.sourceSha,
    });
    const prepared = (await receipt(database)).value;
    if (!prepared) fail('RESET_RECEIPT_MISSING');
    return { mode: 'prepare', ...identity, prepared: prepared.status === 'prepared', alreadyApplied: prepared.status === 'completed',
      receipt: prepared, currentPlayers: before.players, legacyPlayers: before.legacyPlayers, currentV2Players: before.currentV2Players };
  }
  if (!found.value) fail('RESET_NOT_PREPARED');
  // The gate is inside the DELETE itself, so a late concurrent caller cannot
  // execute a new deletion after another caller has completed this release.
  await write(database, 'LEGACY_DELETE', `DELETE FROM chipper_players WHERE ${legacyPredicate}
    AND json_type(state_json, '$.schemaVersion') = 'integer'
    AND EXISTS (SELECT 1 FROM ${markerTable} WHERE release_key = :releaseKey AND status = 'prepared'
      AND app_id = :appId AND bot_username = :botUsername)`, {
    ':releaseKey': RESET_RELEASE_KEY, ':appId': RESET_BOT_ID, ':botUsername': RESET_BOT_USERNAME,
  });
  const after = await inspectPlayers(database);
  if (after.legacyPlayers !== 0) fail('RESET_LEGACY_PLAYERS_REMAIN');
  const completed = await write(database, 'COMPLETE_RECEIPT', `UPDATE ${markerTable} SET status = 'completed', completed_at = :completedAt,
    remaining_legacy_players = 0 WHERE release_key = :releaseKey AND status = 'prepared'
      AND app_id = :appId AND bot_username = :botUsername
      AND NOT EXISTS (SELECT 1 FROM chipper_players WHERE ${legacyPredicate})
    RETURNING release_key`, {
    ':releaseKey': RESET_RELEASE_KEY, ':completedAt': Math.max(timestamp, found.value.prepared_at),
    ':appId': RESET_BOT_ID, ':botUsername': RESET_BOT_USERNAME,
  });
  const finalReceipt = (await receipt(database)).value;
  if (finalReceipt?.status !== 'completed') fail('RESET_COMPLETION_NOT_CONFIRMED');
  return { mode: 'apply', ...identity, applied: completed.rows.length === 1, alreadyApplied: completed.rows.length === 0,
    receipt: finalReceipt, currentPlayers: after.players, legacyPlayers: after.legacyPlayers, currentV2Players: after.currentV2Players };
}
