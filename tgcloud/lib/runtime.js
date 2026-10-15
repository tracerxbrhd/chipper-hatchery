import { db } from 'sdk';
import { createSqliteStore } from './store.js';
import { createGameService } from './service.js';
import { createSocialService } from './social.js';
import { createGiftService } from './gifts.js';
import { createGuestService } from './guestService.js';
import { createTowerService } from './towerService.js';
import { createExchangeService } from './exchanges.js';

const store = createSqliteStore(db);
const service = createGameService({ store });
const socialService = createSocialService({ database: db, gameService: service });
const towerService = createTowerService({ database: db, store, gameService: service });
const guestService = createGuestService({ database: db, gameService: service });
const giftService = createGiftService({ database: db, store, gameService: service });
const exchangeService = createExchangeService({ database: db, store, gameService: service });

export function callGame(method, input, ctx) {
  return service.call(method, input, ctx);
}
export function callSocial(method, input, ctx) { return socialService.call(method, input, ctx); }
export function callGift(method, input, ctx) { return giftService.call(method, input, ctx); }
export function callExchange(method, input, ctx) { return exchangeService.call(method, input, ctx); }

export function callGuest(method, input, ctx) { return guestService.call(method, input, ctx); }

export function callTower(method, input, ctx) { return towerService.call(method, input, ctx); }
