import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { consumeRequestBudget, createRequestBudget } from '../tgcloud/lib/requestBudget.js';

function budgetFixture(path = ':memory:') {
  const sqlite = new DatabaseSync(path);
  sqlite.exec("CREATE TABLE chipper_social_limits(key TEXT PRIMARY KEY,window_start INTEGER NOT NULL,count INTEGER NOT NULL,seen_json TEXT NOT NULL DEFAULT '{}')");
  const database = {
    async run(query, params) { const rows = sqlite.prepare(query).all(params ?? {}); return { rows, rowsAffected: rows.length }; },
    async get(query, params) { return sqlite.prepare(query).get(params ?? {}) ?? null; },
  };
  return { sqlite, database, row: (kind = 'listTraitCodex', actor = 101) => sqlite.prepare('SELECT * FROM chipper_social_limits WHERE key=?').get(`v04:${actor}:${kind}`) };
}
const request = (overrides = {}) => ({ actor: '101', kind: 'listTraitCodex', limit: 60, now: 1791810000000, ...overrides });

describe('v0.4 SQLite atomic request budgets', () => {
  it('60 simultaneous fresh requests accepted, overflow does not increment count or inflate JSON', async () => {
    const f = budgetFixture();
    const requests = Array.from({ length: 71 }, () => request({ operationId: randomUUID() }));
    const responses = await Promise.allSettled(requests.map((params) => consumeRequestBudget(f.database, params)));
    expect(responses.filter((response) => response.status === 'fulfilled')).toHaveLength(60);
    const rejected = responses.filter((response) => response.status === 'rejected');
    expect(rejected).toHaveLength(11);
    expect(rejected.every((response) => response.reason.code === 'REQUEST_RATE_LIMIT' && response.reason.retryable)).toBe(true);
    const full = f.row();
    expect(full.count).toBe(60); expect(Object.keys(JSON.parse(full.seen_json))).toHaveLength(60);
    for (let index = 0; index < 100; index += 1) await expect(consumeRequestBudget(f.database, request({ operationId: randomUUID() }))).rejects.toMatchObject({ code: 'REQUEST_RATE_LIMIT' });
    expect(f.row()).toEqual(full);
    f.sqlite.close();
  });

  it('identical UUID requests charge once, even when the minute budget is full', async () => {
    const f = budgetFixture(); const operationId = randomUUID();
    const calls = await Promise.all(Array.from({ length: 20 }, () => consumeRequestBudget(f.database, request({ limit: 1, operationId }))));
    expect(calls.every((result) => result.count === 1 && result.remaining === 0)).toBe(true);
    expect(f.row().count).toBe(1); expect(Object.keys(JSON.parse(f.row().seen_json))).toEqual([operationId]);
    expect((await consumeRequestBudget(f.database, request({ limit: 1, operationId: operationId.toUpperCase() }))).count).toBe(1);
    await expect(consumeRequestBudget(f.database, request({ limit: 1, operationId: randomUUID() }))).rejects.toMatchObject({ code: 'REQUEST_RATE_LIMIT' });
    f.sqlite.close();
  });

  it('read requests without UUID charge each call and never retain a request trace', async () => {
    const f = budgetFixture();
    for (let index = 0; index < 60; index += 1) expect((await consumeRequestBudget(f.database, request())).count).toBe(index + 1);
    expect(f.row().seen_json).toBe('{}');
    await expect(consumeRequestBudget(f.database, request())).rejects.toMatchObject({ code: 'REQUEST_RATE_LIMIT' });
    expect(f.row().count).toBe(60);
    f.sqlite.close();
  });

  it('exact next-minute reset clears seen UUIDs; backwards clock does not open another budget', async () => {
    const f = budgetFixture(); const operationId = randomUUID();
    const first = await consumeRequestBudget(f.database, request({ limit: 1, operationId }));
    await expect(consumeRequestBudget(f.database, request({ limit: 1, now: first.retryAt - 1 }))).rejects.toMatchObject({ retryAt: first.retryAt });
    const next = await consumeRequestBudget(f.database, request({ limit: 1, now: first.retryAt, operationId: randomUUID() }));
    expect(next.count).toBe(1); expect(next.windowStart).toBe(first.retryAt);
    expect(Object.keys(JSON.parse(f.row().seen_json))).toHaveLength(1);
    expect(Object.keys(JSON.parse(f.row().seen_json))).not.toContain(operationId);
    await expect(consumeRequestBudget(f.database, request({ limit: 1, now: first.windowStart - 60000 }))).rejects.toMatchObject({ retryAt: next.retryAt });
    expect(f.row().window_start).toBe(next.windowStart);
    f.sqlite.close();
  });

  it('budgets are independent by actor/method and isolated from old social namespaces', async () => {
    const f = budgetFixture();
    for (const params of [request(), request({ actor: 202 }), request({ kind: 'getDailyBonus' }), request({ kind: 'claimDailyBonus' }), request({ kind: 'getHome', limit: 120 })]) {
      expect((await consumeRequestBudget(f.database, params)).count).toBe(1);
    }
    expect(f.sqlite.prepare('SELECT COUNT(*) AS size FROM chipper_social_limits').get().size).toBe(5);
    expect(f.sqlite.prepare('SELECT * FROM chipper_social_limits WHERE key=?').get('101:read')).toBeUndefined();
    f.sqlite.close();
  });

  it('invalid UUID/path/actor/config/clock inputs never write or retain untrusted body fields', async () => {
    const f = budgetFixture();
    for (const bad of [{ operationId: 'x"].injected' }, { actor: '101:evil' }, { actor: 0 }, { kind: 'claimDailyBonus:evil' }, { kind: 'x"' }, { limit: 0 }, { limit: 1001 }, { now: -1 }, { now: NaN }]) {
      await expect(consumeRequestBudget(f.database, request(bad))).rejects.toBeDefined();
    }
    expect(f.sqlite.prepare('SELECT COUNT(*) AS size FROM chipper_social_limits').get().size).toBe(0);
    f.sqlite.close();
  });

  it('factory uses server clock and ignores caller-supplied now override', async () => {
    const f = budgetFixture();
    const budget = createRequestBudget({ database: f.database, now: () => 60000 });
    const response = await budget.consume(request({ now: 0 }));
    expect(response.windowStart).toBe(60000);
    f.sqlite.close();
  });
});

const moduleUrl = new URL('../tgcloud/lib/requestBudget.js', import.meta.url).href;
const workerSource = `
const { parentPort, workerData } = require('node:worker_threads');
const { DatabaseSync } = require('node:sqlite');
(async () => {
  const { consumeRequestBudget } = await import(workerData.moduleUrl);
  const sqlite = new DatabaseSync(workerData.path); sqlite.exec('PRAGMA busy_timeout=5000');
  const database = {
    async run(query, params) { const rows=sqlite.prepare(query).all(params??{}); return {rows,rowsAffected:rows.length}; },
    async get(query, params) { return sqlite.prepare(query).get(params??{})??null; },
  };
  parentPort.postMessage({ready:true}); Atomics.wait(new Int32Array(workerData.start),0,0);
  let result;
  try { result={ok:true,result:await consumeRequestBudget(database,workerData.request)}; }
  catch(error) { result={ok:false,code:error.code}; }
  sqlite.close(); parentPort.postMessage({result});
})().catch(error=>parentPort.postMessage({failure:error.message}));
`;

async function independentCalls(path, requests) {
  const start = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT); const workers = []; let ready = 0;
  try {
    return await Promise.all(requests.map((params) => new Promise((resolve, reject) => {
      const worker = new Worker(workerSource, { eval: true, workerData: { path, request: params, start, moduleUrl } }); workers.push(worker);
      worker.on('error', reject); worker.on('message', (message) => {
        if (message.failure) reject(new Error(message.failure));
        if (message.ready && ++ready === requests.length) { Atomics.store(new Int32Array(start), 0, 1); Atomics.notify(new Int32Array(start), 0); }
        if (message.result) resolve(message.result);
      });
    })));
  } finally { await Promise.all(workers.map((worker) => worker.terminate())); }
}

describe('v0.4 budgets across independent SQLite worker connections', () => {
  it('11 competing devices admit exactly limit=6; identical retry cannot consume another slot', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'chipper-budget-v04-')); const path = join(directory, 'budget.sqlite');
    try {
      const f = budgetFixture(path); f.sqlite.close();
      const requests = Array.from({ length: 11 }, () => request({ kind: 'claimDailyBonus', limit: 6, operationId: randomUUID() }));
      const results = await independentCalls(path, requests);
      expect(results.filter((result) => result.ok)).toHaveLength(6);
      expect(results.filter((result) => !result.ok).every((result) => result.code === 'REQUEST_RATE_LIMIT')).toBe(true);
      const winner = requests[results.findIndex((result) => result.ok)];
      const replays = await independentCalls(path, Array.from({ length: 11 }, () => winner));
      expect(replays.every((result) => result.ok && result.result.count === 6)).toBe(true);
      const sqlite = new DatabaseSync(path); const saved = sqlite.prepare('SELECT * FROM chipper_social_limits').get(); sqlite.close();
      expect(saved.count).toBe(6); expect(Object.keys(JSON.parse(saved.seen_json))).toHaveLength(6);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }, 20000);
});
