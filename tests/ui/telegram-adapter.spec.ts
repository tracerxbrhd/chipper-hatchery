import { test, expect, type Page } from '@playwright/test';
import { fixture, operation } from '../helpers.js';
import type { ApiResult, Method } from '../../src/types';

declare global { interface Window { endpointBridge(method: Method, input: Record<string, unknown>, identity: string): Promise<ApiResult> } }
async function bridge(page: Page, call: (method: Method, input: Record<string, unknown>, identity: string) => Promise<ApiResult>) {
  // This is explicitly a local synthetic callback bridge. Prevent the genuine
  // browser SDK from replacing the fixture with its outside-Telegram context.
  await page.route('https://telegram.org/js/telegram-web-app.js', route => route.fulfill({ contentType: 'application/javascript', body: '/* local synthetic Telegram bridge test */' }));
  await page.exposeFunction('endpointBridge', call);
  await page.addInitScript(() => {
    window.Telegram = { WebApp: {
      initData: 'synthetic-test-A', colorScheme: 'dark',
      ready() {}, expand() {}, onEvent() {}, offEvent() {},
      BackButton: { show() {}, hide() {}, onClick() {}, offClick() {} },
      Serverless: { call(method, input, callback) { void window.endpointBridge(method as Method, input, window.Telegram!.WebApp!.initData).then(result => callback(null, result)); } },
    } };
  });
  await page.goto('http://127.0.0.1:4173/');
}

test('production adapter switches identities and drops a delayed old-account response', async ({ page }) => {
  const f = fixture(); const a = await f.initial(); const b = await f.initial(202);
  await f.call('renameChick', operation({ chickId: a, name: 'Аккаунт А' }));
  await f.call('renameChick', operation({ chickId: b, name: 'Аккаунт Б' }), 202);
  await bridge(page, async (method, input, identity) => {
    const response = await f.call(method, input, identity.endsWith('B') ? 202 : 101);
    if (method === 'careAction') await new Promise(resolve => setTimeout(resolve, 1200));
    return response as ApiResult;
  });
  await expect(page.getByRole('heading', { name: 'Аккаунт А', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Покормить/ }).click();
  await page.evaluate(() => { window.Telegram!.WebApp!.initData = 'synthetic-test-B'; window.dispatchEvent(new Event('focus')); });
  await expect(page.getByRole('heading', { name: 'Аккаунт Б', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Аккаунт А', exact: true })).toHaveCount(0);
  await page.waitForTimeout(1400);
  await expect(page.getByRole('heading', { name: 'Аккаунт Б', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key !== 'chipper:preferences'))).toEqual([]);
});

test('an expired game attempt recovers to activities instead of an endless saving state', async ({ page }) => {
  const f = fixture(); await f.initial(); await page.clock.install();
  await bridge(page, async (method, input) => await f.call(method, input) as ApiResult);
  await page.getByRole('button', { name: 'Активности', exact: true }).click(); await page.getByRole('button', { name: 'Играть', exact: true }).click();
  await expect(page.getByRole('timer')).toBeVisible(); f.advance(600001); await page.clock.fastForward(26000);
  await expect(page.getByRole('alert')).toContainText('Время раунда истекло');
  await page.getByRole('button', { name: 'Обновить состояние', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Немного веселья', exact: true })).toBeVisible();
  await expect(page.locator('.game-saving')).toHaveCount(0); await expect(page.getByRole('alert')).toHaveCount(0);
});

test('focus during a round never occupies the finish operation with a background read', async ({ page }) => {
  const f = fixture(); await f.initial(); await page.clock.install(); const calls: string[] = [];
  await bridge(page, async (method, input) => { calls.push(method); return await f.call(method, input) as ApiResult; });
  await page.getByRole('button', { name: 'Активности', exact: true }).click(); await page.getByRole('button', { name: 'Играть', exact: true }).click();
  await expect(page.getByRole('timer')).toBeVisible(); calls.length = 0;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  f.advance(26000); await page.clock.fastForward(26000);
  await expect(page.getByRole('heading', { name: 'Отличная прогулка!' })).toBeVisible();
  expect(calls).toContain('finishMiniGame'); expect(calls).not.toContain('getHome');
});
