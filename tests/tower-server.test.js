import { performance } from 'node:perf_hooks';
import { describe, expect, it, vi } from 'vitest';
import { operation } from './helpers.js';
import { towerFixture, playWaves } from './tower-server-helpers.js';
import { TOWER_LIMITS } from '../tgcloud/lib/towerService.js';
import { applyTowerCommand, createTowerState, generateTowerMap, replayTowerCheckpoint, stepTower, towerStateHash } from '../tgcloud/lib/towerRules.js';

describe('Nest Defense production service on real SQLite', () => {
  it('persists server seed/rules; start keys, simultaneous starts and aliases durably resume one run', async () => {
    const f = await towerFixture(); const first = operation();
    const starts = await Promise.all(Array.from({ length: 10 }, () => f.tower('startTowerRun', first)));
    expect(starts.every(response => response.ok)).toBe(true);
    const run = starts[0].result.run;
    expect(new Set(starts.map(response => response.result.run.runId)).size).toBe(1);
    expect(run.checkpoint).toEqual(createTowerState(run.seed));
    expect(f.sqlite.prepare('SELECT count(*) AS total FROM chipper_tower_runs').get().total).toBe(1);
    const alias = operation(); expect((await f.tower('startTowerRun', alias)).result.run.runId).toBe(run.runId);
    await f.tower('finishTowerRun', operation({ runId: run.runId, endReason: 'retire' })); f.restart();
    expect((await f.tower('startTowerRun', alias)).result.run.status).toBe('finished');
    expect((await f.tower('startTowerRun', first)).result.run.status).toBe('finished');
    expect(f.sqlite.prepare('SELECT count(*) AS total FROM chipper_tower_runs').get().total).toBe(1);
  });

  it('requires verified owner/onboarding, validates all unknown fields and never accepts claimed wave/state', async () => {
    const f = await towerFixture(); const { run } = await f.start();
    await f.initial(202);
    for (const method of ['getTowerRun', 'finishTowerRun', 'checkpointTowerRun']) {
      const fields = method === 'getTowerRun' ? { runId: run.runId } : method === 'finishTowerRun'
        ? operation({ runId: run.runId, endReason: 'retire' }) : operation({ runId: run.runId, revision: 0, commands: [], ticks: 0, expectedHash: towerStateHash(run.checkpoint) });
      expect((await f.tower(method, fields, 202)).error.code).toBe('RUN_NOT_FOUND');
    }
    expect((await f.tower('finishTowerRun', operation({ runId: run.runId, endReason: 'retire', wave: 999 }))).error.code).toBe('INVALID_REQUEST');
    expect((await f.tower('checkpointTowerRun', operation({ runId: run.runId, revision: 0, commands: [], ticks: 0, expectedHash: '00000000', hp: 999 }))).error.code).toBe('INVALID_REQUEST');
    expect((await f.tower('startTowerRun', operation(), 999)).error.code).toBe('PROFILE_NOT_FOUND');
    const boot = await f.call('bootstrap', {}, 303); expect(boot.ok).toBe(true);
    expect((await f.tower('startTowerRun', operation(), 303)).error.code).toBe('ONBOARDING_REQUIRED');
    expect((await f.tower('startTowerRun', operation(), null)).error.code).toBe('UNAUTHORIZED');
    expect((await f.store.read('101')).state.player.feathers).toBe(0);
  });

  it('rejects path/money/timing/hash exploits without any partial checkpoint effect', async () => {
    const f = await towerFixture(); const { run } = await f.start(); const map = generateTowerMap(run.seed);
    const checkpoint = commands => operation({ runId: run.runId, revision: 0, commands, ticks: 0, expectedHash: towerStateHash(run.checkpoint) });
    expect((await f.tower('checkpointTowerRun', checkpoint([{ type: 'place', ...map.path[0], towerType: 'beak' }]))).error.code).toBe('INVALID_TILE');
    expect((await f.tower('checkpointTowerRun', checkpoint(map.buildable.slice(0, 3).map(cell => ({ type: 'place', ...cell, towerType: 'seed' }))))).error.code).toBe('NOT_ENOUGH_COINS');
    expect((await f.tower('checkpointTowerRun', checkpoint([{ type: 'startWave', wave: 25 }]))).error.code).toBe('INVALID_COMMAND');
    expect((await f.tower('checkpointTowerRun', checkpoint([{ type: 'startWave' }]))).error.code).toBe('CHECKPOINT_MISMATCH');
    const predicted = replayTowerCheckpoint(run.checkpoint, [{ type: 'startWave' }], 50);
    expect((await f.tower('checkpointTowerRun', operation({ runId: run.runId, revision: 0, commands: [{ type: 'startWave' }], ticks: 50, expectedHash: towerStateHash(predicted) }))).error.code).toBe('SIMULATION_TOO_FAST');
    expect((await f.tower('finishTowerRun', operation({ runId: run.runId, endReason: 'defeat' }))).error.code).toBe('INVALID_END_REASON');
    expect((await f.tower('getTowerRun', { runId: run.runId })).result.run).toEqual(run);
  });

  it('bounded batches and rate windows, checkpoint races and lost response preserve sequence', async () => {
    const f = await towerFixture(); const { run } = await f.start();
    const command = { type: 'place', ...generateTowerMap(run.seed).buildable[0], towerType: 'beak' };
    const predicted = replayTowerCheckpoint(run.checkpoint, [command], 0);
    const request = operation({ runId: run.runId, revision: 0, commands: [command], ticks: 0, expectedHash: towerStateHash(predicted) });
    const invalid = [ { commands: Array(65).fill({ type: 'startWave' }) }, { ticks: 1201 }, { revision: -1 } ];
    for (const change of invalid) expect((await f.tower('checkpointTowerRun', { ...request, ...change })).error.code).toBe('INVALID_CHECKPOINT');
    expect((await f.tower('checkpointTowerRun', { ...request, expectedHash: '0'.repeat(40000) })).error.code).toBe('BATCH_TOO_LARGE');
    f.fail('after', /SET revision=revision\+1,verified_wave/);
    const mute = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await f.tower('checkpointTowerRun', request)).error.code).toBe('TEMPORARILY_UNAVAILABLE'); mute.mockRestore();
    f.restart(); const retry = await f.tower('checkpointTowerRun', request); expect(retry.ok).toBe(true); expect(retry.result.run.revision).toBe(1);
    expect((await f.tower('checkpointTowerRun', { ...request, expectedHash: '00000000' })).error.code).toBe('OPERATION_CONFLICT');
    const concurrent = await Promise.all(Array.from({ length: 10 }, () => f.tower('checkpointTowerRun', operation({ runId: run.runId, revision: 1, commands: [], ticks: 0, expectedHash: towerStateHash(predicted) }))));
    expect(concurrent.filter(response => response.ok)).toHaveLength(1);
    expect(concurrent.filter(response => !response.ok).every(response => response.error.code === 'RUN_CONFLICT')).toBe(true);
    expect((await f.tower('checkpointTowerRun', request)).error.code).toBe('RUN_CONFLICT');
    const limits = f.sqlite.prepare("SELECT length(seen_json) AS bytes FROM chipper_social_limits WHERE key='tower:101:checkpoint'").get();
    expect(limits.bytes).toBeLessThan(3000);
    for (let read = 0; read < 60; read++) await f.tower('getTowerRun');
    expect((await f.tower('getTowerRun')).error.code).toBe('RATE_LIMITED'); f.advance(60000);
    expect((await f.tower('getTowerRun')).ok).toBe(true);
  });

  it.each([[2, 0], [3, 1], [8, 2], [15, 3], [25, 4]])('real legal command replay completes wave %i and pays exactly %i', async (waves, amount) => {
    const f = await towerFixture(); const { run: start } = await f.start(); const run = await playWaves(f, start, waves);
    const request = operation({ runId: run.runId, endReason: 'retire' });
    const finished = await f.tower('finishTowerRun', request);
    expect(finished.ok, JSON.stringify(finished)).toBe(true);
    expect(finished.result).toMatchObject({ score: waves, verifiedWave: waves, rewarded: amount > 0, rewardAmount: amount, bestScore: waves });
    expect(finished.state.player.feathers).toBe(amount);
    expect(finished.state.player.games['nest-defense'].lastRewardAt === null).toBe(amount === 0);
    const replay = await f.tower('finishTowerRun', request); expect(replay.result).toEqual(finished.result);
    expect((await f.tower('getTowerRun', { runId: run.runId })).result.run.checkpoint).toBe(null);
    expect(f.sqlite.prepare('SELECT length(checkpoint_json) AS bytes FROM chipper_tower_runs WHERE run_id=?').get(run.runId).bytes).toBe(2);
  });

  it.each([
    ['after', /SET status='settling'/],
    ['before', /UPDATE chipper_players SET revision=revision\+1,state_json/],
    ['after', /UPDATE chipper_players SET revision=revision\+1,state_json/],
    ['before', /SET status='finished'/],
    ['after', /SET status='finished'/],
  ])('durable payment recovery after %s %s preserves one payment', async (when, pattern) => {
    const f = await towerFixture(); const { run: initial } = await f.start(); const run = await playWaves(f, initial, 3);
    const request = operation({ runId: run.runId, endReason: 'retire' }); f.fail(when, pattern);
    const mute = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await f.tower('finishTowerRun', request)).ok).toBe(false); mute.mockRestore();
    f.advance(TOWER_LIMITS.ttlMs * 2); f.restart();
    const results = await Promise.all(Array.from({ length: 10 }, () => f.tower('finishTowerRun', request)));
    expect(results.every(response => response.ok && response.result.rewardAmount === 1)).toBe(true);
    expect((await f.store.read('101')).state.player.feathers).toBe(1);
    const owner = (await f.store.read('101')).state;
    expect(Object.keys(owner.towerReceipts)).toEqual([run.runId]);
    expect(owner.player.games['nest-defense'].completedRuns).toBe(1);
    expect(f.sqlite.prepare('SELECT status FROM chipper_tower_runs WHERE run_id=?').get(run.runId).status).toBe('finished');
  });

  it('zero tier leaves cooldown available; rewards/bests independent from Flaps/daily and repeated tiers obey 20h', async () => {
    const f = await towerFixture(); let { run } = await f.start();
    await f.tower('finishTowerRun', operation({ runId: run.runId, endReason: 'retire' }));
    ({ run } = await f.start()); run = await playWaves(f, run, 3);
    const first = await f.tower('finishTowerRun', operation({ runId: run.runId, endReason: 'retire' })); expect(first.result.rewardAmount).toBe(1);
    ({ run } = await f.start()); run = await playWaves(f, run, 8);
    const second = await f.tower('finishTowerRun', operation({ runId: run.runId, endReason: 'retire' }));
    expect(second.result).toMatchObject({ rewardAmount: 0, reason: 'cooldown', bestScore: 8 });
    const flap = await f.call('startFlapsRun', operation()); f.advance(3000);
    expect((await f.call('finishFlapsRun', operation({ runId: flap.result.runId, score: 0, endReason: 'crash' }))).result.rewarded).toBe(true);
    expect((await f.call('claimDailyBonus', operation())).result.rewarded).toBe(true);
    f.advance(20 * 60 * 60 * 1000);
    ({ run } = await f.start()); run = await playWaves(f, run, 8);
    const third = await f.tower('finishTowerRun', operation({ runId: run.runId, endReason: 'retire' })); expect(third.result.rewardAmount).toBe(2);
    expect((await f.store.read('101')).state.player.feathers).toBe(5);
  });

  it('active TTL expires without credit, extends on verified checkpoint, restores after service restart', async () => {
    const f = await towerFixture(); const { request, run } = await f.start();
    f.advance(TOWER_LIMITS.ttlMs - 1000);
    const resume = await f.tower('checkpointTowerRun', operation({ runId: run.runId, revision: 0, commands: [], ticks: 0, expectedHash: towerStateHash(run.checkpoint) }));
    expect(resume.result.run.expiresAt).toBe(f.now + TOWER_LIMITS.ttlMs); f.restart();
    expect((await f.tower('getTowerRun')).result.run.checkpoint).toEqual(run.checkpoint);
    f.advance(TOWER_LIMITS.ttlMs); expect((await f.tower('getTowerRun')).result.run.status).toBe('expired');
    expect((await f.tower('finishTowerRun', operation({ runId: run.runId, endReason: 'retire' }))).error.code).toBe('RUN_EXPIRED');
    expect((await f.tower('startTowerRun', request)).result.run.status).toBe('expired');
    expect((await f.start()).run.runId).not.toBe(run.runId); expect((await f.store.read('101')).state.player.feathers).toBe(0);
  });

  it('lost start response and interrupted pre-seal reservation recover without duplicate runs or values', async () => {
    const f = await towerFixture(); const start = operation();
    const mute = vi.spyOn(console, 'error').mockImplementation(() => {});
    f.fail('after', /INSERT INTO chipper_tower_runs/);
    expect((await f.tower('startTowerRun', start)).error.code).toBe('TEMPORARILY_UNAVAILABLE'); f.restart();
    const recovered = await f.tower('startTowerRun', start); expect(recovered.ok).toBe(true);
    expect(f.sqlite.prepare('SELECT count(*) AS total FROM chipper_tower_runs').get().total).toBe(1);
    const run = await playWaves(f, recovered.result.run, 3); const finish = operation({ runId: run.runId, endReason: 'retire' });
    // Reservation is an ordinary store CAS whose response can be lost. It has
    // no financial effect and leaves the run active until the retry seals it.
    f.fail('after', /UPDATE chipper_players SET revision = revision \+ 1/);
    expect((await f.tower('finishTowerRun', finish)).error.code).toBe('TEMPORARILY_UNAVAILABLE');
    expect(f.sqlite.prepare('SELECT status FROM chipper_tower_runs WHERE run_id=?').get(run.runId).status).toBe('active');
    expect((await f.call('claimDailyBonus', { operationId: finish.operationId })).error.code).toBe('OPERATION_CONFLICT');
    f.restart(); expect((await f.tower('finishTowerRun', finish)).result.rewardAmount).toBe(1); mute.mockRestore();
    expect((await f.store.read('101')).state.player.feathers).toBe(1);
  });

  it('legacy sealed key collision recovers through the permanent run fence without replacing unrelated receipts', async () => {
    const f = await towerFixture(); const { run: initial } = await f.start(); const run = await playWaves(f, initial, 3);
    const collision = operation(); const daily = await f.call('claimDailyBonus', collision); expect(daily.ok).toBe(true);
    const priorReceipt = (await f.store.read('101')).state.receipts[collision.operationId];
    const effect = JSON.stringify(['finishTowerRun', { runId: run.runId, endReason: 'retire' }]);
    // Emulate a sealed checkpoint from a previous interrupted writer, before
    // the strict pre-seal key reservation existed. No client may do this SQL.
    f.sqlite.prepare("UPDATE chipper_tower_runs SET status='settling',revision=revision+1,finish_reason='retire',last_operation_id=?,last_fingerprint=? WHERE run_id=?")
      .run(collision.operationId, effect, run.runId);
    f.advance(TOWER_LIMITS.ttlMs * 2); f.restart();
    const recovered = await f.tower('getTowerRun', { runId: run.runId }); expect(recovered.ok).toBe(true);
    expect(recovered.result.run.status).toBe('finished'); expect(recovered.result.run.result.rewardAmount).toBe(1);
    const state = (await f.store.read('101')).state; expect(state.player.feathers).toBe(2);
    expect(state.receipts[collision.operationId]).toEqual(priorReceipt); expect(state.player.games['nest-defense'].completedRuns).toBe(1);
    expect((await f.tower('startTowerRun', operation())).ok).toBe(true);
  });

  it('verified defeat excludes the uncompleted losing wave and unknown rules never silently reroll a live run', async () => {
    const f = await towerFixture(); let { run } = await f.start();
    while (run.checkpoint.phase !== 'defeat') {
      const commands = run.checkpoint.phase === 'build' ? [{ type: 'startWave' }] : [];
      const predicted = structuredClone(run.checkpoint); for (const command of commands) applyTowerCommand(predicted, command);
      let ticks = 0; while (predicted.phase === 'wave' && ticks < 1200) { stepTower(predicted); ticks++; }
      f.advance(ticks * 50);
      const accepted = await f.tower('checkpointTowerRun', operation({ runId: run.runId, revision: run.revision, commands, ticks, expectedHash: towerStateHash(predicted) }));
      expect(accepted.ok).toBe(true); run = accepted.result.run;
    }
    expect(run.verifiedWave).toBeLessThan(run.checkpoint.wave);
    const finished = await f.tower('finishTowerRun', operation({ runId: run.runId, endReason: 'defeat' }));
    expect(finished.result.verifiedWave).toBe(run.checkpoint.completedWave); expect(finished.result.rewardAmount).toBe(0);
    ({ run } = await f.start()); f.sqlite.prepare("UPDATE chipper_tower_runs SET config_version='future-2' WHERE run_id=?").run(run.runId);
    expect((await f.tower('getTowerRun')).error.code).toBe('RULES_VERSION_UNSUPPORTED');
    expect((await f.tower('startTowerRun', operation())).error.code).toBe('RULES_VERSION_UNSUPPORTED');
    expect(f.sqlite.prepare("SELECT count(*) AS total FROM chipper_tower_runs WHERE status='active'").get().total).toBe(1);
  });

  it('measures bounded headless verifier at representative full board rather than promising cloud CPU', async () => {
    const f = await towerFixture(); const { run: start } = await f.start(); const run = await playWaves(f, start, 25);
    const state = structuredClone(run.checkpoint); applyTowerCommand(state, { type: 'startWave' });
    let ticks = 0; const simulated = structuredClone(state); while (simulated.phase === 'wave') { stepTower(simulated); ticks++; }
    const begin = performance.now(); const replayed = replayTowerCheckpoint(run.checkpoint, [{ type: 'startWave' }], ticks);
    const elapsed = performance.now() - begin;
    console.log('TD verifier local evidence', JSON.stringify({ wave: 26, towers: state.towers.length, ticks, elapsedMs: Number(elapsed.toFixed(2)), checkpointBytes: Buffer.byteLength(JSON.stringify(replayed)), budgetTicks: TOWER_LIMITS.maxTicks }));
    expect(elapsed).toBeLessThan(5000); expect(Buffer.byteLength(JSON.stringify(replayed))).toBeLessThan(TOWER_LIMITS.maxBytes);
  });
});
