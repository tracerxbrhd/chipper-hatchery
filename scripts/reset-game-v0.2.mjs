import { readFile, writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const endpoint = resolve(root, 'tgcloud/endpoints/chipperV02ResetTemporary.js');
const cli = resolve(root, 'node_modules/@tgcloud/cli/bin/tgcloud.js');
const apply = process.argv.slice(2).includes('--apply');
const prepare = process.argv.slice(2).includes('--prepare');
const allowed = new Set(['--apply', '--prepare', '--dry-run', '--help']);
if (process.argv.slice(2).some(argument => !allowed.has(argument)) || process.argv.slice(2).filter(argument => argument !== '--help').length > 1) {
  throw new Error('Usage: node scripts/reset-game-v0.2.mjs [--dry-run | --prepare | --apply]');
}
if (process.argv.includes('--help')) {
  console.log('Usage: node scripts/reset-game-v0.2.mjs [--dry-run | --prepare | --apply]\nDefault: read-only identity/schema/count check. --prepare: install validated marker table/trigger without clearing gameplay. --apply: one authorized Chipper 0.2 reset.');
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
    mode: apply ? 'apply' : prepare ? 'prepare' : 'dry-run',
    releaseKey: 'chipper-v0.2-clean-start',
    sourceSha: head.stdout.trim(),
  })]);
  if (execution.status !== 0) process.exitCode = execution.status ?? 1;
} finally {
  await cleanup();
}
