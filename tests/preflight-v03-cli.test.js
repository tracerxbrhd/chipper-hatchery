import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = [];
const goodSummary = { ready: true, appId: 8924974998, bot: '@chipperhatcherybot', players: 2, chicks: 3,
  duplicateChickIds: 0, jsonFunctionsReady: true, materializedCteReady: true, releaseReceiptUnchanged: true,
  preservedRelease: 'chipper-v0.2-clean-start', socialSchemaReady: true, databaseWrites: 0 };
const fakeCli = `import { existsSync,readFileSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const args=process.argv.slice(2);
const endpoint=resolve(process.cwd(),'tgcloud/endpoints/chipperV03PreflightTemporary.js');
writeFileSync(process.env.CHIPPER_TEST_PREFLIGHT_LOG,JSON.stringify({args,present:existsSync(endpoint),source:readFileSync(endpoint,'utf8')}));
if(process.env.CHIPPER_TEST_PREFLIGHT_FAIL) { console.error(process.env.CHIPPER_TEST_PREFLIGHT_FAIL); process.exit(17); }
console.log('> chipperV03PreflightTemporary('+args[2]+')');
console.log('< '+(process.env.CHIPPER_TEST_PREFLIGHT_OUTPUT ?? ${JSON.stringify(JSON.stringify(goodSummary))})+' 12ms');
`;
function setup() {
  const path = mkdtempSync(resolve(tmpdir(), 'chipper-preflight-cli-')); temporary.push(path);
  for (const directory of ['scripts/lib', 'tgcloud/endpoints', 'node_modules/@tgcloud/cli/bin']) mkdirSync(resolve(path, directory), { recursive: true });
  for (const filename of ['scripts/preflight-v0.3.mjs', 'scripts/lib/preflight-v03.js']) copyFileSync(resolve(root, filename), resolve(path, filename));
  writeFileSync(resolve(path, 'package.json'), JSON.stringify({ type: 'module' }));
  writeFileSync(resolve(path, 'node_modules/@tgcloud/cli/package.json'), JSON.stringify({ type: 'module' }));
  writeFileSync(resolve(path, 'node_modules/@tgcloud/cli/bin/tgcloud.js'), fakeCli);
  const endpoint = resolve(path, 'tgcloud/endpoints/chipperV03PreflightTemporary.js');
  const log = resolve(path, 'cli.log');
  return { path, endpoint,
    run(args = [], env = {}) { return spawnSync(process.execPath, ['scripts/preflight-v0.3.mjs', ...args], {
      cwd: path, encoding: 'utf8', env: { ...process.env, TGCLOUD_TOKEN: '', CHIPPER_TEST_PREFLIGHT_LOG: log, ...env },
    }); },
    call() { return existsSync(log) ? JSON.parse(readFileSync(log, 'utf8')) : null; },
  };
}
afterEach(() => { for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true }); });

describe('read-only preflight supported CLI and cleanup contract', () => {
  it('uses only tgcloud run and removes the exclusively created local endpoint', () => {
    const f = setup(); const result = f.run(); expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(goodSummary);
    expect(f.call().args).toEqual(['run', 'endpoints/chipperV03PreflightTemporary', '{"requireSocialSchema":false}']);
    expect(f.call().present).toBe(true);
    expect(f.call().source).toContain("import { db, api } from 'sdk'");
    expect(f.call().source).toContain('JSON.stringify(await preflightV03');
    expect(f.call().source).not.toMatch(/database\.(?:run|all)\(|\b(?:DELETE FROM|UPDATE chipper|INSERT INTO|CREATE TABLE|CREATE TRIGGER|DROP TABLE|PRAGMA)\b/);
    expect(existsSync(f.endpoint)).toBe(false);
  });

  it('strict post-migration mode forwards requirement, with no push/migrate/reset', () => {
    const f = setup(); const result = f.run(['--require-social-schema']); expect(result.status).toBe(0);
    expect(f.call().args.at(-1)).toBe('{"requireSocialSchema":true}');
    expect(existsSync(f.endpoint)).toBe(false);
  });

  it('missing credentials reports a fixed actionable code and still cleans up', () => {
    const f = setup(); const result = f.run([], { CHIPPER_TEST_PREFLIGHT_FAIL: 'No CLI access token found for this project. unsafe-private-marker' });
    expect(result.status).not.toBe(0); expect(result.stderr).toContain('PREFLIGHT_CREDENTIALS_UNAVAILABLE');
    expect(result.stderr).toContain('tgcloud login or TGCLOUD_TOKEN');
    expect(`${result.stdout}${result.stderr}`).not.toContain('unsafe-private-marker');
    expect(existsSync(f.endpoint)).toBe(false);
  });

  it('cloud SQL rejection reports only its safe code and cleans up', () => {
    const f = setup(); const result = f.run([], { CHIPPER_TEST_PREFLIGHT_FAIL: 'PREFLIGHT_SQL_MATERIALIZED_CTE private-database-detail' });
    expect(result.status).not.toBe(0); expect(result.stderr).toContain('PREFLIGHT_SQL_MATERIALIZED_CTE');
    expect(result.stderr).not.toContain('private-database-detail'); expect(existsSync(f.endpoint)).toBe(false);
  });

  it('does not overwrite or delete a pre-existing endpoint', () => {
    const f = setup(); writeFileSync(f.endpoint, 'owner existing file'); const result = f.run();
    expect(result.status).not.toBe(0); expect(result.stderr).toContain('PREFLIGHT_TEMPORARY_ENDPOINT_EXISTS');
    expect(f.call()).toBeNull(); expect(readFileSync(f.endpoint, 'utf8')).toBe('owner existing file');
  });

  it.each(['not-json', JSON.stringify({ ...goodSummary, appId: 999 }),
    JSON.stringify({ ...goodSummary, privateState: 'private marker' }),
    JSON.stringify({ ...goodSummary, materializedCteReady: false })])('refuses an invalid/unexpected cloud summary', (output) => {
    const f = setup(); const result = f.run([], { CHIPPER_TEST_PREFLIGHT_OUTPUT: output });
    expect(result.status).not.toBe(0); expect(result.stderr).toContain('PREFLIGHT_OUTPUT_INVALID');
    expect(`${result.stdout}${result.stderr}`).not.toContain('private marker'); expect(existsSync(f.endpoint)).toBe(false);
  });

  it('strict migration probe rejects missing schema even if subprocess exits zero', () => {
    const f = setup(); const result = f.run(['--require-social-schema'], {
      CHIPPER_TEST_PREFLIGHT_OUTPUT: JSON.stringify({ ...goodSummary, socialSchemaReady: false }),
    });
    expect(result.status).not.toBe(0); expect(result.stderr).toContain('PREFLIGHT_OUTPUT_INVALID'); expect(existsSync(f.endpoint)).toBe(false);
  });

  it('help and invalid destructive flags never create an endpoint or call CLI', () => {
    const f = setup(); expect(f.run(['--help']).status).toBe(0);
    expect(f.run(['--apply']).status).not.toBe(0); expect(f.run(['--require-social-schema', '--require-social-schema']).status).not.toBe(0);
    expect(f.call()).toBeNull(); expect(existsSync(f.endpoint)).toBe(false);
  });
});
