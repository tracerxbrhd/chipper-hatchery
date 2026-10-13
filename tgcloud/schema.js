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

// Additive declaration only: supported tgcloud migrate creates this receipt
// table. Gameplay never writes it and ordinary deploy never resets any player.
export const releaseOperations = table('chipper_release_operations', {
  releaseKey: text('release_key').primaryKey().notNull(),
  status: text('status').notNull(),
  preparedAt: integer('prepared_at').notNull(),
  completedAt: integer('completed_at'),
  plannedLegacyPlayers: integer('planned_legacy_players').notNull(),
  remainingLegacyPlayers: integer('remaining_legacy_players').notNull(),
  appId: integer('app_id').notNull(),
  botUsername: text('bot_username').notNull(),
  sourceSha: text('source_sha').notNull(),
}, (columns) => ({
  validReleaseStatus: check('chipper_release_status', sql`${columns.status} IN ('prepared', 'completed')`),
  nonnegativePlannedPlayers: check('chipper_release_planned_nonnegative', sql`${columns.plannedLegacyPlayers} >= 0`),
  nonnegativeRemainingPlayers: check('chipper_release_remaining_nonnegative', sql`${columns.remainingLegacyPlayers} >= 0`),
}));
