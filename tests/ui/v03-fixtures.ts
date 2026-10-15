import { expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fixture } from '../helpers.js';
import { BALANCE } from '../../tgcloud/lib/domain.js';
import type { ApiResult, Method, Stage } from '../../src/types';

export function qa03Path(name: string) {
  const directory = process.env.CHIPPER_CAPTURE_QA === '1' ? 'DOCS/qa/0.3' : 'test-results/qa/0.3';
  mkdirSync(directory, { recursive: true });
  return join(directory, name);
}

export async function seedStage(page: Page, stage: Stage) {
  const f = fixture(); await f.initial();
  const row = await f.store.read('101');
  const bird = row.state.chicks[0];
  if (stage !== 'baby') {
    bird.bornAt = f.now - (stage === 'adult' ? BALANCE.adultAgeMs : BALANCE.teenAgeMs) - 1;
    bird.careMilestones = stage === 'adult' ? [f.now - 3, f.now - 2, f.now - 1] : [f.now - 1];
  }
  const delta = Date.now() - f.now;
  const rewrite = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(rewrite);
    if (typeof value === 'number' && value > 1_000_000_000_000) return value + delta;
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewrite(item)]));
    return value;
  };
  const seeded = rewrite(row);
  await page.addInitScript(value => localStorage.setItem('chipper-explicit-development-v2', value), JSON.stringify(seeded));
  return seeded as typeof row;
}

export async function socialFixture() {
  const f = fixture();
  const { createSocialService } = await import('../../tgcloud/lib/social.js');
  const { createGiftService } = await import('../../tgcloud/lib/gifts.js');
  const { createExchangeService } = await import('../../tgcloud/lib/exchanges.js');
  const social = createSocialService({ database: f.database, gameService: f.service, now: () => f.now, id: randomUUID });
  const gifts = createGiftService({ database: f.database, store: f.store, gameService: f.service, now: () => f.now, id: randomUUID });
  const exchanges = createExchangeService({ database: f.database, store: f.store, gameService: f.service, now: () => f.now, id: randomUUID });
  const socialMethods = new Set(['getSocial', 'updatePrivacy', 'createSocialLink', 'resolveSocialLink', 'getPublicProfile', 'visitProfile', 'sendFriendRequest', 'respondFriendRequest', 'removeFriend', 'blockUser']);
  const giftMethods = new Set(['listGifts', 'offerGift', 'respondGift', 'cancelGift']);
  const exchangeMethods = new Set(['listExchanges', 'offerExchange', 'respondExchange', 'cancelExchange']);
  return {
    ...f,
    async dispatch(method: Method, input: Record<string, unknown>, owner = 101): Promise<ApiResult> {
      const context = { initData: { user: { id: owner, first_name: owner === 101 ? 'Синтетический А' : owner === 202 ? 'Синтетический Б' : 'Синтетический В' } } };
      return await (giftMethods.has(method) ? gifts : exchangeMethods.has(method) ? exchanges : socialMethods.has(method) ? social : f.service).call(method, input, context) as ApiResult;
    },
  };
}

/** Synthetic official-adapter host; this never counts as signed live acceptance. */
export async function nativeBridge(page: Page, call: (method: Method, input: Record<string, unknown>, identity: string) => Promise<ApiResult>, options: { theme?: 'light' | 'dark'; native?: boolean; startParam?: string; identity?: 'A' | 'B' | 'C' } = {}) {
  await page.route('https://telegram.org/js/telegram-web-app.js', route => route.fulfill({ contentType: 'application/javascript', body: '/* synthetic v0.3 host, not signed Telegram */' }));
  await page.exposeFunction('endpointBridge', call);
  await page.addInitScript(({ theme, native, startParam, identity }) => {
    window.telegramCalls = []; window.telegramEvents = {};
    const listeners = new Map<string, Set<() => void>>();
    window.Telegram = { WebApp: {
      initData: `synthetic-test-${identity}`, initDataUnsafe: { ...(startParam ? { start_param: startParam } : {}) },
      colorScheme: theme, platform: 'android', version: '9.1', isActive: true,
      viewportStableHeight: innerHeight, viewportHeight: innerHeight,
      ...(native ? { isFullscreen: true, safeAreaInset: { top: 24, bottom: 16, left: 0, right: 0 }, contentSafeAreaInset: { top: 72, bottom: 16, left: 0, right: 0 } } : {}),
      ready() {}, expand() {}, isVersionAtLeast() { return true; },
      onEvent(event, callback) { const group = listeners.get(event) ?? new Set(); group.add(callback); listeners.set(event, group); window.telegramEvents[event] = () => { for (const listener of listeners.get(event) ?? []) listener(); }; },
      offEvent(event, callback) { listeners.get(event)?.delete(callback); },
      disableVerticalSwipes() { window.telegramCalls.push('disable'); }, enableVerticalSwipes() { window.telegramCalls.push('enable'); },
      BackButton: { show() {}, hide() {}, onClick(callback) { window.telegramBack = callback; }, offClick() { window.telegramBack = undefined; } },
      HapticFeedback: { impactOccurred() { window.telegramCalls.push('haptic'); }, notificationOccurred() { window.telegramCalls.push('haptic'); } },
      Serverless: { call(method, input, callback) { void window.endpointBridge(method as Method, input, window.Telegram!.WebApp!.initData).then(result => callback(null, result)); } },
    } };
  }, { theme: options.theme ?? 'dark', native: options.native === true, startParam: options.startParam, identity: options.identity ?? 'A' });
  await page.goto('http://127.0.0.1:4173/');
  await expect(page.locator('.home-screen,.onboarding,.visit-screen')).toBeVisible();
  if (options.native) await nativeOverlay(page);
}

export async function nativeOverlay(page: Page) {
  await page.evaluate(() => {
    const container = document.createElement('div');
    container.id = 'synthetic-native-chrome'; container.setAttribute('aria-hidden', 'true');
    for (const [side, label] of [['left', '× Close'], ['right', '⌄   ⋮']]) {
      const node = document.createElement('div');
      node.dataset.nativeFixture = side; node.textContent = label;
      Object.assign(node.style, { position: 'fixed', top: '28px', [side]: '8px', width: '88px', height: '36px', borderRadius: '20px', background: '#1118', color: '#fff', display: 'grid', placeItems: 'center', zIndex: '99999', font: '600 14px sans-serif', pointerEvents: 'none' });
      container.appendChild(node);
    }
    document.body.appendChild(container);
  });
}

export async function expectNoNativeOverlap(page: Page, selectors: string[]) {
  const overlap = await page.evaluate(selectors => {
    const controls = Array.from(document.querySelectorAll('[data-native-fixture]')).map(node => node.getBoundingClientRect());
    return selectors.flatMap(selector => Array.from(document.querySelectorAll(selector)).flatMap(node => {
      const style = getComputedStyle(node); const box = node.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden' || box.width === 0) return [];
      return controls.some(control => box.left < control.right && box.right > control.left && box.top < control.bottom && box.bottom > control.top) ? [selector] : [];
    }));
  }, selectors);
  expect(overlap, 'App content must remain outside native Close/menu target rectangles').toEqual([]);
}
