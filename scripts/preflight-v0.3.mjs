import { readFile, writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { stripVTControlCharacters } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const endpoint = resolve(root, 'tgcloud/endpoints/chipperV03PreflightTemporary.js');
const cli = resolve(root, 'node_modules/@tgcloud/cli/bin/tgcloud.js');
const args = process.argv.slice(2);
if (args.some((arg) => !['--require-social-schema', '--help'].includes(arg)) || new Set(args).size !== args.length) {
  console.error('Usage: node scripts/preflight-v0.3.mjs [--require-social-schema]'); process.exitCode = 1;
} else if (args.includes('--help')) {
  console.log('Usage: node scripts/preflight-v0.3.mjs [--require-social-schema]\nRead-only Bot/App, player ownership, V2 data, immutable completed0.2 receipt, JSON and MATERIALIZED SQL probe. --require-social-schema checks the additive migration after completion. Uses tgcloud run, never push/migrate/reset.');
} else {
  let created = false;
  async function cleanup() {
    if (!created) return;
    await unlink(endpoint).catch((error) => { if (error.code !== 'ENOENT') throw error; });
    created = false;
  }
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void cleanup().finally(() => process.exit(1)); });
  try {
    const core = await readFile(resolve(root, 'scripts/lib/preflight-v03.js'), 'utf8');
    const source = `import { db, api } from 'sdk';\n${core}\nexport default async function(input) { return JSON.stringify(await preflightV03({database:db,api},input)); }\n`;
    // Never overwrite an existing endpoint or inspect CLI credential files.
    await writeFile(endpoint, source, { flag: 'wx', mode: 0o600 }); created = true;
    const result = spawnSync(process.execPath, [cli, 'run', 'endpoints/chipperV03PreflightTemporary',
      JSON.stringify({ requireSocialSchema: args.includes('--require-social-schema') })], {
      cwd: root, env: process.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 45000,
    });
    const output = stripVTControlCharacters(`${result.stdout ?? ''}\n${result.stderr ?? ''}`);
    if (result.status !== 0) {
      const probeCode = output.match(/\bPREFLIGHT_[A-Z_]+\b/)?.[0];
      if (/No CLI access token|No token provided/i.test(output)) throw new Error('PREFLIGHT_CREDENTIALS_UNAVAILABLE');
      throw new Error(probeCode ?? 'PREFLIGHT_CLI_FAILED');
    }
    const returned = stripVTControlCharacters(result.stdout ?? '').split(/\r?\n/)
      .filter((line) => /^< \{/.test(line.trim()));
    if (returned.length !== 1) throw new Error('PREFLIGHT_OUTPUT_INVALID');
    const match = returned[0].trim().match(/^< (\{.*\})(?:\s+\d+ms)?$/);
    if (!match) throw new Error('PREFLIGHT_OUTPUT_INVALID');
    let summary;
    try { summary = JSON.parse(match[1]); } catch { throw new Error('PREFLIGHT_OUTPUT_INVALID'); }
    const summaryKeys = ['ready', 'appId', 'bot', 'players', 'chicks', 'duplicateChickIds', 'jsonFunctionsReady',
      'materializedCteReady', 'releaseReceiptUnchanged', 'preservedRelease', 'socialSchemaReady', 'databaseWrites'];
    if (summary?.ready !== true || summary.appId !== 8924974998 || summary.bot !== '@chipperhatcherybot'
      || Object.keys(summary).some((key) => !summaryKeys.includes(key))
      || !Number.isSafeInteger(summary.players) || summary.players < 0 || !Number.isSafeInteger(summary.chicks) || summary.chicks < 0
      || summary.duplicateChickIds !== 0 || summary.jsonFunctionsReady !== true
      || summary.preservedRelease !== 'chipper-v0.2-clean-start' || typeof summary.socialSchemaReady !== 'boolean'
      || (args.includes('--require-social-schema') && summary.socialSchemaReady !== true)
      || summary.databaseWrites !== 0 || summary.materializedCteReady !== true || summary.releaseReceiptUnchanged !== true) {
      throw new Error('PREFLIGHT_OUTPUT_INVALID');
    }
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    const code = /^PREFLIGHT_[A-Z_]+$/.test(error?.message ?? '') ? error.message
      : error?.code === 'EEXIST' ? 'PREFLIGHT_TEMPORARY_ENDPOINT_EXISTS' : 'PREFLIGHT_LOCAL_FAILURE';
    console.error(`${code}: read-only preflight failed; no cloud writes or deployment performed.`);
    if (code === 'PREFLIGHT_CREDENTIALS_UNAVAILABLE') console.error('Use the official tgcloud login or TGCLOUD_TOKEN, then repeat this command.');
    process.exitCode = 1;
  } finally { await cleanup(); }
}
