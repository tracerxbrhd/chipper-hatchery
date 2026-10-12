import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { createGameService } from '../tgcloud/lib/service.js';
import { createSqliteStore } from '../tgcloud/lib/store.js';

export const ctx = (id = 101) => ({ initData: { user: { id } } });
export const operation = (params = {}) => ({ ...params, operationId: randomUUID() });
export function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE chipper_players (telegram_id INTEGER PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 0, state_json TEXT NOT NULL)');
  let time = 1791810000000;
  let roll = .1;
  let failAfterCommit = false;
  const yieldRequest = () => new Promise(resolve => setImmediate(resolve));
  const database = {
    async get(sql, params) { await yieldRequest(); return sqlite.prepare(sql).get(params ?? {}) ?? null; },
    async run(sql, params) {
      await yieldRequest();
      const statement = sqlite.prepare(sql);
      if (/\bRETURNING\b/i.test(sql)) {
        const rows = statement.all(params ?? {});
        if (failAfterCommit && rows.length) { failAfterCommit = false; throw new Error('lost response after commit'); }
        return { rows, rowsAffected: rows.length, lastInsertRowid: 0 };
      }
      const result = statement.run(params ?? {});
      return { rows: [], rowsAffected: result.changes, lastInsertRowid: result.lastInsertRowid };
    },
  };
  const store = createSqliteStore(database);
  const service = createGameService({ store, now: () => time, random: () => roll, id: randomUUID });
  return {
    service, sqlite, store,
    get now() { return time; },
    advance(ms) { time += ms; },
    roll(value) { roll = value; },
    loseNextResponse() { failAfterCommit = true; },
    async call(method, params = {}, owner = 101) { return service.call(method, params, ctx(owner)); },
    async initial(owner = 101) {
      const boot = await service.call('bootstrap', {}, ctx(owner));
      if (!boot.ok) throw new Error(JSON.stringify(boot));
      const hatch = await service.call('hatchEgg', operation({ eggId: boot.state.egg.id }), ctx(owner));
      if (!hatch.ok) throw new Error(JSON.stringify(hatch));
      await service.call('completeOnboarding', operation(), ctx(owner));
      return hatch.state.chicks[0].id;
    },
    async seedFeathers(amount, owner = 101) {
      const row = await store.read(String(owner)); row.state.player.feathers = amount;
      await store.compareAndSwap(String(owner), row.revision, row.state);
    },
  };
}
