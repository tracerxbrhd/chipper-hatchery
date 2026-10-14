import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { describe, expect, it } from 'vitest';
import { giftFixture } from './gifts-helpers.js';
import { operation } from './helpers.js';

const giftsUrl = new URL('../tgcloud/lib/gifts.js', import.meta.url).href;
const storeUrl = new URL('../tgcloud/lib/store.js', import.meta.url).href;
const serviceUrl = new URL('../tgcloud/lib/service.js', import.meta.url).href;
const workerSource = `
const { parentPort, workerData } = require('node:worker_threads');
const { DatabaseSync } = require('node:sqlite');
(async () => {
  const { createGiftService } = await import(workerData.giftsUrl);
  const { createSqliteStore } = await import(workerData.storeUrl);
  const { createGameService } = await import(workerData.serviceUrl);
  const sqlite = new DatabaseSync(workerData.path);
  sqlite.exec('PRAGMA busy_timeout=5000');
  const database = {
    async get(query, params) { return sqlite.prepare(query).get(params ?? {}) ?? null; },
    async all(query, params) { return sqlite.prepare(query).all(params ?? {}); },
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
  const store = createSqliteStore(database);
  const gameService = createGameService({ store, now: () => workerData.now });
  const service = createGiftService({ database, store, gameService, now: () => workerData.now });
  parentPort.postMessage({ ready: true });
  Atomics.wait(new Int32Array(workerData.start), 0, 0);
  const result = await service.call(workerData.method, workerData.request, { initData: { user: { id: workerData.actor } } });
  sqlite.close(); parentPort.postMessage({ result });
})().catch(error => { parentPort.postMessage({ failure: error.message }); });
`;

async function parallelCalls(path, now, calls) {
  const start = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
  let ready = 0;
  const workers = [];
  try {
    return await Promise.all(calls.map((call) => new Promise((resolve, reject) => {
      const worker = new Worker(workerSource, { eval: true, workerData: { ...call, path, now, start, giftsUrl, storeUrl, serviceUrl } });
      workers.push(worker);
      worker.on('error', reject);
      worker.on('message', (message) => {
        if (message.failure) reject(new Error(message.failure));
        if (message.ready) {
          ready += 1;
          if (ready === calls.length) { Atomics.store(new Int32Array(start), 0, 1); Atomics.notify(new Int32Array(start), 0); }
        }
        if (message.result) resolve(message.result);
      });
    })));
  } finally {
    await Promise.all(workers.map((worker) => worker.terminate()));
  }
}

describe('gift writes across independent SQLite connections and worker isolates', () => {
  it('P08/P15 ten simultaneous writers preserve one owner with durable replay', async () => {
    const f = await giftFixture(); const { giftId } = await f.offer();
    const directory = mkdtempSync(join(tmpdir(), 'chipper-gift-'));
    const path = join(directory, 'players.sqlite');
    try {
      // Test-only on-disk copy. Production never issues VACUUM or PRAGMA.
      f.sqlite.prepare('VACUUM INTO ?').run(path);
      const calls = Array.from({ length: 10 }, () => ({ method: 'respondGift', request: operation({ giftId, accept: true }), actor: 202 }));
      const results = await parallelCalls(path, f.now, calls);
      expect(results.every((result) => result.ok && result.result.gift.status === 'accepted')).toBe(true);
      const { DatabaseSync } = await import('node:sqlite'); const durable = new DatabaseSync(path);
      const states = durable.prepare('SELECT telegram_id,state_json FROM chipper_players').all();
      expect(states.filter((row) => JSON.parse(row.state_json).chicks.some((chick) => chick.id === f.extra.id)).map((row) => row.telegram_id)).toEqual([202]);
      expect(JSON.parse(states.find((row) => row.telegram_id === 101).state_json).gifts[0].status).toBe('accepted');
      durable.close();
      const replay = await parallelCalls(path, f.now, [calls[0]]);
      expect(replay[0].ok).toBe(true); expect(replay[0].result.gift.status).toBe('accepted');
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }, 20000);

  it('P07/P15 concurrent accept/cancel on separate connections leaves exactly one owner', async () => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const f = await giftFixture(); const { giftId } = await f.offer();
      const directory = mkdtempSync(join(tmpdir(), 'chipper-gift-race-')); const path = join(directory, 'players.sqlite');
      try {
        f.sqlite.prepare('VACUUM INTO ?').run(path);
        const results = await parallelCalls(path, f.now, [
          { method: 'respondGift', request: operation({ giftId, accept: true }), actor: 202 },
          { method: 'cancelGift', request: operation({ giftId }), actor: 101 },
        ]);
        expect(results.filter((result) => result.ok)).toHaveLength(1);
        const { DatabaseSync } = await import('node:sqlite'); const durable = new DatabaseSync(path);
        const states = durable.prepare('SELECT telegram_id,state_json FROM chipper_players').all();
        const status = JSON.parse(states.find((row) => row.telegram_id === 101).state_json).gifts[0].status;
        expect(['accepted', 'cancelled']).toContain(status);
        expect(states.filter((row) => JSON.parse(row.state_json).chicks.some((chick) => chick.id === f.extra.id)).map((row) => row.telegram_id)).toEqual([status === 'accepted' ? 202 : 101]);
        durable.close();
      } finally { rmSync(directory, { recursive: true, force: true }); }
    }
  }, 20000);
});
