import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const fixtures = [];
const schemaInSync = 'No schema changes. Database is in sync with your local tgcloud/schema.js.';

// This binary never imports the SDK, connects to Telegram, or executes SQL. It
// records only the wrapper's command contract and temporary-file lifecycle.
const fakeCli = `import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const args = process.argv.slice(2);
const endpoint = resolve(process.cwd(), 'tgcloud/endpoints/chipperV02ResetTemporary.js');
const present = existsSync(endpoint);
const record = { args, endpointPresent: present };
if (args[0] === 'run') {
  record.input = JSON.parse(args[2]);
  record.endpointSource = present ? readFileSync(endpoint, 'utf8') : null;
}
appendFileSync(process.env.CHIPPER_TEST_CLI_LOG, JSON.stringify(record) + '\\n');
if (args[0] === 'migrate') {
  process.stdout.write(process.env.CHIPPER_TEST_SCHEMA_OUTPUT ?? ${JSON.stringify(schemaInSync)});
  process.stderr.write(process.env.CHIPPER_TEST_SCHEMA_STDERR ?? '');
  process.exit(Number(process.env.CHIPPER_TEST_SCHEMA_STATUS ?? 0));
}
if (args[0] === 'run') process.exit(Number(process.env.CHIPPER_TEST_RUN_STATUS ?? 0));
if (args.join(' ') === '--no-pager status') process.exit(0);
throw new Error('Unexpected fake CLI command');
`;

function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Fixture Git command failed: ${result.stderr}`);
  return result.stdout.trim();
}

function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), 'chipper-reset-cli-'));
  fixtures.push(root);
  mkdirSync(resolve(root, 'scripts/lib'), { recursive: true });
  mkdirSync(resolve(root, 'tgcloud/endpoints'), { recursive: true });
  mkdirSync(resolve(root, 'node_modules/@tgcloud/cli/bin'), { recursive: true });
  copyFileSync(resolve(projectRoot, 'scripts/reset-game-v0.2.mjs'), resolve(root, 'scripts/reset-game-v0.2.mjs'));
  copyFileSync(resolve(projectRoot, 'scripts/lib/reset-v02.js'), resolve(root, 'scripts/lib/reset-v02.js'));
  writeFileSync(resolve(root, 'package.json'), JSON.stringify({ type: 'module', devDependencies: { '@tgcloud/cli': '0.2.0' } }));
  writeFileSync(resolve(root, '.gitignore'), 'node_modules/\ncli-invocations.log\n');
  writeFileSync(resolve(root, 'tgcloud/endpoints/.gitkeep'), '');
  writeFileSync(resolve(root, 'node_modules/@tgcloud/cli/package.json'), JSON.stringify({ type: 'module', version: '0.2.0' }));
  writeFileSync(resolve(root, 'node_modules/@tgcloud/cli/bin/tgcloud.js'), fakeCli);
  git(root, ['init', '--quiet']);
  git(root, ['add', '.']);
  git(root, ['-c', 'user.name=Chipper fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'Isolated reset CLI fixture']);
  const sourceSha = git(root, ['rev-parse', 'HEAD']);
  const log = resolve(root, 'cli-invocations.log');
  const endpoint = resolve(root, 'tgcloud/endpoints/chipperV02ResetTemporary.js');
  return {
    root, sourceSha, endpoint,
    run(mode, env = {}) {
      return spawnSync(process.execPath, ['scripts/reset-game-v0.2.mjs', `--${mode}`], {
        cwd: root, encoding: 'utf8',
        env: { ...process.env, TGCLOUD_TOKEN: '', CHIPPER_TEST_CLI_LOG: log,
          CHIPPER_TEST_SCHEMA_OUTPUT: schemaInSync, CHIPPER_TEST_SCHEMA_STDERR: '',
          CHIPPER_TEST_SCHEMA_STATUS: '0', CHIPPER_TEST_RUN_STATUS: '0', ...env },
      });
    },
    calls() { return existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line)) : []; },
  };
}

afterEach(() => { for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true }); });

function expectSchemaBlocked(f, result) {
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('RESET_SCHEMA_REVIEW_REQUIRED');
  expect(f.calls().map(call => call.args)).toEqual([
    ['--no-pager', 'status'], ['migrate', '--local', '--dry-run'],
  ]);
  expect(f.calls().every(call => !call.endpointPresent)).toBe(true);
  expect(existsSync(f.endpoint)).toBe(false);
}

describe('one-time reset wrapper CLI contract with isolated fake cloud commands', () => {
  it('diagnose uses only status and a read-only mode, without a schema migration', () => {
    const f = fixture(); const result = f.run('diagnose');
    expect(result.status).toBe(0);
    const calls = f.calls();
    expect(calls.map(call => call.args.slice(0, 2))).toEqual([
      ['--no-pager', 'status'], ['run', 'endpoints/chipperV02ResetTemporary'],
    ]);
    expect(calls[1].input).toEqual({ mode: 'diagnose', releaseKey: 'chipper-v0.2-clean-start', sourceSha: f.sourceSha });
    expect(calls[1].endpointPresent).toBe(true);
    expect(existsSync(f.endpoint)).toBe(false);
  });

  it('prepare refuses a missing migration even when the dry-run CLI exits zero', () => {
    const f = fixture();
    expectSchemaBlocked(f, f.run('prepare', { CHIPPER_TEST_SCHEMA_OUTPUT: 'Schema out of sync.\n@@ create chipper_release_operations\n' }));
  });

  it('apply refuses schema warnings or diff markers despite an in-sync success line and zero exit', () => {
    const f = fixture();
    expectSchemaBlocked(f, f.run('apply', { CHIPPER_TEST_SCHEMA_OUTPUT: `${schemaInSync}\n@@ Unexpected additional table\nSchema out of sync.\n` }));
  });

  it('unknown successful CLI output fails closed before creating a module or running SQL', () => {
    const f = fixture();
    expectSchemaBlocked(f, f.run('apply', { CHIPPER_TEST_SCHEMA_OUTPUT: 'Migration inspection finished successfully.\n' }));
  });

  it('an exit-zero warning on stderr blocks execution even with the expected stdout success', () => {
    const f = fixture();
    expectSchemaBlocked(f, f.run('apply', { CHIPPER_TEST_SCHEMA_STDERR: '\u001b[33mWarning: schema inspection was incomplete.\u001b[0m\n' }));
  });

  it('unknown extra stdout blocks execution even when an accepted success line is also present', () => {
    const f = fixture();
    expectSchemaBlocked(f, f.run('prepare', { CHIPPER_TEST_SCHEMA_OUTPUT: `${schemaInSync}\nUnexpected schema object skipped.\n` }));
  });

  it.each(['prepare', 'apply'])('an inspected clean schema runs %s with the committed SHA and cleans up its temporary endpoint', mode => {
    const f = fixture();
    const result = f.run(mode, { CHIPPER_TEST_SCHEMA_OUTPUT: `\u001b[2m(diff computed against your local tgcloud/schema.js)\u001b[0m\r\n\u001b[32m${schemaInSync}\u001b[0m\r\n` });
    expect(result.status).toBe(0);
    const calls = f.calls();
    expect(calls.map(call => call.args.slice(0, 2))).toEqual([
      ['--no-pager', 'status'], ['migrate', '--local'], ['run', 'endpoints/chipperV02ResetTemporary'],
    ]);
    expect(calls[1].args).toEqual(['migrate', '--local', '--dry-run']);
    expect(calls[2].input).toEqual({ mode, releaseKey: 'chipper-v0.2-clean-start', sourceSha: f.sourceSha });
    expect(calls[2].endpointPresent).toBe(true);
    expect(calls[2].endpointSource).toContain("import { db, api } from 'sdk';");
    expect(calls[2].endpointSource).toContain('return resetGameV02({ database: db, api }, input)');
    expect(existsSync(f.endpoint)).toBe(false);
    expect(git(f.root, ['status', '--porcelain'])).toBe('');
  });

  it('a failed temporary execution preserves the CLI exit code and still removes the endpoint', () => {
    const f = fixture(); const result = f.run('apply', { CHIPPER_TEST_RUN_STATUS: '17' });
    expect(result.status).toBe(17);
    expect(f.calls().at(-1)).toMatchObject({ args: ['run', 'endpoints/chipperV02ResetTemporary', expect.any(String)], endpointPresent: true, input: { mode: 'apply' } });
    expect(existsSync(f.endpoint)).toBe(false);
    expect(git(f.root, ['status', '--porcelain'])).toBe('');
  });

  it('dirty prepare/apply worktrees are refused before any cloud command or temporary SQL module', () => {
    const f = fixture(); writeFileSync(resolve(f.root, 'uncommitted-release.txt'), 'not reviewed');
    for (const mode of ['prepare', 'apply']) {
      const result = f.run(mode);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('RESET_RELEASE_WORKTREE_NOT_CLEAN');
      expect(f.calls()).toEqual([]);
      expect(existsSync(f.endpoint)).toBe(false);
    }
  });
});
