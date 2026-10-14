import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { seed, finishOnboarding, enterFlaps, storageKey, qaPath } from './fixtures';

const tabs = ['Магазин', 'Коллекция', 'Дом', 'Активности', 'Профиль'];

async function openEggs(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Коллекция', exact: true }).click();
  await page.getByRole('tab', { name: /^Яйца/ }).click();
}

test('fresh V2 onboarding, care reward, reload, sleep, profile settings and incubator', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await finishOnboarding(page);
  await expect(page.getByText('Локальная песочница', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: /Покормить/ }).click();
  await page.getByRole('button', { name: /Поиграть/ }).click();
  await expect(page.getByLabel('1 пёрышко', { exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByRole('heading', { name: 'Пип', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Покормить/ })).toBeDisabled();
  await page.getByRole('button', { name: /Спать/ }).click();
  await expect(page.getByText('Тихий час', { exact: true })).toBeVisible();
  await expect(page.locator('.living-world')).toHaveAttribute('data-mode', 'sleep');
  await page.getByRole('button', { name: 'Профиль', exact: true }).click();
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await page.getByRole('switch', { name: /Анимации/ }).uncheck();
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect(page.locator('.profile-screen')).toBeVisible();
  await expect(page.locator('.app')).toHaveAttribute('data-motion', 'off');
  await openEggs(page);
  await expect(page.getByRole('button', { name: 'Ещё 5 пёрышек', exact: true })).toBeDisabled();
  await page.screenshot({ path: qaPath('incubator-light.png') });
  const genes = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).state.chicks[0], storageKey);
  expect(genes.appearanceVersion).toBe(2); expect(genes.genes.geneSchemaVersion).toBe(1); expect(errors).toEqual([]);
});

test('collection rename and activation preserve individual V2 genes in Home and Flaps', async ({ page }) => {
  const row = await seed(page, { twoBirds: true }); await page.goto('/');
  await page.getByRole('button', { name: 'Коллекция', exact: true }).click();
  await expect(page.locator('.collection-card')).toHaveCount(2);
  await page.screenshot({ path: qaPath('collection-light.png') });
  await page.locator('.collection-card').filter({ hasText: 'Цып №2' }).click();
  await page.getByRole('button', { name: 'Изменить имя', exact: true }).click();
  await page.getByLabel('Имя цыплёнка', { exact: true }).fill('Золотко');
  await page.getByRole('button', { name: 'Сохранить имя', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Золотко', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Позвать домой', exact: true }).click();
  await expect(page.locator('.home-screen').getByRole('heading', { name: 'Золотко', exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByRole('heading', { name: 'Золотко', exact: true })).toBeVisible();
  await enterFlaps(page);
  await expect(page.locator('.flaps-game')).toHaveAttribute('data-chick-id', row.state.chicks[1].id);
  await expect(page.getByText('Ваш пилот — Золотко')).toBeVisible();
  await page.getByRole('button', { name: 'Выйти из Chippster Flaps' }).click();
  const bird = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).state.chicks.find((chick: { name: string }) => chick.name === 'Золотко'), storageKey);
  expect(bird.genes).toEqual(row.state.chicks[1].genes);
});

test('ready ordinary egg hatches once and retains the current active bird', async ({ page }) => {
  await seed(page, { readyEgg: true }); await page.goto('/');
  await openEggs(page);
  await page.getByRole('button', { name: 'Вылупить', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'В семье пополнение!' })).toBeVisible();
  await page.getByRole('button', { name: 'В коллекцию', exact: true }).click();
  await expect(page.locator('.collection-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Дом', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Цып №1', exact: true })).toBeVisible();
});

test('Flaps pointer start, local collision, instant restart and leave without another reward', async ({ page }) => {
  await seed(page); await page.goto('/'); await enterFlaps(page);
  await page.screenshot({ path: qaPath('flaps-ready.png') });
  await page.getByRole('application').click(); await expect(page.locator('.flaps-game')).toHaveAttribute('data-phase', 'playing');
  await page.screenshot({ path: qaPath('flaps-playing.png') });
  await expect(page.locator('.flaps-result')).toBeVisible({ timeout: 15000 });
  await page.screenshot({ path: qaPath('flaps-result.png') });
  await expect(page.getByText('Полёт был короче 2 секунд.', { exact: false })).toBeVisible();
  await expect(page.getByLabel('0 пёрышек', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Ещё раз', exact: true }).click();
  await expect(page.locator('.flaps-game')).toHaveAttribute('data-phase', 'ready');
  await page.getByRole('application').click(); await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  await expect(page.locator('.flaps-game')).toHaveAttribute('data-phase', 'paused');
  await page.screenshot({ path: qaPath('flaps-paused.png') });
  await page.getByRole('button', { name: 'Продолжить полёт', exact: true }).click();
  await page.getByRole('button', { name: 'Выйти из Chippster Flaps' }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible(); await page.getByRole('button', { name: 'Выйти из игры', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Расправим крылья', exact: true })).toBeVisible();
  await expect(page.getByLabel('0 пёрышек', { exact: true })).toBeVisible();
});

test('network error retains care operation and permits safe retry', async ({ page, context }) => {
  await seed(page); await page.goto('/'); await expect(page.getByRole('heading', { name: 'Цып №1', exact: true })).toBeVisible();
  await context.setOffline(true); await page.getByRole('button', { name: /Покормить/ }).click();
  await expect(page.getByRole('alert')).toBeVisible(); await context.setOffline(false);
  await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0); await expect(page.getByRole('button', { name: /Покормить/ })).toBeDisabled();
});

for (const viewport of [{ width: 320, height: 568 }, { width: 360, height: 640 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
  test(`fixed mobile Home ${viewport.width}x${viewport.height}, five tabs, dark reduced motion and glass fallback`, async ({ page }) => {
    await page.setViewportSize(viewport); await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' }); await seed(page); await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Цып №1', exact: true })).toBeVisible();
    await expect(page.locator('.app')).toHaveAttribute('data-motion', 'off'); await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await page.locator('.bottom-dock button').allTextContents()).toEqual(tabs);
    await expect(page.locator('.bottom-dock button').nth(2)).toHaveAttribute('aria-current', 'page');
    await page.addStyleTag({ content: '.glass-panel,.bottom-dock,.app-header { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }' });
    for (const name of [/Покормить/, /Поиграть/, /Спать/]) {
      const box = await page.getByRole('button', { name }).boundingBox(); expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44); expect(box!.y).toBeGreaterThanOrEqual(0); expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
    }
    const world = await page.locator('.living-world').boundingBox(); expect(world!.height).toBeGreaterThan(80);
    await page.mouse.move(world!.x + 15, world!.y + world!.height / 2); await page.mouse.wheel(0, 500);
    expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0);
    expect(await page.locator('.app-main').evaluate(element => element.scrollTop)).toBe(0);
    for (const tab of tabs) {
      await page.getByRole('button', { name: tab, exact: true }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.getByRole('button', { name: 'Дом', exact: true }).click();
    await page.screenshot({ path: qaPath(`home-dark-${viewport.width}.png`) });
  });
}

test('40 V2 birds scroll internally and preserve scroll when returning from detail; rapid tabs stay single', async ({ page }) => {
  await seed(page, { manyBirds: 40 }); await page.goto('/');
  await page.getByRole('button', { name: 'Коллекция', exact: true }).click(); await expect(page.locator('.collection-card')).toHaveCount(40);
  await page.locator('.app-main').evaluate(element => { element.scrollTop = 820; });
  await expect.poll(() => page.locator('.app-main').evaluate(element => element.scrollTop)).toBeGreaterThan(700);
  const before = await page.locator('.app-main').evaluate(element => element.scrollTop);
  const target = await page.locator('.collection-card').evaluateAll(elements => {
    const area = document.querySelector('.app-main')!.getBoundingClientRect();
    const element = elements.find(item => { const box = item.getBoundingClientRect(); return box.top >= area.top + 10 && box.bottom <= area.bottom - 10; })!;
    const box = element.getBoundingClientRect(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  });
  await page.mouse.click(target.x, target.y);
  await expect(page.locator('.bird-screen')).toBeVisible(); await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect(page.locator('.collection-screen')).toBeVisible();
  await expect.poll(() => page.locator('.app-main').evaluate(element => element.scrollTop)).toBeGreaterThanOrEqual(before - 2);
  expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0);
  for (let index = 0; index < 15; index++) await page.getByRole('button', { name: tabs[index % 5], exact: true }).click();
  await expect(page.locator('.profile-screen')).toBeVisible();
  await expect(page.locator('.screen-transition')).toHaveCount(1);
  await page.locator('.app-main').evaluate(element => { element.scrollTop = element.scrollHeight; });
  expect(await page.locator('.app-main').evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await page.screenshot({ path: qaPath('profile-dark.png') });
});

test('rename form stays accessible at keyboard-height viewport', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 }); await seed(page); await page.goto('/');
  await page.getByRole('button', { name: 'Коллекция', exact: true }).click(); await page.locator('.collection-card').first().click();
  await page.getByRole('button', { name: 'Изменить имя', exact: true }).click();
  await page.setViewportSize({ width: 360, height: 370 }); await page.getByLabel('Имя цыплёнка', { exact: true }).fill('Кнопка');
  await page.getByRole('button', { name: 'Сохранить имя', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Кнопка', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0);
});

test('Living World approaches a field target and care cancels walking; preferences stop motion', async ({ page }) => {
  await seed(page); await page.goto('/'); const world = page.locator('.living-world');
  await expect(world).toHaveAttribute('data-running', 'true'); const box = (await world.boundingBox())!;
  await page.mouse.click(box.x + box.width * .344, box.y + box.height * .736);
  await expect.poll(() => world.getAttribute('data-mode')).toMatch(/turn|walk/);
  await page.getByRole('button', { name: /Поиграть/ }).click();
  await expect.poll(() => world.getAttribute('data-mode')).toBe('play');
  await page.getByRole('button', { name: 'Профиль', exact: true }).click(); await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await page.getByRole('switch', { name: /Анимации/ }).uncheck(); await page.getByRole('button', { name: 'Дом', exact: true }).click();
  await expect(world).toHaveAttribute('data-running', 'false');
});

test('dev gallery shows 90 V2 age variants, morphology controls and dark 320px preview', async ({ page }) => {
  await page.goto('/?art=1'); await expect(page.getByRole('heading', { name: 'Chick System 2.0 · Touchy Feel', exact: true })).toBeVisible();
  await expect(page.locator('.gallery-age-row .chick-art')).toHaveCount(90);
  await page.getByLabel('Анимация', { exact: true }).uncheck(); await page.getByLabel('Поза', { exact: true }).selectOption('sleep');
  await page.getByLabel('Тема', { exact: true }).selectOption('dark'); await page.getByLabel('Ширина 320px', { exact: true }).check();
  await page.addStyleTag({ content: '.chick-gallery { position: static !important; overflow: visible !important; } html,body,#root { height: auto !important; overflow: visible !important; }' });
  await page.screenshot({ path: qaPath('chick-gallery-dark.png'), fullPage: true });
  await page.getByLabel('Поза', { exact: true }).selectOption('flap'); await page.getByLabel('Направление', { exact: true }).selectOption('left');
  await page.getByLabel('Тема', { exact: true }).selectOption('light'); await page.screenshot({ path: qaPath('chick-gallery-light.png'), fullPage: true });
});

test('production outside Telegram denies mock and dev gallery query/storage', async ({ page }) => {
  await seed(page); await page.goto('http://127.0.0.1:4173/?mock=true&userId=101&art=1');
  await expect(page.getByRole('heading', { name: 'Ваш цыплёнок ждёт в Telegram' })).toBeVisible();
  await expect(page.locator('.bottom-dock')).toHaveCount(0); await expect(page.locator('.chick-gallery')).toHaveCount(0);
  await expect(page.getByText('Локальная песочница', { exact: false })).toHaveCount(0);
});

test('30-second Living World browser perf smoke keeps DOM and long tasks bounded', async ({ page }) => {
  await seed(page); await page.goto('/'); await expect(page.locator('.living-world')).toBeVisible();
  const metrics = await page.evaluate(async () => {
    const initialNodes = document.querySelectorAll('*').length;
    const longTasks: number[] = []; const frameIntervals: number[] = [];
    let frame = 0; let previous = performance.now();
    const observer = new PerformanceObserver(list => { for (const entry of list.getEntries()) longTasks.push(entry.duration); });
    if (PerformanceObserver.supportedEntryTypes.includes('longtask')) observer.observe({ type: 'longtask' });
    const sample = (time: number) => { frameIntervals.push(time - previous); previous = time; frame = requestAnimationFrame(sample); };
    frame = requestAnimationFrame(sample);
    await new Promise<void>(resolve => setTimeout(resolve, 30000));
    cancelAnimationFrame(frame); observer.disconnect();
    frameIntervals.sort((a, b) => a - b);
    return { durationMs: 30000, initialNodes, finalNodes: document.querySelectorAll('*').length, frames: frameIntervals.length,
      frameIntervalP95Ms: frameIntervals[Math.floor(frameIntervals.length * .95)] ?? null,
      longTaskCount: longTasks.length, maxLongTaskMs: Math.max(0, ...longTasks) };
  });
  expect(metrics.finalNodes).toBeLessThan(metrics.initialNodes + 30);
  expect(metrics.maxLongTaskMs).toBeLessThan(1500);
  expect(metrics.frames).toBeGreaterThan(300);
  await writeFile(qaPath('perf-smoke.json'), JSON.stringify({ kind: 'local Chromium browser smoke, not real-device FPS proof', ...metrics }, null, 2));
});
