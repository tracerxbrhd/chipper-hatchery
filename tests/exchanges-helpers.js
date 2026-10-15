import { randomUUID } from 'node:crypto';
import { giftFixture } from './gifts-helpers.js';
import { clone } from '../tgcloud/lib/domain.js';
import { createExchangeService } from '../tgcloud/lib/exchanges.js';
import { operation, ctx } from './helpers.js';

export async function exchangeFixture() {
  const f = await giftFixture();
  const row = await f.store.read('202'), requested = clone(row.state.chicks[0]);
  requested.id = randomUUID(); requested.name = 'Встречный'; requested.mood = 79;
  row.state.chicks.push(requested); await f.store.compareAndSwap('202', row.revision, row.state);
  f.sqlite.prepare("UPDATE chipper_social_profiles SET visibility='friends',collection_visibility='friends'").run();
  const options = { database: f.database, store: f.store, gameService: f.service, now: () => f.now, id: randomUUID };
  let exchanges = createExchangeService(options);
  return { ...f, requested, get now() { return f.now; },
    restartExchange() { exchanges = createExchangeService(options); },
    exchange(method, params = {}, actor = 101) { return exchanges.call(method, params, ctx(actor)); },
    async offerExchange() {
      const request = operation({ chickId: f.extra.id, recipientProfileId: f.profileId(202), requestedChickId: requested.id });
      const response = await exchanges.call('offerExchange', request, ctx(101));
      if (!response.ok) throw new Error(JSON.stringify(response));
      return { request, exchange: response.result.exchange, exchangeId: response.result.exchange.exchangeId };
    },
  };
}
