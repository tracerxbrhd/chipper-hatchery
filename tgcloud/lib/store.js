import { consumeRequestBudget } from './requestBudget.js';
/**
 * SQLite adapter using the documented sdk/db raw API. Keeping the adapter free
 * of SDK imports lets the identical statements run against real SQLite in QA.
 * database.get(query, namedParams) -> row | null
 * database.run(query, namedParams) -> { rowsAffected, lastInsertRowid, rows }
 */
export function createSqliteStore(database) {
  return {
    async consumeBudget(actor, kind, timestamp, limit, operationId) {
      return consumeRequestBudget(database, { actor, kind, now: timestamp, limit, ...(operationId ? { operationId } : {}) });
    },
    async read(telegramId) {
      const row = await database.get(
        'SELECT revision, state_json FROM chipper_players WHERE telegram_id = :telegramId',
        { ':telegramId': Number(telegramId) },
      );
      return row ? { revision: row.revision, state: JSON.parse(row.state_json) } : null;
    },
    async create(telegramId, state) {
      await database.run(
        'INSERT INTO chipper_players (telegram_id, revision, state_json) VALUES (:telegramId, 0, :stateJson) ON CONFLICT (telegram_id) DO NOTHING',
        { ':telegramId': Number(telegramId), ':stateJson': JSON.stringify(state) },
      );
    },
    async compareAndSwap(telegramId, revision, state) {
      const result = await database.run(
        'UPDATE chipper_players SET revision = revision + 1, state_json = :stateJson WHERE telegram_id = :telegramId AND revision = :expectedRevision RETURNING revision',
        { ':telegramId': Number(telegramId), ':expectedRevision': revision, ':stateJson': JSON.stringify(state) },
      );
      // In the documented raw API, RETURNING is result.rows, not the run result
      // itself. Exactly one row means that the expected revision won the CAS.
      return result.rows.length === 1;
    },
  };
}
