import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { describe, expect, it } from 'vitest';
import { fixture, operation } from './helpers.js';

const storeUrl = new URL('../tgcloud/lib/store.js', import.meta.url).href;
const serviceUrl = new URL('../tgcloud/lib/service.js', import.meta.url).href;
const workerSource = `
const { parentPort, workerData } = require('node:worker_threads');
const { DatabaseSync } = require('node:sqlite');
(async () => {
  const { createSqliteStore } = await import(workerData.storeUrl);
  const { createGameService } = await import(workerData.serviceUrl);
  const sqlite = new DatabaseSync(workerData.path);
  sqlite.exec('PRAGMA busy_timeout=5000');
  const database = {
    async get(query, params) { return sqlite.prepare(query).get(params ?? {}) ?? null; },
    async run(query, params) {
      const statement = sqlite.prepare(query);
      if (/\\bRETURNING\\b/i.test(query)) {
        const rows = statement.all(params ?? {});
        return { rows, rowsAffected: rows.length, lastInsertRowid: 0 };
      }
      const result = statement.run(params ?? {});
      return { rows: [], rowsAffected: result.changes, lastInsertRowid: result.lastInsertRowid };
    },
  };
  const service = createGameService({ store: createSqliteStore(database), now: () => workerData.now });
  parentPort.postMessage({ ready: true });
  Atomics.wait(new Int32Array(workerData.start), 0, 0);
  const result = await service.call(workerData.method, workerData.request, { initData: { user: { id: 101 } } });
  sqlite.close(); parentPort.postMessage({ result });
})().catch(error => { parentPort.postMessage({ failure: error.message }); });
`;

async function parallelCalls(path, now, calls) {
  const start = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
  const workers = [];
  let ready = 0;
  try {
    return await Promise.all(calls.map(call => new Promise((resolve, reject) => {
      const worker = new Worker(workerSource, { eval: true, workerData: { ...call, path, now, start, storeUrl, serviceUrl } });
      workers.push(worker);
      worker.on('error', reject);
      worker.on('message', message => {
        if (message.failure) reject(new Error(message.failure));
        if (message.ready) {
          ready += 1;
          if (ready === calls.length) { Atomics.store(new Int32Array(start), 0, 1); Atomics.notify(new Int32Array(start), 0); }
        }
        if (message.result) resolve(message.result);
      });
    })));
  } finally { await Promise.all(workers.map(worker => worker.terminate())); }
}

describe('daily bonus across independent SQLite connections and worker isolates', () => {
  it('D03 ten competing devices with different UUIDs produce one durable credit', async () => {
    const f = fixture(); await f.initial();
    const directory = mkdtempSync(join(tmpdir(), 'chipper-daily-')); const path = join(directory, 'players.sqlite');
    try {
      // Test-only durable copy. Production runtime never VACUUMs/changes PRAGMA.
      f.sqlite.prepare('VACUUM INTO ?').run(path);
      const requests = Array.from({ length: 10 }, () => operation());
      const results = await parallelCalls(path, f.now, requests.map(request => ({ method: 'claimDailyBonus', request })));
      expect(results.filter(result => result.ok)).toHaveLength(1);
      expect(results.filter(result => !result.ok).every(result => result.error.code === 'ALREADY_CLAIMED')).toBe(true);
      const sqlite = new DatabaseSync(path);
      const saved = JSON.parse(sqlite.prepare('SELECT state_json FROM chipper_players WHERE telegram_id=101').get().state_json);
      sqlite.close();
      expect(saved.player.feathers).toBe(1);
      expect(saved.player.dailyBonus.claimsTotal).toBe(1);
      expect(requests.filter(request => Object.hasOwn(saved.receipts, request.operationId))).toHaveLength(1);
      const winner = requests[results.findIndex(result => result.ok)];
      expect((await parallelCalls(path, f.now, [{ method: 'claimDailyBonus', request: winner }]))[0].result.rewardAmount).toBe(1);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }, 20000);

  it('D02/D08 ten identical device claims alongside care keep both credits and receipts', async () => {
    const f = fixture(); const chickId = await f.initial();
    const directory = mkdtempSync(join(tmpdir(), 'chipper-daily-care-')); const path = join(directory, 'players.sqlite');
    try {
      f.sqlite.prepare('VACUUM INTO ?').run(path);
      const request = operation();
      const calls = [
        ...Array.from({ length: 10 }, () => ({ method: 'claimDailyBonus', request })),
        { method: 'careAction', request: operation({ chickId, action: 'feed' }) },
        { method: 'careAction', request: operation({ chickId, action: 'play' }) },
      ];
      const results = await parallelCalls(path, f.now, calls);
      expect(results.every(result => result.ok)).toBe(true);
      expect(new Set(results.slice(0, 10).map(result => JSON.stringify(result.result))).size).toBe(1);
      const sqlite = new DatabaseSync(path);
      const saved = JSON.parse(sqlite.prepare('SELECT state_json FROM chipper_players WHERE telegram_id=101').get().state_json);
      sqlite.close();
      expect(saved.player.feathers).toBe(2);
      expect(saved.player.dailyBonus.claimsTotal).toBe(1);
      expect(saved.chicks[0].careMilestones).toHaveLength(1);
      expect(calls.every(call => Object.hasOwn(saved.receipts, call.request.operationId))).toBe(true);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }, 20000);
});
