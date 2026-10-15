import { describe, expect, it } from 'vitest';
import { APP_ID, parseRevision, redact, runRelease, sha256 } from '../scripts/lib/github-release-v05.js';

const sourceSha = 'a'.repeat(40);
const token = `app${APP_ID}:${'synthetic_'.repeat(4)}`;
const preflight = { ready: true, appId: APP_ID, bot: '@chipperhatcherybot', players: 2, chicks: 3,
  duplicateChickIds: 0, jsonFunctionsReady: true, materializedCteReady: true, releaseReceiptUnchanged: true,
  preservedRelease: 'chipper-v0.2-clean-start', socialSchemaReady: true, databaseWrites: 0,
  towerSchemaReady: true, towerIndicesReady: true, towerRuns: 0, towerActive: 0, towerSettling: 0,
  towerSettlingPending: 0, towerFinished: 0, towerExpired: 0, towerCheckpointIntegrity: true, towerPaymentFenceIntegrity: true };
const source = { head: sourceSha, clean: true, packageVersion: '0.5.0', cliVersion: '0.2.0', declaredCliVersion: '0.2.0',
  schemaSha256: sha256('schema'), baselineSchemaSha256: sha256('schema'), configSha256: sha256('config'), baselineConfigSha256: sha256('config'),
  sourceManifestSha256: sha256('source'), buildSha256: sha256('dist') };
const schemaOutput = 'No schema changes. Database is in sync with your local tgcloud/schema.js.\n';

function fixture(options = {}) {
  const calls = [], plans = [], summaries = [];
  let fetches = 0, inspections = 0;
  const env = { RELEASE_SOURCE_SHA: sourceSha, TGCLOUD_TOKEN: token, TG_CLOUD_API_URL: 'https://cloud.telegram.org', ...options.env };
  return { calls, plans, summaries, env,
    run(overrides = {}) {
      return runRelease({ env: { ...env, ...overrides },
        async inspectSource() { inspections++; return options.inspect ? options.inspect(inspections) : { ...source }; },
        async command(kind, args) {
          calls.push([kind, ...args]);
          if (options.command) { const custom = options.command(kind, args, fetches); if (custom) return custom; }
          if (kind === 'preflight') return { status: 0, stdout: JSON.stringify(options.preflight ?? preflight), stderr: '' };
          const revision = options.moved && fetches > 0 ? 8 : 7;
          if (args[0] === 'fetch') { fetches++; return { status: 0, stdout: `Snapshot updated — 35 modules (revision ${revision})\n`, stderr: '' }; }
          if (args.includes('status')) return { status: 0, stdout: `Linked to app${APP_ID} (from env)\nLocal revision: ${options.moved && fetches > 1 ? 8 : 7}\n`, stderr: '' };
          if (args.includes('diff')) return { status: 0, stdout: options.patch ?? '--- lib/domain.js\n+++ lib/domain.js\n-old\n+new\n', stderr: '' };
          if (args[0] === 'migrate') return options.dryRun ?? { status: 0, stdout: schemaOutput, stderr: '- Checking schema...' };
          if (args[0] === 'push') return { status: 0, stdout: 'Done.', stderr: '' };
          throw new Error('Unexpected test command');
        },
        async savePlan(plan, patch) { plans.push({ plan, patch }); },
        async summary(plan, mode) { summaries.push({ plan, mode }); },
      });
    } };
}
const pushes = f => f.calls.filter(call => call[1] === 'push');
async function approved() {
  const f = fixture(); const result = await f.run();
  return { RELEASE_MODE: 'deploy', RELEASE_EXPECTED_REVISION: String(result.cloudRevision), RELEASE_PLAN_SHA256: result.planSha256, RELEASE_CONFIRMATION: `DEPLOY ${APP_ID}` };
}

describe('manual GitHub deployment plan and production-write boundary', () => {
  it('default preflight only executes supported reads/probes and never pushes', async () => {
    const f = fixture(); const result = await f.run();
    expect(result.pushed).toBe(false); expect(pushes(f)).toHaveLength(0);
    expect(f.calls).toEqual([
      ['cli', 'fetch'], ['cli', '--no-pager', 'status'], ['cli', '--no-pager', 'diff'],
      ['preflight', '--require-tower-schema'], ['cli', 'migrate', '--local', '--dry-run'],
      ['cli', 'fetch'], ['cli', '--no-pager', 'status'], ['cli', '--no-pager', 'diff'],
    ]);
    expect(f.plans).toHaveLength(1); expect(result.planSha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it('requires exact explicit confirmation, reviewed revision and plan before any cloud command', async () => {
    for (const override of [{ RELEASE_CONFIRMATION: '' }, { RELEASE_EXPECTED_REVISION: '' }, { RELEASE_PLAN_SHA256: '' }]) {
      const f = fixture({ env: { ...await approved(), ...override } });
      await expect(f.run()).rejects.toThrow('DEPLOY_APPROVAL_INVALID'); expect(f.calls).toEqual([]);
    }
  });
  it('pushes exactly once only for the unchanged approved plan, without force or retry', async () => {
    const f = fixture({ env: await approved() }); const result = await f.run();
    expect(result.pushed).toBe(true); expect(pushes(f)).toEqual([['cli', 'push']]);
    expect(f.calls.at(-1)).toEqual(['cli', 'push']);
  });
  it('keeps plans stable when only volatile player counts change', async () => {
    const first = await fixture().run(); const second = await fixture({ preflight: { ...preflight, players: 20, chicks: 34 } }).run();
    expect(first.planSha256).toBe(second.planSha256);
  });
  it('rejects missing or ambiguous revision before push', async () => {
    for (const output of ['', 'Snapshot (revision 7) (revision 8)']) {
      const f = fixture({ env: await approved(), command: (_kind, args) => args[0] === 'fetch' ? { status: 0, stdout: output, stderr: '' } : args.includes('status') ? { status: 0, stdout: '', stderr: '' } : null });
      await expect(f.run()).rejects.toThrow('CLOUD_REVISION_UNKNOWN'); expect(pushes(f)).toHaveLength(0);
    }
    expect(() => parseRevision('Snapshot (revision 7)', 'Local revision: 8')).toThrow('CLOUD_REVISION_AMBIGUOUS');
  });
  it.each([
    { status: 1, stdout: schemaOutput, stderr: '' },
    { status: 0, stdout: 'Pending schema change: ADD COLUMN', stderr: '' },
    { status: 0, stdout: `${schemaOutput}Warning: skipped table`, stderr: '' },
    { status: 0, stdout: schemaOutput, stderr: 'Unrecognized diagnostic' },
  ])('rejects unsuccessful, nonempty or unknown schema dry-run %j', async dryRun => {
    const f = fixture({ env: await approved(), dryRun }); await expect(f.run()).rejects.toThrow('SCHEMA_NOT_UNCHANGED'); expect(pushes(f)).toHaveLength(0);
  });
  it('stops if cloud revision moves during probes', async () => {
    const f = fixture({ env: await approved(), moved: true }); await expect(f.run()).rejects.toThrow('CLOUD_BASELINE_MOVED'); expect(pushes(f)).toHaveLength(0);
  });
  it('stops if cloud content changes even without a revision change', async () => {
    const f = fixture({ env: await approved(), command: (_kind, args, count) => args.includes('diff') && count > 1 ? { status: 0, stdout: 'Different cloud diff', stderr: '' } : null });
    await expect(f.run()).rejects.toThrow('CLOUD_BASELINE_MOVED'); expect(pushes(f)).toHaveLength(0);
  });
  it.each([2, 3])('stops a build alteration at source inspection %i', async when => {
    const f = fixture({ env: await approved(), inspect: count => ({ ...source, buildSha256: count >= when ? sha256('changed dist') : source.buildSha256 }) });
    await expect(f.run()).rejects.toThrow('RELEASE_FILES_CHANGED'); expect(pushes(f)).toHaveLength(0);
  });
  it('stops source/CLI/schema drift before cloud commands', async () => {
    for (const override of [{ clean: false }, { head: 'b'.repeat(40) }, { cliVersion: '0.3.0' }, { schemaSha256: sha256('new schema') }]) {
      const f = fixture({ env: await approved(), inspect: () => ({ ...source, ...override }) }); await expect(f.run()).rejects.toThrow(); expect(f.calls).toEqual([]);
    }
  });
  it('requires exact approved plan and revision', async () => {
    for (const override of [{ RELEASE_PLAN_SHA256: 'f'.repeat(64) }, { RELEASE_EXPECTED_REVISION: '8' }]) {
      const f = fixture({ env: { ...await approved(), ...override } }); await expect(f.run()).rejects.toThrow('APPROVED_PLAN_MISMATCH'); expect(pushes(f)).toHaveLength(0);
    }
  });
  it('never retries a revision-conflict push or adds force', async () => {
    const f = fixture({ env: await approved(), command: (_kind, args) => args[0] === 'push' ? { status: 1, stdout: '', stderr: 'Server has new revisions since your last sync.' } : null });
    await expect(f.run()).rejects.toThrow('PUSH_REVISION_CONFLICT'); expect(pushes(f)).toEqual([['cli', 'push']]);
  });
  it('rejects unexpected preflight fields and false ownership/payment invariants', async () => {
    for (const changed of [{ ...preflight, unexpected: true }, { ...preflight, databaseWrites: 1 }, { ...preflight, towerPaymentFenceIntegrity: false }]) {
      const f = fixture({ env: await approved(), preflight: changed }); await expect(f.run()).rejects.toThrow(); expect(pushes(f)).toHaveLength(0);
    }
  });
  it('redacts full credential and its secret suffix from saved diff', async () => {
    const secret = token.split(':')[1], patch = `+ Authorization: Bearer ${token}\n+ secret = ${secret}\n`;
    const f = fixture({ patch }); await f.run(); const saved = f.plans[0].patch;
    expect(saved).not.toContain(token); expect(saved).not.toContain(secret); expect(saved).toContain('[REDACTED]');
    expect(redact('unrelated source', token)).toBe('unrelated source');
  });
  it('suppresses raw thrown runner diagnostics that could contain a credential', async () => {
    const f = fixture({ command() { throw new Error(token); } }); await expect(f.run()).rejects.toThrow('CLI_EXECUTION_FAILED'); expect(pushes(f)).toHaveLength(0);
  });
});
