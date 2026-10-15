import { test, expect, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { communityFixture, bridge04, qa04Path } from './v04-fixtures';

async function sample(page: Page) {
  return page.evaluate(async () => {
    const initialNodes = document.querySelectorAll('*').length, intervals: number[] = [], longTasks: number[] = [];
    let previous = performance.now(), frame = 0;
    const observer = new PerformanceObserver(list => { for (const entry of list.getEntries()) longTasks.push(entry.duration); });
    if (PerformanceObserver.supportedEntryTypes.includes('longtask')) observer.observe({ type: 'longtask' });
    const update = (now: number) => { intervals.push(now - previous); previous = now; frame = requestAnimationFrame(update); };
    frame = requestAnimationFrame(update);
    await new Promise<void>(resolve => setTimeout(resolve, 2500)); cancelAnimationFrame(frame); observer.disconnect();
    intervals.sort((a, b) => a - b);
    return { sampleMs: 2500, initialNodes, finalNodes: document.querySelectorAll('*').length, frames: intervals.length,
      frameIntervalP95Ms: intervals[Math.floor(intervals.length * .95)] ?? null,
      longTaskCount: longTasks.length, maxLongTaskMs: Math.max(0, ...longTasks),
      heapBytes: (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null };
  });
}
async function scheduled(page: Page) { return page.evaluate(() => (window as unknown as { __qaRAFCount(): number }).__qaRAFCount()); }
async function background(page: Page) {
  await page.evaluate(() => { window.Telegram!.WebApp!.isActive = false; window.telegramEvents.deactivated?.(); });
  await page.waitForTimeout(250);
  const before = await scheduled(page); await page.waitForTimeout(350); const after = await scheduled(page);
  expect(after, 'Hidden/deactivated scenes must stop scheduling requestAnimationFrame').toBe(before);
  return { hiddenSampleMs: 350, hiddenRafScheduled: after - before };
}

test('v0.4 measured pair and Tower browser work stays bounded and background RAF stops', async ({ page, browser }) => {
  test.setTimeout(60000);
  await page.addInitScript(() => {
    const original = window.requestAnimationFrame.bind(window); let count = 0;
    window.requestAnimationFrame = callback => { count++; return original(callback); };
    Object.assign(window, { __qaRAFCount: () => count });
  });
  const f = communityFixture(); await f.friends();
  await bridge04(page, f, { theme: 'dark', native: true });
  await page.getByRole('button', { name: 'Позвать друга', exact: true }).click();
  await page.getByRole('button', { name: 'Позвать: Гнездо Б', exact: true }).click();
  await expect(page.locator('.living-world')).toHaveAttribute('data-guest-count', '1');
  const pair = await sample(page);
  expect(pair.finalNodes).toBeLessThanOrEqual(pair.initialNodes + 30); expect(pair.frames).toBeGreaterThan(20);
  const pairPaused = await background(page);
  await expect(page.locator('.living-world')).toHaveAttribute('data-running', 'false');
  await page.evaluate(() => { window.Telegram!.WebApp!.isActive = true; window.telegramEvents.activated?.(); });
  await page.getByRole('button', { name: 'Активности', exact: true }).click();
  await page.getByRole('button', { name: 'Защитить гнездо', exact: true }).click();
  await expect(page.locator('.tower-game')).toHaveAttribute('data-tower-state', 'build');
  await page.getByRole('button', { name: 'Начать волну 1', exact: true }).click();
  await expect(page.locator('.tower-game')).toHaveAttribute('data-tower-state', 'playing');
  const tower = await sample(page);
  expect(tower.finalNodes).toBeLessThanOrEqual(tower.initialNodes + 15); expect(tower.frames).toBeGreaterThan(20);
  const towerPaused = await background(page);
  await expect(page.locator('.tower-game')).toHaveAttribute('data-tower-state', 'paused');
  const tick = await page.locator('.tower-game').getAttribute('data-tick'); await page.waitForTimeout(300);
  await expect(page.locator('.tower-game')).toHaveAttribute('data-tick', tick!);
  await writeFile(qa04Path('browser-perf.json'), JSON.stringify({ evidence: 'Headless Chromium with synthetic Telegram Android host and real local SQLite production services; not physical-device FPS or signed live acceptance', chromium: browser.version(), viewport: { width: 390, height: 844 }, pair: { ...pair, ...pairPaused }, tower: { ...tower, ...towerPaused } }, null, 2));
});
