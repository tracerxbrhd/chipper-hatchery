// Read-only administrative probe embedded in a local temporary tgcloud module.
// No player state, user identifiers or credential data leave these queries.
export const PREFLIGHT_APP_ID = 8924974998;
export const PREFLIGHT_BOT = 'chipperhatcherybot';
export const PRESERVED_V02_RELEASE = Object.freeze({
  release_key: 'chipper-v0.2-clean-start', status: 'completed',
  prepared_at: 1791875990577, completed_at: 1791875998225,
  planned_legacy_players: 3, remaining_legacy_players: 0,
  app_id: 8924974998, bot_username: 'chipperhatcherybot',
  source_sha: 'cb4e83ac619435f09dc7969364c90defe18b5407',
});

const whole = (value) => Number.isSafeInteger(value) && value >= 0;
function fail(code) { throw new Error(code); }
async function get(database, code, query, params) {
  try { return await database.get(query, params); }
  catch { fail(`PREFLIGHT_SQL_${code}`); }
}
function validCounts(row, keys) {
  if (!row || keys.some((key) => !whole(row[key]))) fail('PREFLIGHT_INVALID_QUERY_RESULT');
}

export async function preflightV03({ database, api }, input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some((key) => key !== 'requireSocialSchema')
    || (input.requireSocialSchema !== undefined && typeof input.requireSocialSchema !== 'boolean')) fail('PREFLIGHT_INVALID_REQUEST');
  const me = await api.getMe();
  if (me.id !== PREFLIGHT_APP_ID || me.username !== PREFLIGHT_BOT || me.is_bot !== true) fail('PREFLIGHT_BOT_IDENTITY_MISMATCH');
  const json = await get(database, 'JSON_PROBE', `SELECT json_valid('{"version":2}') AS valid,
    json_extract('{"version":2}', '$.version') AS version,
    json_type('{"version":2}', '$.version') AS type,
    (SELECT COUNT(*) FROM json_each('[{"id":"a"},{"id":"b"}]')) AS eachCount`);
  if (json?.valid !== 1 || json.version !== 2 || json.type !== 'integer' || json.eachCount !== 2) fail('PREFLIGHT_JSON_INVALID');
  const cte = await get(database, 'MATERIALIZED_CTE', `WITH eligible AS MATERIALIZED (SELECT 1 AS allowed)
    SELECT COUNT(*) AS eligibleCount, SUM(allowed) AS allowed FROM eligible`);
  if (cte?.eligibleCount !== 1 || cte.allowed !== 1) fail('PREFLIGHT_MATERIALIZED_CTE_INVALID');
  const basic = await get(database, 'PLAYERS', `SELECT COUNT(*) AS players,
    COALESCE(SUM(CASE WHEN typeof(telegram_id) != 'integer' OR telegram_id <= 0
      OR telegram_id > 9007199254740991 OR typeof(revision) != 'integer' OR revision < 0 OR revision > 9007199254740991
      OR typeof(state_json) != 'text' OR json_valid(state_json) != 1 THEN 1 ELSE 0 END), 0) AS invalidRows
    FROM chipper_players`);
  validCounts(basic, ['players', 'invalidRows']);
  if (basic.invalidRows) fail('PREFLIGHT_INVALID_PLAYER_ROWS');
  const states = await get(database, 'OWNERSHIP', `SELECT
    COALESCE(SUM(CASE WHEN json_type(state_json,'$') != 'object'
      OR COALESCE(json_type(state_json,'$.schemaVersion'),'') != 'integer'
      OR COALESCE(json_extract(state_json,'$.schemaVersion'),-1) != 2
      OR COALESCE(json_type(state_json,'$.player.telegramId'),'') != 'text'
      OR COALESCE(json_extract(state_json,'$.player.telegramId'),'') != CAST(telegram_id AS TEXT)
      OR COALESCE(json_type(state_json,'$.chicks'),'') != 'array'
      THEN 1 ELSE 0 END),0) AS invalidStates,
    COALESCE(SUM(CASE WHEN json_extract(state_json,'$.schemaVersion') = 1 THEN 1 ELSE 0 END),0) AS legacyPlayers
    FROM chipper_players`);
  validCounts(states, ['invalidStates', 'legacyPlayers']);
  if (states.legacyPlayers) fail('PREFLIGHT_LEGACY_AFTER_COMPLETED_RELEASE');
  if (states.invalidStates) fail('PREFLIGHT_INVALID_OWNERSHIP');
  const birds = await get(database, 'CHICK_OWNERSHIP', `SELECT COUNT(*) AS chicks,
    COALESCE(SUM(CASE WHEN c.type != 'object'
      OR COALESCE(json_type(c.value,'$.id'),'') != 'text'
      OR COALESCE(length(json_extract(c.value,'$.id')),0) = 0
      OR COALESCE(json_extract(c.value,'$.appearanceVersion'),0) != 2
      OR COALESCE(json_type(c.value,'$.genes'),'') != 'object'
      THEN 1 ELSE 0 END),0) AS invalidChicks
    FROM chipper_players p, json_each(p.state_json,'$.chicks') c`);
  validCounts(birds, ['chicks', 'invalidChicks']);
  if (birds.invalidChicks) fail('PREFLIGHT_INVALID_CHICKS');
  const duplicates = await get(database, 'DUPLICATE_OWNERS', `SELECT COUNT(*) AS duplicateChickIds FROM (
    SELECT json_extract(c.value,'$.id') AS chick_id
    FROM chipper_players p, json_each(p.state_json,'$.chicks') c
    GROUP BY chick_id HAVING COUNT(*) > 1
  )`);
  validCounts(duplicates, ['duplicateChickIds']);
  if (duplicates.duplicateChickIds) fail('PREFLIGHT_DUPLICATE_CHICK_OWNER');
  const active = await get(database, 'ACTIVE_CHICK', `SELECT COUNT(*) AS invalidActiveOwners FROM chipper_players p
    WHERE json_extract(p.state_json,'$.player.activeChickId') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM json_each(p.state_json,'$.chicks') c
      WHERE json_extract(c.value,'$.id') = json_extract(p.state_json,'$.player.activeChickId'))`);
  validCounts(active, ['invalidActiveOwners']);
  if (active.invalidActiveOwners) fail('PREFLIGHT_ACTIVE_CHICK_NOT_OWNED');
  const receipt = await get(database, 'V02_RECEIPT', `SELECT release_key,status,prepared_at,completed_at,
    planned_legacy_players,remaining_legacy_players,app_id,bot_username,source_sha
    FROM chipper_release_operations WHERE release_key = :releaseKey`, { ':releaseKey': PRESERVED_V02_RELEASE.release_key });
  if (!receipt || Object.entries(PRESERVED_V02_RELEASE).some(([key, value]) => receipt[key] !== value)) fail('PREFLIGHT_V02_RECEIPT_CHANGED');
  let socialSchemaReady = true;
  for (const [table, columns] of [
    ['chipper_social_profiles', 'telegram_id,public_id,revision,display_name,visibility,collection_visibility,invite_token,share_token,receipts_json,updated_at'],
    ['chipper_friendships', 'pair_key,friendship_id,low_id,high_id,requested_by,status,low_blocked,high_blocked,revision,receipts_json,created_at,updated_at'],
    ['chipper_social_limits', 'key,window_start,count,seen_json'],
  ]) {
    try { await database.get(`SELECT ${columns} FROM ${table} LIMIT 0`); }
    catch (error) {
      if (/no such table:/i.test(error?.message ?? '')) socialSchemaReady = false;
      else fail('PREFLIGHT_SQL_SOCIAL_SCHEMA');
    }
  }
  if (input.requireSocialSchema && !socialSchemaReady) fail('PREFLIGHT_SOCIAL_MIGRATION_REQUIRED');
  return { ready: true, appId: PREFLIGHT_APP_ID, bot: `@${PREFLIGHT_BOT}`,
    players: basic.players, chicks: birds.chicks, duplicateChickIds: 0,
    jsonFunctionsReady: true, materializedCteReady: true,
    releaseReceiptUnchanged: true, preservedRelease: PRESERVED_V02_RELEASE.release_key,
    socialSchemaReady, databaseWrites: 0 };
}
