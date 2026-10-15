import { readFile, readdir, mkdir, writeFile, appendFile, lstat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASELINE_SHA, ReleaseError, runRelease, sha256 } from './lib/github-release-v05.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cli = resolve(root, 'node_modules/@tgcloud/cli/bin/tgcloud.js');
const sourcePaths = ['src', 'tgcloud', 'scripts', 'package.json', 'package-lock.json', 'tgcloud.jsonc', 'index.html', 'tsconfig.json', 'vite.config.ts'];
function git(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', timeout: 15000, maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) throw new ReleaseError('GIT_INSPECTION_FAILED');
  return result.stdout;
}
async function manifest(paths) {
  const entries = [];
  async function visit(path) {
    const full = resolve(root, path);
    const stat = await lstat(full);
    if (stat.isSymbolicLink()) throw new ReleaseError('SOURCE_SYMLINK_FORBIDDEN');
    if (stat.isDirectory()) for (const name of (await readdir(full)).sort()) await visit(`${path}/${name}`);
    else if (stat.isFile()) entries.push([relative(root, full).split('\\').join('/'), sha256(await readFile(full))]);
    else throw new ReleaseError('SOURCE_MANIFEST_INVALID');
  }
  for (const path of paths) await visit(path);
  return sha256(JSON.stringify(entries.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)));
}
async function inspectSource() {
  const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  const installed = JSON.parse(await readFile(resolve(root, 'node_modules/@tgcloud/cli/package.json'), 'utf8'));
  await readFile(resolve(root, 'dist/index.html'));
  return { head: git(['rev-parse', 'HEAD']).trim(),
    clean: !git(['diff', '--name-only', 'HEAD', '--', ...sourcePaths]).trim() && !git(['ls-files', '--others', '--exclude-standard', '--', ...sourcePaths]).trim(),
    packageVersion: pkg.version, cliVersion: installed.version, declaredCliVersion: pkg.devDependencies?.['@tgcloud/cli'],
    schemaSha256: sha256(await readFile(resolve(root, 'tgcloud/schema.js'))),
    baselineSchemaSha256: sha256(git(['show', `${BASELINE_SHA}:tgcloud/schema.js`])),
    configSha256: sha256(await readFile(resolve(root, 'tgcloud.jsonc'))),
    baselineConfigSha256: sha256(git(['show', `${BASELINE_SHA}:tgcloud.jsonc`])),
    sourceManifestSha256: await manifest(sourcePaths), buildSha256: await manifest(['dist']) };
}
async function command(kind, args) {
  const target = kind === 'cli' ? [cli, ...args] : [resolve(root, 'scripts/preflight-v0.4.mjs'), ...args];
  const result = spawnSync(process.execPath, target, { cwd: root, env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', TGCLOUD_DEBUG: '0' },
    encoding: 'utf8', timeout: kind === 'preflight' ? 60000 : 180000, maxBuffer: 16 * 1024 * 1024 });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}
try {
  const result = await runRelease({ env: process.env, inspectSource, command,
    async savePlan(plan, patch) {
      const directory = resolve(root, 'release-plan'); await mkdir(directory, { recursive: true });
      await writeFile(resolve(directory, 'plan.json'), `${JSON.stringify(plan, null, 2)}\n`, { mode: 0o600 });
      await writeFile(resolve(directory, 'changes.patch'), patch, { mode: 0o600 });
    },
    async summary(plan, mode) {
      if (!process.env.GITHUB_STEP_SUMMARY) return;
      await appendFile(process.env.GITHUB_STEP_SUMMARY, `\nChipper ${mode} plan\n\n- Source: \`${plan.sourceSha}\`\n- App: ${plan.appId}\n- Cloud revision: ${plan.cloudRevision}\n- Plan SHA256: \`${plan.planSha256}\`\n- Build SHA256: \`${plan.buildSha256}\`\n\nThis plan is a deployment preview; physical Telegram acceptance remains separate.\n`);
    } });
  console.log(`Release ${result.pushed ? 'push completed' : 'preflight complete'}: ${result.sourceSha}; reviewed baseline revision ${result.cloudRevision}; plan ${result.planSha256}`);
} catch (error) {
  // No raw CLI output, stack, token or source fragment reaches Actions logs.
  console.error(error instanceof ReleaseError ? error.code : 'RELEASE_LOCAL_FAILURE');
  process.exitCode = 1;
}
