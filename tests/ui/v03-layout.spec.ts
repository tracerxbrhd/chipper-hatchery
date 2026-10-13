import { test, expect } from '@playwright/test';
import { fixture } from '../helpers.js';
import { seed, enterFlaps } from './fixtures';
import { nativeBridge, qa03Path, expectNoNativeOverlap } from './v03-fixtures';
import type { ApiResult } from '../../src/types';

const sizes = [{ width: 320, height: 568 }, { width: 360, height: 640 }, { width: 390, height: 844 }, { width: 430, height: 932 }];
const tabs = ['Магазин', 'Коллекция', 'Дом', 'Активности', 'Профиль'];

for (const viewport of sizes) for (const theme of ['light', 'dark'] as const) {
  test(`v0.3 native safe Home and floating dock ${theme} ${viewport.width}`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize(viewport);
    const f = fixture(); await f.initial();
    await nativeBridge(page, async (method, input) => await f.call(method, input) as ApiResult, { theme, native: true });
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expectNoNativeOverlap(page, ['.brand', '.feather-balance', '.app-header .icon-button']);
    expect(await page.locator('.bottom-dock button').allTextContents()).toEqual(tabs);
    await expect(page.locator('.bottom-dock button').nth(2)).toHaveAttribute('aria-current', 'page');
    const layout = await page.evaluate(() => {
      const rect = (selector: string) => { const box = document.querySelector(selector)!.getBoundingClientRect(); return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, height: box.height, width: box.width }; };
      const dock = rect('.bottom-dock');
      return { dock, home: rect('.dock-home'), summary: rect('.care-summary-toggle'), care: Array.from(document.querySelectorAll('.care-button')).map(node => { const box = node.getBoundingClientRect(); return { width: box.width, height: box.height, bottom: box.bottom }; }), width: document.documentElement.scrollWidth, scroll: document.documentElement.scrollHeight - innerHeight, mainScroll: document.querySelector('.app-main')!.scrollHeight - document.querySelector('.app-main')!.clientHeight };
    });
    expect(layout.width).toBeLessThanOrEqual(viewport.width);
    expect(layout.scroll).toBeLessThanOrEqual(1); expect(layout.mainScroll).toBeLessThanOrEqual(1);
    expect(viewport.height - layout.dock.bottom).toBeGreaterThanOrEqual(20);
    expect(Math.abs((layout.home.left + layout.home.right) / 2 - viewport.width / 2)).toBeLessThanOrEqual(1);
    expect(layout.summary.height).toBeGreaterThanOrEqual(44);
    for (const care of layout.care) { expect(care.width).toBeGreaterThanOrEqual(44); expect(care.height).toBeGreaterThanOrEqual(44); expect(care.bottom).toBeLessThanOrEqual(layout.dock.top); }
    await page.screenshot({ path: qa03Path(`home-native-${theme}-${viewport.width}.png`) });
    await page.getByRole('button', { name: 'Коллекция', exact: true }).click();
    await page.locator('.collection-card').first().click();
    await expect(page.locator('.bird-screen')).toBeVisible();
    await expectNoNativeOverlap(page, ['.brand', '.feather-balance', '.app-header .icon-button']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({ path: qa03Path(`growth-native-${theme}-${viewport.width}.png`) });
    expect(errors).toEqual([]);
  });
}

test('v0.3 collection owns working egg mechanics, shop is truthful and rapid tabs stay isolated', async ({ page }) => {
  await seed(page, { readyEgg: true }); await page.goto('/');
  await page.getByRole('button', { name: 'Коллекция', exact: true }).click();
  await page.getByRole('tab', { name: /^Яйца/ }).click();
  await expect(page.getByRole('button', { name: 'Вылупить', exact: true })).toBeVisible();
  await page.screenshot({ path: qa03Path('collection-eggs-light.png') });
  await page.getByRole('button', { name: 'Вылупить', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'В семье пополнение!' })).toBeVisible();
  await page.getByRole('button', { name: 'В коллекцию', exact: true }).click();
  await expect(page.locator('.collection-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Магазин', exact: true }).click();
  await expect(page.locator('.shop-screen')).toContainText('Скоро');
  expect(await page.getByRole('button', { name: /Купить|Оплатить|Stars/ }).count()).toBe(0);
  await expect(page.locator('.screen-transition')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: qa03Path('shop-light.png') });
  for (let index = 0; index < 20; index++) await page.getByRole('button', { name: tabs[index % tabs.length], exact: true }).click();
  await expect(page.locator('.profile-screen')).toBeVisible();
  await expect(page.locator('.screen-transition')).toHaveCount(1);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test('v0.3 narrow native Flaps controls and score avoid Telegram chrome, leaving stays functional', async ({ page }) => {
  await page.setViewportSize(sizes[0]); const f = fixture(); await f.initial();
  await nativeBridge(page, async (method, input) => await f.call(method, input) as ApiResult, { native: true });
  await enterFlaps(page);
  await expect(page.locator('.flaps-toolbar .native-hud-primary')).toBeVisible();
  await expect(page.locator('.flaps-score')).toBeVisible();
  await expectNoNativeOverlap(page, ['.flaps-toolbar .native-hud-primary', '.flaps-score', '.flaps-controls']);
  const titleFits = await page.locator('.flaps-toolbar h1').evaluate(node => node.scrollWidth <= node.clientWidth + 1);
  expect(titleFits, 'Chippster Flaps must stay readable without an ellipsized title').toBe(true);
  await page.screenshot({ path: qa03Path('flaps-native-dark-320.png') });
  await page.getByRole('button', { name: 'Выйти из Chippster Flaps' }).click();
  await expect(page.getByRole('heading', { name: 'Расправим крылья', exact: true })).toBeVisible();
});

test('v0.3 reduced motion, blur fallback and keyboard retain accessible controls', async ({ page }) => {
  await page.setViewportSize(sizes[1]); await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
  await seed(page); await page.goto('/');
  await page.addStyleTag({ content: '.glass-surface,.bottom-dock,.app-header {backdrop-filter:none!important;-webkit-backdrop-filter:none!important}' });
  await expect(page.locator('.living-world')).toHaveAttribute('data-running', 'false');
  const boxes = await page.locator('.bottom-dock button').evaluateAll(nodes => nodes.map(node => { const box = node.getBoundingClientRect(); return { width: box.width, height: box.height }; }));
  for (const box of boxes) { expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44); }
  await page.getByRole('button', { name: 'Коллекция', exact: true }).click(); await page.locator('.collection-card').first().click();
  await page.getByRole('button', { name: 'Изменить имя', exact: true }).click(); await page.setViewportSize({ width: 360, height: 370 });
  await page.getByLabel('Имя цыплёнка', { exact: true }).fill('Маленький');
  await page.getByRole('button', { name: 'Сохранить имя', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Маленький', exact: true })).toBeVisible();
});

test('v0.3 legacy incubator links return to Collection eggs without a blank route', async ({ page }) => {
  await seed(page, { readyEgg: true });
  for (const route of ['/?tab=incubator', '/#incubator']) {
    await page.goto(route);
    await expect(page.getByRole('tab', { name: /^Яйца/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('button', { name: 'Вылупить', exact: true })).toBeVisible();
    await expect(page.locator('.bottom-dock button').nth(1)).toHaveAttribute('aria-current', 'page');
  }
});
