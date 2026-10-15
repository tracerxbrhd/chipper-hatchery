import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { BALANCE } from '../../tgcloud/lib/domain.js';
import { operation } from '../helpers.js';
import { bridge04, communityFixture, success } from './v04-fixtures';
import { nativeBridge } from './v03-fixtures';
import { ru } from '../../src/i18n';

async function collectionFixture() {
  const f = communityFixture();
  const firstId = await f.initial();
  await f.seedFeathers(6);
  const bought = success(await f.dispatch('buyEgg', operation()));
  f.advance(BALANCE.incubationMs);
  success(await f.dispatch('hatchEgg', operation({ eggId: bought.state.egg!.id })));
  const row = await f.store.read('101');
  const adult = row.state.chicks.find(chick => chick.id === firstId)!;
  adult.name = 'Профессор Перо'; adult.bornAt = f.now - BALANCE.adultAgeMs - 1;
  adult.careMilestones = [f.now - 3, f.now - 2, f.now - 1];
  row.state.chicks.find(chick => chick.id !== firstId)!.name = 'Малыш Клюв';
  await f.store.compareAndSwap('101', row.revision, row.state);
  return f;
}

for (const width of [320, 430]) for (const theme of ['light', 'dark'] as const) {
  test(`v0.5 comparison ${width}px ${theme} preserves birds and only renders unlocked ages`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const f = await collectionFixture();
    await bridge04(page, f, { theme, native: true });
    await page.getByRole('button', { name: 'Коллекция', exact: true }).click();
    const before = (await f.store.read('101')).state;
    await page.getByRole('button', { name: 'Сравнить', exact: true }).click();
    const comparison = page.getByRole('region', { name: 'Сравнение птиц', exact: true });
    await expect(comparison).toBeVisible();
    await comparison.getByLabel('Первая птица', { exact: true }).selectOption(before.chicks.find(chick => chick.name === 'Малыш Клюв')!.id);
    // Select controls keep two distinct IDs even when changing the first slot.
    const ids = await comparison.locator('[data-chick-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-chick-id')));
    expect(new Set(ids).size).toBe(2);
    const baby = comparison.locator('.comparison-bird').filter({ has: page.getByRole('heading', { name: 'Малыш Клюв', exact: true }) });
    const adult = comparison.locator('.comparison-bird').filter({ has: page.getByRole('heading', { name: 'Профессор Перо', exact: true }) });
    await expect(baby.locator('.chick-art')).toHaveAttribute('data-stage', 'baby');
    await expect(baby.getByRole('button', { name: 'Возраст пока закрыт' })).toHaveCount(2);
    for (const button of await baby.getByRole('button', { name: 'Возраст пока закрыт' }).all()) await expect(button).toBeDisabled();
    await adult.getByRole('button', { name: 'Птенец', exact: true }).click();
    await expect(adult.locator('.chick-art')).toHaveAttribute('data-stage', 'baby');
    await expect(adult.getByRole('status')).toContainText('воспоминание');
    await expect(comparison.locator('.chick-art')).toHaveCount(2);
    for (const art of await comparison.locator('.chick-art').all()) await expect(art).toHaveAttribute('data-reduced-motion', 'true');
    const after = (await f.store.read('101')).state;
    expect(after.chicks).toEqual(before.chicks); expect(after.receipts).toEqual(before.receipts);
    expect(after.player.feathers).toBe(before.player.feathers);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const directory = process.env.CHIPPER_CAPTURE_QA === '1' ? 'DOCS/qa/0.5' : 'test-results/qa/0.5';
    mkdirSync(directory, { recursive: true });
    await comparison.screenshot({ path: join(directory, `collection-comparison-${width}-${theme}.png`) });
  });
}

test('v0.5 collection marks exchange reservation and disables conflicting owner actions', async ({ page }) => {
  const f = await collectionFixture();
  const response = success(await f.dispatch('getHome'));
  const reservedId = response.state.chicks.find(chick => chick.id !== response.state.player.activeChickId)!.id;
  await nativeBridge(page, async (method, input) => {
    const result = await f.dispatch(method, input);
    if (result.ok) for (const chick of result.state.chicks) if (chick.id === reservedId) chick.reservedExchangeId = 'synthetic-pending-exchange';
    return result;
  });
  await page.getByRole('button', { name: 'Коллекция', exact: true }).click();
  const card = page.locator('.collection-card').filter({ hasText: 'Ждёт обмена' });
  await expect(card).toHaveCount(1); await card.click();
  await expect(page.getByRole('button', { name: ru.rename, exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: ru.activate, exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Подарить другу', exact: true })).toBeDisabled();
});
