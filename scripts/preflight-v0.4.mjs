import { readFile, writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { stripVTControlCharacters } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const endpoint = resolve(root, 'tgcloud/endpoints/chipperV04PreflightTemporary.js');
const cli = resolve(root, 'node_modules/@tgcloud/cli/bin/tgcloud.js');
const args = process.argv.slice(2);
const usage = 'Usage: node scripts/preflight-v0.4.mjs [--require-tower-schema]';
if (args.some((arg) => !['--require-tower-schema', '--help'].includes(arg)) || new Set(args).size !== args.length) {
  console.error(usage); process.exitCode = 1;
} else if (args.includes('--help')) {
  console.log(`${usage}\nRead-only verified Bot/App, preserved 0.2 receipt, 0.3 social schema/ownership, and additive 0.4 tower schema/index/checkpoint/payment fence probe. Before migration the tower table may be absent; --require-tower-schema requires it. Uses tgcloud run only, never push/migrate/reset. Prints aggregate counts only.`);
} else {
  let created = false;
  async function cleanup() {
    if (!created) return;
    await unlink(endpoint).catch((error) => { if (error.code !== 'ENOENT') throw error; });
    created = false;
  }
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void cleanup().finally(() => process.exit(1)); });
  try {
    const baseline = await readFile(resolve(root, 'scripts/lib/preflight-v03.js'), 'utf8');
    const extension = (await readFile(resolve(root, 'scripts/lib/preflight-v04.js'), 'utf8'))
      .replace(/^import \{ preflightV03 \} from '\.\/preflight-v03\.js';\r?\n/, '');
    if (/\bimport\s/.test(extension)) throw new Error('PREFLIGHT_SOURCE_INVALID');
    const source = `import { db, api } from 'sdk';\n${baseline}\n${extension}\nexport default async function(input) { return JSON.stringify(await preflightV04({database:db,api},input)); }\n`;
    await writeFile(endpoint, source, { flag: 'wx', mode: 0o600 }); created = true;
    const result = spawnSync(process.execPath, [cli, 'run', 'endpoints/chipperV04PreflightTemporary',
      JSON.stringify({ requireTowerSchema: args.includes('--require-tower-schema') })], {
      cwd: root, env: process.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 45000,
    });
    const output = stripVTControlCharacters(`${result.stdout ?? ''}\n${result.stderr ?? ''}`);
    if (result.status !== 0) {
      const probeCode = output.match(/\bPREFLIGHT_[A-Z_]+\b/)?.[0];
      if (/No CLI access token|No token provided/i.test(output)) throw new Error('PREFLIGHT_CREDENTIALS_UNAVAILABLE');
      throw new Error(probeCode ?? 'PREFLIGHT_CLI_FAILED');
    }
    const returned = stripVTControlCharacters(result.stdout ?? '').split(/\r?\n/).filter((line) => /^< \{/.test(line.trim()));
    if (returned.length !== 1) throw new Error('PREFLIGHT_OUTPUT_INVALID');
    const match = returned[0].trim().match(/^< (\{.*\})(?:\s+\d+ms)?$/);
    if (!match) throw new Error('PREFLIGHT_OUTPUT_INVALID');
    let summary;
    try { summary = JSON.parse(match[1]); } catch { throw new Error('PREFLIGHT_OUTPUT_INVALID'); }
    const keys = ['ready', 'appId', 'bot', 'players', 'chicks', 'duplicateChickIds', 'jsonFunctionsReady',
      'materializedCteReady', 'releaseReceiptUnchanged', 'preservedRelease', 'socialSchemaReady', 'databaseWrites',
      'towerSchemaReady', 'towerIndicesReady', 'towerRuns', 'towerActive', 'towerSettling', 'towerSettlingPending',
      'towerFinished', 'towerExpired', 'towerCheckpointIntegrity', 'towerPaymentFenceIntegrity'];
    const counts = ['players', 'chicks', 'towerRuns', 'towerActive', 'towerSettling', 'towerSettlingPending', 'towerFinished', 'towerExpired'];
    if (summary?.ready !== true || summary.appId !== 8924974998 || summary.bot !== '@chipperhatcherybot'
      || Object.keys(summary).length !== keys.length || Object.keys(summary).some((key) => !keys.includes(key))
      || counts.some((key) => !Number.isSafeInteger(summary[key]) || summary[key] < 0)
      || summary.duplicateChickIds !== 0 || summary.databaseWrites !== 0 || summary.jsonFunctionsReady !== true
      || summary.materializedCteReady !== true || summary.releaseReceiptUnchanged !== true
      || summary.preservedRelease !== 'chipper-v0.2-clean-start' || summary.socialSchemaReady !== true
      || typeof summary.towerSchemaReady !== 'boolean' || summary.towerIndicesReady !== summary.towerSchemaReady
      || summary.towerCheckpointIntegrity !== summary.towerSchemaReady || summary.towerPaymentFenceIntegrity !== summary.towerSchemaReady
      || (args.includes('--require-tower-schema') && summary.towerSchemaReady !== true)
      || summary.towerActive + summary.towerSettling + summary.towerFinished + summary.towerExpired !== summary.towerRuns
      || summary.towerSettlingPending > summary.towerSettling
      || (!summary.towerSchemaReady && summary.towerRuns !== 0)) throw new Error('PREFLIGHT_OUTPUT_INVALID');
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    const code = /^PREFLIGHT_[A-Z_]+$/.test(error?.message ?? '') ? error.message
      : error?.code === 'EEXIST' ? 'PREFLIGHT_TEMPORARY_ENDPOINT_EXISTS' : 'PREFLIGHT_LOCAL_FAILURE';
    console.error(`${code}: read-only preflight failed; no cloud writes or deployment performed.`);
    if (code === 'PREFLIGHT_CREDENTIALS_UNAVAILABLE') console.error('Use the official tgcloud login or TGCLOUD_TOKEN, then repeat this command.');
    process.exitCode = 1;
  } finally { await cleanup(); }
}
