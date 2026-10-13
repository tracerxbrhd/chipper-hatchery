import { readFile, writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { stripVTControlCharacters } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const endpoint = resolve(root, 'tgcloud/endpoints/chipperV02ResetTemporary.js');
const cli = resolve(root, 'node_modules/@tgcloud/cli/bin/tgcloud.js');
const apply = process.argv.slice(2).includes('--apply');
const prepare = process.argv.slice(2).includes('--prepare');
const diagnose = process.argv.slice(2).includes('--diagnose');
const allowed = new Set(['--apply', '--prepare', '--dry-run', '--diagnose', '--help']);
if (process.argv.slice(2).some(argument => !allowed.has(argument)) || process.argv.slice(2).filter(argument => argument !== '--help').length > 1) {
  throw new Error('Usage: node scripts/reset-game-v0.2.mjs [--diagnose | --dry-run | --prepare | --apply]');
}
if (process.argv.includes('--help')) {
  console.log('Usage: node scripts/reset-game-v0.2.mjs [--diagnose | --dry-run | --prepare | --apply]\n--diagnose: read-only identity and direct gameplay SQL probe, including before receipt-table migration. Default --dry-run: read-only gameplay/receipt check. --prepare: record the one-time release plan without deleting gameplay. --apply: resume the authorized legacy-only clean start. Receipt table is created only by supported tgcloud migrate.');
  process.exit(0);
}
const run = args => spawnSync(process.execPath, [cli, ...args], { cwd: root, stdio: 'inherit', env: process.env });
const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
if (head.status !== 0) throw new Error('Unable to determine release source SHA.');
if (apply || prepare) {
  const changes = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
  if (changes.status !== 0 || changes.stdout.trim()) throw new Error('RESET_RELEASE_WORKTREE_NOT_CLEAN: commit the tested release before preparing or applying its one-time reset.');
}
// Only presence is printed; credential values and machine-state files are never
// read by this script. Saved tokens are resolved by the actual CLI itself.
console.log(`CLI token supplied through environment: ${Boolean(process.env.TGCLOUD_TOKEN)}`);
const status = run(['--no-pager', 'status']);
if (status.status !== 0) process.exit(status.status ?? 1);
if (apply || prepare) {
  // The runtime cannot inspect SQLite's system catalog. Use the supported CLI
  // schema inspector instead, and fail closed on missing migrations, unknown
  // objects, warnings, or a changed CLI output contract. A successful --safe
  // migration alone is insufficient: it may leave warnings unapplied.
  const schema = spawnSync(process.execPath, [cli, 'migrate', '--local', '--dry-run'], {
    cwd: root, env: process.env, encoding: 'utf8',
  });
  process.stdout.write(schema.stdout ?? '');
  process.stderr.write(schema.stderr ?? '');
  if (schema.status !== 0) process.exit(schema.status ?? 1);
  const output = stripVTControlCharacters(schema.stdout ?? '');
  const successLine = 'No schema changes. Database is in sync with your local tgcloud/schema.js.';
  const allowedLines = new Set([successLine, '(diff computed against your local tgcloud/schema.js)']);
  const lines = output.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  // Pinned CLI 0.2.0 uses ora: when stdout/stderr are pipes, start() writes
  // exactly this one progress line to stderr. It is not a schema warning.
  const diagnostics = stripVTControlCharacters(schema.stderr ?? '').trim();
  if (!lines.includes(successLine) || lines.some(line => !allowedLines.has(line))
    || (diagnostics !== '' && diagnostics !== '- Checking schema...')) {
    throw new Error('RESET_SCHEMA_REVIEW_REQUIRED: review and finish only the expected additive receipt-table migration before preparing or applying the reset.');
  }
}
let temporaryCreated = false;
async function cleanup() {
  if (!temporaryCreated) return;
  await unlink(endpoint).catch(error => { if (error.code !== 'ENOENT') throw error; });
  temporaryCreated = false;
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => { void cleanup().finally(() => process.exit(1)); });
}
try {
  const core = await readFile(resolve(root, 'scripts/lib/reset-v02.js'), 'utf8');
  const source = `import { db, api } from 'sdk';\n${core}\nexport default async function (input) { return resetGameV02({ database: db, api }, input); }\n`;
  // Exclusive creation refuses any pre-existing temporary endpoint instead of
  // overwriting it. The release gate rejects this path if a killed process leaves it.
  await writeFile(endpoint, source, { flag: 'wx', mode: 0o600 });
  temporaryCreated = true;
  const execution = run(['run', 'endpoints/chipperV02ResetTemporary', JSON.stringify({
    mode: apply ? 'apply' : prepare ? 'prepare' : diagnose ? 'diagnose' : 'dry-run',
    releaseKey: 'chipper-v0.2-clean-start',
    sourceSha: head.stdout.trim(),
  })]);
  if (execution.status !== 0) process.exitCode = execution.status ?? 1;
} finally {
  await cleanup();
}
