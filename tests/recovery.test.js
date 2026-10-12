import { expect, it } from 'vitest';
import { BALANCE } from '../tgcloud/lib/domain.js';
import { createGameService } from '../tgcloud/lib/service.js';
import { fixture, operation, ctx } from './helpers';

it('durable purchase receipt remains valid after hatch releases the slot', async () => {
  const f = fixture(); await f.initial(); await f.seedFeathers(12); const request = operation(); const buy = await f.call('buyEgg', request);
  f.advance(BALANCE.incubationMs); await f.call('hatchEgg', operation({ eggId: buy.result.eggId }));
  const replay = await f.call('buyEgg', request); expect(replay.ok).toBe(true); expect(replay.state.egg).toBe(null); expect(replay.state.player.feathers).toBe(6); expect(replay.state.chicks).toHaveLength(2);
});
it('old finish replay after 20 hours never awards another feather', async () => {
  const f = fixture(); await f.initial(); const start = await f.call('startMiniGame', operation()); f.advance(25000);
  const finish = operation({ attemptId: start.result.attemptId, score: 10 }); await f.call('finishMiniGame', finish); f.advance(21 * BALANCE.hourMs);
  const replay = await f.call('finishMiniGame', finish); expect(replay.state.player.feathers).toBe(1);
  const freshKey = await f.call('finishMiniGame', operation({ attemptId: start.result.attemptId, score: 10 })); expect(freshKey.state.player.feathers).toBe(1);
  expect((await f.call('finishMiniGame', operation({ attemptId: start.result.attemptId, score: 11 }))).error.code).toBe('ATTEMPT_ALREADY_FINISHED');
});
it('a recreated service restores the same state from SQLite', async () => {
  const f = fixture(); const chickId = await f.initial(); await f.call('renameChick', operation({ chickId, name: 'Север' }));
  const reopened = createGameService({ store: f.store, now: () => f.now }); const r = await reopened.call('bootstrap', {}, ctx());
  expect(r.state.chicks[0]).toMatchObject({ id: chickId, name: 'Север' }); expect(r.state.player.onboarding).toBe('done');
});
it('backward server clock never duplicates decay or rewards', async () => {
  const f = fixture(); await f.initial(); f.advance(BALANCE.hourMs); const before = await f.call('getHome');
  f.advance(-2 * BALANCE.hourMs); const after = await f.call('getHome'); expect(after.state.serverNow).toBe(before.state.serverNow); expect(after.state.chicks).toEqual(before.state.chicks);
});
it('an abandoned attempt cannot be revived by replaying its start receipt', async () => {
  const f = fixture(); await f.initial(); const op = operation(); const first = await f.call('startMiniGame', op); await f.call('startMiniGame', operation());
  const replay = await f.call('startMiniGame', op); expect(replay.result.attemptId).toBe(first.result.attemptId); f.advance(25000);
  expect((await f.call('finishMiniGame', operation({ attemptId: first.result.attemptId, score: 2 }))).error.code).toBe('ATTEMPT_CANCELLED');
});
it('care window includes exactly 30 minutes and reward includes exactly 20 hours', async () => {
  const f = fixture(); const chickId = await f.initial(); await f.call('careAction', operation({ chickId, action: 'feed' })); f.advance(BALANCE.careCycleWindowMs);
  const first = await f.call('careAction', operation({ chickId, action: 'play' })); expect(first.result.rewarded).toBe(true);
  f.advance(BALANCE.rewardCooldownMs); await f.call('careAction', operation({ chickId, action: 'feed' }));
  const second = await f.call('careAction', operation({ chickId, action: 'play' })); expect(second.result.rewarded).toBe(true); expect(second.state.chicks[0].careMilestones).toHaveLength(2);
});
it.each([-1, 501, 1.5, '1', null])('rejects invalid mini-game score %s', async score => {
  const f = fixture(); await f.initial(); const s = await f.call('startMiniGame', operation()); f.advance(25000);
  expect((await f.call('finishMiniGame', operation({ attemptId: s.result.attemptId, score }))).error.code).toBe('INVALID_SCORE');
});
it('rate limits abandoned attempts without cancelling the last allowed round', async () => {
  const f = fixture(); await f.initial(); let last;
  for (let i = 0; i < 6; i++) last = await f.call('startMiniGame', operation());
  const refusal = await f.call('startMiniGame', operation()); expect(refusal.error.code).toBe('RATE_LIMITED');
  f.advance(25000); expect((await f.call('finishMiniGame', operation({ attemptId: last.result.attemptId, score: 1 }))).ok).toBe(true);
  f.advance(35000); expect((await f.call('startMiniGame', operation())).ok).toBe(true);
});
