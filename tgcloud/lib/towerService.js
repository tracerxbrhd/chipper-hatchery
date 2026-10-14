import { GameError, clone, reconcileState, validateStateVersion } from './domain.js';
import { verifiedTelegramId, serverId, serverRandom } from './service.js';
import { emptyGameRecord, gameConfig, gameRewardNextAt } from './gameRegistry.js';
import { TOWER_CONFIG, createTowerState, replayTowerCheckpoint, towerStateHash, towerRewardAmount } from './towerRules.js';

export const TOWER_GAME_ID = 'nest-defense';
export const TOWER_LIMITS = Object.freeze({ ttlMs: 24 * 60 * 60 * 1000, maxBytes: 32768,
  maxCommands: 64, maxTicks: 1200, clockToleranceMs: 250, checkpointPerMinute: 90,
  readPerMinute: 60, startPerMinute: 12, finishPerMinute: 30 });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const METHODS = Object.freeze({ startTowerRun: ['operationId'], getTowerRun: ['runId'],
  checkpointTowerRun: ['operationId', 'runId', 'revision', 'commands', 'ticks', 'expectedHash'],
  finishTowerRun: ['operationId', 'runId', 'endReason'] });
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const error = (code, message, options) => new GameError(code, message, options);

function validate(method, input) {
  if (!Object.hasOwn(METHODS, method)) throw error('UNKNOWN_METHOD', 'Такое действие не поддерживается.');
  if (!plain(input) || Object.keys(input).some(key => !METHODS[method].includes(key))) {
    throw error('INVALID_REQUEST', 'Некорректный запрос защиты гнезда.');
  }
  // UTF-8 upper bound without TextEncoder (the production V8 SDK has no Node).
  if (encodeURIComponent(JSON.stringify(input)).replace(/%[0-9A-F]{2}/g, 'x').length > TOWER_LIMITS.maxBytes) {
    throw error('BATCH_TOO_LARGE', 'Отправьте более короткую часть игры.');
  }
  const params = {};
  if (method !== 'getTowerRun') {
    if (typeof input.operationId !== 'string' || !UUID.test(input.operationId)) throw error('INVALID_REQUEST', 'Требуется уникальный ключ операции.');
    params.operationId = input.operationId.toLowerCase();
  }
  if (method !== 'startTowerRun' && (method !== 'getTowerRun' || input.runId !== undefined)) {
    if (typeof input.runId !== 'string' || !UUID.test(input.runId)) throw error('INVALID_REQUEST', 'Некорректная игра.');
    params.runId = input.runId.toLowerCase();
  }
  if (method === 'checkpointTowerRun') {
    if (!Number.isSafeInteger(input.revision) || input.revision < 0
      || !Number.isSafeInteger(input.ticks) || input.ticks < 0 || input.ticks > TOWER_LIMITS.maxTicks
      || !Array.isArray(input.commands) || input.commands.length > TOWER_LIMITS.maxCommands
      || typeof input.expectedHash !== 'string' || !/^[0-9a-f]{8,64}$/i.test(input.expectedHash)) {
      throw error('INVALID_CHECKPOINT', 'Некорректное сохранение игры.');
    }
    params.revision = input.revision; params.ticks = input.ticks;
    params.expectedHash = input.expectedHash.toLowerCase();
    params.commands = input.commands.map(command => {
      if (!plain(command) || !['place', 'upgrade', 'sell', 'startWave'].includes(command.type)) throw error('INVALID_COMMAND', 'Неизвестное действие в игре.');
      const keys = command.type === 'place' ? ['type', 'x', 'y', 'towerType'] : command.type === 'startWave' ? ['type'] : ['type', 'x', 'y'];
      if (Object.keys(command).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(command, key))) throw error('INVALID_COMMAND', 'Некорректное действие в игре.');
      if (command.type !== 'startWave' && (!Number.isSafeInteger(command.x) || command.x < 0 || command.x >= 10
        || !Number.isSafeInteger(command.y) || command.y < 0 || command.y >= 14)) throw error('INVALID_COMMAND', 'Выберите клетку игрового поля.');
      if (command.type === 'place' && !['beak', 'seed', 'frost'].includes(command.towerType)) throw error('INVALID_COMMAND', 'Неизвестная башня.');
      return Object.fromEntries(keys.map(key => [key, command[key]]));
    });
  }
  if (method === 'finishTowerRun') {
    if (!['retire', 'defeat'].includes(input.endReason)) throw error('INVALID_REQUEST', 'Укажите причину завершения игры.');
    params.endReason = input.endReason;
  }
  return params;
}

function fingerprint(method, params) {
  return JSON.stringify([method, Object.fromEntries(Object.entries(params).filter(([key]) => key !== 'operationId'))]);
}
function checkedState(row, owner, timestamp) {
  if (!row || row.state?.player?.telegramId !== owner || !Number.isSafeInteger(row.revision) || row.revision < 0) {
    throw error('PROFILE_NOT_FOUND', 'Откройте игру заново, чтобы загрузить профиль.');
  }
  validateStateVersion(row.state);
  const state = reconcileState(clone(row.state), Math.max(timestamp, row.state.updatedAt));
  if (state.player.onboarding !== 'done') throw error('ONBOARDING_REQUIRED', 'Сначала познакомьтесь со своим цыплёнком.');
  state.towerReceipts ??= {};
  if (!plain(state.towerReceipts)) throw new Error('Invalid tower fences');
  return state;
}
function sharedOperation(state, operationId, effect) {
  if (Object.hasOwn(state.giftReceipts ?? {}, operationId)) throw error('OPERATION_CONFLICT', 'Этот ключ уже использован для другого действия.');
  const receipt = Object.hasOwn(state.receipts, operationId) ? state.receipts[operationId] : null;
  if (receipt && receipt.fingerprint !== effect) throw error('OPERATION_CONFLICT', 'Этот ключ уже использован для другого действия.');
  return receipt;
}
function dto(row) {
  if (row.config_version !== TOWER_CONFIG.configVersion && ['active', 'settling'].includes(row.status)) {
    throw error('RULES_VERSION_UNSUPPORTED', 'Этой игре нужна прежняя версия правил. Попробуйте позже.', { retryable: true });
  }
  return { runId: row.run_id, revision: row.revision, seed: row.seed, configVersion: row.config_version,
    status: row.status, verifiedWave: row.verified_wave,
    checkpoint: row.status === 'active' || row.status === 'settling' ? JSON.parse(row.checkpoint_json) : null,
    startedAt: row.created_at, expiresAt: row.expires_at,
    ...(row.result_json ? { result: JSON.parse(row.result_json) } : {}) };
}
function failure(fault) {
  if (fault instanceof GameError) return { ok: false, error: { code: fault.code, message: fault.message,
    retryable: fault.retryable, ...(fault.retryAt === undefined ? {} : { retryAt: fault.retryAt }) } };
  console.error('Chipper tower operation failed', { code: 'INTERNAL' });
  return { ok: false, error: { code: 'TEMPORARILY_UNAVAILABLE', message: 'Не удалось сохранить защиту гнезда. Попробуйте ещё раз.', retryable: true } };
}

/** Only a sealed canonical completedWave reaches this owner-CAS calculation. */
export function recordTowerCompletion(player, verifiedWave, timestamp) {
  const config = gameConfig(TOWER_GAME_ID);
  if (!config) throw new Error('Tower game registry is missing');
  player.games ??= {};
  const record = player.games[TOWER_GAME_ID] ?? (player.games[TOWER_GAME_ID] = emptyGameRecord(config));
  const previousBest = record.bestScore;
  const amount = towerRewardAmount(verifiedWave);
  const rewarded = amount > 0 && gameRewardNextAt(record, config, timestamp) === null;
  if (!Number.isSafeInteger(player.feathers) || player.feathers < 0 || player.feathers > Number.MAX_SAFE_INTEGER - (rewarded ? amount : 0)) throw new Error('Invalid feather balance');
  if (rewarded) { player.feathers += amount; record.lastRewardAt = timestamp; }
  record.bestScore = Math.max(previousBest, verifiedWave); record.completedRuns += 1;
  record.lastPlayedAt = timestamp; record.configVersion = config.configVersion;
  record.scoreType = 'wave'; record.scoreTrust = 'verified';
  return { gameId: TOWER_GAME_ID, score: verifiedWave, verifiedWave, previousBest,
    bestScore: record.bestScore, newBest: verifiedWave > previousBest,
    rewarded, rewardAmount: rewarded ? amount : 0, rewardNextAt: gameRewardNextAt(record, config, timestamp),
    reason: rewarded ? 'rewarded' : amount === 0 ? 'no_reward' : 'cooldown' };
}

/**
 * Every checkpoint is one run CAS. Finish first seals that immutable checkpoint;
 * then ONE owner CAS changes feathers, record, operation receipt and permanent
 * run fence together. Terminalization is repairable bookkeeping, never payment
 * authority. No transactions, triggers, Node or external calls at runtime.
 */
export function createTowerService({ database, store, gameService, now = Date.now, id = serverId, random = serverRandom }) {
  function clock() {
    const value = now();
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid server clock');
    return value;
  }
  async function runById(actor, runId) {
    const row = await database.get('SELECT * FROM chipper_tower_runs WHERE run_id = :runId AND telegram_id = :actor', { ':runId': runId, ':actor': Number(actor) });
    if (!row) throw error('RUN_NOT_FOUND', 'Эта игра недоступна.');
    if (!Number.isSafeInteger(row.revision) || row.revision < 0 || !Number.isSafeInteger(row.verified_wave) || row.verified_wave < 0) throw new Error('Invalid tower row');
    if (row.config_version !== TOWER_CONFIG.configVersion && ['active', 'settling'].includes(row.status)) throw error('RULES_VERSION_UNSUPPORTED', 'Этой игре нужна прежняя версия правил. Попробуйте позже.', { retryable: true });
    return row;
  }
  async function response(ctx, result) {
    const own = await gameService.call('getHome', {}, ctx);
    return own.ok ? { ...own, result } : own;
  }
  async function budget(method, actor, timestamp, operationId, effect) {
    const label = method === 'getTowerRun' ? 'read' : method === 'startTowerRun' ? 'start' : method === 'finishTowerRun' ? 'finish' : 'checkpoint';
    const limit = TOWER_LIMITS[`${label === 'read' ? 'read' : label === 'start' ? 'start' : label === 'finish' ? 'finish' : 'checkpoint'}PerMinute`];
    const key = `tower:${actor}:${label}`;
    // Bounded minute-local dedupe avoids charging lost-response retries. This is
    // NOT a durable replay fence; revisions and terminal receipts provide that.
    const seenKey = operationId ? `${operationId}:${towerStateHash({ effect })}` : null;
    for (let conflict = 0; conflict < 32; conflict += 1) {
      const old = await database.get('SELECT window_start,count,seen_json FROM chipper_social_limits WHERE key=:key', { ':key': key });
      const expired = !old || old.window_start <= timestamp - 60000;
      const seen = expired ? {} : JSON.parse(old.seen_json);
      if (seenKey && Object.hasOwn(seen, seenKey)) return;
      if (!expired && old.count >= limit) throw error('RATE_LIMITED', 'Подождите немного перед следующим действием.', { retryable: true, retryAt: old.window_start + 60000 });
      if (seenKey) seen[seenKey] = true;
      const updated = await database.run(`INSERT INTO chipper_social_limits(key,window_start,count,seen_json)
        VALUES(:key,:now,1,:seen) ON CONFLICT(key) DO UPDATE SET window_start=:now,count=:count,seen_json=:seen
        WHERE window_start=:oldWindow AND count=:oldCount AND seen_json=:oldSeen RETURNING count`, {
        ':key': key, ':now': expired ? timestamp : old.window_start, ':count': expired ? 1 : old.count + 1,
        ':seen': JSON.stringify(seen), ':oldWindow': old?.window_start ?? -1, ':oldCount': old?.count ?? -1, ':oldSeen': old?.seen_json ?? '{}' });
      if (updated.rows.length === 1) return;
    }
    throw error('CONCURRENT_UPDATE', 'Игра обновляется в другом окне. Повторите действие.', { retryable: true });
  }
  async function expire(row, actor, timestamp) {
    if (row.status !== 'active' || row.expires_at > timestamp) return row;
    await database.run(`UPDATE chipper_tower_runs SET status='expired',revision=revision+1,checkpoint_json='{}',last_activity_at=:now
      WHERE run_id=:runId AND telegram_id=:actor AND status='active' AND revision=:revision AND expires_at<=:now RETURNING revision`, {
      ':runId': row.run_id, ':actor': Number(actor), ':revision': row.revision, ':now': timestamp });
    return runById(actor, row.run_id);
  }
  async function terminalize(row, result, actor) {
    await database.run(`UPDATE chipper_tower_runs SET status='finished',revision=revision+1,checkpoint_json='{}',result_json=:result
      WHERE run_id=:runId AND telegram_id=:actor AND status='settling' AND revision=:revision RETURNING revision`, {
      ':runId': row.run_id, ':actor': Number(actor), ':revision': row.revision, ':result': JSON.stringify(result) });
  }
  async function rememberStart(actor, operationId, effect, runId) {
    for (let conflict = 0; conflict < 32; conflict += 1) {
      const own = await store.read(actor); const state = checkedState(own, actor, clock());
      const previous = sharedOperation(state, operationId, effect);
      if (previous) return previous.result.runId;
      // Compact owner receipt also fences alternate start keys that resumed an
      // already active run. Retrying that key after retirement cannot start a
      // second run. The actual first key is additionally durable in run SQL.
      state.receipts[operationId] = { fingerprint: effect, result: { gameId: TOWER_GAME_ID, runId }, at: state.updatedAt };
      if (await store.compareAndSwap(actor, own.revision, state)) return runId;
    }
    throw error('CONCURRENT_UPDATE', 'Игра запускается в другом окне. Повторите действие.', { retryable: true });
  }
  async function reserveFinish(actor, params, effect) {
    for (let conflict = 0; conflict < 32; conflict += 1) {
      const own = await store.read(actor); const state = checkedState(own, actor, clock());
      if (sharedOperation(state, params.operationId, effect)) return;
      // No reward or record changes here. Reserving the shared UUID before run
      // sealing prevents a simultaneous daily/gift action from occupying it and
      // stranding settlement. The sealed run + permanent run fence still remain
      // the sole payment authority, independently recoverable after this CAS.
      state.receipts[params.operationId] = { fingerprint: effect,
        result: { runId: params.runId, pendingTowerRun: true }, at: state.updatedAt };
      if (await store.compareAndSwap(actor, own.revision, state)) return;
    }
    throw error('CONCURRENT_UPDATE', 'Игра завершается в другом окне. Повторите действие.', { retryable: true });
  }
  async function settle(row, actor) {
    for (let conflict = 0; conflict < 32; conflict += 1) {
      const own = await store.read(actor); const state = checkedState(own, actor, clock());
      const previous = Object.hasOwn(state.towerReceipts, row.run_id) ? state.towerReceipts[row.run_id] : null;
      if (previous) { await terminalize(row, previous, actor); return previous; }
      row = await runById(actor, row.run_id);
      // A concurrent payer may have committed and terminalized after our owner
      // read. Re-read the owner fence instead of mistaking that valid race for
      // an unpaid terminal row.
      if (row.status === 'finished') continue;
      if (row.status !== 'settling' || !row.last_operation_id || !row.last_fingerprint || !row.finish_reason) throw new Error('Unsealed tower settlement');
      const result = { ...recordTowerCompletion(state.player, row.verified_wave, state.updatedAt), runId: row.run_id };
      state.towerReceipts[row.run_id] = clone(result);
      // Defensive recovery for a sealed run from an interrupted older writer:
      // an unrelated shared receipt never blocks the permanent run fence, and
      // is never overwritten. New writers reserve their key before sealing.
      const reserved = Object.hasOwn(state.receipts, row.last_operation_id) ? state.receipts[row.last_operation_id] : null;
      if (!Object.hasOwn(state.giftReceipts ?? {}, row.last_operation_id)
        && (!reserved || reserved.fingerprint === row.last_fingerprint)) {
        state.receipts[row.last_operation_id] = { fingerprint: row.last_fingerprint, result: clone(result), at: state.updatedAt };
      }
      const paid = await database.run(`UPDATE chipper_players SET revision=revision+1,state_json=:state
        WHERE telegram_id=:actor AND revision=:revision AND EXISTS (
          SELECT 1 FROM chipper_tower_runs WHERE run_id=:runId AND telegram_id=:actor AND status='settling'
            AND revision=:runRevision AND verified_wave=:wave AND finish_reason=:reason
            AND last_operation_id=:operationId AND last_fingerprint=:fingerprint
        ) RETURNING revision`, { ':actor': Number(actor), ':revision': own.revision, ':state': JSON.stringify(state),
        ':runId': row.run_id, ':runRevision': row.revision, ':wave': row.verified_wave, ':reason': row.finish_reason,
        ':operationId': row.last_operation_id, ':fingerprint': row.last_fingerprint });
      if (paid.rows.length === 1) { await terminalize(row, result, actor); return result; }
    }
    throw error('CONCURRENT_UPDATE', 'Награда сохраняется в другом окне. Повторите действие.', { retryable: true });
  }

  return { async call(method, input = {}, ctx) {
    try {
      const actor = verifiedTelegramId(ctx); const params = validate(method, input); const timestamp = clock();
      const state = checkedState(await store.read(actor), actor, timestamp);
      const effect = fingerprint(method, params);
      const shared = params.operationId ? sharedOperation(state, params.operationId, effect) : null;
      await budget(method, actor, timestamp, params.operationId, effect);
      if (method === 'startTowerRun') {
        if (shared) {
          let prior = await runById(actor, shared.result.runId);
          if (prior.status === 'settling') { await settle(prior, actor); prior = await runById(actor, prior.run_id); }
          return response(ctx, { run: dto(await expire(prior, actor, clock())) });
        }
        const prior = await database.get('SELECT * FROM chipper_tower_runs WHERE telegram_id=:actor AND start_operation_id=:operationId', { ':actor': Number(actor), ':operationId': params.operationId });
        if (prior) {
          if (prior.status === 'settling') await settle(prior, actor);
          const chosen = await rememberStart(actor, params.operationId, effect, prior.run_id);
          return response(ctx, { run: dto(await expire(await runById(actor, chosen), actor, clock())) });
        }
        for (let conflict = 0; conflict < 32; conflict += 1) {
          let live = await database.get("SELECT * FROM chipper_tower_runs WHERE telegram_id=:actor AND status IN ('active','settling')", { ':actor': Number(actor) });
          if (live?.status === 'settling') { await settle(live, actor); continue; }
          if (live) {
            live = await expire(live, actor, clock());
            if (live.status === 'active') {
              const chosen = await rememberStart(actor, params.operationId, effect, live.run_id);
              return response(ctx, { run: dto(await runById(actor, chosen)) });
            }
            continue;
          }
          const runId = id(); const roll = random();
          if (typeof runId !== 'string' || !UUID.test(runId) || !Number.isFinite(roll) || roll < 0 || roll >= 1) throw new Error('Invalid tower randomness');
          const seed = Math.floor(roll * 4294967296); const created = clock(); const checkpoint = createTowerState(seed);
          const inserted = await database.run(`INSERT INTO chipper_tower_runs
            (run_id,telegram_id,revision,seed,config_version,status,verified_wave,checkpoint_json,created_at,expires_at,last_activity_at,start_operation_id)
            VALUES(:runId,:actor,0,:seed,:version,'active',0,:checkpoint,:now,:expires,:now,:operationId)
            ON CONFLICT DO NOTHING RETURNING run_id`, { ':runId': runId.toLowerCase(), ':actor': Number(actor), ':seed': seed,
            ':version': TOWER_CONFIG.configVersion, ':checkpoint': JSON.stringify(checkpoint), ':now': created,
            ':expires': created + TOWER_LIMITS.ttlMs, ':operationId': params.operationId });
          if (inserted.rows.length) {
            const chosen = await rememberStart(actor, params.operationId, effect, runId.toLowerCase());
            return response(ctx, { run: dto(await runById(actor, chosen)) });
          }
          const winner = await database.get('SELECT * FROM chipper_tower_runs WHERE telegram_id=:actor AND start_operation_id=:operationId', { ':actor': Number(actor), ':operationId': params.operationId });
          if (winner) {
            const chosen = await rememberStart(actor, params.operationId, effect, winner.run_id);
            return response(ctx, { run: dto(await runById(actor, chosen)) });
          }
        }
        throw error('CONCURRENT_UPDATE', 'Игра запускается в другом окне. Повторите действие.', { retryable: true });
      }
      if (method === 'getTowerRun') {
        let row = params.runId ? await runById(actor, params.runId) : await database.get("SELECT * FROM chipper_tower_runs WHERE telegram_id=:actor AND status IN ('active','settling')", { ':actor': Number(actor) });
        if (row?.status === 'settling') { await settle(row, actor); row = await runById(actor, row.run_id); }
        if (row) row = await expire(row, actor, clock());
        return response(ctx, { run: row ? dto(row) : null });
      }
      let row = await runById(actor, params.runId);
      if (method === 'checkpointTowerRun') {
        row = await expire(row, actor, clock());
        if (row.last_operation_id === params.operationId) {
          if (row.last_fingerprint !== effect) throw error('OPERATION_CONFLICT', 'Этот ключ уже использован для другого сохранения.');
          return response(ctx, { run: dto(row) });
        }
        if (row.status !== 'active') throw error(row.status === 'expired' ? 'RUN_EXPIRED' : 'RUN_FINISHED', 'Эта игра уже завершена.');
        if (row.revision !== params.revision) throw error('RUN_CONFLICT', 'Игра сохранена в другом окне. Загрузите последнее состояние.', { retryable: true });
        let checkpoint;
        try { checkpoint = replayTowerCheckpoint(JSON.parse(row.checkpoint_json), params.commands, params.ticks); }
        catch (fault) { throw error(fault?.code ?? 'INVALID_COMMAND', 'Действие не соответствует правилам защиты гнезда.'); }
        if (!Number.isSafeInteger(checkpoint.tick) || checkpoint.tick * TOWER_CONFIG.stepMs > clock() - row.created_at + TOWER_LIMITS.clockToleranceMs) {
          throw error('SIMULATION_TOO_FAST', 'Игра движется быстрее серверного времени. Повторите сохранение позже.', { retryable: true });
        }
        if (towerStateHash(checkpoint) !== params.expectedHash) throw error('CHECKPOINT_MISMATCH', 'Игра рассинхронизировалась. Загрузите последнее сохранение.', { retryable: true });
        const accepted = clock();
        const changed = await database.run(`UPDATE chipper_tower_runs SET revision=revision+1,verified_wave=:wave,checkpoint_json=:checkpoint,
          expires_at=:expires,last_activity_at=:now,last_operation_id=:operationId,last_fingerprint=:fingerprint
          WHERE run_id=:runId AND telegram_id=:actor AND status='active' AND revision=:revision AND expires_at>:now RETURNING revision`, {
          ':runId': row.run_id, ':actor': Number(actor), ':revision': params.revision, ':wave': checkpoint.completedWave,
          ':checkpoint': JSON.stringify(checkpoint), ':expires': accepted + TOWER_LIMITS.ttlMs, ':now': accepted,
          ':operationId': params.operationId, ':fingerprint': effect });
        if (!changed.rows.length) throw error('RUN_CONFLICT', 'Игра сохранена в другом окне. Загрузите последнее состояние.', { retryable: true });
        return response(ctx, { run: dto(await runById(actor, row.run_id)) });
      }
      if (row.status === 'finished') {
        if (row.finish_reason !== params.endReason) throw error('OPERATION_CONFLICT', 'Игра завершена с другой причиной.');
        const own = checkedState(await store.read(actor), actor, clock());
        const paid = own.towerReceipts[row.run_id];
        if (!paid) throw new Error('Missing tower reward fence');
        return response(ctx, paid);
      }
      if (row.status === 'active') {
        row = await expire(row, actor, clock());
        if (row.status === 'expired') throw error('RUN_EXPIRED', 'Срок этой игры истёк. Начните новую.');
        const checkpoint = JSON.parse(row.checkpoint_json);
        if (params.endReason === 'defeat' && checkpoint.phase !== 'defeat') throw error('INVALID_END_REASON', 'Гнездо ещё цело. Можно завершить игру добровольно.');
        await reserveFinish(actor, params, effect);
        const sealed = await database.run(`UPDATE chipper_tower_runs SET status='settling',revision=revision+1,
          finish_reason=:reason,last_operation_id=:operationId,last_fingerprint=:fingerprint
          WHERE run_id=:runId AND telegram_id=:actor AND status='active' AND revision=:revision AND expires_at>:now RETURNING revision`, {
          ':runId': row.run_id, ':actor': Number(actor), ':revision': row.revision, ':now': clock(),
          ':reason': params.endReason, ':operationId': params.operationId, ':fingerprint': effect });
        row = await runById(actor, row.run_id);
        if (!sealed.rows.length && row.status === 'active') throw error('RUN_CONFLICT', 'Игра меняется в другом окне. Повторите завершение.', { retryable: true });
      }
      if (row.status === 'expired') throw error('RUN_EXPIRED', 'Срок этой игры истёк. Начните новую.');
      if (row.finish_reason !== params.endReason) throw error('OPERATION_CONFLICT', 'Игра завершается с другой причиной.');
      return response(ctx, await settle(row, actor));
    } catch (fault) { return failure(fault); }
  } };
}
