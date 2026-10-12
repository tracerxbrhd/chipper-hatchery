import { table, integer, text, check, sql } from 'sdk/db';

// Logical players/chicks/eggs/rewards/receipts live in one JSON aggregate.
// SQLite's single-statement conditional UPDATE is the transaction boundary.
// No foreign keys and no unsupported multi-statement transaction API are used.
export const players = table('chipper_players', {
  telegramId: integer('telegram_id').primaryKey(),
  revision: integer('revision').notNull().default(0),
  stateJson: text('state_json').notNull(),
}, (columns) => ({
  positiveTelegramId: check('chipper_positive_telegram_id', sql`${columns.telegramId} > 0`),
  nonnegativeRevision: check('chipper_nonnegative_revision', sql`${columns.revision} >= 0`),
}));
