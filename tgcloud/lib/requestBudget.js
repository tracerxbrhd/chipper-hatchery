/** Fixed-minute request budget using the existing additive social limits table. */
import { GameError } from './domain.js';

const WINDOW_MS = 60000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KIND = /^[a-z][a-zA-Z0-9_-]{0,47}$/;

function checkedRequest({ actor, kind, limit, now, operationId }) {
  const actorText = String(actor);
  if (!/^[1-9][0-9]{0,15}$/.test(actorText) || !Number.isSafeInteger(Number(actorText))) {
    throw new GameError('UNAUTHORIZED', 'Откройте Chipper через Telegram-бота.');
  }
  if (typeof kind !== 'string' || !KIND.test(kind) || !Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
    throw new Error('Invalid request budget configuration');
  }
  if (!Number.isSafeInteger(now) || now < 0 || now > Number.MAX_SAFE_INTEGER - WINDOW_MS) {
    throw new Error('Invalid request budget clock');
  }
  if (operationId !== undefined && operationId !== null && (typeof operationId !== 'string' || !UUID.test(operationId))) {
    throw new GameError('INVALID_REQUEST', 'Для действия требуется уникальный ключ операции.');
  }
  return { key: `v04:${actorText}:${kind}`, window: Math.floor(now / WINDOW_MS) * WINDOW_MS,
    receipt: operationId === undefined || operationId === null ? null : operationId.toLowerCase() };
}

/**
 * Call only after request validation and successful durable receipt lookup.
 * In-window identical UUID retries consume one slot; once full, unsuccessful
 * calls do not increment count or grow seen_json. No effect/claim lives here.
 */
export async function consumeRequestBudget(database, params) {
  const { key, window, receipt } = checkedRequest(params);
  if (!database || typeof database.run !== 'function' || typeof database.get !== 'function') throw new Error('Request budget requires SQLite database');
  // The only variable JSON key is a validated canonical UUID. Never interpolate
  // a raw request body, arbitrary path, profile, name, or operation payload.
  const response = await database.run(`INSERT INTO chipper_social_limits(key,window_start,count,seen_json)
    VALUES(:key,:window,1,:seen)
    ON CONFLICT(key) DO UPDATE SET
      count=CASE WHEN window_start<:window THEN 1
        WHEN :receipt IS NOT NULL AND json_extract(seen_json,:path)=1 THEN count ELSE count+1 END,
      seen_json=CASE WHEN window_start<:window THEN :seen
        WHEN :receipt IS NULL OR json_extract(seen_json,:path)=1 THEN seen_json ELSE json_set(seen_json,:path,1) END,
      window_start=MAX(window_start,:window)
    WHERE window_start<:window OR count<:maximum
      OR (:receipt IS NOT NULL AND json_extract(seen_json,:path)=1)
    RETURNING window_start,count`, {
    ':key': key, ':window': window, ':receipt': receipt, ':maximum': params.limit,
    ':path': receipt ? `$."${receipt}"` : '$.unused', ':seen': receipt ? JSON.stringify({ [receipt]: 1 }) : '{}',
  });
  const accepted = response.rows[0];
  if (!accepted) {
    // Only a rejected call needs this small read. A backwards server clock must
    // not reset an already-current window or produce a misleading retry time.
    const row = await database.get('SELECT window_start FROM chipper_social_limits WHERE key=:key', { ':key': key });
    const retryAt = Math.max(window, row?.window_start ?? window) + WINDOW_MS;
    throw new GameError('REQUEST_RATE_LIMIT', 'Слишком много действий. Дайте гнезду немного отдохнуть.', { retryable: true, retryAt });
  }
  return { count: accepted.count, remaining: Math.max(0, params.limit - accepted.count),
    windowStart: accepted.window_start, retryAt: accepted.window_start + WINDOW_MS };
}

export function createRequestBudget({ database, now = Date.now }) {
  return { consume: (params) => consumeRequestBudget(database, { ...params, now: now() }) };
}
