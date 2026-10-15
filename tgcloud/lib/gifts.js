import { discoverChickTraits } from './traitCodex.js';
import { GameError, clone, reconcileState, validateStateVersion, chickReservation, recordEvent } from './domain.js';
import { verifiedTelegramId, serverId } from './service.js';
import { areFriends, friendPairKey, peerFor, publicChick } from './social.js';

export const GIFT_TTL_MS = 24 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROFILE_ID = /^[a-zA-Z0-9_-]{12,128}$/;
const METHODS = {
  listGifts: [],
  offerGift: ['operationId', 'chickId', 'recipientProfileId'],
  respondGift: ['operationId', 'giftId', 'accept'],
  cancelGift: ['operationId', 'giftId'],
};

/** Presentation and mutation guards use the same server-time reservation rule. */
export function isChickReserved(state, chickId, now) {
  return Boolean(chickReservation(state, chickId, now));
}

function validate(method, input) {
  if (!Object.hasOwn(METHODS, method)) throw new GameError('UNKNOWN_METHOD', 'Такое действие не поддерживается.');
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some((key) => !METHODS[method].includes(key))) {
    throw new GameError('INVALID_REQUEST', 'Некорректный запрос подарка.');
  }
  if (method === 'listGifts') return {};
  if (typeof input.operationId !== 'string' || !UUID.test(input.operationId)) {
    throw new GameError('INVALID_REQUEST', 'Для действия требуется уникальный ключ операции.');
  }
  const params = { operationId: input.operationId.toLowerCase() };
  if (method === 'offerGift') {
    if (typeof input.chickId !== 'string' || input.chickId.length < 1 || input.chickId.length > 128
      || !/^[a-zA-Z0-9_-]+$/.test(input.chickId)
      || typeof input.recipientProfileId !== 'string' || !PROFILE_ID.test(input.recipientProfileId)) {
      throw new GameError('INVALID_REQUEST', 'Некорректный адресат или цыплёнок.');
    }
    params.chickId = input.chickId;
    params.recipientProfileId = input.recipientProfileId;
  } else {
    giftNamespace(input.giftId);
    params.giftId = input.giftId;
    if (method === 'respondGift') {
      if (typeof input.accept !== 'boolean') throw new GameError('INVALID_REQUEST', 'Подтвердите решение о подарке.');
      params.accept = input.accept;
    }
  }
  return params;
}

function giftNamespace(giftId) {
  if (typeof giftId !== 'string') throw new GameError('INVALID_REQUEST', 'Некорректный идентификатор подарка.');
  const pieces = giftId.split('.');
  if (pieces.length !== 2 || !PROFILE_ID.test(pieces[0]) || !UUID.test(pieces[1])) {
    throw new GameError('INVALID_REQUEST', 'Некорректный идентификатор подарка.');
  }
  return pieces[0];
}

function fingerprint(method, params) {
  return JSON.stringify([method, Object.fromEntries(Object.entries(params).filter(([key]) => key !== 'operationId'))]);
}

function checkedState(row, owner, now) {
  if (!row || row.state?.player?.telegramId !== String(owner) || !Number.isSafeInteger(row.revision)
    || row.revision < 0) throw new GameError('PROFILE_NOT_FOUND', 'Откройте игру заново, чтобы загрузить профиль.');
  validateStateVersion(row.state);
  const state = reconcileState(clone(row.state), Math.max(now, row.state.updatedAt));
  state.gifts ??= [];
  state.giftReceipts ??= {};
  if (!Array.isArray(state.gifts) || typeof state.giftReceipts !== 'object' || Array.isArray(state.giftReceipts)) {
    throw new Error('Invalid gift aggregate');
  }
  return state;
}

function expire(state, now) {
  for (const gift of state.gifts) {
    if (gift.status === 'pending' && gift.expiresAt <= now) {
      gift.status = 'expired';
      gift.completedAt = gift.expiresAt;
    }
  }
}

function dto(gift, state, now) {
  const expired = gift.status === 'pending' && gift.expiresAt <= now;
  const chick = gift.status === 'pending' ? state.chicks.find((entry) => entry.id === gift.chick.id) ?? gift.chick : gift.chick;
  return {
    giftId: gift.giftId,
    sender: { profileId: gift.sender.profileId, displayName: gift.sender.displayName },
    recipient: { profileId: gift.recipient.profileId, displayName: gift.recipient.displayName },
    chick: publicChick(chick),
    status: expired ? 'expired' : gift.status,
    createdAt: gift.createdAt,
    expiresAt: gift.expiresAt,
    completedAt: expired ? gift.expiresAt : gift.completedAt,
  };
}

function receipt(state, operationId, effect) {
  const previous = Object.hasOwn(state.giftReceipts, operationId) ? state.giftReceipts[operationId] : null;
  if (previous && previous.fingerprint !== effect) {
    throw new GameError('OPERATION_CONFLICT', 'Этот ключ операции уже использован для другого подарка.');
  }
  // Operation IDs are shared with game actions; an actor cannot reuse a durable
  // key in another subsystem and accidentally change its original meaning.
  if (Object.hasOwn(state.receipts, operationId) || Object.hasOwn(state.exchangeReceipts ?? {}, operationId)) {
    throw new GameError('OPERATION_CONFLICT', 'Этот ключ операции уже использован для другого действия.');
  }
  return previous;
}

function remember(state, params, effect, giftId, now) {
  state.giftReceipts[params.operationId] = { fingerprint: effect, giftId, at: now };
}

function failure(error) {
  if (error instanceof GameError) return { ok: false, error: { code: error.code, message: error.message,
    retryable: error.retryable, ...(error.retryAt === undefined ? {} : { retryAt: error.retryAt }) } };
  // Never log IDs, state_json, Telegram init data or private profile fields.
  console.error('Chipper gift operation failed', { code: 'INTERNAL' });
  return { ok: false, error: { code: 'TEMPORARILY_UNAVAILABLE', message: 'Не удалось сохранить подарок. Попробуйте ещё раз.', retryable: true } };
}

/**
 * Single-statement cross-player CAS. MATERIALIZED evaluates the authorization
 * and BOTH revision predicates before updating either row. A SQLite statement
 * commits both new aggregates/receipts or rolls back all of them; there is no
 * intermediate deletion or separate gift-status write.
 */
async function swapPair(database, senderId, senderRow, senderState, recipientId, recipientRow, recipientState, requireFriend, expiresAt, clock) {
  if (String(senderId) === String(recipientId)) throw new Error('Gift pair must contain two players');
  const relation = requireFriend ? `AND :expiresAt > :commitNow AND EXISTS (
    SELECT 1 FROM chipper_friendships WHERE pair_key = :pairKey
      AND status = 'accepted' AND low_blocked = 0 AND high_blocked = 0
  )` : '';
  const result = await database.run(`WITH eligible AS MATERIALIZED (
    SELECT 1 AS eligible
    WHERE EXISTS (SELECT 1 FROM chipper_players WHERE telegram_id = :senderId AND revision = :senderRevision)
      AND EXISTS (SELECT 1 FROM chipper_players WHERE telegram_id = :recipientId AND revision = :recipientRevision)
      ${relation}
  )
  UPDATE chipper_players SET revision = revision + 1,
    state_json = CASE telegram_id WHEN :senderId THEN :senderJson ELSE :recipientJson END
  WHERE telegram_id IN (:senderId, :recipientId) AND EXISTS (SELECT 1 FROM eligible)
  RETURNING telegram_id, revision`, {
    ':senderId': Number(senderId), ':recipientId': Number(recipientId),
    ':senderRevision': senderRow.revision, ':recipientRevision': recipientRow.revision,
    ':senderJson': JSON.stringify(senderState), ':recipientJson': JSON.stringify(recipientState),
    ...(requireFriend ? { ':pairKey': friendPairKey(senderId, recipientId), ':expiresAt': expiresAt, ':commitNow': clock() } : {}),
  });
  if (result.rows.length !== 0 && result.rows.length !== 2) throw new Error('Invalid atomic gift outcome');
  return result.rows.length === 2;
}

async function swapOffer(database, senderId, row, state, recipientId) {
  const result = await database.run(`UPDATE chipper_players SET revision = revision + 1, state_json = :stateJson
    WHERE telegram_id = :senderId AND revision = :revision AND EXISTS (
      SELECT 1 FROM chipper_friendships WHERE pair_key = :pairKey
      AND status = 'accepted' AND low_blocked = 0 AND high_blocked = 0
    ) RETURNING revision`, {
    ':senderId': Number(senderId), ':revision': row.revision,
    ':stateJson': JSON.stringify(state), ':pairKey': friendPairKey(senderId, recipientId),
  });
  return result.rows.length === 1;
}

export function createGiftService({ database, store, gameService, now = Date.now, id = serverId }) {
  async function consumeBudget(method, actorId, timestamp) {
    const key = `gift:${actorId}:${method === 'listGifts' ? 'read' : 'write'}`;
    const limit = method === 'listGifts' ? 90 : 120;
    const result = await database.run(`INSERT INTO chipper_social_limits (key, window_start, count)
      VALUES (:key, :now, 1) ON CONFLICT (key) DO UPDATE SET
      window_start = CASE WHEN window_start <= :expiredAt THEN :now ELSE window_start END,
      count = CASE WHEN window_start <= :expiredAt THEN 1 ELSE count + 1 END
      WHERE window_start <= :expiredAt OR count < :limit RETURNING count`, {
      ':key': key, ':now': timestamp, ':expiredAt': timestamp - 60000, ':limit': limit,
    });
    if (result.rows.length !== 1) {
      const budget = await database.get('SELECT window_start FROM chipper_social_limits WHERE key = :key', { ':key': key });
      throw new GameError('RATE_LIMITED', 'Подождите немного перед следующим действием.', {
        retryable: true, retryAt: (budget?.window_start ?? timestamp) + 60000,
      });
    }
  }
  async function playerByProfile(profileId) {
    return database.get('SELECT telegram_id FROM chipper_social_profiles WHERE public_id = :profileId', { ':profileId': profileId });
  }
  async function resolveGift(giftId, actorId, timestamp) {
    const owner = await playerByProfile(giftNamespace(giftId));
    if (!owner) throw new GameError('GIFT_NOT_FOUND', 'Подарок недоступен.');
    const senderId = String(owner.telegram_id);
    const row = await store.read(senderId);
    const state = checkedState(row, senderId, timestamp);
    const gift = state.gifts.find((entry) => entry.giftId === giftId);
    if (!gift || (senderId !== actorId && String(gift.recipientId) !== actorId)) {
      throw new GameError('GIFT_NOT_FOUND', 'Подарок недоступен.');
    }
    return { senderId, row, state, gift };
  }
  async function response(ctx, result) {
    const own = await gameService.call('getHome', {}, ctx);
    return own.ok ? { ...own, result } : own;
  }
  return {
    async call(method, input = {}, ctx) {
      try {
        const actorId = verifiedTelegramId(ctx);
        const params = validate(method, input);
        const timestamp = now();
        if (!Number.isSafeInteger(timestamp) || timestamp < 0) throw new Error('Invalid server clock');
        checkedState(await store.read(actorId), actorId, timestamp);
        await consumeBudget(method, actorId, timestamp);
        if (method === 'listGifts') {
          // Sender history remains discoverable for its real recipient even
          // after unfriend/block. No foreign state or raw IDs reach the client.
          const rows = await database.all(`SELECT telegram_id, revision, state_json FROM chipper_players p
            WHERE telegram_id = :actorId OR EXISTS (
              SELECT 1 FROM json_each(p.state_json, '$.gifts') g
              WHERE json_extract(g.value, '$.recipientId') = :actorText
            )`, { ':actorId': Number(actorId), ':actorText': actorId });
          const gifts = [];
          for (const raw of rows) {
            const row = { revision: raw.revision, state: JSON.parse(raw.state_json) };
            const state = checkedState(row, String(raw.telegram_id), timestamp);
            expire(state, state.updatedAt);
            // Safe single-owner expiry; a competing accept changes revision
            // and wins instead. Expiry is also derived in DTO/activation guard.
            if (row.state.gifts?.some((entry) => entry.status === 'pending' && entry.expiresAt <= timestamp)) {
              if (!(await store.compareAndSwap(String(raw.telegram_id), row.revision, state))) {
                const latest = await store.read(String(raw.telegram_id));
                state.gifts = checkedState(latest, String(raw.telegram_id), timestamp).gifts;
              }
            }
            for (const gift of state.gifts) {
              if (String(raw.telegram_id) === actorId || String(gift.recipientId) === actorId) gifts.push(dto(gift, state, timestamp));
            }
          }
          gifts.sort((a, b) => b.createdAt - a.createdAt || a.giftId.localeCompare(b.giftId));
          return response(ctx, { gifts });
        }
        const effect = fingerprint(method, params);
        for (let conflict = 0; conflict < 32; conflict += 1) {
          const actorRow = await store.read(actorId);
          const currentTime = now();
          if (!Number.isSafeInteger(currentTime) || currentTime < 0) throw new Error('Invalid server clock');
          const actorState = checkedState(actorRow, actorId, Math.max(timestamp, currentTime));
          const serverNow = actorState.updatedAt;
          const previous = receipt(actorState, params.operationId, effect);
          if (previous) {
            const found = await resolveGift(previous.giftId, actorId, serverNow);
            return response(ctx, { gift: dto(found.gift, found.state, serverNow) });
          }
          expire(actorState, serverNow);
          if (method === 'offerGift') {
            const target = await playerByProfile(params.recipientProfileId);
            if (!target || String(target.telegram_id) === actorId
              || !(await areFriends(database, actorId, String(target.telegram_id)))) {
              throw new GameError('FRIEND_REQUIRED', 'Дарить цыплят можно только принятым друзьям.');
            }
            const chick = actorState.chicks.find((entry) => entry.id === params.chickId);
            if (!chick) throw new GameError('CHICK_NOT_FOUND', 'Цыплёнок не найден в вашей коллекции.');
            if (actorState.chicks.length <= 1 || actorState.player.activeChickId === chick.id) {
              throw new GameError('CHICK_NOT_GIFTABLE', 'Выберите неактивного цыплёнка. Последнего подарить нельзя.');
            }
            if (isChickReserved(actorState, chick.id, serverNow)) throw new GameError('CHICK_RESERVED', 'Цыплёнок уже ожидает решения о подарке.');
            const recent = actorState.gifts.filter((entry) => entry.createdAt > serverNow - 60 * 60 * 1000);
            if (recent.length >= 20) throw new GameError('RATE_LIMITED', 'Подождите перед следующим подарком.', {
              retryable: true, retryAt: Math.min(...recent.map((entry) => entry.createdAt)) + 60 * 60 * 1000,
            });
            const sender = await peerFor(database, actorId);
            const recipient = await peerFor(database, String(target.telegram_id));
            if (!sender || !recipient) throw new GameError('PROFILE_NOT_FOUND', 'Сначала откройте раздел друзей.');
            let giftId;
            for (let attempt = 0; attempt < 8; attempt += 1) {
              const suffix = id();
              if (!UUID.test(suffix)) throw new Error('Invalid gift ID generator');
              const candidate = `${sender.profileId}.${suffix}`;
              if (!actorState.gifts.some((entry) => entry.giftId === candidate)) { giftId = candidate; break; }
            }
            if (!giftId) throw new Error('Gift ID generator collision');
            const gift = { giftId, sender: clone(sender), recipient: clone(recipient), recipientId: String(target.telegram_id),
              chick: clone(chick), status: 'pending', createdAt: serverNow, expiresAt: serverNow + GIFT_TTL_MS, completedAt: null };
            actorState.gifts.push(gift);
            remember(actorState, params, effect, giftId, serverNow);
            if (await swapOffer(database, actorId, actorRow, actorState, String(target.telegram_id))) {
              return response(ctx, { gift: dto(gift, actorState, serverNow) });
            }
            continue;
          }
          const found = await resolveGift(params.giftId, actorId, serverNow);
          const { senderId, row: senderRow, state: senderState, gift } = found;
          const isSender = senderId === actorId;
          if ((method === 'cancelGift' && !isSender) || (method === 'respondGift' && isSender)) {
            throw new GameError('GIFT_NOT_FOUND', 'Подарок недоступен.');
          }
          if (gift.status !== 'pending' || gift.expiresAt <= serverNow) {
            const expected = method === 'cancelGift' ? 'cancelled' : params.accept ? 'accepted' : 'declined';
            if (gift.status === expected) return response(ctx, { gift: dto(gift, senderState, serverNow) });
            throw new GameError(gift.expiresAt <= serverNow && gift.status === 'pending' ? 'GIFT_EXPIRED' : 'GIFT_NOT_PENDING', 'Это предложение уже завершено.');
          }
          if (method === 'cancelGift') {
            const latestReceipt = receipt(senderState, params.operationId, effect);
            if (latestReceipt) return response(ctx, { gift: dto(gift, senderState, serverNow) });
            gift.status = 'cancelled'; gift.completedAt = serverNow;
            remember(senderState, params, effect, gift.giftId, serverNow);
            if (await store.compareAndSwap(senderId, senderRow.revision, senderState)) {
              return response(ctx, { gift: dto(gift, senderState, serverNow) });
            }
            continue;
          }
          const accept = params.accept;
          if (String(gift.recipientId) !== actorId) throw new GameError('GIFT_NOT_FOUND', 'Подарок недоступен.');
          if (accept) {
            if (actorState.player.onboarding !== 'done') throw new GameError('ONBOARDING_REQUIRED', 'Сначала завершите знакомство со своим цыплёнком.');
            if (!(await areFriends(database, senderId, actorId))) throw new GameError('FRIEND_REQUIRED', 'Для принятия подарка нужна действующая дружба.');
            const chick = senderState.chicks.find((entry) => entry.id === gift.chick.id);
            if (!chick || senderState.chicks.length <= 1 || senderState.player.activeChickId === chick.id) throw new Error('Invalid reserved ownership');
            if (chickReservation(senderState, chick.id, serverNow)?.kind === 'exchange') throw new GameError('CHICK_RESERVED', 'Цыплёнок участвует в обмене.');
            if (actorState.chicks.some((entry) => entry.id === chick.id)) throw new Error('Duplicate gift ownership');
            gift.chick = clone(chick);
            senderState.chicks = senderState.chicks.filter((entry) => entry.id !== chick.id);
            actorState.chicks.push(clone(chick));
            discoverChickTraits(actorState, chick);
            recordEvent(senderState, 'gift_accepted', serverNow);
            recordEvent(actorState, 'gift_accepted', serverNow);
          }
          gift.status = accept ? 'accepted' : 'declined'; gift.completedAt = serverNow;
          remember(actorState, params, effect, gift.giftId, serverNow);
          if (await swapPair(database, senderId, senderRow, senderState, actorId, actorRow, actorState, accept, gift.expiresAt, now)) {
            return response(ctx, { gift: dto(gift, senderState, serverNow) });
          }
        }
        throw new GameError('CONCURRENT_UPDATE', 'Подарок меняется в другом окне. Повторите действие.', { retryable: true });
      } catch (error) {
        return failure(error);
      }
    },
  };
}
