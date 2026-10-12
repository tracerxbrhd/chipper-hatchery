import { test, expect, type Page } from '@playwright/test';
import { fixture, operation } from '../helpers.js';
import { BALANCE } from '../../tgcloud/lib/domain.js';

const storageKey = 'chipper-explicit-development-v1';
async function seed(page: Page, options: { twoBirds?: boolean; readyEgg?: boolean } = {}) {
  const f = fixture(); await f.initial();
  if (options.twoBirds || options.readyEgg) {
    await f.seedFeathers(6); const buy = await f.call('buyEgg', operation()); f.advance(BALANCE.incubationMs);
    if (options.twoBirds) { f.roll(.99); await f.call('hatchEgg', operation({ eggId: buy.result.eggId })); }
  }
  const row = await f.store.read('101');
  // Shift the controlled-clock local fixture to this browser's wall clock.
  const delta = Date.now() - f.now;
  const rewrite = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(rewrite);
    if (typeof value === 'number' && value > 1_000_000_000_000) return value + delta;
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewrite(item)]));
    return value;
  };
  await page.addInitScript(({ key, value }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value); }, { key: storageKey, value: JSON.stringify(rewrite(row)) });
}
async function finishOnboarding(page: Page) {
  await page.getByRole('button', { name: 'Начать', exact: true }).click();
  const egg = page.getByRole('button', { name: 'Коснитесь яйца', exact: true });
  for (let i = 0; i < 3; i++) await egg.click();
  await expect(page.getByRole('heading', { name: 'Привет, маленький!' })).toBeVisible();
  await page.getByLabel('Имя цыплёнка', { exact: true }).fill('Пип');
  await page.getByRole('button', { name: 'Сохранить имя', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Пип', exact: true })).toBeVisible();
}

test('onboarding, care reward, reload, sleep, settings and incubator', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await finishOnboarding(page);
  await expect(page.getByText('Локальная песочница', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: /Покормить/ }).click();
  await page.getByRole('button', { name: /Поиграть/ }).click();
  await expect(page.getByLabel('1 пёрышко', { exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByRole('heading', { name: 'Пип', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Покормить/ })).toBeDisabled();
  await page.getByRole('button', { name: /Спать/ }).click();
  await expect(page.getByText('Тихий час', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await page.getByRole('switch', { name: /Анимации/ }).uncheck();
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect(page.locator('.app')).toHaveAttribute('data-motion', 'off');
  await page.getByRole('button', { name: 'Инкубатор', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ещё 5 пёрышек', exact: true })).toBeDisabled();
  await page.screenshot({ path: 'DOCS/qa/incubator.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('collection rename and switch preserve each individual bird', async ({ page }) => {
  await seed(page, { twoBirds: true }); await page.goto('/');
  await page.getByRole('button', { name: 'Коллекция', exact: true }).click();
  await expect(page.locator('.collection-card')).toHaveCount(2);
  await page.screenshot({ path: 'DOCS/qa/collection.png', fullPage: true });
  await page.locator('.collection-card').filter({ hasText: 'Цып №2' }).click();
  await page.getByRole('button', { name: 'Изменить имя', exact: true }).click();
  await page.getByLabel('Имя цыплёнка', { exact: true }).fill('Золотко');
  await page.getByRole('button', { name: 'Сохранить имя', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Золотко', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Позвать домой', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Золотко', exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByRole('heading', { name: 'Золотко', exact: true })).toBeVisible();
  await page.screenshot({ path: 'DOCS/qa/home.png', fullPage: true });
});

test('ready ordinary egg hatches once and preserves active bird', async ({ page }) => {
  await seed(page, { readyEgg: true }); await page.goto('/');
  await page.getByRole('button', { name: 'Инкубатор', exact: true }).click();
  await page.getByRole('button', { name: 'Вылупить', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'В семье пополнение!' })).toBeVisible();
  await page.getByRole('button', { name: 'В коллекцию', exact: true }).click();
  await expect(page.locator('.collection-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Дом', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Цып №1', exact: true })).toBeVisible();
});

test('complete 25-second grain round, then replay without another reward', async ({ page }) => {
  test.setTimeout(80000); await seed(page); await page.goto('/');
  await page.getByRole('button', { name: 'Активности', exact: true }).click();
  const round = async () => {
    await page.getByRole('button', { name: 'Играть', exact: true }).click();
    await expect(page.getByRole('timer')).toBeVisible();
    for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Собрать зёрнышко' }).first().click();
    await page.screenshot({ path: 'DOCS/qa/minigame.png', fullPage: true });
    await expect(page.getByRole('heading', { name: 'Отличная прогулка!' })).toBeVisible({ timeout: 35000 });
  };
  await round(); await expect(page.getByText('+1 пёрышко в копилку', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Домой', exact: true }).click();
  await page.getByRole('button', { name: 'Активности', exact: true }).click();
  await round(); await expect(page.getByText('Играли ради удовольствия. Следующая награда ещё отдыхает.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('1 пёрышко', { exact: true })).toBeVisible();
});

test('network error retains the operation and allows safe retry', async ({ page, context }) => {
  await seed(page); await page.goto('/'); await expect(page.getByRole('heading', { name: 'Цып №1', exact: true })).toBeVisible();
  await context.setOffline(true); await page.getByRole('button', { name: /Покормить/ }).click();
  await expect(page.getByRole('alert')).toBeVisible(); await context.setOffline(false);
  await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0); await expect(page.getByRole('button', { name: /Покормить/ })).toBeDisabled();
});

for (const width of [320, 360, 390, 430]) {
  test(`mobile layout ${width}px with dark theme and reduced motion`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 }); await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' }); await seed(page); await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Цып №1', exact: true })).toBeVisible();
    await expect(page.locator('.app')).toHaveAttribute('data-motion', 'off');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    for (const tab of ['Дом', 'Инкубатор', 'Коллекция', 'Активности']) {
      await page.getByRole('button', { name: tab, exact: true }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    if (width === 320) await page.screenshot({ path: 'DOCS/qa/mobile-dark-320.png', fullPage: true });
  });
}

test('production build opened outside Telegram denies access even with mock query/storage', async ({ page }) => {
  await seed(page); await page.goto('http://127.0.0.1:4173/?mock=true&userId=101');
  await expect(page.getByRole('heading', { name: 'Ваш цыплёнок ждёт в Telegram' })).toBeVisible();
  await expect(page.locator('.bottom-nav')).toHaveCount(0); await expect(page.getByText('Локальная песочница', { exact: false })).toHaveCount(0);
});
