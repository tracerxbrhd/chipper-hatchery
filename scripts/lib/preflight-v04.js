import { preflightV03 } from './preflight-v03.js';

// Read-only extension. Historical 0.3 probe stays immutable and reusable.
export const PREFLIGHT_TOWER_VERSION = 'nest-defense-1';
const V04_COLUMNS = 'run_id,telegram_id,revision,seed,config_version,status,verified_wave,checkpoint_json,created_at,expires_at,last_activity_at,start_operation_id,last_operation_id,last_fingerprint,finish_reason,result_json';
function v04fail(code) { throw new Error(code); }
async function v04get(database, code, query, params) {
  try { return await database.get(query, params); }
  catch { v04fail(`PREFLIGHT_SQL_${code}`); }
}
function v04counts(row, keys) {
  if (!row || keys.some((key) => !Number.isSafeInteger(row[key]) || row[key] < 0)) v04fail('PREFLIGHT_INVALID_QUERY_RESULT');
}
function v04normalizedIndex(value) {
  return typeof value === 'string' ? value.replace(/["`\s;]/g, '').replaceAll('[', '').replaceAll(']', '').toLowerCase()
    .replace(/^create(unique)?indexifnotexists/, 'create$1index')
    .replace(/where\((statusin\('active','settling'\))\)$/, 'where$1') : '';
}

export async function preflightV04({ database, api }, input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some((key) => key !== 'requireTowerSchema')
    || (input.requireTowerSchema !== undefined && typeof input.requireTowerSchema !== 'boolean')) v04fail('PREFLIGHT_INVALID_REQUEST');
  const baseline = await preflightV03({ database, api }, { requireSocialSchema: true });
  let towerSchemaReady = true;
  try { await database.get(`SELECT ${V04_COLUMNS} FROM chipper_tower_runs LIMIT 0`); }
  catch (error) {
    if (/no such table:/i.test(error?.message ?? '')) towerSchemaReady = false;
    else v04fail('PREFLIGHT_SQL_TOWER_SCHEMA');
  }
  if (!towerSchemaReady) {
    if (input.requireTowerSchema) v04fail('PREFLIGHT_TOWER_MIGRATION_REQUIRED');
    return { ...baseline, towerSchemaReady: false, towerIndicesReady: false, towerRuns: 0,
      towerActive: 0, towerSettling: 0, towerSettlingPending: 0, towerFinished: 0, towerExpired: 0,
      towerCheckpointIntegrity: false, towerPaymentFenceIntegrity: false };
  }
  const expectedIndices = [
    ['chipper_tower_start_key', 'createuniqueindexchipper_tower_start_keyonchipper_tower_runs(telegram_id,start_operation_id)'],
    ['chipper_tower_one_active', "createuniqueindexchipper_tower_one_activeonchipper_tower_runs(telegram_id)wherestatusin('active','settling')"],
    ['chipper_tower_owner_status', 'createindexchipper_tower_owner_statusonchipper_tower_runs(telegram_id,status,last_activity_at)'],
  ];
  for (const [name, expected] of expectedIndices) {
    const index = await v04get(database, 'TOWER_INDICES', "SELECT sql FROM sqlite_schema WHERE type='index' AND tbl_name='chipper_tower_runs' AND name=:name", { ':name': name });
    if (v04normalizedIndex(index?.sql) !== expected) v04fail('PREFLIGHT_TOWER_INDICES_INVALID');
  }
  const rows = await v04get(database, 'TOWER_ROWS', `SELECT COUNT(*) AS runs,
    COALESCE(SUM(status='active'),0) AS active,COALESCE(SUM(status='settling'),0) AS settling,
    COALESCE(SUM(status='finished'),0) AS finished,COALESCE(SUM(status='expired'),0) AS expired,
    COALESCE(SUM(CASE WHEN typeof(run_id)!='text' OR length(run_id)!=36
      OR run_id GLOB '*[^0-9a-f-]*' OR substr(run_id,9,1)!='-' OR substr(run_id,14,1)!='-'
      OR substr(run_id,19,1)!='-' OR substr(run_id,24,1)!='-'
      OR typeof(telegram_id)!='integer' OR telegram_id<=0 OR telegram_id>9007199254740991
      OR typeof(revision)!='integer' OR revision<0 OR revision>9007199254740991
      OR typeof(seed)!='integer' OR seed<0 OR seed>4294967295
      OR typeof(verified_wave)!='integer' OR verified_wave<0 OR verified_wave>9007199254740991
      OR typeof(created_at)!='integer' OR created_at<0 OR typeof(expires_at)!='integer' OR expires_at<created_at
      OR typeof(last_activity_at)!='integer' OR last_activity_at<created_at
      OR status NOT IN ('active','settling','finished','expired')
      OR typeof(config_version)!='text' OR length(config_version)<1
      OR (status IN ('active','settling') AND config_version!=:version)
      OR typeof(start_operation_id)!='text' OR length(start_operation_id)!=36
      OR typeof(checkpoint_json)!='text' OR json_valid(checkpoint_json)!=1
      OR length(CAST(checkpoint_json AS BLOB))>32768
      OR (result_json IS NOT NULL AND (typeof(result_json)!='text' OR json_valid(result_json)!=1))
      OR (status IN ('settling','finished') AND (finish_reason IS NULL OR finish_reason NOT IN ('retire','defeat')
        OR last_operation_id IS NULL OR last_fingerprint IS NULL))
      OR NOT EXISTS(SELECT 1 FROM chipper_players p WHERE p.telegram_id=r.telegram_id)
      THEN 1 ELSE 0 END),0) AS invalidRows
    FROM chipper_tower_runs r`, { ':version': PREFLIGHT_TOWER_VERSION });
  v04counts(rows, ['runs', 'active', 'settling', 'finished', 'expired', 'invalidRows']);
  if (rows.invalidRows) v04fail('PREFLIGHT_TOWER_ROWS_INVALID');
  const duplicate = await v04get(database, 'TOWER_ACTIVE_OWNER', `SELECT COUNT(*) AS duplicates FROM (
    SELECT telegram_id FROM chipper_tower_runs WHERE status IN ('active','settling') GROUP BY telegram_id HAVING COUNT(*)>1)`);
  v04counts(duplicate, ['duplicates']);
  if (duplicate.duplicates) v04fail('PREFLIGHT_TOWER_MULTIPLE_ACTIVE');
  const checkpoints = await v04get(database, 'TOWER_CHECKPOINT', `SELECT COUNT(*) AS invalidCheckpoints FROM chipper_tower_runs r
    WHERE (status IN ('finished','expired') AND checkpoint_json!='{}')
    OR (status IN ('active','settling') AND (
      COALESCE(json_type(checkpoint_json,'$'),'')!='object'
      OR COALESCE(json_type(checkpoint_json,'$.seed'),'')!='integer' OR COALESCE(json_extract(checkpoint_json,'$.seed'),-1)!=seed
      OR COALESCE(json_extract(checkpoint_json,'$.configVersion'),'')!=config_version
      OR COALESCE(json_type(checkpoint_json,'$.tick'),'')!='integer' OR COALESCE(json_extract(checkpoint_json,'$.tick'),-1)<0
      OR COALESCE(json_extract(checkpoint_json,'$.tick'),-1)>9007199254740991
      OR COALESCE(json_type(checkpoint_json,'$.completedWave'),'')!='integer' OR COALESCE(json_extract(checkpoint_json,'$.completedWave'),-1)!=verified_wave
      OR COALESCE(json_type(checkpoint_json,'$.wave'),'')!='integer' OR COALESCE(json_extract(checkpoint_json,'$.wave'),-1)<verified_wave
      OR COALESCE(json_extract(checkpoint_json,'$.wave'),-1)>verified_wave+1
      OR COALESCE(json_extract(checkpoint_json,'$.phase'),'') NOT IN ('build','wave','defeat')
      OR (json_extract(checkpoint_json,'$.phase')='build' AND json_extract(checkpoint_json,'$.wave')!=verified_wave)
      OR (json_extract(checkpoint_json,'$.phase') IN ('wave','defeat') AND json_extract(checkpoint_json,'$.wave')!=verified_wave+1)
      OR COALESCE(json_type(checkpoint_json,'$.hp'),'')!='integer' OR COALESCE(json_extract(checkpoint_json,'$.hp'),-1)<0
      OR COALESCE(json_extract(checkpoint_json,'$.hp'),-1)>10
      OR (json_extract(checkpoint_json,'$.phase')='defeat' AND json_extract(checkpoint_json,'$.hp')!=0)
      OR (json_extract(checkpoint_json,'$.phase')!='defeat' AND json_extract(checkpoint_json,'$.hp')=0)
      OR COALESCE(json_type(checkpoint_json,'$.coins'),'')!='integer' OR COALESCE(json_extract(checkpoint_json,'$.coins'),-1)<0
      OR COALESCE(json_extract(checkpoint_json,'$.coins'),-1)>1000000000000
      OR COALESCE(json_type(checkpoint_json,'$.towers'),'')!='array' OR json_array_length(checkpoint_json,'$.towers')>140
      OR COALESCE(json_type(checkpoint_json,'$.enemies'),'')!='array' OR json_array_length(checkpoint_json,'$.enemies')>48
      OR COALESCE(json_type(checkpoint_json,'$.spawn'),'')!='object'
      OR COALESCE(json_type(checkpoint_json,'$.spawn.total'),'')!='integer' OR COALESCE(json_extract(checkpoint_json,'$.spawn.total'),-1)<0
      OR COALESCE(json_extract(checkpoint_json,'$.spawn.total'),-1)>120
      OR COALESCE(json_type(checkpoint_json,'$.spawn.remaining'),'')!='integer' OR COALESCE(json_extract(checkpoint_json,'$.spawn.remaining'),-1)<0
      OR COALESCE(json_type(checkpoint_json,'$.spawn.emitted'),'')!='integer' OR COALESCE(json_extract(checkpoint_json,'$.spawn.emitted'),-1)<0
      OR COALESCE(json_extract(checkpoint_json,'$.spawn.remaining'),-1)+COALESCE(json_extract(checkpoint_json,'$.spawn.emitted'),-1)!=json_extract(checkpoint_json,'$.spawn.total')
      OR COALESCE(json_type(checkpoint_json,'$.spawn.nextTick'),'')!='integer' OR COALESCE(json_extract(checkpoint_json,'$.spawn.nextTick'),-1)<0
      OR COALESCE(json_type(checkpoint_json,'$.nextEnemyId'),'')!='integer' OR COALESCE(json_extract(checkpoint_json,'$.nextEnemyId'),0)<1
    ))`);
  v04counts(checkpoints, ['invalidCheckpoints']);
  if (checkpoints.invalidCheckpoints) v04fail('PREFLIGHT_TOWER_CHECKPOINT_INVALID');
  const entities = await v04get(database, 'TOWER_ENTITIES', `SELECT
    (SELECT COUNT(*) FROM chipper_tower_runs r,json_each(r.checkpoint_json,'$.towers') t
      WHERE r.status IN ('active','settling') AND (t.type!='object'
        OR COALESCE(json_extract(t.value,'$.type'),'') NOT IN ('beak','seed','frost')
        OR COALESCE(json_type(t.value,'$.level'),'')!='integer' OR COALESCE(json_extract(t.value,'$.level'),0) NOT BETWEEN 1 AND 3
        OR COALESCE(json_type(t.value,'$.x'),'')!='integer' OR COALESCE(json_extract(t.value,'$.x'),-1) NOT BETWEEN 0 AND 9
        OR COALESCE(json_type(t.value,'$.y'),'')!='integer' OR COALESCE(json_extract(t.value,'$.y'),-1) NOT BETWEEN 0 AND 13
        OR COALESCE(json_type(t.value,'$.invested'),'')!='integer' OR COALESCE(json_extract(t.value,'$.invested'),-1)<0
        OR COALESCE(json_type(t.value,'$.cooldown'),'')!='integer' OR COALESCE(json_extract(t.value,'$.cooldown'),-1)<0)) AS invalidTowers,
    (SELECT COUNT(*) FROM chipper_tower_runs r,json_each(r.checkpoint_json,'$.enemies') e
      WHERE r.status IN ('active','settling') AND (e.type!='object'
        OR COALESCE(json_extract(e.value,'$.type'),'') NOT IN ('crawler','dasher','brute')
        OR COALESCE(json_type(e.value,'$.id'),'')!='integer' OR COALESCE(json_extract(e.value,'$.id'),0)<1
        OR COALESCE(json_type(e.value,'$.hp'),'')!='integer' OR COALESCE(json_extract(e.value,'$.hp'),0)<1
        OR COALESCE(json_type(e.value,'$.maxHp'),'')!='integer' OR COALESCE(json_extract(e.value,'$.maxHp'),0)<json_extract(e.value,'$.hp')
        OR COALESCE(json_type(e.value,'$.progress'),'')!='integer' OR COALESCE(json_extract(e.value,'$.progress'),-1)<0
        OR COALESCE(json_type(e.value,'$.slowTicks'),'')!='integer' OR COALESCE(json_extract(e.value,'$.slowTicks'),-1)<0)) AS invalidEnemies,
    (SELECT COUNT(*) FROM (SELECT r.run_id,json_extract(t.value,'$.x'),json_extract(t.value,'$.y')
      FROM chipper_tower_runs r,json_each(r.checkpoint_json,'$.towers') t WHERE r.status IN ('active','settling')
      GROUP BY r.run_id,json_extract(t.value,'$.x'),json_extract(t.value,'$.y') HAVING COUNT(*)>1)) AS duplicateTowerCells,
    (SELECT COUNT(*) FROM (SELECT r.run_id,json_extract(e.value,'$.id')
      FROM chipper_tower_runs r,json_each(r.checkpoint_json,'$.enemies') e WHERE r.status IN ('active','settling')
      GROUP BY r.run_id,json_extract(e.value,'$.id') HAVING COUNT(*)>1)) AS duplicateEnemyIds`);
  v04counts(entities, ['invalidTowers', 'invalidEnemies', 'duplicateTowerCells', 'duplicateEnemyIds']);
  if (entities.invalidTowers || entities.invalidEnemies || entities.duplicateTowerCells || entities.duplicateEnemyIds) v04fail('PREFLIGHT_TOWER_CHECKPOINT_INVALID');
  const fences = await v04get(database, 'TOWER_PAYMENT_FENCE', `SELECT
    COALESCE(SUM(CASE WHEN r.status='settling' AND f.key IS NULL THEN 1 ELSE 0 END),0) AS settlingPending,
    COALESCE(SUM(CASE WHEN (r.status='finished' AND f.key IS NULL)
      OR (r.status IN ('active','expired') AND f.key IS NOT NULL)
      OR (f.key IS NOT NULL AND (f.type!='object'
        OR COALESCE(json_extract(f.value,'$.runId'),'')!=r.run_id
        OR COALESCE(json_extract(f.value,'$.gameId'),'')!='nest-defense'
        OR COALESCE(json_extract(f.value,'$.verifiedWave'),-1)!=r.verified_wave
        OR COALESCE(json_extract(f.value,'$.score'),-1)!=r.verified_wave
        OR COALESCE(json_type(f.value,'$.rewardAmount'),'')!='integer'
        OR COALESCE(json_extract(f.value,'$.rewardAmount'),-1)<0 OR COALESCE(json_extract(f.value,'$.rewardAmount'),-1)>4))
      OR (r.status='finished' AND (r.result_json IS NULL
        OR COALESCE(json_type(r.result_json,'$'),'')!='object'
        OR COALESCE(json_extract(r.result_json,'$.runId'),'')!=r.run_id
        OR COALESCE(json_extract(r.result_json,'$.verifiedWave'),-1)!=r.verified_wave
        OR COALESCE(json_extract(r.result_json,'$.rewardAmount'),-1)!=json_extract(f.value,'$.rewardAmount')))
      THEN 1 ELSE 0 END),0) AS invalidFences
    FROM chipper_tower_runs r JOIN chipper_players p ON p.telegram_id=r.telegram_id
    LEFT JOIN json_each(p.state_json,'$.towerReceipts') f ON f.key=r.run_id`);
  v04counts(fences, ['settlingPending', 'invalidFences']);
  if (fences.invalidFences) v04fail('PREFLIGHT_TOWER_PAYMENT_FENCE_INVALID');
  const orphan = await v04get(database, 'TOWER_ORPHAN_FENCE', `SELECT COUNT(*) AS orphanFences FROM chipper_players p,
    json_each(p.state_json,'$.towerReceipts') f WHERE NOT EXISTS (
      SELECT 1 FROM chipper_tower_runs r WHERE r.run_id=f.key AND r.telegram_id=p.telegram_id AND r.status IN ('settling','finished'))`);
  v04counts(orphan, ['orphanFences']);
  if (orphan.orphanFences) v04fail('PREFLIGHT_TOWER_PAYMENT_FENCE_INVALID');
  return { ...baseline, towerSchemaReady: true, towerIndicesReady: true, towerRuns: rows.runs,
    towerActive: rows.active, towerSettling: rows.settling, towerSettlingPending: fences.settlingPending,
    towerFinished: rows.finished, towerExpired: rows.expired,
    towerCheckpointIntegrity: true, towerPaymentFenceIntegrity: true };
}
