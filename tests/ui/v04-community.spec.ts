import { test, expect, type Page } from '@playwright/test';
import { operation } from '../helpers.js';
import { communityFixture, bridge04, qa04Path, success, viewports04 } from './v04-fixtures';
import { expectNoNativeOverlap, nativeOverlay } from './v03-fixtures';

async function profile(page: Page) {
  await page.getByRole('button', { name: 'Профиль', exact: true }).click();
  await expect(page.locator('.telegram-identity-card')).toBeVisible();
}
async function inviteGuest(page: Page, displayName = 'Гнездо Б') {
  await page.getByRole('button', { name: 'Позвать друга', exact: true }).click();
  await page.getByRole('button', { name: `Позвать: ${displayName}`, exact: true }).click();
  await expect(page.locator('.living-world')).toHaveAttribute('data-guest-count', '1');
  await expect(page.locator('.world-guest')).toHaveCount(1);
}
async function fits(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await expectNoNativeOverlap(page, ['.brand', '.feather-balance', '.app-header .icon-button']);
}
async function homeControlsFit(page: Page) {
  const summary = await page.locator('.care-summary-toggle').boundingBox();
  const dock = await page.locator('.bottom-dock').boundingBox();
  expect(summary).not.toBeNull(); expect(dock).not.toBeNull();
  expect(summary!.height).toBeGreaterThanOrEqual(44);
  expect(summary!.y + summary!.height, 'Care summary must remain fully reachable above the dock after adding daily').toBeLessThanOrEqual(dock!.y + 1);
}

for (const viewport of viewports04) for (const theme of ['light', 'dark'] as const) {
  test(`v0.4 native mobile community surfaces ${theme} ${viewport.width}`, async ({ page }) => {
    test.setTimeout(90000);
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize(viewport);
    const f = communityFixture(); await f.friends();
    await bridge04(page, f, { theme, native: true });
    await expect(page.locator('.living-world')).toHaveAttribute('data-guest-count', '0');
    await expect(page.getByRole('button', { name: 'Ежедневный подарок', exact: true })).toBeVisible();
    await fits(page, viewport.width);
    await homeControlsFit(page);
    await page.screenshot({ path: qa04Path(`home-one-daily-native-${theme}-${viewport.width}.png`) });
    await page.getByRole('button', { name: 'Ежедневный подарок', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Забрать ежедневный подарок: 1 пёрышко', exact: true })).toBeVisible();
    const giftPanel = (await page.locator('.home-daily-panel').boundingBox())!;
    expect(giftPanel.x, 'Daily panel must not be cropped by the left viewport edge').toBeGreaterThanOrEqual(0);
    expect(giftPanel.x + giftPanel.width).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({ path: qa04Path(`daily-available-native-${theme}-${viewport.width}.png`) });
    await page.getByRole('button', { name: 'Закрыть подарок', exact: true }).click();
    await inviteGuest(page);
    await fits(page, viewport.width);
    const birds = await page.locator('.world-chick-action,.world-guest').evaluateAll(nodes => nodes.map(node => { const box = node.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height }; }));
    expect(birds).toHaveLength(2);
    for (const bird of birds) { expect(bird.width).toBeGreaterThan(60); expect(bird.x).toBeLessThan(viewport.width); expect(bird.x + bird.width).toBeGreaterThan(0); }
    await page.screenshot({ path: qa04Path(`home-two-native-${theme}-${viewport.width}.png`) });
    await page.getByRole('button', { name: 'Ежедневный подарок', exact: true }).click();
    await page.getByRole('button', { name: 'Забрать ежедневный подарок: 1 пёрышко', exact: true }).click();
    await expect(page.locator('.daily-bonus')).toContainText('Подарок получен');
    expect((await f.store.read('101')).state.player.feathers).toBe(1);
    await expect(page.locator('.toast')).toHaveCount(0);
    await page.screenshot({ path: qa04Path(`daily-claimed-native-${theme}-${viewport.width}.png`) });
    await page.getByRole('button', { name: 'Закрыть подарок', exact: true }).click();
    await homeControlsFit(page);
    await page.getByRole('button', { name: 'Коллекция', exact: true }).click();
    await page.getByRole('tab', { name: 'Кодекс', exact: true }).click();
    await expect(page.locator('.trait-codex')).toBeVisible();
    await expect(page.locator('.codex-category')).toHaveCount(10);
    await expect(page.locator('.codex-trait')).toHaveCount(51);
    expect(await page.locator('.codex-trait.found').count()).toBeGreaterThan(0);
    expect(await page.locator('.codex-trait.locked').count()).toBeGreaterThan(0);
    await fits(page, viewport.width);
    await page.screenshot({ path: qa04Path(`codex-native-${theme}-${viewport.width}.png`) });
    await page.locator('.codex-category').first().evaluate(node => node.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: qa04Path(`codex-traits-native-${theme}-${viewport.width}.png`) });
    await profile(page);
    await expect(page.locator('.telegram-identity-card')).toContainText('Алексей Тестовый');
    await expect(page.locator('.telegram-identity-card')).toContainText('@chipper_test_A');
    await expect(page.locator('.telegram-avatar')).toHaveAttribute('data-avatar', 'photo');
    await expect(page.locator('.telegram-avatar img')).toBeVisible();
    await fits(page, viewport.width);
    await page.screenshot({ path: qa04Path(`profile-photo-native-${theme}-${viewport.width}.png`) });
    f.users.set(101, { first_name: 'Алексей', last_name: 'Тестовый' });
    await page.reload(); await nativeOverlay(page); await profile(page);
    await expect(page.locator('.telegram-avatar')).toHaveAttribute('data-avatar', 'initials');
    await expect(page.locator('.telegram-identity-card')).toContainText('Без @username');
    await fits(page, viewport.width);
    await page.screenshot({ path: qa04Path(`profile-fallback-native-${theme}-${viewport.width}.png`) });
    expect(errors).toEqual([]);
  });
}

test('v0.4 guest stays read-only, swaps exactly one bird and disappears after peer revoke', async ({ page }) => {
  await page.setViewportSize(viewports04[0]);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const f = communityFixture(); const b = await f.friends(); await f.friends(101, 303);
  await bridge04(page, f, { theme: 'dark', native: true }); await inviteGuest(page);
  const before = structuredClone((await f.store.read('202')).state);
  const own = page.locator('.world-chick-action');
  const ownerBeforeTouch = structuredClone((await f.store.read('101')).state.chicks);
  await own.click(); await expect(page.locator('.living-world')).toHaveAttribute('data-gesture', 'tap');
  await expect(page.locator('.living-world')).toHaveAttribute('data-gesture', 'idle');
  const ownerBox = (await own.boundingBox())!;
  await page.mouse.move(ownerBox.x + ownerBox.width / 2, ownerBox.y + ownerBox.height / 2); await page.mouse.down();
  await expect(page.locator('.living-world')).toHaveAttribute('data-gesture', 'held');
  await page.mouse.move(ownerBox.x + ownerBox.width / 2 + 30, ownerBox.y + ownerBox.height / 2 - 16, { steps: 4 });
  await expect(page.locator('.living-world')).toHaveAttribute('data-gesture', 'drag');
  await page.mouse.up(); await expect(page.locator('.living-world')).toHaveAttribute('data-gesture', 'idle');
  expect((await f.store.read('101')).state.chicks).toEqual(ownerBeforeTouch);
  await expect(page.locator('.living-world')).toHaveAttribute('data-guest-count', '1');
  await page.locator('.world-guest').dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 250, clientY: 250, isPrimary: true });
  await page.locator('.world-guest').dispatchEvent('pointermove', { pointerId: 1, pointerType: 'touch', clientX: 40, clientY: 400, isPrimary: true });
  await page.locator('.world-guest').dispatchEvent('pointerup', { pointerId: 1, pointerType: 'touch', clientX: 40, clientY: 400, isPrimary: true });
  await expect(page.locator('.living-world')).toHaveAttribute('data-gesture', 'idle');
  expect((await f.store.read('202')).state).toEqual(before);
  await page.getByRole('button', { name: 'Гость на поляне', exact: true }).click();
  await page.getByRole('button', { name: 'Позвать: Гнездо В', exact: true }).click();
  await expect(page.locator('.world-guest')).toHaveCount(1);
  await expect(page.locator('.world-guest')).toHaveAttribute('aria-label', /Гнездо В/);
  await page.getByRole('button', { name: 'Гость на поляне', exact: true }).click();
  await page.getByRole('button', { name: 'Позвать: Гнездо Б', exact: true }).click();
  success(await f.dispatch('updatePrivacy', operation({ visibility: 'private', collectionVisibility: 'private' }), 202));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('.world-guest')).toHaveCount(0);
  await expect(page.locator('.living-world')).toHaveAttribute('data-guest-count', '0');
  const denied = await f.dispatch('getGuestChick', { profileId: b }); expect(denied.ok).toBe(false);
});

test('v0.4 broken photo and Telegram-account switch discard old private profile hints', async ({ page }) => {
  const f = communityFixture(); await f.initial(); await f.initial(202);
  await bridge04(page, f, { theme: 'light', brokenPhoto: true }); await profile(page);
  await expect(page.locator('.telegram-avatar')).toHaveAttribute('data-avatar', 'initials');
  await expect(page.locator('.telegram-avatar img')).toHaveCount(0);
  await page.evaluate(() => {
    Object.assign(window.Telegram!.WebApp!.initDataUnsafe!, { user: { id: 101, first_name: 'FORGED UNSAFE', username: 'forged_tag' } });
    window.Telegram!.WebApp!.initData = 'synthetic-test-B';
    window.dispatchEvent(new Event('focus'));
  });
  await expect(page.locator('.home-screen')).toBeVisible(); await profile(page);
  await expect(page.locator('.telegram-identity-card')).toContainText('Белла Тестовая');
  await expect(page.locator('.telegram-identity-card')).not.toContainText('Алексей');
  await expect(page.locator('.telegram-identity-card')).not.toContainText('chipper_test_A');
  await expect(page.locator('.telegram-identity-card')).not.toContainText('FORGED');
  await expect(page.locator('.telegram-avatar img')).toHaveCount(0);
});
