import { DatabaseSync } from 'node:sqlite';
import { describe, it, expect } from 'vitest';

// Phase-0 proof: seal the authoritative run before a single owner CAS pays.
// A permanent run fence lives in that same CAS, so terminalization is only
// cleanup and can be retried after any lost response. No cross-table credit.
describe('0.4 SQLite sealed-run reward protocol spike', () => {
  it('recovers after seal and after credit; concurrent daily/finish cannot duplicate', async () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE players(id INTEGER PRIMARY KEY, revision INTEGER, state TEXT);
      CREATE TABLE runs(id TEXT PRIMARY KEY, owner INTEGER, revision INTEGER, status TEXT, wave INTEGER);
      INSERT INTO players VALUES(1,0,'{"feathers":0,"towerReceipts":{},"daily":false}');
      INSERT INTO runs VALUES('run',1,0,'active',25);`);
    const sealed = db.prepare("UPDATE runs SET status='settling',revision=revision+1 WHERE id='run' AND owner=1 AND status='active' AND revision=0 RETURNING wave").all();
    expect(sealed).toEqual([{ wave: 25 }]);
    // Simulated crash here: reload both rows, never assume seal means paid.
    const yieldRead = () => new Promise(resolve => setImmediate(resolve));
    async function finish() {
      for (;;) {
        const run = db.prepare("SELECT * FROM runs WHERE id='run' AND owner=1").get();
        const player = db.prepare('SELECT * FROM players WHERE id=1').get();
        const state = JSON.parse(player.state);
        if (state.towerReceipts.run) return state.towerReceipts.run;
        expect(run.status).toBe('settling');
        state.feathers += 4;
        state.towerReceipts.run = { wave: run.wave, reward: 4 };
        await yieldRead();
        const rows = db.prepare("UPDATE players SET revision=revision+1,state=:state WHERE id=1 AND revision=:revision AND EXISTS(SELECT 1 FROM runs WHERE id='run' AND owner=1 AND status='settling' AND wave=25) RETURNING revision").all({ ':state': JSON.stringify(state), ':revision': player.revision });
        if (rows.length) return state.towerReceipts.run;
      }
    }
    async function daily() {
      for (;;) {
        const row = db.prepare('SELECT * FROM players WHERE id=1').get();
        const state = JSON.parse(row.state);
        if (state.daily) return;
        state.daily = true; state.feathers++;
        await yieldRead();
        if (db.prepare('UPDATE players SET revision=revision+1,state=? WHERE id=1 AND revision=? RETURNING revision').all(JSON.stringify(state), row.revision).length) return;
      }
    }
    await Promise.all([daily(), ...Array.from({ length: 10 }, finish)]);
    // Simulated loss of credit response before terminal row update.
    expect(await finish()).toEqual({ wave: 25, reward: 4 });
    const result = JSON.parse(db.prepare('SELECT state FROM players WHERE id=1').get().state);
    expect(result.feathers).toBe(5);
    expect(Object.keys(result.towerReceipts)).toHaveLength(1);
    expect(db.prepare("UPDATE runs SET wave=999 WHERE id='run' AND status='active' RETURNING wave").all()).toHaveLength(0);
    db.close();
  });
});
