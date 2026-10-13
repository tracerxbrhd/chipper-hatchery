import { GameError, clone, normalizeName, reconcileState, validateStateVersion } from './domain.js';
import { serverId, verifiedTelegramId } from './service.js';

const VISIBILITY = ['private', 'friends', 'public'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPAQUE = /^[a-f0-9]{64}$/;
const METHODS = {
  getSocial: [],
  updatePrivacy: ['operationId', 'visibility', 'collectionVisibility', 'displayName'],
  createSocialLink: ['operationId', 'kind', 'chickId', 'revoke'],
  resolveSocialLink: ['token', 'kind', 'chickId'],
  getPublicProfile: ['profileId', 'chickId'],
  visitProfile: ['profileId'],
  sendFriendRequest: ['operationId', 'profileId', 'inviteToken'],
  respondFriendRequest: ['operationId', 'requestId', 'accept'],
  removeFriend: ['operationId', 'profileId'],
  blockUser: ['operationId', 'profileId', 'blocked'],
};
const unavailable = () => new GameError('PROFILE_UNAVAILABLE', 'Это гнездо сейчас недоступно.');

export function friendPairKey(a, b) {
  const [low, high] = [Number(a), Number(b)].sort((left, right) => left - right);
  if (!Number.isSafeInteger(low) || low <= 0 || !Number.isSafeInteger(high) || high <= 0 || low === high) {
    throw new GameError('INVALID_REQUEST', 'Выберите другое гнездо.');
  }
  return `${low}:${high}`;
}

export async function areFriends(database, a, b) {
  if (String(a) === String(b)) return false;
  return Boolean(await database.get("SELECT 1 AS allowed FROM chipper_friendships WHERE pair_key=:pair AND status='accepted' AND low_blocked=0 AND high_blocked=0", { ':pair': friendPairKey(a, b) }));
}

export async function peerFor(database, telegramId) {
  const row = await database.get('SELECT public_id, display_name FROM chipper_social_profiles WHERE telegram_id=:actor', { ':actor': Number(telegramId) });
  return row ? { profileId: row.public_id, displayName: row.display_name } : null;
}

export function publicChick(chick) {
  if (!chick) return null;
  return { id: chick.id, appearanceVersion: 2, genes: clone(chick.genes), appearanceId: chick.appearanceId,
    rarity: chick.rarity, name: chick.name, bornAt: chick.bornAt, stage: chick.stage };
}

function parseRequest(method, input) {
  const allowed = Object.hasOwn(METHODS, method) ? METHODS[method] : null;
  if (!allowed) throw new GameError('UNKNOWN_METHOD', 'Такое действие не поддерживается.');
  if (!input || typeof input !== 'object' || Array.isArray(input) || ![Object.prototype, null].includes(Object.getPrototypeOf(input))
    || Object.keys(input).some(key => !allowed.includes(key))) throw new GameError('INVALID_REQUEST', 'Некорректный запрос.');
  const params = { ...input };
  if (allowed.includes('operationId')) {
    if (typeof params.operationId !== 'string' || !UUID.test(params.operationId)) throw new GameError('INVALID_REQUEST', 'Требуется уникальный ключ операции.');
    params.operationId = params.operationId.toLowerCase();
  }
  for (const key of ['profileId', 'requestId', 'token', 'inviteToken']) {
    if (params[key] !== undefined && (typeof params[key] !== 'string' || !OPAQUE.test(params[key]))) throw new GameError('INVALID_REQUEST', 'Некорректная ссылка или гнездо.');
  }
  if (allowed.includes('profileId') && !params.profileId) throw new GameError('INVALID_REQUEST', 'Выберите гнездо.');
  if (allowed.includes('requestId') && !params.requestId) throw new GameError('INVALID_REQUEST', 'Выберите приглашение.');
  if (allowed.includes('token') && !params.token) throw new GameError('INVALID_REQUEST', 'Некорректная ссылка.');
  if (params.chickId !== undefined && (typeof params.chickId !== 'string' || !/^[a-zA-Z0-9.-]{1,128}$/.test(params.chickId))) throw new GameError('INVALID_REQUEST', 'Некорректная птица.');
  if (method === 'updatePrivacy') {
    if (!VISIBILITY.includes(params.visibility) || !VISIBILITY.includes(params.collectionVisibility)) throw new GameError('INVALID_REQUEST', 'Выберите видимость профиля и коллекции.');
    if (params.displayName !== undefined) params.displayName = normalizeName(params.displayName);
  }
  if (['createSocialLink', 'resolveSocialLink'].includes(method)) {
    if (!['invite', 'profile', 'chick'].includes(params.kind)) throw new GameError('INVALID_REQUEST', 'Некорректный тип ссылки.');
    if (params.kind === 'chick' && !params.chickId && !params.revoke) throw new GameError('INVALID_REQUEST', 'Выберите птицу для карточки.');
    if (params.kind !== 'chick' && params.chickId !== undefined) throw new GameError('INVALID_REQUEST', 'Эта ссылка не указывает птицу.');
    if (params.revoke !== undefined && typeof params.revoke !== 'boolean') throw new GameError('INVALID_REQUEST', 'Некорректное действие ссылки.');
  }
  if (method === 'respondFriendRequest' && typeof params.accept !== 'boolean') throw new GameError('INVALID_REQUEST', 'Выберите ответ на приглашение.');
  if (method === 'blockUser' && typeof params.blocked !== 'boolean') throw new GameError('INVALID_REQUEST', 'Выберите действие блокировки.');
  return params;
}

function fingerprint(method, params) {
  return JSON.stringify([method, Object.fromEntries(Object.entries(params).filter(([key]) => key !== 'operationId').sort(([left], [right]) => left.localeCompare(right)))]);
}

function receiptFor(row, actor, method, params) {
  const receipts = JSON.parse(row.receipts_json);
  const receipt = receipts[`${actor}:${params.operationId}`];
  if (receipt && receipt.fingerprint !== fingerprint(method, params)) throw new GameError('OPERATION_CONFLICT', 'Этот ключ операции уже использован для другого действия.');
  return { receipts, receipt };
}

function failure(error) {
  if (error instanceof GameError) return { ok: false, error: { code: error.code, message: error.message, retryable: error.retryable, ...(error.retryAt === undefined ? {} : { retryAt: error.retryAt }) } };
  return { ok: false, error: { code: 'TEMPORARILY_UNAVAILABLE', message: 'Сейчас не удалось связаться с гнездом. Попробуйте ещё раз.', retryable: true } };
}

export function createSocialService({ database, gameService, now = Date.now, id = serverId }) {
  const opaqueId = () => {
    const token = `${id()}${id()}`.replaceAll('-', '').toLowerCase();
    if (!OPAQUE.test(token)) throw new Error('Invalid opaque identifier');
    return token;
  };
  const getProfile = (actor) => database.get('SELECT * FROM chipper_social_profiles WHERE telegram_id=:actor', { ':actor': Number(actor) });
  const profileFor = (profileId) => database.get('SELECT * FROM chipper_social_profiles WHERE public_id=:profile', { ':profile': profileId });

  async function provision(actor) {
    let own = await getProfile(actor);
    if (own) return own;
    for (let tries = 0; tries < 8; tries += 1) {
      const token = opaqueId();
      await database.run("INSERT INTO chipper_social_profiles(telegram_id,public_id,revision,display_name,visibility,collection_visibility,invite_token,share_token,receipts_json,updated_at) VALUES(:actor,:token,0,'Моё гнездо','private','private',NULL,NULL,'{}',:now) ON CONFLICT DO NOTHING", { ':actor': Number(actor), ':token': token, ':now': now() });
      own = await getProfile(actor);
      if (own) return own;
    }
    throw new Error('Profile identifier collision');
  }

  async function limit(actor, kind, maximum, receipt = null) {
    const timestamp = now(); const window = Math.floor(timestamp / 60000) * 60000;
    // One UPSERT charges concurrent identical retries once. Keys contain only
    // validated method/opaque-id/UUID characters, never arbitrary JSON paths.
    const response = await database.run(`INSERT INTO chipper_social_limits(key,window_start,count,seen_json) VALUES(:key,:window,1,:seen)
      ON CONFLICT(key) DO UPDATE SET
      count=CASE WHEN window_start<>:window THEN 1 WHEN :receipt IS NOT NULL AND json_extract(seen_json,:path)=1 THEN count ELSE count+1 END,
      seen_json=CASE WHEN window_start<>:window THEN :seen WHEN :receipt IS NULL OR count>=:maximum THEN seen_json ELSE json_set(seen_json,:path,1) END,
      window_start=:window RETURNING count`, { ':key': `${actor}:${kind}`, ':window': window, ':receipt': receipt,
      ':path': receipt ? `$."${receipt}"` : '$.unused', ':seen': receipt ? JSON.stringify({ [receipt]: 1 }) : '{}', ':maximum': maximum });
    if (response.rows[0].count > maximum) throw new GameError('SOCIAL_RATE_LIMIT', 'Слишком много действий. Дайте гнезду немного отдохнуть.', { retryAt: window + 60000, retryable: true });
  }

  async function summary(actor) {
    const own = await getProfile(actor);
    const rows = await database.all(`SELECT f.*,p.public_id AS peer_id,p.display_name AS peer_name,p.visibility AS peer_visibility
      FROM chipper_friendships f JOIN chipper_social_profiles p ON p.telegram_id=CASE WHEN f.low_id=:actor THEN f.high_id ELSE f.low_id END
      WHERE f.low_id=:actor OR f.high_id=:actor ORDER BY f.updated_at DESC`, { ':actor': Number(actor) });
    const self = { profileId: own.public_id, displayName: own.display_name };
    const result = { profile: { ...self, visibility: own.visibility, collectionVisibility: own.collection_visibility, inviteToken: own.invite_token, shareToken: own.share_token }, friends: [], incoming: [], outgoing: [], blocked: [], giftsEnabled: true };
    for (const row of rows) {
      const peer = { profileId: row.peer_id, displayName: row.peer_name };
      const ownBlocked = row.low_id === Number(actor) ? row.low_blocked : row.high_blocked;
      if (ownBlocked) { result.blocked.push({ profileId: peer.profileId, displayName: 'Закрытое гнездо' }); continue; }
      if (row.low_blocked || row.high_blocked) continue;
      if (row.status === 'accepted') result.friends.push({ ...peer, canVisit: row.peer_visibility !== 'private' });
      if (row.status === 'pending') {
        const incoming = row.requested_by !== Number(actor);
        result[incoming ? 'incoming' : 'outgoing'].push({ requestId: row.friendship_id, from: incoming ? peer : self, to: incoming ? self : peer, status: 'pending' });
      }
    }
    return result;
  }

  async function mutateProfile(actor, method, params, ownState) {
    let charged = false;
    for (let conflict = 0; conflict < 32; conflict += 1) {
      const row = await getProfile(actor); const { receipts, receipt } = receiptFor(row, actor, method, params);
      if (receipt) {
        const result = receipt.result;
        if (method === 'createSocialLink' && result.link) {
          const liveToken = params.kind === 'invite' ? row.invite_token : row.share_token;
          return { link: liveToken === result.link.token ? result.link : null };
        }
        return result;
      }
      if (!charged) { await limit(actor, 'write', 12, `${method}:${params.operationId}`); charged = true; }
      const next = { ...row }; let result = {};
      if (method === 'updatePrivacy') {
        next.visibility = params.visibility; next.collection_visibility = params.collectionVisibility;
        if (params.displayName !== undefined) next.display_name = params.displayName;
        if (params.visibility === 'private') next.share_token = null;
      } else {
        const field = params.kind === 'invite' ? 'invite_token' : 'share_token';
        if (params.revoke) { next[field] = null; result = { link: null }; }
        else {
          if (params.kind !== 'invite' && row.visibility === 'private') throw new GameError('PROFILE_PRIVATE', 'Разрешите просмотр профиля перед публикацией карточки.');
          if (params.kind === 'chick') {
            if (!ownState.chicks.some(chick => chick.id === params.chickId)) throw new GameError('CHICK_NOT_FOUND', 'Этой птицы нет в вашем гнезде.');
            if (params.chickId !== ownState.player.activeChickId && row.collection_visibility === 'private') throw new GameError('COLLECTION_PRIVATE', 'Разрешите просмотр коллекции для карточки неактивной птицы.');
          }
          next[field] = opaqueId();
          const prefix = params.kind === 'invite' ? 'i' : params.kind === 'profile' ? 'p' : 'c';
          const start = `${prefix}_${next[field]}${params.kind === 'chick' ? `_${params.chickId}` : ''}`;
          result = { link: { token: next[field], url: `https://t.me/chipperhatcherybot?startapp=${start}`, kind: params.kind, ...(params.kind === 'chick' ? { chickId: params.chickId } : {}) } };
        }
      }
      receipts[`${actor}:${params.operationId}`] = { fingerprint: fingerprint(method, params), result, at: now() };
      const response = await database.run('UPDATE chipper_social_profiles SET revision=revision+1,display_name=:name,visibility=:visibility,collection_visibility=:collection,invite_token=:invite,share_token=:share,receipts_json=:receipts,updated_at=:now WHERE telegram_id=:actor AND revision=:revision RETURNING revision', { ':actor': Number(actor), ':revision': row.revision, ':name': next.display_name, ':visibility': next.visibility, ':collection': next.collection_visibility, ':invite': next.invite_token, ':share': next.share_token, ':receipts': JSON.stringify(receipts), ':now': now() });
      if (response.rows.length === 1) return result;
    }
    throw new GameError('CONCURRENT_UPDATE', 'Гнездо обновляется в другом окне. Повторите действие.', { retryable: true });
  }

  async function relationFor(actor, method, params) {
    if (method === 'respondFriendRequest') {
      const row = await database.get('SELECT * FROM chipper_friendships WHERE friendship_id=:request AND (low_id=:actor OR high_id=:actor)', { ':request': params.requestId, ':actor': Number(actor) });
      if (!row) throw unavailable();
      return { target: await getProfile(row.low_id === Number(actor) ? row.high_id : row.low_id), pair: row.pair_key };
    }
    const target = await profileFor(params.profileId);
    if (!target || target.telegram_id === Number(actor)) throw unavailable();
    return { target, pair: friendPairKey(actor, target.telegram_id) };
  }

  async function mutateRelation(actor, method, params) {
    const { target, pair } = await relationFor(actor, method, params);
    let charged = false;
    for (let conflict = 0; conflict < 32; conflict += 1) {
      let row = await database.get('SELECT * FROM chipper_friendships WHERE pair_key=:pair', { ':pair': pair });
      if (!row) {
        if (!['sendFriendRequest', 'blockUser'].includes(method)) throw unavailable();
        if (method === 'sendFriendRequest') {
          const liveTarget = await getProfile(target.telegram_id);
          if (liveTarget.visibility !== 'public' && (!params.inviteToken || liveTarget.invite_token !== params.inviteToken)) {
            await limit(actor, 'request', 6, `${method}:${target.public_id}:${params.operationId}`);
            throw unavailable();
          }
        }
        const [low, high] = pair.split(':').map(Number);
        await database.run("INSERT INTO chipper_friendships(pair_key,friendship_id,low_id,high_id,requested_by,status,low_blocked,high_blocked,revision,receipts_json,created_at,updated_at) VALUES(:pair,:request,:low,:high,:actor,'removed',0,0,0,'{}',:now,:now) ON CONFLICT(pair_key) DO NOTHING", { ':pair': pair, ':request': opaqueId(), ':low': low, ':high': high, ':actor': Number(actor), ':now': now() });
        row = await database.get('SELECT * FROM chipper_friendships WHERE pair_key=:pair', { ':pair': pair });
        if (!row) continue;
      }
      if (method === 'respondFriendRequest' && row.friendship_id !== params.requestId) throw unavailable();
      const { receipts, receipt } = receiptFor(row, actor, method, params);
      if (receipt) return receipt.result;
      if (!charged) {
        const rateKey = `${method}:${target.public_id}:${params.operationId}`;
        await limit(actor, 'write', 12, rateKey);
        if (method === 'sendFriendRequest') await limit(actor, 'request', 6, rateKey);
        charged = true;
      }
      const next = { ...row };
      if (method === 'blockUser') {
        const field = row.low_id === Number(actor) ? 'low_blocked' : 'high_blocked';
        next[field] = params.blocked ? 1 : 0;
        if (params.blocked || row[field]) next.status = 'removed';
      } else {
        if (row.low_blocked || row.high_blocked) throw unavailable();
        if (method === 'sendFriendRequest') {
          const liveTarget = await getProfile(target.telegram_id);
          if (!['accepted', 'pending'].includes(row.status) && liveTarget.visibility !== 'public' && (!params.inviteToken || liveTarget.invite_token !== params.inviteToken)) throw unavailable();
          if (!['pending', 'accepted'].includes(row.status)) {
            next.status = 'pending'; next.requested_by = Number(actor); next.created_at = now();
            next.friendship_id = opaqueId();
          }
          // Reciprocal requests do not auto-consent. Recipient explicitly accepts.
        } else if (method === 'respondFriendRequest') {
          if (row.requested_by === Number(actor)) throw new GameError('REQUEST_NOT_INCOMING', 'Отвечать может получатель приглашения.');
          if (row.status !== 'pending') throw new GameError('REQUEST_NOT_PENDING', 'Приглашение уже закрыто.');
          next.status = params.accept ? 'accepted' : 'declined';
        } else next.status = 'removed';
      }
      receipts[`${actor}:${params.operationId}`] = { fingerprint: fingerprint(method, params), result: {}, at: now() };
      const response = await database.run(`UPDATE chipper_friendships SET friendship_id=:requestId,status=:status,requested_by=:requester,low_blocked=:lowBlock,high_blocked=:highBlock,revision=revision+1,receipts_json=:receipts,created_at=:created,updated_at=:now
        WHERE pair_key=:pair AND revision=:revision
        AND (:needInvite=0 OR EXISTS(SELECT 1 FROM chipper_social_profiles WHERE telegram_id=:target AND (visibility='public' OR invite_token=:invite))) RETURNING revision`, { ':pair': pair, ':requestId': next.friendship_id, ':revision': row.revision, ':status': next.status, ':requester': next.requested_by, ':lowBlock': next.low_blocked, ':highBlock': next.high_blocked, ':receipts': JSON.stringify(receipts), ':created': next.created_at, ':now': now(), ':needInvite': method === 'sendFriendRequest' && !['pending', 'accepted'].includes(row.status) ? 1 : 0, ':target': target.telegram_id, ':invite': params.inviteToken ?? null });
      if (response.rows.length === 1) return {};
    }
    throw new GameError('CONCURRENT_UPDATE', 'Социальные настройки обновляются. Повторите действие.', { retryable: true });
  }

  async function publicProfile(actor, params, linkKind) {
    const token = params.token ?? null;
    const key = params.profileId ?? null;
    // This statement freezes permission, token validity, block status and the
    // requested owner's aggregate in one SQLite read. Never bootstrap a peer.
    const row = await database.get(`SELECT p.*,v.state_json,f.status AS relation_status,f.requested_by,f.low_blocked,f.high_blocked
      FROM chipper_social_profiles p JOIN chipper_players v ON v.telegram_id=p.telegram_id
      LEFT JOIN chipper_friendships f ON f.low_id=MIN(p.telegram_id,:actor) AND f.high_id=MAX(p.telegram_id,:actor)
      WHERE (:profile IS NULL OR p.public_id=:profile)
      AND (:kind IS NULL OR (:kind='invite' AND p.invite_token=:token) OR (:kind IN ('profile','chick') AND p.share_token=:token))
      AND (p.telegram_id=:actor OR (COALESCE(f.low_blocked,0)=0 AND COALESCE(f.high_blocked,0)=0))
      AND (:kind='invite' OR p.telegram_id=:actor OR p.visibility='public' OR (p.visibility='friends' AND f.status='accepted')) LIMIT 1`, { ':actor': Number(actor), ':profile': key, ':token': token, ':kind': linkKind ?? null });
    if (!row) throw unavailable();
    const self = row.telegram_id === Number(actor); const friend = row.relation_status === 'accepted';
    const accessible = self || row.visibility === 'public' || (row.visibility === 'friends' && friend);
    const relationship = self ? 'self' : friend ? 'friend' : row.relation_status === 'pending' ? row.requested_by === Number(actor) ? 'outgoing' : 'incoming' : 'none';
    const collectionVisible = accessible && (self || row.collection_visibility === 'public' || (row.collection_visibility === 'friends' && friend));
    const result = { profileId: row.public_id, displayName: row.display_name, relationship, accessible, activeChick: null, chicks: null, collectionVisible };
    if (!accessible) return result; // An explicit private invite shares consent label only.
    const stored = JSON.parse(row.state_json);
    if (stored.player.telegramId !== String(row.telegram_id)) throw new Error('Invalid aggregate ownership');
    validateStateVersion(stored);
    const state = reconcileState(clone(stored), Math.max(now(), stored.updatedAt));
    const active = state.chicks.find(chick => chick.id === state.player.activeChickId);
    result.activeChick = publicChick(active);
    if (collectionVisible) result.chicks = state.chicks.map(publicChick);
    if (params.chickId) {
      const chick = state.chicks.find(item => item.id === params.chickId);
      if (!chick || (chick.id !== state.player.activeChickId && !collectionVisible)) throw unavailable();
      result.activeChick = publicChick(chick);
    }
    return result;
  }

  return {
    async call(method, input = {}, ctx) {
      try {
        const actor = verifiedTelegramId(ctx); const params = parseRequest(method, input);
        const loaded = await gameService.call('getHome', {}, ctx);
        if (!loaded.ok) return loaded;
        await provision(actor);
        let result;
        if (method === 'getSocial') result = {};
        else if (['updatePrivacy', 'createSocialLink'].includes(method)) result = await mutateProfile(actor, method, params, loaded.state);
        else if (['sendFriendRequest', 'respondFriendRequest', 'removeFriend', 'blockUser'].includes(method)) result = await mutateRelation(actor, method, params);
        else {
          await limit(actor, 'lookup', 60);
          result = { profile: await publicProfile(actor, params, method === 'resolveSocialLink' ? params.kind : undefined) };
        }
        if (!Object.hasOwn(result, 'profile')) result.social = await summary(actor);
        const current = await gameService.call('getHome', {}, ctx);
        if (!current.ok) return current;
        return { ...current, result };
      } catch (error) {
        if (!(error instanceof GameError)) console.error('Chipper social operation failed', { method, code: 'INTERNAL' });
        return failure(error);
      }
    },
  };
}
