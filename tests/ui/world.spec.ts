import { test, expect, type Page } from '@playwright/test';
import { fixture } from '../helpers.js';

async function seedWorld(page: Page, extreme = false) {
  const f = fixture();
  await f.initial();
  const row = await f.store.read('101');
  if (extreme) {
    const chick = row.state.chicks[0];
    chick.bornAt = f.now - 100 * 3_600_000;
    chick.careMilestones = [f.now - 80 * 3_600_000, f.now - 60 * 3_600_000, f.now - 40 * 3_600_000];
    Object.assign(chick.genes, { headShape: 'tall', bodyShape: 'stocky', legShape: 'slender', tailShape: 'feathery', crestShape: 'messy' });
  }
  const delta = Date.now() - f.now;
  const rewrite = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(rewrite);
    if (typeof value === 'number' && value > 1_000_000_000_000) return value + delta;
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewrite(item)]));
    return value;
  };
  await page.addInitScript(value => localStorage.setItem('chipper-explicit-development-v2', value), JSON.stringify(rewrite(row)));
}

for (const viewport of [{ width: 320, height: 568 }, { width: 360, height: 640 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
  test(`fixed Home keeps care and dock inside ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await seedWorld(page);
    await page.goto('/');
    await expect(page.locator('.living-world')).toHaveAttribute('data-running', 'true');
    const layout = await page.evaluate(() => {
      const care = Array.from(document.querySelectorAll('.care-button')).map(node => { const rect = node.getBoundingClientRect(); return { top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height }; });
      const main = document.querySelector('.app-main')!;
      return { care, dock: document.querySelector('.bottom-dock')?.getBoundingClientRect().top ?? document.querySelector('nav')!.getBoundingClientRect().top, mainScroll: main.scrollHeight - main.clientHeight, documentScroll: document.documentElement.scrollHeight - window.innerHeight, documentWidth: document.documentElement.scrollWidth };
    });
    expect(layout.documentScroll).toBeLessThanOrEqual(1);
    expect(layout.mainScroll).toBeLessThanOrEqual(1);
    expect(layout.documentWidth).toBeLessThanOrEqual(viewport.width);
    for (const care of layout.care) {
      expect(care.height).toBeGreaterThanOrEqual(44);
      expect(care.width).toBeGreaterThanOrEqual(44);
      expect(care.bottom).toBeLessThanOrEqual(layout.dock);
    }
    await page.getByRole('button', { name: /Два маленьких добрых дела/ }).click();
    await expect(page.locator('.care-tip-popover')).toBeVisible();
    expect(await page.locator('.app-main').evaluate(node => node.scrollHeight - node.clientHeight)).toBeLessThanOrEqual(1);
  });
}

test('ground tap arrives, feeding overrides walk, and authoritative sleep locks movement', async ({ page }) => {
  await seedWorld(page);
  await page.goto('/');
  const scene = page.locator('.living-world');
  await expect(scene).toBeVisible();
  const rect = (await scene.boundingBox())!;
  const desiredX = 11 + .71 * 78;
  const desiredY = 55 + .55 * 31;
  await page.mouse.click(rect.x + rect.width * desiredX / 100, rect.y + rect.height * desiredY / 100);
  await expect.poll(() => page.locator('.world-chick-action').evaluate(node => Math.abs(parseFloat((node as HTMLElement).style.left) - 66.38)), { timeout: 4000 }).toBeLessThan(.15);
  await page.getByRole('button', { name: /Покормить/ }).click();
  await expect(scene).toHaveAttribute('data-mode', 'feed');
  await expect(page.locator('.world-food')).toHaveClass(/world-food--served/);
  await page.getByRole('button', { name: /Спать/ }).click();
  await expect(scene).toHaveAttribute('data-mode', 'sleep');
  const before = await page.locator('.world-chick-action').getAttribute('style');
  await page.mouse.click(rect.x + rect.width * .4, rect.y + rect.height * .7);
  await page.waitForTimeout(150);
  await expect(scene).toHaveAttribute('data-mode', 'sleep');
  expect(await page.locator('.world-chick-action').getAttribute('style')).toBe(before);
  for (const action of ['Покормить', 'Поиграть', 'Спать']) await expect(page.getByRole('button', { name: new RegExp(action) })).toBeDisabled();
});

test('reduced motion uses a still world with functional care', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedWorld(page);
  await page.goto('/');
  await expect(page.locator('.living-world')).toHaveAttribute('data-running', 'false');
  const before = await page.locator('.world-chick-action').getAttribute('style');
  await page.waitForTimeout(150);
  expect(await page.locator('.world-chick-action').getAttribute('style')).toBe(before);
  await page.getByRole('button', { name: /Покормить/ }).click();
  await expect(page.locator('.world-chick-action .chick-art')).toHaveAttribute('data-pose', 'feed');
  await page.getByRole('button', { name: /Спать/ }).click();
  await expect(page.locator('.world-chick-action .chick-art')).toHaveAttribute('data-pose', 'sleep');
});

test('Telegram deactivation and tab unmount stop the world RAF', async ({ page }) => {
  await seedWorld(page);
  await page.addInitScript(() => {
    const listeners = new Map<string, Set<() => void>>();
    const app = { initData: '', colorScheme: 'light', isActive: true, ready() {}, expand() {}, onEvent(event: string, listener: () => void) { const group = listeners.get(event) ?? new Set(); group.add(listener); listeners.set(event, group); }, offEvent(event: string, listener: () => void) { listeners.get(event)?.delete(listener); } };
    let calls = 0;
    const originalRaf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => { calls++; return originalRaf(callback); };
    Object.assign(window, { Telegram: { WebApp: app }, __worldRafCalls: () => calls, __worldSetActive: (active: boolean) => { app.isActive = active; listeners.get(active ? 'activated' : 'deactivated')?.forEach(listener => listener()); } });
  });
  const calls = () => page.evaluate(() => (window as unknown as { __worldRafCalls(): number }).__worldRafCalls());
  await page.goto('/');
  await expect(page.locator('.living-world')).toHaveAttribute('data-running', 'true');
  await page.evaluate(() => (window as unknown as { __worldSetActive(active: boolean): void }).__worldSetActive(false));
  await expect(page.locator('.living-world')).toHaveAttribute('data-running', 'false');
  const paused = await calls();
  await page.waitForTimeout(150);
  expect(await calls()).toBe(paused);
  await page.evaluate(() => (window as unknown as { __worldSetActive(active: boolean): void }).__worldSetActive(true));
  await expect(page.locator('.living-world')).toHaveAttribute('data-running', 'true');
  await expect.poll(calls).toBeGreaterThan(paused);
  await page.getByRole('button', { name: 'Коллекция', exact: true }).click();
  await expect(page.locator('.living-world')).toHaveCount(0);
  const unmounted = await calls();
  await page.waitForTimeout(150);
  expect(await calls()).toBe(unmounted);
});

test('largest adult head and tail remain inside the scene at its walk boundaries', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await seedWorld(page, true);
  await page.goto('/');
  const scene = page.locator('.living-world');
  await expect(page.locator('.world-chick-action .chick-art')).toHaveAttribute('data-stage', 'adult');
  const rect = (await scene.boundingBox())!;
  for (const point of [{ u: .28, v: .53 }, { u: .72, v: .53 }, { u: .5, v: .215 }, { u: .5, v: .84 }]) {
    const x = 11 + point.u * 78;
    const y = 55 + point.v * 31;
    await page.mouse.click(rect.x + rect.width * x / 100, rect.y + rect.height * y / 100);
    await expect.poll(() => page.locator('.world-chick-action').evaluate((node, goal) => Math.hypot(parseFloat((node as HTMLElement).style.left) - goal.x, parseFloat((node as HTMLElement).style.top) - goal.y), { x, y }), { timeout: 5000 }).toBeLessThan(.2);
    const bounds = await page.locator('.world-chick-action').evaluate(node => Array.from(node.querySelectorAll('.chick-v2-tail path,.chick-v2-crest path,.chick-v2-head>path:first-child')).map(part => { const box = part.getBoundingClientRect(); return { left: box.left, right: box.right, top: box.top, bottom: box.bottom }; }));
    for (const part of bounds) {
      expect(part.left).toBeGreaterThanOrEqual(rect.x - 1);
      expect(part.right).toBeLessThanOrEqual(rect.x + rect.width + 1);
      expect(part.top).toBeGreaterThanOrEqual(rect.y - 1);
      expect(part.bottom).toBeLessThanOrEqual(rect.y + rect.height + 1);
    }
  }
  await page.screenshot({ path: 'DOCS/qa/0.2/world-extreme-adult-320.png' });
});
