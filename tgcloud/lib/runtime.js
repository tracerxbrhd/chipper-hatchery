import { db } from 'sdk';
import { createSqliteStore } from './store.js';
import { createGameService } from './service.js';

const service = createGameService({ store: createSqliteStore(db) });

export function callGame(method, input, ctx) {
  return service.call(method, input, ctx);
}
