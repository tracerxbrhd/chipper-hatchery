import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { exchangeFixture } from './exchanges-helpers.js';
import { operation } from './helpers.js';

const modules = Object.fromEntries(['exchanges', 'store', 'service'].map(name => [name, new URL(`../tgcloud/lib/${name}.js`, import.meta.url).href]));
const workerSource = `
const { parentPort, workerData:w } = require('node:worker_threads');
const { DatabaseSync } = require('node:sqlite');
(async()=>{
 const {createExchangeService}=await import(w.modules.exchanges), {createSqliteStore}=await import(w.modules.store), {createGameService}=await import(w.modules.service);
 const sqlite=new DatabaseSync(w.path);sqlite.exec('PRAGMA busy_timeout=10000');
 const database={async get(q,p){return sqlite.prepare(q).get(p??{})??null;},async all(q,p){return sqlite.prepare(q).all(p??{});},
  async run(q,p){const s=sqlite.prepare(q);if(/\\bRETURNING\\b/i.test(q)){const rows=s.all(p??{});return{rows,rowsAffected:rows.length};}const r=s.run(p??{});return{rows:[],rowsAffected:r.changes};}};
 const store=createSqliteStore(database),gameService=createGameService({store,now:()=>w.now});
 const exchange=createExchangeService({database,store,gameService,now:()=>w.now});
 parentPort.postMessage({ready:true});Atomics.wait(new Int32Array(w.start),0,0);
 const result=await (w.method==='claimAchievement'?gameService:exchange).call(w.method,w.request,{initData:{user:{id:w.actor}}});
 sqlite.close();parentPort.postMessage({result});
})().catch(e=>parentPort.postMessage({failure:e.message}));`;
async function parallel(path, now, calls) {
  const start = new SharedArrayBuffer(4), workers = []; let ready = 0;
  try {
    return await Promise.all(calls.map(call => new Promise((resolve, reject) => {
      const worker = new Worker(workerSource, { eval: true, workerData: { ...call, path, now, start, modules } }); workers.push(worker);
      worker.on('error', reject); worker.on('message', message => {
        if (message.failure) reject(new Error(message.failure));
        if (message.ready && ++ready === calls.length) { Atomics.store(new Int32Array(start), 0, 1); Atomics.notify(new Int32Array(start), 0); }
        if (message.result) resolve(message.result);
      });
    })));
  } finally { await Promise.all(workers.map(worker => worker.terminate())); }
}
function states(db) { return db.prepare('SELECT telegram_id,state_json FROM chipper_players').all().map(row => ({ owner: row.telegram_id, state: JSON.parse(row.state_json) })); }
describe('exchange and achievement independent SQLite worker races', () => {
  it('ten simultaneous exchange accepts leave two unique correct owners and durable replay', async () => {
    const f = await exchangeFixture(), { exchangeId } = await f.offerExchange();
    const dir = mkdtempSync(join(tmpdir(), 'chipper-exchange-')), path = join(dir, 'state.sqlite');
    try {
      f.sqlite.prepare('VACUUM INTO ?').run(path);
      const calls = Array.from({ length: 10 }, () => ({ method: 'respondExchange', actor: 202, request: operation({ exchangeId, accept: true }) }));
      const results = await parallel(path, f.now, calls); expect(results.every(x => x.ok), JSON.stringify(results.filter(x => !x.ok))).toBe(true);
      const db = new DatabaseSync(path), all = states(db);
      expect(all.filter(row => row.state.chicks.some(chick => chick.id === f.extra.id)).map(x => x.owner)).toEqual([202]);
      expect(all.filter(row => row.state.chicks.some(chick => chick.id === f.requested.id)).map(x => x.owner)).toEqual([101]);
      expect(all.find(x => x.owner === 101).state.exchanges).toEqual(all.find(x => x.owner === 202).state.exchanges); db.close();
      expect((await parallel(path, f.now, [calls[0]]))[0].result.exchange.status).toBe('accepted');
    } finally { f.sqlite.close(); rmSync(dir, { recursive: true, force: true }); }
  }, 30000);
  it('cancel versus accept commits exactly one terminal outcome', async () => {
    const f = await exchangeFixture(), { exchangeId } = await f.offerExchange();
    const dir = mkdtempSync(join(tmpdir(), 'chipper-exchange-cancel-')), path = join(dir, 'state.sqlite');
    try {
      f.sqlite.prepare('VACUUM INTO ?').run(path);
      const results = await parallel(path, f.now, [
        { method: 'respondExchange', actor: 202, request: operation({ exchangeId, accept: true }) },
        { method: 'cancelExchange', actor: 101, request: operation({ exchangeId }) },
      ]);
      expect(results.filter(x => x.ok)).toHaveLength(1);
      const db = new DatabaseSync(path), all = states(db), status = all.find(x => x.owner === 101).state.exchanges[0].status;
      expect(['accepted', 'cancelled']).toContain(status);
      expect(all.filter(row => row.state.chicks.some(chick => chick.id === f.extra.id)).map(x => x.owner)).toEqual([status === 'accepted' ? 202 : 101]);
      expect(all.filter(row => row.state.chicks.some(chick => chick.id === f.requested.id)).map(x => x.owner)).toEqual([status === 'accepted' ? 101 : 202]); db.close();
    } finally { f.sqlite.close(); rmSync(dir, { recursive: true, force: true }); }
  }, 30000);
  it('ten distinct achievement claim UUIDs pay the entitlement once', async () => {
    const f = await exchangeFixture(); await f.call('careAction', operation({ chickId: (await f.store.read('101')).state.player.activeChickId, action: 'feed' }));
    const dir = mkdtempSync(join(tmpdir(), 'chipper-achievement-')), path = join(dir, 'state.sqlite');
    try {
      f.sqlite.prepare('VACUUM INTO ?').run(path);
      const results = await parallel(path, f.now, Array.from({ length: 10 }, () => ({ method: 'claimAchievement', actor: 101, request: operation({ achievementId: 'first-feed' }) })));
      expect(results.filter(x => x.ok)).toHaveLength(1); expect(results.filter(x => !x.ok).every(x => x.error.code === 'ALREADY_CLAIMED')).toBe(true);
      const db = new DatabaseSync(path), own = states(db).find(x => x.owner === 101).state;
      expect(own.player.feathers).toBe(1); expect(Object.keys(own.player.achievements.claimed)).toEqual(['first-feed']); db.close();
    } finally { f.sqlite.close(); rmSync(dir, { recursive: true, force: true }); }
  }, 30000);
});
