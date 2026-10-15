import { GameError, clone, reconcileState, validateStateVersion, chickReservation, reservedExchangeId, recordEvent } from './domain.js';
import { verifiedTelegramId, serverId } from './service.js';
import { friendPairKey, peerFor, publicChick } from './social.js';
import { consumeRequestBudget } from './requestBudget.js';
import { discoverChickTraits } from './traitCodex.js';

export const EXCHANGE_TTL_MS = 24 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROFILE = /^[a-zA-Z0-9_-]{12,128}$/;
const CHICK = /^[a-zA-Z0-9_-]{1,128}$/;
const METHODS = { listExchanges: [], offerExchange: ['operationId', 'chickId', 'recipientProfileId', 'requestedChickId'],
  respondExchange: ['operationId', 'exchangeId', 'accept'], cancelExchange: ['operationId', 'exchangeId'] };
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const unavailable = () => new GameError('EXCHANGE_UNAVAILABLE', 'Эта пара цыплят недоступна для обмена.');

function namespace(value) {
  if (typeof value !== 'string') throw new GameError('INVALID_REQUEST', 'Некорректный обмен.');
  const parts = value.split('.');
  if (parts.length !== 2 || !PROFILE.test(parts[0]) || !UUID.test(parts[1])) throw new GameError('INVALID_REQUEST', 'Некорректный обмен.');
  return parts[0];
}
function validate(method, input) {
  if (!Object.hasOwn(METHODS, method)) throw new GameError('UNKNOWN_METHOD', 'Такое действие не поддерживается.');
  if (!plain(input) || Object.keys(input).some(key => !METHODS[method].includes(key))) throw new GameError('INVALID_REQUEST', 'Некорректный запрос обмена.');
  if (method === 'listExchanges') return {};
  if (typeof input.operationId !== 'string' || !UUID.test(input.operationId)) throw new GameError('INVALID_REQUEST', 'Требуется уникальный ключ операции.');
  const params = { operationId: input.operationId.toLowerCase() };
  if (method === 'offerExchange') {
    if (typeof input.chickId !== 'string' || typeof input.requestedChickId !== 'string' || typeof input.recipientProfileId !== 'string'
      || !CHICK.test(input.chickId) || !CHICK.test(input.requestedChickId) || !PROFILE.test(input.recipientProfileId)) {
      throw new GameError('INVALID_REQUEST', 'Выберите двух цыплят и друга.');
    }
    Object.assign(params, { chickId: input.chickId, requestedChickId: input.requestedChickId, recipientProfileId: input.recipientProfileId });
  } else {
    namespace(input.exchangeId); params.exchangeId = input.exchangeId;
    if (method === 'respondExchange') {
      if (typeof input.accept !== 'boolean') throw new GameError('INVALID_REQUEST', 'Подтвердите решение об обмене.');
      params.accept = input.accept;
    }
  }
  return params;
}
function fingerprint(method, params) { return JSON.stringify([method, Object.fromEntries(Object.entries(params).filter(([key]) => key !== 'operationId'))]); }
function checked(row, owner, now) {
  if (!row || row.state?.player?.telegramId !== owner || !Number.isSafeInteger(row.revision) || row.revision < 0) {
    throw new GameError('PROFILE_NOT_FOUND', 'Откройте игру заново, чтобы загрузить профиль.');
  }
  validateStateVersion(row.state);
  const state = reconcileState(clone(row.state), Math.max(now, row.state.updatedAt));
  if (state.player.onboarding !== 'done') throw new GameError('ONBOARDING_REQUIRED', 'Сначала завершите знакомство с цыплёнком.');
  state.exchanges ??= []; state.exchangeReceipts ??= {};
  if (!Array.isArray(state.exchanges) || !plain(state.exchangeReceipts)) throw new Error('Invalid exchange state');
  if (state.exchanges.some(entry => !plain(entry) || entry.version !== 1
    || !['pending', 'accepted', 'declined', 'cancelled', 'expired'].includes(entry.status)
    || typeof entry.senderId !== 'string' || typeof entry.recipientId !== 'string' || entry.senderId === entry.recipientId
    || ![entry.senderId, entry.recipientId].includes(owner) || !plain(entry.offeredChick) || !plain(entry.requestedChick)
    || !Number.isSafeInteger(entry.createdAt) || !Number.isSafeInteger(entry.expiresAt) || entry.expiresAt <= entry.createdAt)) {
    throw new GameError('INVALID_SAVE', 'Обновите игру, чтобы прочитать историю обменов.', { retryable: true });
  }
  return state;
}
function receipt(state, operationId, effect) {
  if (Object.hasOwn(state.receipts, operationId) || Object.hasOwn(state.giftReceipts ?? {}, operationId)) throw new GameError('OPERATION_CONFLICT', 'Этот ключ уже использован для другого действия.');
  const prior = Object.hasOwn(state.exchangeReceipts, operationId) ? state.exchangeReceipts[operationId] : null;
  if (prior && prior.fingerprint !== effect) throw new GameError('OPERATION_CONFLICT', 'Этот ключ уже использован для другого обмена.');
  return prior;
}
function dto(entry, now) {
  return { exchangeId: entry.exchangeId, sender: clone(entry.sender), recipient: clone(entry.recipient),
    offeredChick: publicChick(entry.offeredChick), requestedChick: publicChick(entry.requestedChick),
    status: entry.status === 'pending' && entry.expiresAt <= now ? 'expired' : entry.status,
    createdAt: entry.createdAt, expiresAt: entry.expiresAt,
    completedAt: entry.status === 'pending' && entry.expiresAt <= now ? entry.expiresAt : entry.completedAt };
}
function eligibleChick(state, chickId, now, excludeExchangeId = null) {
  const chick = state.chicks.find(entry => entry.id === chickId);
  if (!chick || state.chicks.length <= 1 || state.player.activeChickId === chickId || chickReservation(state, chickId, now, excludeExchangeId)) throw unavailable();
  return chick;
}
function failure(error) {
  if (error instanceof GameError) return { ok: false, error: { code: error.code, message: error.message,
    retryable: error.retryable, ...(error.retryAt === undefined ? {} : { retryAt: error.retryAt }) } };
  console.error('Chipper exchange operation failed', { code: 'INTERNAL' });
  return { ok: false, error: { code: 'TEMPORARILY_UNAVAILABLE', message: 'Не удалось сохранить обмен. Попробуйте ещё раз.', retryable: true } };
}

/** Both immutable mirror records and ownership effects share one SQLite statement. */
export function createExchangeService({ database, store, gameService, now = Date.now, id = serverId }) {
  function clock() { const value = now(); if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid server clock'); return value; }
  async function response(ctx, entry, time) {
    const own = await gameService.call('getHome', {}, ctx);
    return own.ok ? { ...own, result: { exchange: dto(entry, time) } } : own;
  }
  async function pairCommit(senderId, senderRow, senderState, recipientId, recipientRow, recipientState, entry, options = {}) {
    const time = Math.max(clock(), senderState.updatedAt, recipientState.updatedAt);
    const friendGuard = options.friend ? `AND EXISTS (SELECT 1 FROM chipper_friendships WHERE pair_key=:pair
      AND status='accepted' AND low_blocked=0 AND high_blocked=0) AND :expires>:now` : '';
    const privacyGuard = options.privacy ? `AND EXISTS (SELECT 1 FROM chipper_social_profiles
      WHERE telegram_id=:recipient AND visibility IN ('friends','public') AND collection_visibility IN ('friends','public'))` : '';
    const inventoryGuard = options.inventory ? `AND EXISTS (SELECT 1 FROM chipper_players
      WHERE telegram_id=:sender AND json_array_length(state_json,'$.chicks')>1
      AND json_extract(state_json,'$.player.activeChickId')<>:offered
      AND EXISTS (SELECT 1 FROM json_each(state_json,'$.chicks') WHERE json_extract(value,'$.id')=:offered))
      AND EXISTS (SELECT 1 FROM chipper_players WHERE telegram_id=:recipient AND json_array_length(state_json,'$.chicks')>1
      AND json_extract(state_json,'$.player.activeChickId')<>:requested
      AND EXISTS (SELECT 1 FROM json_each(state_json,'$.chicks') WHERE json_extract(value,'$.id')=:requested))` : '';
    const result = await database.run(`WITH eligible AS MATERIALIZED (
      SELECT 1 WHERE EXISTS(SELECT 1 FROM chipper_players WHERE telegram_id=:sender AND revision=:senderRevision)
      AND EXISTS(SELECT 1 FROM chipper_players WHERE telegram_id=:recipient AND revision=:recipientRevision)
      ${friendGuard} ${privacyGuard} ${inventoryGuard}
    ) UPDATE chipper_players SET revision=revision+1,state_json=CASE telegram_id WHEN :sender THEN :senderJson ELSE :recipientJson END
      WHERE telegram_id IN (:sender,:recipient) AND EXISTS(SELECT 1 FROM eligible) RETURNING telegram_id`, {
      ':sender': Number(senderId), ':recipient': Number(recipientId), ':senderRevision': senderRow.revision, ':recipientRevision': recipientRow.revision,
      ':senderJson': JSON.stringify(senderState), ':recipientJson': JSON.stringify(recipientState),
      ...(options.friend ? { ':pair': friendPairKey(senderId, recipientId), ':expires': entry.expiresAt, ':now': time } : {}),
      ...(options.inventory ? { ':offered': entry.offeredChick.id, ':requested': entry.requestedChick.id } : {}),
    });
    if (result.rows.length !== 0 && result.rows.length !== 2) throw new Error('Invalid atomic exchange outcome');
    return result.rows.length === 2;
  }
  return { async call(method, input = {}, ctx) {
    try {
      const actor = verifiedTelegramId(ctx), params = validate(method, input), timestamp = clock();
      let budget = false;
      for (let conflict = 0; conflict < 32; conflict++) {
        const actorRow = await store.read(actor), actorState = checked(actorRow, actor, Math.max(timestamp, clock()));
        const time = actorState.updatedAt;
        if (method === 'listExchanges') {
          await consumeRequestBudget(database, { actor, kind: 'exchange-read', now: time, limit: 60 });
          const own = await gameService.call('getHome', {}, ctx);
          return own.ok ? { ...own, result: { exchanges: actorState.exchanges.filter(entry => String(entry.senderId) === actor || String(entry.recipientId) === actor)
            .map(entry => dto(entry, time)).sort((a, b) => b.createdAt - a.createdAt || a.exchangeId.localeCompare(b.exchangeId)) } } : own;
        }
        const effect = fingerprint(method, params), previous = receipt(actorState, params.operationId, effect);
        if (previous) {
          const entry = actorState.exchanges.find(item => item.exchangeId === previous.exchangeId);
          if (!entry) throw new Error('Missing exchange receipt target');
          return response(ctx, entry, time);
        }
        if (!budget) { await consumeRequestBudget(database, { actor, kind: 'exchange-write', now: time, limit: 60, operationId: params.operationId }); budget = true; }
        if (method === 'offerExchange') {
          const target = await database.get(`SELECT telegram_id FROM chipper_social_profiles WHERE public_id=:profile
            AND visibility IN ('friends','public') AND collection_visibility IN ('friends','public')`, { ':profile': params.recipientProfileId });
          if (!target || String(target.telegram_id) === actor) throw unavailable();
          const peerId = String(target.telegram_id), peerRow = await store.read(peerId), peerState = checked(peerRow, peerId, time);
          const relation = await database.get(`SELECT 1 FROM chipper_friendships WHERE pair_key=:pair AND status='accepted' AND low_blocked=0 AND high_blocked=0`, { ':pair': friendPairKey(actor, peerId) });
          if (!relation) throw new GameError('FRIEND_REQUIRED', 'Обмен доступен принятым друзьям.');
          const offered = eligibleChick(actorState, params.chickId, time), requested = eligibleChick(peerState, params.requestedChickId, time);
          if (offered.id === requested.id || peerState.chicks.some(chick => chick.id === offered.id) || actorState.chicks.some(chick => chick.id === requested.id)) throw unavailable();
          if (actorState.exchanges.filter(entry => String(entry.senderId) === actor && entry.createdAt > time - 3600000).length >= 20) throw new GameError('RATE_LIMITED', 'Подождите перед следующим предложением.', { retryable: true, retryAt: time + 3600000 });
          const sender = await peerFor(database, actor), recipient = await peerFor(database, peerId);
          if (!sender || !recipient) throw unavailable();
          let exchangeId;
          for (let attempt = 0; attempt < 8; attempt++) {
            const suffix = id(); if (!UUID.test(suffix)) throw new Error('Invalid exchange ID generator');
            const candidate = `${sender.profileId}.${suffix}`;
            if (![...actorState.exchanges, ...peerState.exchanges].some(entry => entry.exchangeId === candidate)) { exchangeId = candidate; break; }
          }
          if (!exchangeId) throw new Error('Exchange ID collision');
          const entry = { version: 1, exchangeId, senderId: actor, recipientId: peerId, sender, recipient,
            offeredChick: publicChick(offered), requestedChick: publicChick(requested), status: 'pending', createdAt: time, expiresAt: time + EXCHANGE_TTL_MS, completedAt: null };
          actorState.exchanges.push(clone(entry)); peerState.exchanges.push(clone(entry));
          actorState.exchangeReceipts[params.operationId] = { fingerprint: effect, exchangeId, at: time };
          if (await pairCommit(actor, actorRow, actorState, peerId, peerRow, peerState, entry, { friend: true, privacy: true, inventory: true })) return response(ctx, entry, time);
          continue;
        }
        const entry = actorState.exchanges.find(item => item.exchangeId === params.exchangeId);
        if (!entry || ![String(entry.senderId), String(entry.recipientId)].includes(actor)) throw new GameError('EXCHANGE_NOT_FOUND', 'Обмен недоступен.');
        const isSender = String(entry.senderId) === actor;
        if ((method === 'cancelExchange' && !isSender) || (method === 'respondExchange' && isSender)) throw new GameError('EXCHANGE_NOT_FOUND', 'Обмен недоступен.');
        const expected = method === 'cancelExchange' ? 'cancelled' : params.accept ? 'accepted' : 'declined';
        if (entry.status !== 'pending' || entry.expiresAt <= time) {
          if (entry.status === expected) {
            // No new effect and no new permanent receipt for arbitrary fresh
            // terminal keys. The original transition key remains durable.
            return response(ctx, entry, time);
          }
          throw new GameError(entry.status === 'pending' ? 'EXCHANGE_EXPIRED' : 'EXCHANGE_NOT_PENDING', 'Предложение уже завершено.');
        }
        const peerId = isSender ? String(entry.recipientId) : String(entry.senderId), peerRow = await store.read(peerId), peerState = checked(peerRow, peerId, time);
        const mirror = peerState.exchanges.find(item => item.exchangeId === entry.exchangeId);
        if (!mirror || JSON.stringify(mirror) !== JSON.stringify(entry)) {
          if ((await store.read(actor))?.revision !== actorRow.revision) continue;
          throw new Error('Exchange mirror mismatch');
        }
        const senderState = isSender ? actorState : peerState, recipientState = isSender ? peerState : actorState;
        const accept = method === 'respondExchange' && params.accept;
        if (accept) {
          const relation = await database.get(`SELECT 1 FROM chipper_friendships WHERE pair_key=:pair AND status='accepted' AND low_blocked=0 AND high_blocked=0`, { ':pair': friendPairKey(String(entry.senderId), String(entry.recipientId)) });
          if (!relation) throw new GameError('FRIEND_REQUIRED', 'Для обмена нужна действующая дружба.');
          const offered = eligibleChick(senderState, entry.offeredChick.id, time, entry.exchangeId);
          const requested = eligibleChick(recipientState, entry.requestedChick.id, time);
          if (reservedExchangeId(senderState, offered.id, time) !== entry.exchangeId || senderState.chicks.some(chick => chick.id === requested.id) || recipientState.chicks.some(chick => chick.id === offered.id)) throw unavailable();
          entry.offeredChick = publicChick(offered); entry.requestedChick = publicChick(requested);
          senderState.chicks = senderState.chicks.filter(chick => chick.id !== offered.id); senderState.chicks.push(clone(requested));
          recipientState.chicks = recipientState.chicks.filter(chick => chick.id !== requested.id); recipientState.chicks.push(clone(offered));
          discoverChickTraits(senderState, requested); discoverChickTraits(recipientState, offered);
          recordEvent(senderState, 'exchange_accepted', time); recordEvent(recipientState, 'exchange_accepted', time);
        }
        entry.status = expected; entry.completedAt = time;
        Object.assign(mirror, clone(entry));
        actorState.exchangeReceipts[params.operationId] = { fingerprint: effect, exchangeId: entry.exchangeId, at: time };
        if (await pairCommit(String(entry.senderId), isSender ? actorRow : peerRow, senderState,
          String(entry.recipientId), isSender ? peerRow : actorRow, recipientState, entry, { friend: accept, inventory: accept })) return response(ctx, entry, time);
      }
      throw new GameError('CONCURRENT_UPDATE', 'Обмен обновляется в другом окне. Повторите действие.', { retryable: true });
    } catch (error) { return failure(error); }
  } };
}
