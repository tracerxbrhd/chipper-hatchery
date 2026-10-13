import { db } from 'sdk';
import { createSqliteStore } from './store.js';
import { createGameService } from './service.js';
import { createSocialService } from './social.js';
import { createGiftService } from './gifts.js';

const store = createSqliteStore(db);
const service = createGameService({ store });
const socialService = createSocialService({ database: db, gameService: service });
const giftService = createGiftService({ database: db, store, gameService: service });

export function callGame(method, input, ctx) {
  return service.call(method, input, ctx);
}
export function callSocial(method, input, ctx) { return socialService.call(method, input, ctx); }
export function callGift(method, input, ctx) { return giftService.call(method, input, ctx); }
