import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { operation } from '../helpers.js';
import { BALANCE } from '../../tgcloud/lib/domain.js';
import { bridge04, communityFixture, success, viewports04 } from './v04-fixtures';
import { expectNoNativeOverlap } from './v03-fixtures';

// This exercises the real built App and production SQLite services. Only the
// Telegram signature transport and capability hints are synthetic. It does not
// establish physical Android/iOS, signed Telegram, or device performance PASS.
function qa05Path(name: string) {
  const directory = process.env.CHIPPER_CAPTURE_QA === '1' ? 'DOCS/qa/0.5' : 'test-results/qa/0.5';
  mkdirSync(directory, { recursive: true });
  return join(directory, name);
}
async function capture(page: Page, info: TestInfo, name: string) {
  const path = qa05Path(`${name}.png`);
  await page.screenshot({ path, animations: 'disabled' });
  await info.attach(name, { path, contentType: 'image/png' });
}
async function forceGlassCapability(page: Page, memory = 8, saveData = false) {
  await page.addInitScript(({ memory, saveData }) => {
    Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: memory });
    Object.defineProperty(navigator, 'connection', { configurable: true, value: Object.assign(new EventTarget(), { saveData }) });
  }, { memory, saveData });
}
async function fits(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  const appScroll = await page.locator('.app').evaluate(node => ({ x: node.scrollLeft, y: node.scrollTop }));
  expect(appScroll, 'Focus and navigation must scroll the content, keeping the app/native frame stationary').toEqual({ x: 0, y: 0 });
  await expectNoNativeOverlap(page, ['.brand', '.feather-balance', '.app-header .icon-button']);
}
async function solidTextContrast(page: Page, text: string, surface: string) {
  return page.evaluate(({ text, surface }) => {
    const element = document.querySelector(text), background = document.querySelector(surface);
    if (!element || !background) throw new Error(`Missing contrast sample: ${text} / ${surface}`);
    const foreground = getComputedStyle(element).color, backdrop = getComputedStyle(background).backgroundColor;
    const channels = (color: string) => {
      const values = color.match(/[\d.]+/g)?.map(Number);
      if (!values || values.length < 3 || (values.length === 4 && values[3] !== 1)) throw new Error(`Expected an opaque RGB contrast sample: ${color}`);
      return values.slice(0, 3).map(value => value / 255);
    };
    const luminance = (color: string) => channels(color).reduce((sum, value, index) => sum + (value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][index], 0);
    const [low, high] = [luminance(foreground), luminance(backdrop)].sort((a, b) => a - b);
    return { text, surface, foreground, background: backdrop, ratio: (high + .05) / (low + .05) };
  }, { text, surface });
}
async function glassStyle(page: Page) {
  return page.locator('.bottom-dock').evaluate(node => {
    const style = getComputedStyle(node), reflection = getComputedStyle(node, '::before');
    return { supported: CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)'),
      backdrop: style.backdropFilter || style.getPropertyValue('-webkit-backdrop-filter'), background: style.backgroundColor,
      reflection: reflection.backgroundImage, reflectionDisplay: reflection.display, lens: getComputedStyle(node.querySelector('.dock-lens')!).transform };
  });
}

for (const viewport of viewports04) for (const theme of ['light', 'dark'] as const) {
  test(`v0.5 real App visual matrix ${theme} ${viewport.width}`, async ({ page, browser }, info) => {
    test.setTimeout(90000);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize(viewport);
    await forceGlassCapability(page);
    const f = communityFixture(); await f.friends();
    // Add the second owned bird through the real incubation/hatch rules.
    await f.seedFeathers(6);
    const buy = success(await f.dispatch('buyEgg', operation()));
    f.advance(BALANCE.incubationMs);
    success(await f.dispatch('hatchEgg', operation({ eggId: buy.result!.eggId })));
    await bridge04(page, f, { theme, native: true });
    const suffix = `native-${theme}-${viewport.width}`;
    const contrast: Awaited<ReturnType<typeof solidTextContrast>>[] = [];
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.locator('.bottom-dock button')).toHaveCount(5);
    await expect(page.locator('.dock-home')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.world-chick-action svg.chick-art')).toHaveAttribute('data-visual-version', '3');
    await fits(page, viewport.width);
    const geometry = await page.evaluate(() => {
      const rect = (selector: string) => { const box = document.querySelector(selector)!.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height, bottom: box.bottom }; };
      return { dock: rect('.bottom-dock'), summary: rect('.care-summary-toggle'), care: [...document.querySelectorAll('.care-button')].map(node => { const box = node.getBoundingClientRect(); return { width: box.width, height: box.height, bottom: box.bottom }; }),
        tabs: [...document.querySelectorAll('.bottom-dock button')].map(node => { const box = node.getBoundingClientRect(); return { width: box.width, height: box.height }; }),
        mainOverflow: document.querySelector('.app-main')!.scrollHeight - document.querySelector('.app-main')!.clientHeight };
    });
    expect(geometry.mainOverflow).toBeLessThanOrEqual(1);
    expect(geometry.summary.height).toBeGreaterThanOrEqual(44);
    expect(geometry.summary.bottom).toBeLessThanOrEqual(geometry.dock.y + 1);
    expect(viewport.height - geometry.dock.bottom).toBeGreaterThanOrEqual(20);
    for (const box of [...geometry.tabs, ...geometry.care]) { expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44); }
    for (const care of geometry.care) expect(care.bottom).toBeLessThanOrEqual(geometry.dock.y + 1);
    contrast.push(await solidTextContrast(page, '.home-heading h1', '.app'));
    contrast.push(await solidTextContrast(page, '.home-heading .stage-label', '.app'));
    await capture(page, info, `home-one-${suffix}`);
    const supportedGlass = await glassStyle(page);
    if (supportedGlass.supported) {
      expect(supportedGlass.backdrop).toContain('blur(');
      expect(supportedGlass.background).toMatch(/^rgba\(/);
      expect(supportedGlass.reflection).toContain('gradient');
    }

    await page.getByRole('button', { name: 'Ежедневный подарок', exact: true }).click();
    await expect(page.locator('.home-daily-panel')).toBeVisible();
    const panel = (await page.locator('.home-daily-panel').boundingBox())!;
    expect(panel.x).toBeGreaterThanOrEqual(0); expect(panel.x + panel.width).toBeLessThanOrEqual(viewport.width);
    await capture(page, info, `daily-${suffix}`);
    await page.getByRole('button', { name: 'Закрыть подарок', exact: true }).click();
    await page.getByRole('button', { name: 'Позвать друга', exact: true }).click();
    await page.getByRole('button', { name: 'Позвать: Гнездо Б', exact: true }).click();
    await expect(page.locator('.living-world')).toHaveAttribute('data-guest-count', '1');
    await expect(page.locator('.world-guest')).toHaveCount(1);
    await capture(page, info, `home-two-${suffix}`);

    await page.getByRole('button', { name: 'Коллекция', exact: true }).click();
    await expect(page.locator('.collection-card')).toHaveCount(2);
    await expect(page.locator('.bottom-dock')).toHaveCSS('--dock-index', '1');
    await fits(page, viewport.width);
    contrast.push(await solidTextContrast(page, '.collection-card strong', '.collection-card'));
    await capture(page, info, `collection-${suffix}`);
    await page.getByRole('button', { name: 'Сравнить', exact: true }).click();
    await expect(page.locator('.comparison-bird')).toHaveCount(2);
    expect(await page.locator('.comparison-bird').evaluateAll(nodes => new Set(nodes.map(node => node.getAttribute('data-chick-id'))).size)).toBe(2);
    await fits(page, viewport.width);
    await capture(page, info, `comparison-${suffix}`);
    await page.getByRole('tab', { name: /^Яйца/ }).click();
    await expect(page.locator('.incubator-screen')).toBeVisible();
    await capture(page, info, `incubator-${suffix}`);
    await page.getByRole('tab', { name: 'Кодекс', exact: true }).click();
    await expect(page.locator('.codex-trait')).toHaveCount(51);
    await fits(page, viewport.width);
    await capture(page, info, `codex-${suffix}`);

    await page.getByRole('button', { name: 'Профиль', exact: true }).click();
    await expect(page.locator('.telegram-identity-card')).toContainText('Алексей Тестовый');
    await expect(page.locator('.telegram-avatar')).toHaveAttribute('data-avatar', 'photo');
    await fits(page, viewport.width);
    contrast.push(await solidTextContrast(page, '.profile-stat span', '.profile-stat'));
    await capture(page, info, `profile-${suffix}`);
    await page.getByRole('button', { name: 'Настройки', exact: true }).click();
    await expect(page.locator('.settings-screen')).toBeVisible();
    await capture(page, info, `settings-${suffix}`);
    await page.getByRole('button', { name: 'Профиль', exact: true }).click();
    await page.getByRole('button', { name: 'Друзья и видимость', exact: true }).click();
    await expect(page.locator('.privacy-form')).toBeVisible();
    await fits(page, viewport.width);
    await capture(page, info, `social-${suffix}`);
    await page.getByRole('button', { name: 'Магазин', exact: true }).click();
    await expect(page.locator('.shop-screen')).toContainText('Скоро');
    await capture(page, info, `shop-${suffix}`);
    await page.getByRole('button', { name: 'Активности', exact: true }).click();
    await expect(page.locator('.activities-screen')).toBeVisible();
    await fits(page, viewport.width);
    await capture(page, info, `activities-${suffix}`);

    // Explicit fallback is tested after returning to the same real Home scene.
    await page.getByRole('button', { name: 'Дом', exact: true }).click();
    await page.evaluate(() => { document.documentElement.dataset.glass = 'off'; });
    const opaqueGlass = await glassStyle(page);
    expect(opaqueGlass.backdrop).toBe('none');
    expect(opaqueGlass.background).toMatch(/^rgb\(/);
    expect(opaqueGlass.reflectionDisplay).toBe('none');
    contrast.push(await solidTextContrast(page, '.dock-label', '.bottom-dock'));
    await capture(page, info, `glass-fallback-${suffix}`);
    for (const sample of contrast) expect(sample.ratio, `${sample.text} on ${sample.surface}`).toBeGreaterThanOrEqual(4.5);
    const metadata = qa05Path(`visual-${suffix}.json`);
    writeFileSync(metadata, `${JSON.stringify({ evidence: 'Actual Chromium rendering of built App with synthetic Telegram Android safe areas and real local SQLite services. Not physical-device, signed-live, or performance evidence.', browser: browser.version(), viewport, theme, geometry, supportedGlass, opaqueGlass,
      contrastScope: 'Computed text and opaque base surface colors; does not measure gradient/reflection pixels or antialiasing.', contrast, pageErrors: errors }, null, 2)}\n`);
    await info.attach(`visual-${suffix}`, { path: metadata, contentType: 'application/json' });
    expect(errors).toEqual([]);
  });
}

test('v0.5 reduced motion and native low-memory glass fallback retain navigation', async ({ page }, info) => {
  await page.setViewportSize(viewports04[0]);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await forceGlassCapability(page, 2);
  const f = communityFixture(); await f.initial();
  await bridge04(page, f, { theme: 'dark', native: true });
  await expect(page.locator('html')).toHaveAttribute('data-glass', 'off');
  await expect(page.locator('.living-world')).toHaveAttribute('data-running', 'false');
  expect((await glassStyle(page)).backdrop).toBe('none');
  await expect(page.locator('.dock-lens')).toHaveCSS('transition-duration', '0s');
  await page.getByRole('button', { name: 'Коллекция', exact: true }).click();
  await expect(page.locator('.bottom-dock')).toHaveCSS('--dock-index', '1');
  await expect(page.locator('.screen-transition')).toHaveCSS('animation-name', 'none');
  await fits(page, 320);
  await capture(page, info, 'reduced-motion-low-memory-native-dark-320');
});

for (const theme of ['light', 'dark'] as const) {
  test(`v0.5 Canvas game palettes and overlays ${theme}`, async ({ page }, info) => {
    await page.setViewportSize(viewports04[2]);
    const f = communityFixture(); await f.initial();
    await bridge04(page, f, { theme, native: true });
    await page.getByRole('button', { name: 'Активности', exact: true }).click();
    await page.getByRole('button', { name: 'Играть', exact: true }).click();
    await expect(page.locator('.flaps-game')).toHaveAttribute('data-phase', 'ready');
    expect(await page.locator('.app').evaluate(node => ({ x: node.scrollLeft, y: node.scrollTop }))).toEqual({ x: 0, y: 0 });
    await expectNoNativeOverlap(page, ['.flaps-toolbar .native-hud-primary', '.flaps-controls']);
    await capture(page, info, `flaps-ready-native-${theme}-390`);
    await page.getByRole('button', { name: 'Выйти из Chippster Flaps', exact: true }).click();
    await expect(page.locator('.activities-screen')).toBeVisible();
    await page.getByRole('button', { name: 'Защитить гнездо', exact: true }).click();
    await expect(page.locator('.tower-game')).toHaveAttribute('data-tower-state', 'build');
    expect(await page.locator('.app').evaluate(node => ({ x: node.scrollLeft, y: node.scrollTop }))).toEqual({ x: 0, y: 0 });
    await expectNoNativeOverlap(page, ['.tower-header .native-hud-primary', '.tower-hud']);
    await capture(page, info, `tower-build-native-${theme}-390`);
  });
}
