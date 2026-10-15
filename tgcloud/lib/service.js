import {
  GameError, clone, createInitialState, isReadMethod, validateRequest,
  requestFingerprint, reconcileState, snapshot, applyMutation,
  validateStateVersion,
} from './domain.js';

import { dailyBonusStatus } from './dailyBonus.js';
import { refreshProfileIdentity } from './profileIdentity.js';
import { traitCodexCatalog } from './traitCodex.js';
import { achievementStatus } from './achievements.js';

/** ctx.initData is verified by Telegram before an endpoint is invoked. */
export function verifiedTelegramId(ctx) {
  const value = ctx?.initData?.user?.id;
  const numeric = typeof value === 'string' && /^[1-9][0-9]{0,15}$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(numeric) || numeric <= 0) {
    throw new GameError('UNAUTHORIZED', 'Откройте Chipper через Telegram-бота.');
  }
  return String(numeric);
}

/** Cosmetic randomness is server-only and injectable in deterministic tests. */
export function serverRandom() {
  // The documented V8 SDK has no cryptographic random API. There are no money,
  // paid draws or public rankings; a server-side cosmetic draw suffices.
  return Math.random();
}

export function serverId() {
  let value = '';
  for (let index = 0; index < 32; index += 1) value += Math.floor(serverRandom() * 16).toString(16);
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-4${value.slice(13, 16)}-${((parseInt(value[16], 16) & 3) | 8).toString(16)}${value.slice(17, 20)}-${value.slice(20)}`;
}

function failure(error) {
  if (error instanceof GameError) {
    return { ok: false, error: { code: error.code, message: error.message,
      retryable: error.retryable, ...(error.retryAt === undefined ? {} : { retryAt: error.retryAt }) } };
  }
  // Database or runtime internals never go to the player, including init data.
  return { ok: false, error: { code: 'TEMPORARILY_UNAVAILABLE', message: 'Сейчас не удалось связаться с гнездом. Попробуйте ещё раз.', retryable: true } };
}

/**
 * store.read(id) -> { revision, state } | null
 * store.create(id, state) -> void (INSERT ON CONFLICT DO NOTHING)
 * store.compareAndSwap(id, expectedRevision, state) -> boolean
 *
 * Every durable effect, including its receipt, fits in ONE atomic row update.
 * A conflicting operation is recomputed against the winning row, never merged.
 */
export function createGameService({ store, now = Date.now, random = serverRandom, id = serverId }) {
  if (!store || typeof store.read !== 'function' || typeof store.create !== 'function' || typeof store.compareAndSwap !== 'function') {
    throw new Error('Game service requires an atomic aggregate store.');
  }
  return {
    async call(method, input = {}, ctx) {
      try {
        const telegramId = verifiedTelegramId(ctx);
        const params = validateRequest(method, input);
        let budgetApplied = false;
        for (let conflict = 0; conflict < 32; conflict += 1) {
          let row = await store.read(telegramId);
          const timestamp = now();
          if (!Number.isSafeInteger(timestamp) || timestamp < 0) throw new Error('Invalid server clock');
          if (!row) {
            // Only bootstrap creates accounts. Mutating an unknown account can
            // neither claim a starter nor accidentally create other inventory.
            if (method !== 'bootstrap') throw new GameError('PROFILE_NOT_FOUND', 'Откройте игру заново, чтобы загрузить ваш профиль.', { retryable: true });
            await store.create(telegramId, createInitialState(telegramId, timestamp, id));
            row = await store.read(telegramId);
            if (!row) continue;
          }
          if (row.state.player.telegramId !== telegramId || !Number.isSafeInteger(row.revision) || row.revision < 0) {
            throw new Error('Invalid aggregate ownership');
          }
          validateStateVersion(row.state);
          const state = reconcileState(clone(row.state), Math.max(timestamp, row.state.updatedAt));
          const serverNow = state.updatedAt;
          if (method === 'bootstrap' || method === 'getHome') refreshProfileIdentity(state, ctx, serverNow);
          let result;
          if (!budgetApplied && ['getDailyBonus', 'listTraitCodex', 'getAchievements', 'bootstrap', 'getHome'].includes(method) && store.consumeBudget) {
            await store.consumeBudget(telegramId, method, serverNow, method === 'getHome' ? 600 : method === 'bootstrap' ? 120 : 60); budgetApplied = true;
          }
          if (method === 'getDailyBonus') result = { dailyBonus: dailyBonusStatus(state, serverNow) };
          if (method === 'listTraitCodex') result = { codex: traitCodexCatalog(state) };
          if (method === 'getAchievements') result = { achievements: achievementStatus(state) };
          if (!isReadMethod(method)) {
            if (Object.hasOwn(state.giftReceipts ?? {}, params.operationId) || Object.hasOwn(state.exchangeReceipts ?? {}, params.operationId)) throw new GameError('OPERATION_CONFLICT', 'Этот ключ операции уже использован для другого действия.');
            const fingerprint = requestFingerprint(method, params);
            const receipt = Object.hasOwn(state.receipts, params.operationId) ? state.receipts[params.operationId] : null;
            if (receipt) {
              if (receipt.fingerprint !== fingerprint) throw new GameError('OPERATION_CONFLICT', 'Этот ключ операции уже использован для другого действия.');
              result = receipt.result;
            } else {
              if (!budgetApplied && ['claimDailyBonus', 'claimAchievement'].includes(method) && store.consumeBudget) {
                await store.consumeBudget(telegramId, method, serverNow, 60, params.operationId); budgetApplied = true;
              }
              result = applyMutation(state, method, params, { now: serverNow, random, id });
              // Receipts are permanent, including buying and issuing attempts.
              // Retrying a lost response years later cannot reapply an effect.
              state.receipts[params.operationId] = { fingerprint, result: clone(result), at: serverNow };
            }
          }
          if (JSON.stringify(state) === JSON.stringify(row.state)) {
            return { ok: true, state: snapshot(state, row.revision, serverNow), ...(result === undefined ? {} : { result: clone(result) }) };
          }
          if (await store.compareAndSwap(telegramId, row.revision, state)) {
            return { ok: true, state: snapshot(state, row.revision + 1, serverNow), ...(result === undefined ? {} : { result: clone(result) }) };
          }
        }
        throw new GameError('CONCURRENT_UPDATE', 'Игра обновляется в другом окне. Повторите действие.', { retryable: true });
      } catch (error) {
        if (!(error instanceof GameError)) {
          // Do not log DB payloads, Telegram init data, user names or tokens.
          console.error('Chipper backend operation failed', { method, code: 'INTERNAL' });
        }
        return failure(error);
      }
    },
  };
}
