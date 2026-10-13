import { expect, type Page } from '@playwright/test';
import { fixture, operation } from '../helpers.js';
import { BALANCE } from '../../tgcloud/lib/domain.js';
import { CHICK_PRESETS, generateGenes } from '../../tgcloud/lib/chickGenes.js';
import type { ApiResult, Method } from '../../src/types';

export const storageKey = 'chipper-explicit-development-v2';
export async function seed(page: Page, options: { twoBirds?: boolean; readyEgg?: boolean; manyBirds?: number } = {}) {
  const f = fixture(); await f.initial();
  if (options.twoBirds || options.readyEgg) {
    await f.seedFeathers(6); const buy = await f.call('buyEgg', operation()); f.advance(BALANCE.incubationMs);
    if (options.twoBirds) { f.roll(.99); await f.call('hatchEgg', operation({ eggId: buy.result.eggId })); }
  }
  const row = await f.store.read('101');
  if (options.manyBirds) {
    const original = row.state.chicks[0];
    row.state.chicks = Array.from({ length: options.manyBirds }, (_, index) => {
      const preset = CHICK_PRESETS[index % CHICK_PRESETS.length];
      let counter = index;
      const draw = () => ((counter++ * 0.61803398875) % 1);
      return { ...structuredClone(original), id: index === 0 ? original.id : `synthetic-gallery-${index}`, name: `Цып №${index + 1}`, appearanceId: preset.id, rarity: preset.rarity, genes: generateGenes(preset, draw), bornAt: original.bornAt - index * 1000 };
    });
  }
  const delta = Date.now() - f.now;
  const rewrite = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(rewrite);
    if (typeof value === 'number' && value > 1_000_000_000_000) return value + delta;
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewrite(item)]));
    return value;
  };
  await page.addInitScript(({ key, value }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value); }, { key: storageKey, value: JSON.stringify(rewrite(row)) });
  return row;
}
export async function finishOnboarding(page: Page) {
  await page.getByRole('button', { name: 'Начать', exact: true }).click();
  const egg = page.getByRole('button', { name: 'Коснитесь яйца', exact: true });
  for (let i = 0; i < 3; i++) await egg.click();
  await expect(page.getByRole('heading', { name: 'Привет, маленький!' })).toBeVisible();
  await page.getByLabel('Имя цыплёнка', { exact: true }).fill('Пип');
  await page.getByRole('button', { name: 'Сохранить имя', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Пип', exact: true })).toBeVisible();
}
export async function enterFlaps(page: Page) {
  await page.getByRole('button', { name: 'Активности', exact: true }).click();
  await page.getByRole('button', { name: 'Играть', exact: true }).click();
  await expect(page.locator('.flaps-game')).toHaveAttribute('data-phase', 'ready');
  await expect(page.locator('.bottom-dock')).toHaveCount(0);
  return page.getByRole('application', { name: 'Игровое поле Chippster Flaps' });
}
export async function fallToResult(page: Page) {
  const surface = page.getByRole('application', { name: 'Игровое поле Chippster Flaps' });
  await surface.click();
  await expect(page.locator('.flaps-game')).toHaveAttribute('data-phase', 'playing');
  await expect(page.locator('.flaps-result')).toBeVisible({ timeout: 15000 });
}

declare global {
  interface Window {
    endpointBridge(method: Method, input: Record<string, unknown>, identity: string): Promise<ApiResult>;
    telegramCalls: string[];
    telegramEvents: Record<string, () => void>;
    telegramBack?: () => void;
  }
}
export async function bridge(page: Page, call: (method: Method, input: Record<string, unknown>, identity: string) => Promise<ApiResult>, options: { oldSdk?: boolean } = {}) {
  await page.route('https://telegram.org/js/telegram-web-app.js', route => route.fulfill({ contentType: 'application/javascript', body: '/* synthetic Telegram bridge, not signed live acceptance */' }));
  await page.exposeFunction('endpointBridge', call);
  await page.addInitScript(({ oldSdk }) => {
    window.telegramCalls = []; window.telegramEvents = {};
    const eventListeners = new Map<string, Set<() => void>>();
    window.Telegram = { WebApp: {
      initData: 'synthetic-test-A', colorScheme: 'dark', viewportStableHeight: innerHeight, viewportHeight: innerHeight, isActive: true,
      ready() {}, expand() {},
      onEvent(event, callback) {
        if (!eventListeners.has(event)) eventListeners.set(event, new Set());
        eventListeners.get(event)!.add(callback);
        window.telegramEvents[event] = () => { for (const listener of eventListeners.get(event) ?? []) listener(); };
      },
      offEvent(event, callback) { eventListeners.get(event)?.delete(callback); },
      ...(!oldSdk ? { disableVerticalSwipes() { window.telegramCalls.push('disable'); }, enableVerticalSwipes() { window.telegramCalls.push('enable'); } } : {}),
      BackButton: { show() {}, hide() {}, onClick(callback) { window.telegramBack = callback; }, offClick() { window.telegramBack = undefined; } },
      HapticFeedback: {
        impactOccurred() { window.telegramCalls.push('haptic'); },
        notificationOccurred() { window.telegramCalls.push('haptic'); },
        selectionChanged() { window.telegramCalls.push('haptic'); },
      },
      Serverless: { call(method, input, callback) { void window.endpointBridge(method as Method, input, window.Telegram!.WebApp!.initData).then(result => callback(null, result)); } },
    } };
  }, { oldSdk: options.oldSdk === true });
  await page.goto('http://127.0.0.1:4173/');
}
