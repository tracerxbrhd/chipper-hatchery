import { randomUUID } from 'node:crypto';
import { fixture, ctx, operation } from './helpers.js';
import { createGiftService } from '../tgcloud/lib/gifts.js';
import { clone } from '../tgcloud/lib/domain.js';

export async function giftFixture() {
  const f = fixture();
  for (const actor of [101, 202, 303]) await f.initial(actor);
  const profileId = (actor) => String(actor).padStart(64, '0');
  for (const actor of [101, 202, 303]) {
    f.sqlite.prepare('INSERT INTO chipper_social_profiles(telegram_id, public_id, display_name, updated_at) VALUES(?,?,?,?)')
      .run(actor, profileId(actor), `Гнездо ${actor}`, f.now);
  }
  const friend = (a, b) => {
    const [low, high] = [a, b].sort((x, y) => x - y);
    f.sqlite.prepare(`INSERT INTO chipper_friendships
      (pair_key,friendship_id,low_id,high_id,requested_by,status,created_at,updated_at)
      VALUES(?,?,?,?,?,'accepted',?,?) ON CONFLICT(pair_key) DO UPDATE SET status='accepted',low_blocked=0,high_blocked=0`)
      .run(`${low}:${high}`, `${low}${high}`.padStart(64, '0'), low, high, low, f.now, f.now);
  };
  friend(101, 202); friend(101, 303);
  const row = await f.store.read('101');
  const extra = clone(row.state.chicks[0]);
  extra.id = randomUUID(); extra.name = 'Подарок';
  extra.hunger = 74; extra.mood = 84; extra.energy = 91;
  extra.lastFeedAt = f.now - 1000; extra.pendingFeedAt = f.now - 1000;
  extra.careMilestones = [f.now - 500];
  row.state.chicks.push(extra);
  await f.store.compareAndSwap('101', row.revision, row.state);

  const original = { ...f.database };
  const log = [];
  let sequence = 0;
  let failAt = null;
  let loseGiftCommit = false;
  let intercept = null;
  for (const type of ['get', 'all', 'run']) {
    f.database[type] = async (query, params) => {
      sequence += 1;
      const entry = { type, query }; log.push(entry);
      if (sequence === failAt) { failAt = null; throw new Error('Injected failure before database call'); }
      if (intercept && (await intercept({ type, query, params }))) intercept = null;
      const result = await original[type](query, params);
      if (type === 'run') entry.affected = result.rowsAffected;
      if (loseGiftCommit && type === 'run' && /UPDATE chipper_players/.test(query) && result.rowsAffected > 0) {
        loseGiftCommit = false; throw new Error('Lost response after gift commit');
      }
      return result;
    };
  }
  const serviceOptions = { database: f.database, store: f.store, gameService: f.service,
    now: () => f.now, id: randomUUID };
  let gifts = createGiftService(serviceOptions);
  return {
    ...f, profileId, extra, log, friend,
    get now() { return f.now; },
    restart() { gifts = createGiftService(serviceOptions); },
    clearLog() { log.length = 0; sequence = 0; },
    failBefore(index) { sequence = 0; failAt = index; },
    loseNextResponse() { loseGiftCommit = true; },
    interceptOnce(callback) { intercept = callback; },
    async gift(method, params = {}, actor = 101) { return gifts.call(method, params, ctx(actor)); },
    async offer(recipient = 202, chickId = extra.id) {
      const request = operation({ chickId, recipientProfileId: profileId(recipient) });
      const result = await gifts.call('offerGift', request, ctx(101));
      if (!result.ok) throw new Error(JSON.stringify(result));
      return { request, result, giftId: result.result.gift.giftId };
    },
    owners(chickId = extra.id) {
      return f.sqlite.prepare('SELECT telegram_id,state_json FROM chipper_players ORDER BY telegram_id').all()
        .filter((player) => JSON.parse(player.state_json).chicks.some((chick) => chick.id === chickId))
        .map((player) => player.telegram_id);
    },
    totalFeathers() {
      return f.sqlite.prepare('SELECT state_json FROM chipper_players').all()
        .reduce((sum, player) => sum + JSON.parse(player.state_json).player.feathers, 0);
    },
    pair(a = 101, b = 202) {
      const [low, high] = [a, b].sort((x, y) => x - y);
      return `${low}:${high}`;
    },
  };
}
