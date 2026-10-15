import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { operation, ctx } from './helpers.js';
import { towerFixture, playWaves } from './tower-server-helpers.js';
import { createGiftService } from '../tgcloud/lib/gifts.js';

const urls = Object.fromEntries(['towerService', 'store', 'service', 'gifts'].map(module => [`${module}Url`, new URL(`../tgcloud/lib/${module}.js`, import.meta.url).href]));
const workerSource = `
const { parentPort,workerData }=require('node:worker_threads');
const { DatabaseSync }=require('node:sqlite');
(async()=>{
  const {createTowerService}=await import(workerData.towerServiceUrl);
  const {createSqliteStore}=await import(workerData.storeUrl);
  const {createGameService}=await import(workerData.serviceUrl);
  const {createGiftService}=await import(workerData.giftsUrl);
  const sqlite=new DatabaseSync(workerData.path);sqlite.exec('PRAGMA busy_timeout=5000');
  const database={
    async get(sql,params){return sqlite.prepare(sql).get(params??{})??null;},
    async all(sql,params){return sqlite.prepare(sql).all(params??{});},
    async run(sql,params){const statement=sqlite.prepare(sql);
      if(/\\bRETURNING\\b/i.test(sql)){const rows=statement.all(params??{});return {rows,rowsAffected:rows.length,lastInsertRowid:0};}
      const result=statement.run(params??{});return {rows:[],rowsAffected:result.changes,lastInsertRowid:result.lastInsertRowid};},
  };
  const store=createSqliteStore(database), gameService=createGameService({store,now:()=>workerData.now});
  const options={database,store,gameService,now:()=>workerData.now};
  const tower=createTowerService(options),gifts=createGiftService(options);
  parentPort.postMessage({ready:true});Atomics.wait(new Int32Array(workerData.start),0,0);
  const service=workerData.kind==='game'?gameService:workerData.kind==='gift'?gifts:tower;
  const result=await service.call(workerData.method,workerData.request,{initData:{user:{id:workerData.actor??101}}});
  sqlite.close();parentPort.postMessage({result});
})().catch(error=>parentPort.postMessage({failure:error.message}));`;

async function callsTogether(path, now, calls) {
  const start = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT); let ready = 0; const workers = [];
  try {
    return await Promise.all(calls.map(call => new Promise((resolve, reject) => {
      const worker = new Worker(workerSource, { eval: true, workerData: { ...call, path, now, start, ...urls } }); workers.push(worker);
      worker.on('error', reject);
      worker.on('message', message => {
        if (message.failure) reject(new Error(message.failure));
        if (message.ready) { ready++; if (ready === calls.length) { Atomics.store(new Int32Array(start), 0, 1); Atomics.notify(new Int32Array(start), 0); } }
        if (message.result) resolve(message.result);
      });
    })));
  } finally { await Promise.all(workers.map(worker => worker.terminate())); }
}

describe('TD independent SQLite connections/isolate proof', () => {
  it('10 finishers plus real daily and gift accept converge on 5 feathers, one completion and one chick owner', async () => {
    const f = await towerFixture(); await f.initial(202);
    const owner = await f.store.read('202'); const extra = structuredClone(owner.state.chicks[0]); extra.id = randomUUID();
    owner.state.chicks.push(extra); await f.store.compareAndSwap('202', owner.revision, owner.state);
    const profileId = actor => String(actor).padStart(64, '0');
    for (const actor of [101, 202]) f.sqlite.prepare('INSERT INTO chipper_social_profiles(telegram_id,public_id,display_name,updated_at) VALUES(?,?,?,?)').run(actor, profileId(actor), `Гнездо ${actor}`, f.now);
    f.sqlite.prepare("INSERT INTO chipper_friendships(pair_key,friendship_id,low_id,high_id,requested_by,status,created_at,updated_at) VALUES('101:202',:id,101,202,202,'accepted',:now,:now)").run({ ':id': randomUUID(), ':now': f.now });
    const gifts = createGiftService({ database: f.database, store: f.store, gameService: f.service, now: () => f.now, id: randomUUID });
    const offer = await gifts.call('offerGift', operation({ chickId: extra.id, recipientProfileId: profileId(101) }), ctx(202)); expect(offer.ok).toBe(true);
    const { run: initial } = await f.start(); const run = await playWaves(f, initial, 25);
    const directory = mkdtempSync(join(tmpdir(), 'chipper-tower-sqlite-')); const path = join(directory, 'game.sqlite');
    try {
      f.sqlite.prepare('VACUUM INTO ?').run(path);
      const finishes = Array.from({ length: 10 }, () => ({ method: 'finishTowerRun', request: operation({ runId: run.runId, endReason: 'retire' }) }));
      const calls = [...finishes,
        { kind: 'game', method: 'claimDailyBonus', request: operation() },
        { kind: 'gift', method: 'respondGift', request: operation({ giftId: offer.result.gift.giftId, accept: true }) },
      ];
      const results = await callsTogether(path, f.now, calls); expect(results.every(result => result.ok), JSON.stringify(results.map(result => result.ok ? 'ok' : result.error))).toBe(true);
      const sqlite = new DatabaseSync(path); const states = sqlite.prepare('SELECT telegram_id,state_json FROM chipper_players').all();
      const state = JSON.parse(states.find(row => row.telegram_id === 101).state_json);
      expect(state.player.feathers).toBe(5); expect(state.player.games['nest-defense'].completedRuns).toBe(1);
      expect(Object.keys(state.towerReceipts)).toEqual([run.runId]);
      expect(states.filter(row => JSON.parse(row.state_json).chicks.some(chick => chick.id === extra.id)).map(row => row.telegram_id)).toEqual([101]);
      expect(sqlite.prepare('SELECT status,checkpoint_json FROM chipper_tower_runs WHERE run_id=?').get(run.runId)).toEqual({ status: 'finished', checkpoint_json: '{}' }); sqlite.close();
      const retry = await callsTogether(path, f.now, [finishes[0]]); expect(retry[0].result.rewardAmount).toBe(4);
      const afterRetry = new DatabaseSync(path); expect(JSON.parse(afterRetry.prepare('SELECT state_json FROM chipper_players WHERE telegram_id=101').get().state_json).player.feathers).toBe(5); afterRetry.close();
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }, 20000);

  it('two device checkpoints on independent connections advance a revision once; starts obey partial unique index', async () => {
    const f = await towerFixture(); const { run } = await f.start();
    const { towerStateHash } = await import('../tgcloud/lib/towerRules.js');
    const directory = mkdtempSync(join(tmpdir(), 'chipper-tower-checkpoint-')); const path = join(directory, 'game.sqlite');
    try {
      f.sqlite.prepare('VACUUM INTO ?').run(path);
      const requests = Array.from({ length: 2 }, () => ({ method: 'checkpointTowerRun', request: operation({ runId: run.runId, revision: 0, commands: [], ticks: 0, expectedHash: towerStateHash(run.checkpoint) }) }));
      const results = await callsTogether(path, f.now, requests); expect(results.filter(result => result.ok)).toHaveLength(1);
      expect(results.find(result => !result.ok).error.code).toBe('RUN_CONFLICT');
      const starts = await callsTogether(path, f.now, Array.from({ length: 5 }, () => ({ method: 'startTowerRun', request: operation() })));
      expect(starts.every(result => result.ok && result.result.run.runId === run.runId)).toBe(true);
      const sqlite = new DatabaseSync(path); expect(sqlite.prepare('SELECT count(*) AS total FROM chipper_tower_runs').get().total).toBe(1); sqlite.close();
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }, 20000);
});
