/** Dependency-free diagnostic, not a replacement for npm check or browser QA.
 * Run: node tests/exchanges-native-smoke.js
 * Uses production services with synthetic in-memory/on-disk local SQLite only.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { DatabaseSync } from 'node:sqlite';
import { exchangeFixture } from './exchanges-helpers.js';
import { operation } from './helpers.js';
import { EXCHANGE_TTL_MS } from '../tgcloud/lib/exchanges.js';

let groups = 0;
async function run(name, work) { await work(); groups++; console.log(`PASS ${name}`); }
await run('atomic original bird swap, reservation and both-owner social achievements', async () => {
  const f = await exchangeFixture();
  try {
    const beforeA = (await f.store.read('101')).state, beforeB = (await f.store.read('202')).state;
    const { exchangeId, request } = await f.offerExchange();
    assert.equal((await f.call('activateChick', operation({ chickId: f.extra.id }))).error.code, 'CHICK_RESERVED');
    assert.equal((await f.call('renameChick', operation({ chickId: f.extra.id, name: 'Нет' }))).error.code, 'CHICK_RESERVED');
    assert.equal((await f.gift('offerGift', operation({ chickId: f.extra.id, recipientProfileId: f.profileId(202) }))).error.code, 'CHICK_RESERVED');
    const results = await Promise.all([...Array.from({ length: 10 }, () => f.exchange('respondExchange', operation({ exchangeId, accept: true }), 202)), f.call('claimDailyBonus', operation(), 202)]);
    assert(results.every(x => x.ok), JSON.stringify(results.filter(x => !x.ok)));
    const a = (await f.store.read('101')).state, b = (await f.store.read('202')).state;
    assert.deepEqual(a.chicks.find(x => x.id === f.requested.id), beforeB.chicks.find(x => x.id === f.requested.id));
    assert.deepEqual(b.chicks.find(x => x.id === f.extra.id), beforeA.chicks.find(x => x.id === f.extra.id));
    assert.deepEqual(a.exchanges, b.exchanges); assert.deepEqual(f.owners(), [202]); assert.deepEqual(f.owners(f.requested.id), [101]);
    assert.equal((await f.exchange('offerExchange', request)).result.exchange.status, 'accepted');
    for (const actor of [101, 202]) {
      assert.equal((await f.store.read(String(actor))).state.telemetry.totals.exchange_accepted, 1);
      assert((await f.call('claimAchievement', operation({ achievementId: 'exchange-first' }), actor)).ok);
    }
    assert.equal(f.totalFeathers(), 3);
    const gift = await f.offer(202, f.requested.id); assert((await f.gift('respondGift', operation({ giftId: gift.giftId, accept: true }), 202)).ok);
    for (const actor of [101, 202]) assert((await f.call('claimAchievement', operation({ achievementId: 'gift-first' }), actor)).ok);
    assert.equal(f.totalFeathers(), 5);
  } finally { f.sqlite.close(); }
});
await run('eight accept/cancel races leave one terminal outcome and unique owners', async () => {
  for (let n = 0; n < 8; n++) {
    const f = await exchangeFixture();
    try {
      const { exchangeId } = await f.offerExchange();
      const results = await Promise.all([f.exchange('respondExchange', operation({ exchangeId, accept: true }), 202), f.exchange('cancelExchange', operation({ exchangeId }))]);
      assert.equal(results.filter(x => x.ok).length, 1);
      assert.equal(f.owners().length, 1); assert.equal(f.owners(f.requested.id).length, 1);
      assert.deepEqual((await f.store.read('101')).state.exchanges, (await f.store.read('202')).state.exchanges);
    } finally { f.sqlite.close(); }
  }
});
await run('lost committed replies, expiry, no private collection probing and before-commit revoke', async () => {
  const f = await exchangeFixture();
  try {
    const request = operation({ chickId: f.extra.id, recipientProfileId: f.profileId(202), requestedChickId: f.requested.id });
    f.sqlite.prepare("UPDATE chipper_social_profiles SET collection_visibility='private' WHERE telegram_id=202").run();
    assert.equal((await f.exchange('offerExchange', request)).error.code, 'EXCHANGE_UNAVAILABLE');
    f.sqlite.prepare("UPDATE chipper_social_profiles SET collection_visibility='friends' WHERE telegram_id=202").run();
    f.loseNextResponse(); assert.equal((await f.exchange('offerExchange', request)).ok, false); f.restartExchange();
    const exchangeId = (await f.exchange('offerExchange', request)).result.exchange.exchangeId;
    assert.equal((await f.store.read('101')).state.exchanges.length, 1);
    assert.equal((await f.call('claimDailyBonus', { operationId: request.operationId })).error.code, 'OPERATION_CONFLICT');
    f.interceptOnce(({ type, query }) => {
      if (type === 'run' && query.includes('WITH eligible AS MATERIALIZED')) { f.sqlite.prepare('UPDATE chipper_friendships SET low_blocked=1').run(); return true; }
      return false;
    });
    assert.equal((await f.exchange('respondExchange', operation({ exchangeId, accept: true }), 202)).error.code, 'FRIEND_REQUIRED');
    f.advance(EXCHANGE_TTL_MS); assert.equal((await f.exchange('listExchanges')).result.exchanges[0].status, 'expired');
    assert((await f.call('activateChick', operation({ chickId: f.extra.id }))).ok);
  } finally { f.sqlite.close(); }
});
await run('SQLite second-row abort rolls back both collections and history', async () => {
  const f = await exchangeFixture();
  try {
    const { exchangeId } = await f.offerExchange(), before = [await f.store.read('101'), await f.store.read('202')];
    f.sqlite.exec("CREATE TRIGGER fail_exchange BEFORE UPDATE ON chipper_players WHEN OLD.telegram_id=202 BEGIN SELECT RAISE(ABORT,'injected'); END");
    assert.equal((await f.exchange('respondExchange', operation({ exchangeId, accept: true }), 202)).ok, false);
    assert.deepEqual([await f.store.read('101'), await f.store.read('202')], before);
  } finally { f.sqlite.close(); }
});
await run('future entitlement schema refuses all writers before CAS; no client unlocks', async () => {
  const f = await exchangeFixture();
  try {
    assert.equal((await f.call('claimAchievement', operation({ achievementId: 'gift-first' }))).error.code, 'ACHIEVEMENT_LOCKED');
    assert.equal((await f.call('logEvent', operation({ event: 'gift_accepted' }))).error.code, 'INVALID_REQUEST');
    const row = await f.store.read('101'); row.state.player.achievements = { version: 2, claimed: { future: f.now } };
    await f.store.compareAndSwap('101', row.revision, row.state); const before = await f.store.read('101');
    assert.equal((await f.call('claimDailyBonus', operation())).error.code, 'INVALID_SAVE'); assert.deepEqual(await f.store.read('101'), before);
  } finally { f.sqlite.close(); }
});

const modules = Object.fromEntries(['exchanges', 'store', 'service'].map(name => [name, new URL(`../tgcloud/lib/${name}.js`, import.meta.url).href]));
const workerSource = `
const{parentPort,workerData:w}=require('node:worker_threads'),{DatabaseSync}=require('node:sqlite');
(async()=>{const{createExchangeService}=await import(w.modules.exchanges),{createSqliteStore}=await import(w.modules.store),{createGameService}=await import(w.modules.service);
const s=new DatabaseSync(w.path);s.exec('PRAGMA busy_timeout=10000');const database={async get(q,p){return s.prepare(q).get(p??{})??null;},async run(q,p){const a=s.prepare(q);if(/\\bRETURNING\\b/i.test(q)){const rows=a.all(p??{});return{rows,rowsAffected:rows.length};}return{rows:[],rowsAffected:a.run(p??{}).changes};}};
const store=createSqliteStore(database),game=createGameService({store,now:()=>w.now}),exchange=createExchangeService({database,store,gameService:game,now:()=>w.now});
parentPort.postMessage({ready:true});Atomics.wait(new Int32Array(w.start),0,0);const result=await(w.method==='claimAchievement'?game:exchange).call(w.method,w.request,{initData:{user:{id:w.actor}}});s.close();parentPort.postMessage({result});})().catch(e=>parentPort.postMessage({failure:e.message}));`;
async function workers(path, now, calls) {
  const start = new SharedArrayBuffer(4), all = []; let ready = 0;
  try {
    return await Promise.all(calls.map(call => new Promise((resolve, reject) => {
      const worker = new Worker(workerSource, { eval: true, execArgv: [], workerData: { ...call, path, now, start, modules } }); all.push(worker);
      worker.on('error', reject); worker.on('message', message => {
        if (message.failure) reject(Error(message.failure));
        if (message.ready && ++ready === calls.length) { Atomics.store(new Int32Array(start), 0, 1); Atomics.notify(new Int32Array(start), 0); }
        if (message.result) resolve(message.result);
      });
    })));
  } finally { await Promise.all(all.map(worker => worker.terminate())); }
}
await run('ten independent SQLite writers swap once and pay achievement once', async () => {
  const f = await exchangeFixture(), { exchangeId } = await f.offerExchange();
  const dir = mkdtempSync(join(tmpdir(), 'chipper-exchange-smoke-')), path = join(dir, 'state.sqlite');
  try {
    f.sqlite.prepare('VACUUM INTO ?').run(path);
    const accepts = await workers(path, f.now, Array.from({ length: 10 }, () => ({ method: 'respondExchange', actor: 202, request: operation({ exchangeId, accept: true }) })));
    assert(accepts.every(x => x.ok));
    const key = operation({ achievementId: 'exchange-first' });
    const claims = await workers(path, f.now, Array.from({ length: 10 }, () => ({ method: 'claimAchievement', actor: 202, request: operation({ achievementId: 'exchange-first' }) })));
    assert.equal(claims.filter(x => x.ok).length, 1);
    const again = await workers(path, f.now, [{ method: 'claimAchievement', actor: 202, request: key }]); assert.equal(again[0].error.code, 'ALREADY_CLAIMED');
    const db = new DatabaseSync(path);
    try {
      const states = db.prepare('SELECT telegram_id,state_json FROM chipper_players').all().map(row => ({ id: row.telegram_id, state: JSON.parse(row.state_json) }));
      assert.equal(states.find(x => x.id === 202).state.player.feathers, 1);
      assert.deepEqual(states.filter(x => x.state.chicks.some(b => b.id === f.extra.id)).map(x => x.id), [202]);
      assert.deepEqual(states.filter(x => x.state.chicks.some(b => b.id === f.requested.id)).map(x => x.id), [101]);
    } finally { db.close(); }
  } finally { f.sqlite.close(); rmSync(dir, { recursive: true, force: true }); }
});
console.log(`Exchange/achievement Node + real SQLite smoke: ${groups} groups PASS. Full npm/browser gates remain separate.`);
