import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { operation } from '../helpers.js';
import { communityFixture, bridge04, success } from './v04-fixtures';
import type { ApiResult, Method } from '../../src/types';

async function prepared() {
  const f = communityFixture(), recipientProfileId = await f.friends();
  const birds = [];
  for (const actor of [101, 202]) {
    const row = await f.store.read(String(actor));
    const chick = structuredClone(row.state.chicks[0]); chick.id = randomUUID(); chick.name = actor === 101 ? 'Кривоклюв' : 'Плюм';
    row.state.chicks.push(chick); await f.store.compareAndSwap(String(actor), row.revision, row.state); birds.push(chick);
  }
  return { f, recipientProfileId, offered: birds[0], requested: birds[1] };
}
async function openSocial(page: Page) {
  await page.getByRole('button', { name: 'Профиль', exact: true }).click();
  await page.getByRole('button', { name: 'Друзья и видимость', exact: true }).click();
  await expect(page.locator('.exchange-panel')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Обновить обмены', exact: true })).toBeEnabled();
}
async function selectPair(page: Page, ownId: string, peerId: string, requestedId: string) {
  await page.getByLabel('Ваш цыплёнок для обмена', { exact: true }).selectOption(ownId);
  await page.getByLabel('Друг для обмена', { exact: true }).selectOption(peerId);
  await expect(page.getByLabel('Цыплёнок друга для обмена', { exact: true })).toBeVisible();
  await page.getByLabel('Цыплёнок друга для обмена', { exact: true }).selectOption(requestedId);
  await expect(page.locator('.exchange-composer .exchange-pair')).toBeVisible();
}
function owners(f: ReturnType<typeof communityFixture>, chickId: string) {
  return f.sqlite.prepare('SELECT telegram_id,state_json FROM chipper_players').all()
    .filter(row => JSON.parse(String(row.state_json)).chicks.some((chick: { id: string }) => chick.id === chickId)).map(row => row.telegram_id);
}
function screenshotPath(name: string) {
  const dir = process.env.CHIPPER_CAPTURE_QA === '1' ? 'DOCS/qa/0.5' : 'test-results/qa/0.5'; mkdirSync(dir, { recursive: true }); return `${dir}/${name}`;
}

test('v0.5 exact pair preview is read-only; both users explicitly consent; reserved gifts stay unavailable', async ({ page, context }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const { f, recipientProfileId, offered, requested } = await prepared();
  success(await f.dispatch('updatePrivacy', operation({ visibility: 'friends', collectionVisibility: 'friends' }), 202));
  await bridge04(page, f, { theme: 'dark', native: true }); await openSocial(page);
  const peerBeforePreview = await f.store.read('202');
  await selectPair(page, offered.id, recipientProfileId, requested.id);
  expect(await f.store.read('202')).toEqual(peerBeforePreview);
  expect(owners(f, offered.id)).toEqual([101]); expect(owners(f, requested.id)).toEqual([202]);
  await page.getByRole('button', { name: 'Предложить обмен', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Предложить эту пару?', exact: true });
  await expect(dialog).toContainText('Кривоклюв'); await expect(dialog).toContainText('Плюм');
  const bounds = (await dialog.boundingBox())!; expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  await page.screenshot({ path: screenshotPath('exchange-pair-confirm-dark-320.png') });
  await dialog.getByRole('button', { name: 'Вернуться', exact: true }).click();
  expect((await f.store.read('101')).state.exchanges).toBeUndefined();
  await page.getByRole('button', { name: 'Предложить обмен', exact: true }).click();
  await page.getByRole('button', { name: 'Да, предложить эту пару', exact: true }).click();
  await expect(page.locator('.exchange-history-item')).toContainText('Ждёт ответа');
  expect((await f.store.read('101')).state.exchanges).toEqual((await f.store.read('202')).state.exchanges);
  await expect(page.getByLabel('Цыплёнок для подарка', { exact: true }).locator(`option[value="${offered.id}"]`)).toHaveCount(0);
  const recipient = await context.newPage(); await recipient.setViewportSize({ width: 390, height: 844 });
  await bridge04(recipient, f, { identity: 'B', theme: 'light', native: true }); await openSocial(recipient);
  await recipient.getByRole('button', { name: 'Принять обмен', exact: true }).click();
  await expect(recipient.getByRole('dialog', { name: 'Подтвердить обмен?', exact: true }).locator('figure').first()).toContainText('Плюм');
  await recipient.getByRole('button', { name: 'Да, обменять этих цыплят', exact: true }).click();
  await expect(recipient.locator('.exchange-history-item')).toContainText('Обмен состоялся');
  expect(owners(f, offered.id)).toEqual([202]); expect(owners(f, requested.id)).toEqual([101]);
  const a = (await f.store.read('101')).state, b = (await f.store.read('202')).state;
  expect(a.chicks.find(chick => chick.id === requested.id).genes).toEqual(requested.genes);
  expect(b.chicks.find(chick => chick.id === offered.id).genes).toEqual(offered.genes);
  expect(a.player.feathers + b.player.feathers).toBe(0);
  await recipient.screenshot({ path: screenshotPath('exchange-accepted-light-390.png') }); await recipient.close();
});

test('v0.5 lost committed accept response uses root persistent retry UUID and cannot duplicate birds', async ({ page }) => {
  const { f, recipientProfileId, offered, requested } = await prepared();
  success(await f.dispatch('updatePrivacy', operation({ visibility: 'friends', collectionVisibility: 'friends' }), 202));
  success(await f.dispatch('offerExchange', operation({ chickId: offered.id, recipientProfileId, requestedChickId: requested.id })));
  const dispatch = f.dispatch, attempts: string[] = []; let lose = true;
  f.dispatch = async (method: Method, input: Record<string, unknown> = {}, owner = 101): Promise<ApiResult> => {
    const response = await dispatch(method, input, owner);
    if (method === 'respondExchange' && input.accept === true) {
      attempts.push(String(input.operationId));
      if (lose && response.ok) { lose = false; return { ok: false, error: { code: 'NETWORK', message: 'Synthetic lost committed response', retryable: true } }; }
    }
    return response;
  };
  await bridge04(page, f, { identity: 'B', theme: 'dark' }); await openSocial(page);
  await page.getByRole('button', { name: 'Принять обмен', exact: true }).click();
  await page.getByRole('button', { name: 'Да, обменять этих цыплят', exact: true }).click();
  await expect(page.locator('.error-banner')).toContainText('Synthetic lost committed response');
  expect(owners(f, offered.id)).toEqual([202]); expect(owners(f, requested.id)).toEqual([101]);
  await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect(page.locator('.exchange-history-item')).toContainText('Обмен состоялся');
  expect(attempts).toHaveLength(2); expect(attempts[0]).toBe(attempts[1]);
  expect(owners(f, offered.id)).toEqual([202]); expect(owners(f, requested.id)).toEqual([101]);
  expect((await f.store.read('202')).state.telemetry.totals.exchange_accepted).toBe(1);
});

test('v0.5 private collection never exposes birds; explicit recheck honors new consent and hides background cache', async ({ page }) => {
  const { f, recipientProfileId, offered, requested } = await prepared();
  await bridge04(page, f, { theme: 'light', native: true }); await openSocial(page);
  const before = await f.store.read('202');
  await page.getByLabel('Ваш цыплёнок для обмена', { exact: true }).selectOption(offered.id);
  await page.getByLabel('Друг для обмена', { exact: true }).selectOption(recipientProfileId);
  await expect(page.locator('.exchange-privacy-note')).toBeVisible();
  await expect(page.getByLabel('Цыплёнок друга для обмена', { exact: true })).toHaveCount(0);
  await expect(page.locator('.exchange-composer')).not.toContainText('Плюм');
  await expect(page.getByRole('button', { name: 'Предложить обмен', exact: true })).toBeDisabled();
  expect(await f.store.read('202')).toEqual(before);
  success(await f.dispatch('updatePrivacy', operation({ visibility: 'friends', collectionVisibility: 'friends' }), 202));
  await page.getByRole('button', { name: 'Обновить коллекцию друга', exact: true }).click();
  await page.getByLabel('Цыплёнок друга для обмена', { exact: true }).selectOption(requested.id);
  await expect(page.locator('.exchange-composer .exchange-pair')).toContainText('Плюм');
  await page.evaluate(() => window.telegramEvents?.deactivated?.());
  await expect(page.locator('.exchange-composer .exchange-pair')).toHaveCount(0);
  await expect(page.getByLabel('Цыплёнок друга для обмена', { exact: true })).toHaveCount(0);
  expect(owners(f, offered.id)).toEqual([101]); expect(owners(f, requested.id)).toEqual([202]);
});
