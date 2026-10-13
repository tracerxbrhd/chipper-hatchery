import { test, expect, type Page } from '@playwright/test';
import { fixture } from '../helpers.js';
import { writeFile } from 'node:fs/promises';
import { seed, storageKey } from './fixtures';
import { nativeBridge, qa03Path } from './v03-fixtures';
import type { ApiResult } from '../../src/types';

async function pickup(page: Page) {
  const actor = page.locator('.world-chick-action'); const box = (await actor.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await expect(page.locator('.living-world')).toHaveAttribute('data-gesture', 'held');
  return box;
}

test('v0.3 tap, stroke, hold, drag and landing are distinct presentation-only gestures', async ({ page }) => {
  await seed(page); await page.goto('/'); const scene = page.locator('.living-world');
  await expect(scene).toHaveAttribute('data-gesture', 'idle');
  const before = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).state, storageKey);
  const actor = page.locator('.world-chick-action'); const initial = await actor.getAttribute('style');
  await actor.click(); await expect(scene).toHaveAttribute('data-gesture', 'tap');
  expect(await actor.getAttribute('style')).toBe(initial);
  await expect(scene).toHaveAttribute('data-gesture', 'idle');
  let box = (await actor.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2, { steps: 3 });
  await expect(scene).toHaveAttribute('data-gesture', 'stroke'); await page.mouse.up();
  await expect(scene).toHaveAttribute('data-gesture', 'idle');
  box = await pickup(page); await page.screenshot({ path: qa03Path('touch-held-light.png') });
  await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 - 35, { steps: 6 });
  await expect(scene).toHaveAttribute('data-gesture', 'drag');
  const shadow = await page.locator('.world-shadow').getAttribute('style');
  expect(shadow ?? '').not.toContain('translateY(-');
  await page.screenshot({ path: qa03Path('touch-drag-light.png') });
  await page.mouse.up(); await expect(scene).toHaveAttribute('data-gesture', 'land');
  await expect(scene).toHaveAttribute('data-gesture', 'idle');
  const after = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).state, storageKey);
  expect(after.player.feathers).toBe(before.player.feathers);
  expect(after.player.careRewardAt).toBe(before.player.careRewardAt);
  expect(after.player.miniGameRewardAt).toBe(before.player.miniGameRewardAt);
  expect(after.chicks[0].genes).toEqual(before.chicks[0].genes);
  expect(after.chicks[0].lastFeedAt).toBe(before.chicks[0].lastFeedAt);
  expect(after.chicks[0].lastPlayAt).toBe(before.chicks[0].lastPlayAt);
});

test('v0.3 drag stays inside scene, cancellation and second pointer release capture safely', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 }); await seed(page); await page.goto('/');
  const scene = page.locator('.living-world'); await pickup(page);
  await page.mouse.move(1, 1, { steps: 5 }); await expect(scene).toHaveAttribute('data-gesture', 'drag');
  const bounds = (await scene.boundingBox())!;
  // The transparent SVG viewBox is larger than its anatomy. Visible extrema
  // must stay inside the scene; the empty viewBox is not a collision boundary.
  const anatomy = await page.locator('.world-chick-action').evaluate(node => Array.from(node.querySelectorAll('.chick-v2-tail path,.chick-v2-crest path,.chick-v2-head>path:first-child')).map(part => { const box = part.getBoundingClientRect(); return { left: box.left, right: box.right, top: box.top }; }));
  for (const part of anatomy) { expect(part.left).toBeGreaterThanOrEqual(bounds.x - 1); expect(part.right).toBeLessThanOrEqual(bounds.x + bounds.width + 1); expect(part.top).toBeGreaterThanOrEqual(bounds.y - 1); }
  await page.locator('.world-chick-action').dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse', isPrimary: true });
  await page.mouse.up(); await expect(scene).toHaveAttribute('data-gesture', 'idle');
  await pickup(page);
  await page.locator('.world-chick-action').dispatchEvent('pointerdown', { pointerId: 2, pointerType: 'touch', isPrimary: false, clientX: 160, clientY: 200 });
  await page.mouse.up(); await expect(scene).toHaveAttribute('data-gesture', 'idle');
  await pickup(page); await page.getByRole('button', { name: 'Коллекция', exact: true }).click();
  await expect(scene).toHaveCount(0); await page.mouse.up();
  await page.getByRole('button', { name: 'Дом', exact: true }).click(); await expect(scene).toHaveAttribute('data-gesture', 'idle');
});

test('v0.3 Telegram background cleanup releases a held chick and sleep forbids pickup', async ({ page }) => {
  const f = fixture(); await f.initial();
  await nativeBridge(page, async (method, input) => await f.call(method, input) as ApiResult);
  const scene = page.locator('.living-world'); await pickup(page);
  await page.evaluate(() => { window.Telegram!.WebApp!.isActive = false; window.telegramEvents.deactivated?.(); });
  await expect(scene).toHaveAttribute('data-gesture', 'idle'); await expect(scene).toHaveAttribute('data-running', 'false'); await page.mouse.up();
  await page.evaluate(() => { window.Telegram!.WebApp!.isActive = true; window.telegramEvents.activated?.(); });
  await expect(scene).toHaveAttribute('data-running', 'true');
  await page.getByRole('button', { name: /Спать/ }).click(); await expect(scene).toHaveAttribute('data-mode', 'sleep');
  await expect(page.locator('.world-chick-action')).toBeDisabled();
  await expect(scene).toHaveAttribute('data-gesture', 'idle');
});

test('v0.3 reduced-motion hold still works without a perpetual animation loop', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await seed(page); await page.goto('/');
  const scene = page.locator('.living-world'); await expect(scene).toHaveAttribute('data-running', 'false');
  await pickup(page); await page.mouse.up(); await expect(scene).toHaveAttribute('data-gesture', 'idle');
  await expect(scene).toHaveAttribute('data-running', 'false');
});

test('v0.3 measured browser perf stays bounded and deactivation stops RAF scheduling', async ({ page }) => {
  const f = fixture(); await f.initial();
  await page.addInitScript(() => {
    const original = window.requestAnimationFrame.bind(window); let scheduled = 0;
    window.requestAnimationFrame = callback => { scheduled++; return original(callback); };
    Object.assign(window, { __qaRafScheduled: () => scheduled });
  });
  await nativeBridge(page, async (method, input) => await f.call(method, input) as ApiResult);
  const scene = page.locator('.living-world'); await expect(scene).toHaveAttribute('data-running', 'true');
  const metrics = await page.evaluate(async () => {
    const initialNodes = document.querySelectorAll('*').length; const frameIntervals: number[] = []; const longTasks: number[] = [];
    let previous = performance.now(); let frame = 0;
    const observer = new PerformanceObserver(list => { for (const item of list.getEntries()) longTasks.push(item.duration); });
    if (PerformanceObserver.supportedEntryTypes.includes('longtask')) observer.observe({ type: 'longtask' });
    const sample = (time: number) => { frameIntervals.push(time - previous); previous = time; frame = requestAnimationFrame(sample); };
    frame = requestAnimationFrame(sample); await new Promise<void>(resolve => setTimeout(resolve, 5000));
    cancelAnimationFrame(frame); observer.disconnect(); frameIntervals.sort((a, b) => a - b);
    return { durationMs: 5000, initialNodes, finalNodes: document.querySelectorAll('*').length, frames: frameIntervals.length, frameIntervalP95Ms: frameIntervals[Math.floor(frameIntervals.length * .95)] ?? null, longTaskCount: longTasks.length, maxLongTaskMs: Math.max(0, ...longTasks) };
  });
  expect(metrics.finalNodes).toBeLessThan(metrics.initialNodes + 30); expect(metrics.frames).toBeGreaterThan(100); expect(metrics.maxLongTaskMs).toBeLessThan(1500);
  await page.evaluate(() => { window.Telegram!.WebApp!.isActive = false; window.telegramEvents.deactivated?.(); });
  await expect(scene).toHaveAttribute('data-running', 'false'); await page.waitForTimeout(200);
  const scheduled = () => page.evaluate(() => (window as unknown as { __qaRafScheduled(): number }).__qaRafScheduled());
  const pausedCount = await scheduled(); await page.waitForTimeout(300); expect(await scheduled()).toBe(pausedCount);
  await writeFile(qa03Path('perf-smoke.json'), JSON.stringify({ kind: 'local Chromium153 synthetic Telegram smoke; not physical-device FPS or signed live evidence', ...metrics, hiddenSampleMs: 300, hiddenRafScheduled: 0 }, null, 2));
});
