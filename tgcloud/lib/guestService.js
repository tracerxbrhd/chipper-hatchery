import { GameError, stageFor, validateStateVersion } from './domain.js';
import { verifiedTelegramId } from './service.js';
import { publicChick } from './social.js';

const PROFILE_ID = /^[a-f0-9]{64}$/;
const unavailable = () => new GameError('PROFILE_UNAVAILABLE', 'Птенец друга сейчас недоступен. Обновите список друзей.');

function parameters(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(input))
    || Object.keys(input).length !== 1 || typeof input.profileId !== 'string' || !PROFILE_ID.test(input.profileId)) {
    throw new GameError('INVALID_REQUEST', 'Выберите друга из списка.');
  }
  return input;
}

function failure(error) {
  if (error instanceof GameError) return { ok: false, error: { code: error.code, message: error.message, retryable: error.retryable,
    ...(error.retryAt === undefined ? {} : { retryAt: error.retryAt }) } };
  return { ok: false, error: { code: 'TEMPORARILY_UNAVAILABLE', message: 'Поляна пока недоступна. Попробуйте обновить её.', retryable: true } };
}

/** A guest is a visual snapshot, never a second editable or owned bird. */
export function createGuestService({ database, gameService, now = Date.now }) {
  async function chargeLookup(actor, timestamp) {
    const window = Math.floor(timestamp / 60000) * 60000;
    // Share the v0.3 foreign-read budget: opening different public profiles cannot
    // bypass the limit by alternating them with this endpoint.
    const response = await database.run(`INSERT INTO chipper_social_limits(key,window_start,count,seen_json) VALUES(:key,:window,1,'{}')
      ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window_start<>:window THEN 1 ELSE count+1 END,
      seen_json=CASE WHEN window_start<>:window THEN '{}' ELSE seen_json END,window_start=:window RETURNING count`,
    { ':key': `${actor}:lookup`, ':window': window });
    if (response.rows[0].count > 60) throw new GameError('SOCIAL_RATE_LIMIT', 'Слишком много обновлений. Дайте поляне немного отдохнуть.',
      { retryable: true, retryAt: window + 60000 });
  }

  return {
    async call(method, input = {}, ctx) {
      try {
        const actor = verifiedTelegramId(ctx);
        if (method !== 'getGuestChick') throw new GameError('UNKNOWN_METHOD', 'Такое действие не поддерживается.');
        const params = parameters(input);
        const own = await gameService.call('getHome', {}, ctx);
        if (!own.ok) return own;
        if (own.state.player.onboarding !== 'done') throw new GameError('ONBOARDING_REQUIRED', 'Сначала познакомьтесь со своим птенцом.');
        const timestamp = now();
        if (!Number.isSafeInteger(timestamp) || timestamp < 0) throw new Error('Invalid server clock');
        await chargeLookup(actor, timestamp);

        // One SQLite statement freezes accepted friendship, BOTH block flags,
        // privacy and the *current* active chick together. Public alone never
        // permits inviting a stranger. Return only the one selected bird to JS,
        // avoiding parsing foreign receipts/inventory/identity on every refresh.
        const row = await database.get(`SELECT p.public_id,p.display_name,v.telegram_id,
          json_extract(v.state_json,'$.player.telegramId') AS owner_id,
          json_extract(v.state_json,'$.schemaVersion') AS schema_version,
          json_extract(v.state_json,'$.player.onboarding') AS onboarding,
          json_extract(v.state_json,'$.updatedAt') AS updated_at,
          (SELECT c.value FROM json_each(v.state_json,'$.chicks') c
            WHERE json_extract(c.value,'$.id')=json_extract(v.state_json,'$.player.activeChickId') LIMIT 1) AS chick_json
          FROM chipper_social_profiles p JOIN chipper_players v ON v.telegram_id=p.telegram_id
          JOIN chipper_friendships f ON f.low_id=MIN(p.telegram_id,:actor) AND f.high_id=MAX(p.telegram_id,:actor)
          WHERE p.public_id=:profile AND p.telegram_id<>:actor
          AND f.status='accepted' AND f.low_blocked=0 AND f.high_blocked=0
          AND p.visibility IN ('friends','public') LIMIT 1`, { ':actor': Number(actor), ':profile': params.profileId });
        if (!row) throw unavailable();
        if (String(row.owner_id) !== String(row.telegram_id)) throw new Error('Invalid guest aggregate ownership');
        const chick = row.chick_json ? JSON.parse(row.chick_json) : null;
        validateStateVersion({ schemaVersion: row.schema_version, player: { flaps: {} }, chicks: chick ? [chick] : [] });
        if (chick) chick.stage = stageFor(chick, Math.max(timestamp, row.updated_at));
        const guest = { profileId: row.public_id, displayName: row.display_name,
          chick: row.onboarding === 'done' ? publicChick(chick) : null, checkedAt: timestamp };
        return { ...own, result: { guest } };
      } catch (error) {
        if (!(error instanceof GameError)) console.error('Chipper guest lookup failed', { code: 'INTERNAL' });
        return failure(error);
      }
    },
  };
}
