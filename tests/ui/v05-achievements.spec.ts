import { test, expect } from '@playwright/test';
import { operation } from '../helpers.js';
import { nativeBridge } from './v03-fixtures';
import { communityFixture, success } from './v04-fixtures';

// Local SQLite production-service evidence with synthetic Telegram transport.
// The delayed response proves the client never marks a claim paid optimistically.
test('v0.5 achievements show authoritative progress, wait for claim and survive reload', async ({ page }) => {
  const f = communityFixture(); const chickId = await f.initial();
  f.users.set(101, { first_name: 'Хранитель достижений' });
  success(await f.dispatch('careAction', operation({ chickId, action: 'feed' })));
  const before = (await f.store.read('101')).state.player.feathers;
  let releaseClaim: () => void = () => {};
  const heldResponse = new Promise<void>(resolve => { releaseClaim = resolve; });
  let requestSeen = false;
  await nativeBridge(page, async (method, input) => {
    if (method === 'claimAchievement') { requestSeen = true; await heldResponse; }
    return await f.dispatch(method, input);
  });
  await page.getByRole('button', { name: 'Профиль', exact: true }).click();
  const unlocked = page.locator('[data-achievement-id="first-feed"]');
  const locked = page.locator('[data-achievement-id="flaps-ten"]');
  await expect(page.locator('.achievement-card')).toHaveCount(12);
  await expect(unlocked).toHaveAttribute('data-achievement-state', 'unlocked');
  await expect(unlocked.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  await expect(locked).toHaveAttribute('data-achievement-state', 'locked');
  await expect(locked.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  await expect(locked.getByRole('button')).toHaveCount(0);
  await unlocked.getByRole('button', { name: /Забрать награду/ }).click();
  await expect.poll(() => requestSeen).toBe(true);
  await expect(unlocked.getByRole('button')).toBeDisabled();
  await expect(unlocked).toHaveAttribute('data-achievement-state', 'unlocked');
  expect((await f.store.read('101')).state.player.feathers).toBe(before);
  releaseClaim();
  await expect(unlocked).toHaveAttribute('data-achievement-state', 'claimed');
  await expect(unlocked.getByText('Награда получена')).toBeVisible();
  await expect(unlocked.getByRole('button')).toHaveCount(0);
  expect((await f.store.read('101')).state.player.feathers).toBe(before + 1);
  await page.reload();
  await expect(page.locator('.home-screen')).toBeVisible();
  await page.getByRole('button', { name: 'Профиль', exact: true }).click();
  await expect(page.locator('[data-achievement-id="first-feed"]')).toHaveAttribute('data-achievement-state', 'claimed');
  expect((await f.store.read('101')).state.player.feathers).toBe(before + 1);
});
