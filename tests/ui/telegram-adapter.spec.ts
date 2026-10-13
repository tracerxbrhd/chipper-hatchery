import { test, expect } from '@playwright/test';
import { fixture, operation } from '../helpers.js';
import type { ApiResult } from '../../src/types';
import { bridge, enterFlaps, fallToResult, qaPath } from './fixtures';

test('synthetic production adapter switches identities and discards delayed old-account care', async ({ page }) => {
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
  await page.waitForTimeout(1400); await expect(page.getByRole('heading', { name: 'Аккаунт Б', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key !== 'chipper:preferences'))).toEqual([]);
});

test('synthetic Flaps TTL error recovers to activities without an endless saving state', async ({ page }) => {
  const f = fixture(); await f.initial();
  await bridge(page, async (method, input) => {
    const result = await f.call(method, input);
    if (method === 'startFlapsRun') f.advance(600001);
    return result as ApiResult;
  });
  await enterFlaps(page); await page.getByRole('application').click();
  await expect(page.getByRole('alert')).toContainText('Время раунда истекло');
  await page.getByRole('button', { name: 'Обновить состояние', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Расправим крылья', exact: true })).toBeVisible();
  await expect(page.locator('.flaps-game')).toHaveCount(0); await expect(page.getByRole('alert')).toHaveCount(0);
});

test('focus during flight does not occupy finish with a background read; one server reward', async ({ page }) => {
  const f = fixture(); await f.initial(); const calls: string[] = [];
  await bridge(page, async (method, input) => {
    calls.push(method); const result = await f.call(method, input);
    if (method === 'startFlapsRun') f.advance(3000);
    return result as ApiResult;
  });
  await enterFlaps(page); calls.length = 0;
  await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await fallToResult(page);
  await expect(page.getByText('+1 пёрышко в копилку', { exact: true })).toBeVisible();
  expect(calls).toContain('finishFlapsRun'); expect(calls).not.toContain('getHome');
  expect((await f.call('getHome')).state.player.feathers).toBe(1);
  await page.getByRole('button', { name: 'Ещё раз', exact: true }).click();
  await expect(page.locator('.flaps-game')).toHaveAttribute('data-phase', 'ready'); await fallToResult(page);
  await expect(page.getByText('Следующее пёрышко через', { exact: false })).toBeVisible();
  expect((await f.call('getHome')).state.player.feathers).toBe(1);
  await page.screenshot({ path: qaPath('flaps-cooldown-result-dark.png') });
});

test('lost finish response retries the same operation and does not duplicate its reward', async ({ page }) => {
  const f = fixture(); await f.initial(); const operationIds: unknown[] = []; let loseFirstFinish = true;
  await bridge(page, async (method, input) => {
    const result = await f.call(method, input);
    if (method === 'startFlapsRun') f.advance(3000);
    if (method === 'finishFlapsRun') {
      operationIds.push(input.operationId);
      if (loseFirstFinish) { loseFirstFinish = false; return { ok: false, error: { code: 'NETWORK', message: 'Синтетически потерян ответ после commit.', retryable: true } }; }
    }
    return result as ApiResult;
  });
  await enterFlaps(page); await page.getByRole('application').click();
  await expect(page.getByRole('alert')).toBeVisible(); await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect(page.locator('.flaps-result')).toBeVisible(); await expect(page.getByText('+1 пёрышко в копилку', { exact: true })).toBeVisible();
  expect(operationIds).toHaveLength(2); expect(operationIds[0]).toEqual(operationIds[1]);
  const state = (await f.call('getHome')).state; expect(state.player.feathers).toBe(1); expect(state.player.flaps.completedRuns).toBe(1);
});

test('account switch during pending finish removes old game, record and reply', async ({ page }) => {
  const f = fixture(); const a = await f.initial(); const b = await f.initial(202);
  await f.call('renameChick', operation({ chickId: a, name: 'Пилот А' })); await f.call('renameChick', operation({ chickId: b, name: 'Пилот Б' }), 202);
  let finishStarted = false;
  await bridge(page, async (method, input, identity) => {
    const result = await f.call(method, input, identity.endsWith('B') ? 202 : 101);
    if (method === 'startFlapsRun') f.advance(3000);
    if (method === 'finishFlapsRun') { finishStarted = true; await new Promise(resolve => setTimeout(resolve, 1200)); }
    return result as ApiResult;
  });
  await enterFlaps(page); await page.getByRole('application').click(); await expect.poll(() => finishStarted).toBe(true);
  await page.evaluate(() => { window.Telegram!.WebApp!.initData = 'synthetic-test-B'; window.dispatchEvent(new Event('focus')); });
  await expect(page.getByRole('heading', { name: 'Пилот Б', exact: true })).toBeVisible();
  await page.waitForTimeout(1400); await expect(page.locator('.flaps-game,.flaps-result')).toHaveCount(0);
  await expect(page.getByLabel('0 пёрышек', { exact: true })).toBeVisible();
});

test('modern Telegram swipe API is scoped to Home/game while Collection/Profile keep scrolling', async ({ page }) => {
  const f = fixture(); await f.initial();
  await bridge(page, async (method, input) => await f.call(method, input) as ApiResult);
  await expect(page.locator('.home-screen')).toBeVisible();
  expect(await page.evaluate(() => window.telegramCalls.at(-1))).toBe('disable');
  await page.getByRole('button', { name: 'Коллекция', exact: true }).click();
  expect(await page.evaluate(() => window.telegramCalls.at(-1))).toBe('enable');
  await page.getByRole('button', { name: 'Профиль', exact: true }).click();
  await page.locator('.app-main').evaluate(element => { element.scrollTop = element.scrollHeight; });
  expect(await page.locator('.app-main').evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await enterFlaps(page); expect(await page.evaluate(() => window.telegramCalls.at(-1))).toBe('disable');
  await page.getByRole('application').click(); await page.evaluate(() => window.telegramBack?.());
  await expect(page.getByRole('alertdialog')).toBeVisible(); await page.getByRole('button', { name: 'Выйти из игры', exact: true }).click();
  expect(await page.evaluate(() => window.telegramCalls.at(-1))).toBe('enable');
});

test('old Telegram SDK without swipe methods remains usable', async ({ page }) => {
  const f = fixture(); await f.initial(); const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await bridge(page, async (method, input) => await f.call(method, input) as ApiResult, { oldSdk: true });
  await expect(page.locator('.home-screen')).toBeVisible(); await enterFlaps(page); await fallToResult(page);
  expect(errors).toEqual([]);
});

test('Telegram deactivation pauses gameplay and resume gives no accumulated background delta', async ({ page }) => {
  const f = fixture(); await f.initial(); let finishes = 0;
  await bridge(page, async (method, input) => { if (method === 'finishFlapsRun') finishes++; return await f.call(method, input) as ApiResult; });
  await enterFlaps(page); await page.getByRole('application').click();
  await page.evaluate(() => { window.Telegram!.WebApp!.isActive = false; window.telegramEvents.deactivated?.(); });
  await expect(page.locator('.flaps-game')).toHaveAttribute('data-phase', 'paused'); await page.waitForTimeout(1500);
  expect(finishes).toBe(0);
  await page.evaluate(() => { window.Telegram!.WebApp!.isActive = true; window.telegramEvents.activated?.(); });
  await page.getByRole('button', { name: 'Продолжить полёт', exact: true }).click();
  await expect(page.locator('.flaps-game')).toHaveAttribute('data-phase', 'playing');
  await page.getByRole('button', { name: 'Выйти из Chippster Flaps' }).click(); await page.getByRole('button', { name: 'Выйти из игры', exact: true }).click();
  expect(finishes).toBe(0);
});

test('local TTL overlay accepts keyboard exit without starting or finishing another flight', async ({ page }) => {
  const f = fixture(); await f.initial(); let finishes = 0;
  await page.clock.install();
  await bridge(page, async (method, input) => { if (method === 'finishFlapsRun') finishes++; return await f.call(method, input) as ApiResult; });
  await enterFlaps(page); await page.clock.fastForward(600001);
  await expect(page.locator('.flaps-game')).toHaveAttribute('data-phase', 'expired');
  const exit = page.getByRole('button', { name: 'К активностям', exact: true });
  await exit.focus(); await exit.press('Space');
  await expect(page.getByRole('heading', { name: 'Расправим крылья', exact: true })).toBeVisible();
  expect(finishes).toBe(0);
});

test('disabled vibration and sound stay off after focus refresh and server-error feedback', async ({ page }) => {
  const f = fixture(); await f.initial();
  await page.addInitScript(() => {
    Object.defineProperty(window, 'AudioContext', { value: class { constructor() { window.telegramCalls.push('audio-context'); throw new Error('Synthetic silent-mode guard'); } } });
  });
  await bridge(page, async (method, input) => method === 'careAction'
    ? { ok: false, error: { code: 'INVALID_REQUEST', message: 'Синтетическая ошибка сервера.', retryable: false } }
    : await f.call(method, input) as ApiResult);
  await page.getByRole('button', { name: 'Профиль', exact: true }).click(); await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await page.getByRole('switch', { name: /Вибрация/ }).uncheck();
  await page.getByRole('button', { name: 'Дом', exact: true }).click();
  await page.evaluate(() => { window.telegramCalls = []; window.dispatchEvent(new Event('focus')); });
  await page.getByRole('button', { name: /Покормить/ }).click(); await expect(page.getByRole('alert')).toContainText('Синтетическая ошибка сервера');
  expect(await page.evaluate(() => window.telegramCalls.filter(value => value === 'haptic' || value === 'audio-context'))).toEqual([]);
});
