import { createHash } from 'node:crypto';
import { stripVTControlCharacters } from 'node:util';

export const APP_ID = 8924974998;
export const BASELINE_SHA = '3764261bd7ab2531b87b47c240a3158022b02754';
export class ReleaseError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const fail = code => { throw new ReleaseError(code); };
export const sha256 = value => createHash('sha256').update(value).digest('hex');
const clean = value => stripVTControlCharacters(String(value ?? '')).replace(/\r\n/g, '\n');

export function redact(value, token) {
  let text = String(value ?? '');
  for (const secret of [token, token?.split(':').slice(1).join(':')].filter(Boolean)) text = text.split(secret).join('[REDACTED]');
  return text.replace(/\bapp\d+:[A-Za-z0-9_-]+\b/g, '[REDACTED]')
    .replace(/\b\d{8,12}:[A-Za-z0-9_-]{30,}\b/g, '[REDACTED]')
    .replace(/\bgh[pousr]_[A-Za-z0-9]{30,}\b/g, '[REDACTED]');
}

export function parseRevision(fetchOutput, statusOutput) {
  const fetched = [...clean(fetchOutput).matchAll(/\(revision (\d+)\)/g)];
  const status = [...clean(statusOutput).matchAll(/^Local revision: (\d+)\s*$/gm)];
  if (fetched.length > 1 || status.length > 1 || fetched.length + status.length === 0) fail('CLOUD_REVISION_UNKNOWN');
  const revisions = [...fetched, ...status].map(match => Number(match[1]));
  if (revisions.some(value => !Number.isSafeInteger(value) || value < 0) || new Set(revisions).size !== 1) fail('CLOUD_REVISION_AMBIGUOUS');
  return revisions[0];
}

const PREFLIGHT_KEYS = ['ready', 'appId', 'bot', 'players', 'chicks', 'duplicateChickIds', 'jsonFunctionsReady',
  'materializedCteReady', 'releaseReceiptUnchanged', 'preservedRelease', 'socialSchemaReady', 'databaseWrites',
  'towerSchemaReady', 'towerIndicesReady', 'towerRuns', 'towerActive', 'towerSettling', 'towerSettlingPending',
  'towerFinished', 'towerExpired', 'towerCheckpointIntegrity', 'towerPaymentFenceIntegrity'];
export function validatePreflight(output) {
  let summary;
  try { summary = JSON.parse(clean(output).trim()); } catch { fail('PREFLIGHT_OUTPUT_INVALID'); }
  if (!summary || Object.keys(summary).length !== PREFLIGHT_KEYS.length || Object.keys(summary).some(key => !PREFLIGHT_KEYS.includes(key))) fail('PREFLIGHT_OUTPUT_INVALID');
  if (summary.appId !== APP_ID || summary.bot !== '@chipperhatcherybot' || summary.databaseWrites !== 0 || summary.duplicateChickIds !== 0
    || summary.preservedRelease !== 'chipper-v0.2-clean-start') fail('PREFLIGHT_INVARIANT_FAILED');
  for (const key of ['ready', 'jsonFunctionsReady', 'materializedCteReady', 'releaseReceiptUnchanged', 'socialSchemaReady',
    'towerSchemaReady', 'towerIndicesReady', 'towerCheckpointIntegrity', 'towerPaymentFenceIntegrity']) if (summary[key] !== true) fail('PREFLIGHT_INVARIANT_FAILED');
  for (const key of ['players', 'chicks', 'towerRuns', 'towerActive', 'towerSettling', 'towerSettlingPending', 'towerFinished', 'towerExpired']) {
    if (!Number.isSafeInteger(summary[key]) || summary[key] < 0) fail('PREFLIGHT_OUTPUT_INVALID');
  }
  if (summary.towerActive + summary.towerSettling + summary.towerFinished + summary.towerExpired !== summary.towerRuns
    || summary.towerSettlingPending > summary.towerSettling) fail('PREFLIGHT_INVARIANT_FAILED');
}

export function validateDryRun(result) {
  const success = 'No schema changes. Database is in sync with your local tgcloud/schema.js.';
  const lines = clean(result.stdout).split('\n').map(line => line.trim()).filter(Boolean);
  const allowed = new Set([success, '(diff computed against your local tgcloud/schema.js)']);
  const diagnostic = clean(result.stderr).trim();
  if (result.status !== 0 || !lines.includes(success) || lines.some(line => !allowed.has(line))
    || (diagnostic !== '' && diagnostic !== '- Checking schema...')) fail('SCHEMA_NOT_UNCHANGED');
}

function validateSource(source, requested) {
  if (source.head !== requested || source.clean !== true) fail('SOURCE_NOT_PINNED');
  if (source.packageVersion !== '0.5.0' || source.cliVersion !== '0.2.0' || source.declaredCliVersion !== '0.2.0') fail('RELEASE_VERSION_MISMATCH');
  if (source.schemaSha256 !== source.baselineSchemaSha256 || source.configSha256 !== source.baselineConfigSha256) fail('BASELINE_SCHEMA_CHANGED');
  for (const key of ['schemaSha256', 'configSha256', 'sourceManifestSha256', 'buildSha256']) if (!/^[a-f0-9]{64}$/.test(source[key] ?? '')) fail('SOURCE_MANIFEST_INVALID');
}
function sameFiles(before, after) {
  return ['head', 'sourceManifestSha256', 'buildSha256', 'schemaSha256', 'configSha256'].every(key => before[key] === after[key]);
}

/** All commands and IO are injected; unit tests never contact a cloud or use credentials. */
export async function runRelease({ env, inspectSource, command, savePlan, summary }) {
  const mode = env.RELEASE_MODE || 'preflight';
  if (!['preflight', 'deploy'].includes(mode)) fail('RELEASE_MODE_INVALID');
  const sourceSha = env.RELEASE_SOURCE_SHA;
  if (!/^[a-f0-9]{40}$/.test(sourceSha ?? '')) fail('SOURCE_SHA_INVALID');
  if (!new RegExp(`^app${APP_ID}:[A-Za-z0-9_-]+$`).test(env.TGCLOUD_TOKEN ?? '')) fail('RELEASE_CREDENTIALS_INVALID');
  if (env.TG_CLOUD_API_URL && env.TG_CLOUD_API_URL !== 'https://cloud.telegram.org') fail('CLOUD_TARGET_INVALID');
  if (env.TGCLOUD_BETA && env.TGCLOUD_BETA !== '0') fail('CLOUD_TARGET_INVALID');
  if (env.TGCLOUD_DEBUG && env.TGCLOUD_DEBUG !== '0') fail('CLOUD_DEBUG_FORBIDDEN');
  if (mode === 'deploy' && (env.RELEASE_CONFIRMATION !== `DEPLOY ${APP_ID}` || !/^\d+$/.test(env.RELEASE_EXPECTED_REVISION ?? '')
    || !Number.isSafeInteger(Number(env.RELEASE_EXPECTED_REVISION)) || !/^[a-f0-9]{64}$/.test(env.RELEASE_PLAN_SHA256 ?? ''))) fail('DEPLOY_APPROVAL_INVALID');
  const initial = await inspectSource(); validateSource(initial, sourceSha);
  const invoke = async (kind, args) => {
    let result;
    try { result = await command(kind, args); } catch { fail('CLI_EXECUTION_FAILED'); }
    if (!result || result.status !== 0) {
      if (kind === 'cli' && args[0] === 'push' && /revision|409/i.test(`${result?.stdout ?? ''}\n${result?.stderr ?? ''}`)) fail('PUSH_REVISION_CONFLICT');
      fail(kind === 'cli' && args[0] === 'push' ? 'PUSH_FAILED' : 'CLI_COMMAND_FAILED');
    }
    return result;
  };
  const readSnapshot = async () => {
    const fetched = await invoke('cli', ['fetch']);
    const status = await invoke('cli', ['--no-pager', 'status']);
    const diff = await invoke('cli', ['--no-pager', 'diff']);
    const patch = clean(diff.stdout);
    return { revision: parseRevision(fetched.stdout, status.stdout), patch, diffSha256: sha256(patch) };
  };
  const before = await readSnapshot();
  const preflight = await invoke('preflight', ['--require-tower-schema']);
  validatePreflight(preflight.stdout);
  // Preserve the stricter pinned-CLI output check even when the process fails.
  let dryRun;
  try { dryRun = await command('cli', ['migrate', '--local', '--dry-run']); } catch { fail('CLI_EXECUTION_FAILED'); }
  validateDryRun(dryRun ?? {});
  const after = await readSnapshot();
  if (after.revision !== before.revision || after.diffSha256 !== before.diffSha256) fail('CLOUD_BASELINE_MOVED');
  const current = await inspectSource(); validateSource(current, sourceSha);
  if (!sameFiles(initial, current)) fail('RELEASE_FILES_CHANGED');
  const content = { sourceSha, appId: APP_ID, cloudRevision: after.revision, diffSha256: after.diffSha256,
    buildSha256: current.buildSha256, schemaSha256: current.schemaSha256, configSha256: current.configSha256,
    sourceManifestSha256: current.sourceManifestSha256 };
  const plan = { ...content, planSha256: sha256(JSON.stringify(content)) };
  if (mode === 'deploy' && (Number(env.RELEASE_EXPECTED_REVISION) !== plan.cloudRevision || env.RELEASE_PLAN_SHA256 !== plan.planSha256)) fail('APPROVED_PLAN_MISMATCH');
  await savePlan(plan, redact(after.patch, env.TGCLOUD_TOKEN));
  await summary(plan, mode);
  if (mode === 'deploy') {
    const final = await inspectSource(); validateSource(final, sourceSha);
    if (!sameFiles(current, final)) fail('RELEASE_FILES_CHANGED');
    // No fetch/retry here: push must retain the reviewed snapshot's revision CAS.
    await invoke('cli', ['push']);
  }
  return { ...plan, pushed: mode === 'deploy' };
}
