import { table, integer, text, check, sql, index, uniqueIndex } from 'sdk/db';

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

// v0.3 additions. The gameplay and completed v0.2 release rows are untouched.
export const socialProfiles = table('chipper_social_profiles', {
  telegramId: integer('telegram_id').primaryKey(),
  publicId: text('public_id').notNull().unique(),
  revision: integer('revision').notNull().default(0),
  displayName: text('display_name').notNull(),
  visibility: text('visibility').notNull().default('private'),
  collectionVisibility: text('collection_visibility').notNull().default('private'),
  inviteToken: text('invite_token').unique(),
  shareToken: text('share_token').unique(),
  receiptsJson: text('receipts_json').notNull().default('{}'),
  updatedAt: integer('updated_at').notNull(),
}, columns => ({
  visibilityCheck: check('chipper_profile_visibility', sql`${columns.visibility} IN ('private','friends','public')`),
  collectionCheck: check('chipper_collection_visibility', sql`${columns.collectionVisibility} IN ('private','friends','public')`),
  revisionCheck: check('chipper_social_revision', sql`${columns.revision} >= 0`),
}));
export const friendships = table('chipper_friendships', {
  pairKey: text('pair_key').primaryKey().notNull(),
  friendshipId: text('friendship_id').notNull().unique(),
  lowId: integer('low_id').notNull(), highId: integer('high_id').notNull(),
  requestedBy: integer('requested_by').notNull(), status: text('status').notNull(),
  lowBlocked: integer('low_blocked').notNull().default(0), highBlocked: integer('high_blocked').notNull().default(0),
  revision: integer('revision').notNull().default(0), receiptsJson: text('receipts_json').notNull().default('{}'),
  createdAt: integer('created_at').notNull(), updatedAt: integer('updated_at').notNull(),
}, columns => ({
  lowIndex: index('chipper_friend_low').on(columns.lowId), highIndex: index('chipper_friend_high').on(columns.highId),
  pairCheck: check('chipper_friend_pair', sql`${columns.lowId} > 0 AND ${columns.highId} > ${columns.lowId}`),
  requesterCheck: check('chipper_friend_requester', sql`${columns.requestedBy} IN (${columns.lowId},${columns.highId})`),
  statusCheck: check('chipper_friend_status', sql`${columns.status} IN ('pending','accepted','declined','removed')`),
  blockedCheck: check('chipper_friend_blocked', sql`${columns.lowBlocked} IN (0,1) AND ${columns.highBlocked} IN (0,1)`),
}));
export const socialLimits = table('chipper_social_limits', {
  key: text('key').primaryKey().notNull(), windowStart: integer('window_start').notNull(), count: integer('count').notNull(),
  seenJson: text('seen_json').notNull().default('{}'),
}, columns => ({ countCheck: check('chipper_social_limit_count', sql`${columns.count} >= 0`) }));

// v0.4: bounded deterministic checkpoints; compact terminal dedupe is durable.
export const towerRuns = table('chipper_tower_runs', {
  runId: text('run_id').primaryKey().notNull(),
  telegramId: integer('telegram_id').notNull(), revision: integer('revision').notNull().default(0),
  seed: integer('seed').notNull(), configVersion: text('config_version').notNull(),
  status: text('status').notNull(), verifiedWave: integer('verified_wave').notNull().default(0),
  checkpointJson: text('checkpoint_json').notNull(),
  createdAt: integer('created_at').notNull(), expiresAt: integer('expires_at').notNull(), lastActivityAt: integer('last_activity_at').notNull(),
  startOperationId: text('start_operation_id').notNull(), lastOperationId: text('last_operation_id'), lastFingerprint: text('last_fingerprint'),
  finishReason: text('finish_reason'), resultJson: text('result_json'),
}, columns => ({
  startKey: uniqueIndex('chipper_tower_start_key').on(columns.telegramId, columns.startOperationId),
  oneActive: uniqueIndex('chipper_tower_one_active').on(columns.telegramId).where(sql`status IN ('active','settling')`),
  ownerStatus: index('chipper_tower_owner_status').on(columns.telegramId, columns.status, columns.lastActivityAt),
  statusCheck: check('chipper_tower_status', sql`${columns.status} IN ('active','settling','finished','expired')`),
  reasonCheck: check('chipper_tower_finish_reason', sql`${columns.finishReason} IS NULL OR ${columns.finishReason} IN ('retire','defeat')`),
  stateCheck: check('chipper_tower_state', sql`${columns.revision} >= 0 AND ${columns.verifiedWave} >= 0 AND ${columns.telegramId} > 0`),
}));
