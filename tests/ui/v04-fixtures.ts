import type { Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fixture, operation } from '../helpers.js';
import { createSocialService } from '../../tgcloud/lib/social.js';
import { createGiftService } from '../../tgcloud/lib/gifts.js';
import { createGuestService } from '../../tgcloud/lib/guestService.js';
import { createTowerService } from '../../tgcloud/lib/towerService.js';
import { nativeBridge } from './v03-fixtures';
import type { ApiResult, Method } from '../../src/types';

export const viewports04 = [{ width: 320, height: 568 }, { width: 360, height: 640 }, { width: 390, height: 844 }, { width: 430, height: 932 }];
export function qa04Path(name: string) {
  const directory = process.env.CHIPPER_CAPTURE_QA === '1' ? 'DOCS/qa/0.4' : 'test-results/qa/0.4';
  mkdirSync(directory, { recursive: true }); return join(directory, name);
}
export function success(response: ApiResult) {
  if (!response.ok) throw new Error(`Synthetic v0.4 fixture failed: ${response.error.code}`);
  return response;
}

/** Real production services on real local SQLite; only the Telegram signature
 * transport is synthetic. This cannot count as owner/live A/B/C acceptance. */
export function communityFixture() {
  const f = fixture();
  const social = createSocialService({ database: f.database, gameService: f.service, now: () => f.now, id: randomUUID });
  const gifts = createGiftService({ database: f.database, store: f.store, gameService: f.service, now: () => f.now, id: randomUUID });
  const guest = createGuestService({ database: f.database, gameService: f.service, now: () => f.now });
  const tower = createTowerService({ database: f.database, store: f.store, gameService: f.service, now: () => f.now, id: randomUUID, random: () => .1234567 });
  const users = new Map<number, Record<string, unknown>>([
    [101, { first_name: 'Алексей', last_name: 'Тестовый', username: 'chipper_test_A', photo_url: 'https://t.me/i/userpic/320/chipper-test-A.svg' }],
    [202, { first_name: 'Белла', last_name: 'Тестовая' }],
    [303, { first_name: 'Саша' }],
  ]);
  const socialMethods = new Set(['getSocial', 'updatePrivacy', 'createSocialLink', 'resolveSocialLink', 'getPublicProfile', 'visitProfile', 'sendFriendRequest', 'respondFriendRequest', 'removeFriend', 'blockUser']);
  const giftMethods = new Set(['listGifts', 'offerGift', 'respondGift', 'cancelGift']);
  const towerMethods = new Set(['startTowerRun', 'getTowerRun', 'checkpointTowerRun', 'finishTowerRun']);
  let wall = Date.now();
  async function dispatch(method: Method, input: Record<string, unknown> = {}, owner = 101): Promise<ApiResult> {
    const current = Date.now(); f.advance(Math.max(0, current - wall)); wall = current;
    const context = { initData: { user: { id: owner, ...users.get(owner) } } };
    const service = method === 'getGuestChick' ? guest : towerMethods.has(method) ? tower : giftMethods.has(method) ? gifts : socialMethods.has(method) ? social : f.service;
    return await service.call(method, input, context) as ApiResult;
  }
  return {
    ...f, users, social, gifts, guest, tower, dispatch,
    get now() { return f.now; },
    async friends(a = 101, b = 202) {
      if (!(await f.store.read(String(a)))) await f.initial(a);
      if (!(await f.store.read(String(b)))) await f.initial(b);
      const invitation = success(await dispatch('createSocialLink', operation({ kind: 'invite' }), b)).result! as { social: { profile: { profileId: string } }; link: { token: string } };
      success(await dispatch('sendFriendRequest', operation({ profileId: invitation.social.profile.profileId, inviteToken: invitation.link.token }), a));
      const incoming = success(await dispatch('getSocial', {}, b)).result! as { social: { incoming: { requestId: string }[] } };
      success(await dispatch('respondFriendRequest', operation({ requestId: incoming.social.incoming[0].requestId, accept: true }), b));
      success(await dispatch('updatePrivacy', operation({ visibility: 'friends', collectionVisibility: 'private', displayName: b === 202 ? 'Гнездо Б' : 'Гнездо В' }), b));
      return invitation.social.profile.profileId;
    },
  };
}

export async function bridge04(page: Page, f: ReturnType<typeof communityFixture>, options: { theme?: 'light' | 'dark'; native?: boolean; identity?: 'A' | 'B' | 'C'; brokenPhoto?: boolean } = {}) {
  await page.route('https://t.me/i/userpic/320/chipper-test-A.svg', route => options.brokenPhoto
    ? route.abort()
    : route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72"><rect width="72" height="72" rx="22" fill="#759180"/><text x="36" y="45" fill="white" text-anchor="middle" font-size="28" font-family="sans-serif">АТ</text></svg>' }));
  await nativeBridge(page, (method, input, identity) => f.dispatch(method, input, identity.endsWith('B') ? 202 : identity.endsWith('C') ? 303 : 101), options);
}
