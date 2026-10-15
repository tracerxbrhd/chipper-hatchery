import { test, expect, type Page } from '@playwright/test';
import { generateTowerMap } from '../../tgcloud/lib/towerRules.js';
import { communityFixture, bridge04, qa04Path, viewports04 } from './v04-fixtures';
import { expectNoNativeOverlap } from './v03-fixtures';

async function enterTower(page: Page) {
  await page.getByRole('button', { name: 'Активности', exact: true }).click();
  await page.getByRole('button', { name: 'Защитить гнездо', exact: true }).click();
  await expect(page.locator('.tower-game')).toBeVisible();
  await expect(page.locator('.bottom-dock')).toHaveCount(0);
}
async function cell(page: Page, position: { x: number; y: number }) {
  const surface = page.getByRole('application', { name: 'Поле защиты гнезда', exact: true });
  const box = (await surface.boundingBox())!;
  await surface.click({ position: { x: box.width * (position.x + .5) / 10, y: box.height * (position.y + .5) / 14 } });
}
function active(f: ReturnType<typeof communityFixture>) {
  const row = f.sqlite.prepare("SELECT run_id,seed,checkpoint_json FROM chipper_tower_runs WHERE telegram_id=101 AND status='active'").get() as { run_id: string; seed: number; checkpoint_json: string };
  return { runId: row.run_id, seed: row.seed, state: JSON.parse(row.checkpoint_json) };
}
async function retire(page: Page) {
  await page.getByRole('button', { name: 'Завершить партию', exact: true }).click();
  await page.getByRole('button', { name: 'Завершить и получить результат', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Результат защиты гнезда', exact: true })).toBeVisible();
}

for (const viewport of viewports04) for (const theme of ['light', 'dark'] as const) {
  test(`v0.4 tower build wave pause result ${theme} ${viewport.width}`, async ({ page }) => {
    test.setTimeout(60000);
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize(viewport);
    const f = communityFixture(); await f.initial();
    await bridge04(page, f, { theme, native: true }); await enterTower(page);
    await expect(page.locator('.tower-game')).toHaveAttribute('data-tower-state', 'build');
    await expectNoNativeOverlap(page, ['.tower-header .native-hud-primary', '.tower-hud']);
    expect(await page.locator('.tower-header h1').evaluate(node => node.scrollWidth <= node.clientWidth + 1), 'Tower title must fit without truncation').toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    const map = generateTowerMap(active(f).seed);
    await cell(page, map.path[2]);
    await expect(page.locator('.tower-selection')).toContainText('строить нельзя');
    await expect(page.getByRole('button', { name: 'Поставить за 40', exact: true })).toHaveCount(0);
    await cell(page, map.buildable[0]);
    await page.getByRole('button', { name: 'Поставить за 40', exact: true }).click();
    await expect(page.locator('.tower-selection')).toContainText('Клюв · ур. 1/3');
    await page.screenshot({ path: qa04Path(`tower-build-native-${theme}-${viewport.width}.png`) });
    await page.getByRole('button', { name: 'Начать волну 1', exact: true }).click();
    await expect(page.locator('.tower-game')).toHaveAttribute('data-tower-state', 'playing');
    await expect.poll(async () => Number(await page.locator('.tower-game').getAttribute('data-tick'))).toBeGreaterThan(15);
    await page.screenshot({ path: qa04Path(`tower-wave-native-${theme}-${viewport.width}.png`) });
    await page.getByRole('button', { name: 'Пауза', exact: true }).click();
    await expect(page.locator('.tower-game')).toHaveAttribute('data-tower-state', 'paused');
    const tick = await page.locator('.tower-game').getAttribute('data-tick');
    await page.waitForTimeout(350);
    await expect(page.locator('.tower-game')).toHaveAttribute('data-tick', tick!);
    await page.screenshot({ path: qa04Path(`tower-paused-native-${theme}-${viewport.width}.png`) });
    await retire(page);
    expect((await f.store.read('101')).state.player.feathers).toBe(0);
    await page.screenshot({ path: qa04Path(`tower-result-native-${theme}-${viewport.width}.png`) });
    await page.getByRole('button', { name: 'К активностям', exact: true }).click();
    await expect(page.locator('.activities-screen')).toBeVisible(); expect(errors).toEqual([]);
  });
}

test('v0.4 actual wave proof survives save exit and browser reload then retires once', async ({ page }) => {
  test.setTimeout(90000);
  const f = communityFixture(); await f.initial();
  await bridge04(page, f, { theme: 'dark', native: true }); await enterTower(page);
  const initial = active(f), map = generateTowerMap(initial.seed);
  const sites = [...map.buildable].sort((a, b) => {
    const coverage = (site: { x: number; y: number }) => map.path.slice(0, 18).filter(part => Math.hypot(part.x - site.x, part.y - site.y) < 2.4).length;
    return coverage(b) - coverage(a) || a.y - b.y || a.x - b.x;
  }).slice(0, 3);
  for (const site of sites) { await cell(page, site); await page.getByRole('button', { name: 'Поставить за 40', exact: true }).click(); }
  await page.getByRole('button', { name: 'Начать волну 1', exact: true }).click();
  await expect(page.locator('.tower-game')).toHaveAttribute('data-tower-state', 'playing');
  await expect.poll(async () => Number(await page.locator('.tower-game').getAttribute('data-tick'))).toBeGreaterThan(20);
  await page.evaluate(() => { window.Telegram!.WebApp!.isActive = false; window.telegramEvents.deactivated?.(); });
  await expect(page.locator('.tower-game')).toHaveAttribute('data-tower-state', 'paused');
  const persisted = active(f);
  expect(persisted.state.tick).toBeGreaterThan(0); expect(persisted.state.towers).toHaveLength(3);
  const hp = persisted.state.hp, tick = persisted.state.tick;
  await page.waitForTimeout(500);
  expect(active(f).state.tick).toBe(tick); expect(active(f).state.hp).toBe(hp);
  await page.evaluate(() => { window.Telegram!.WebApp!.isActive = true; window.telegramEvents.activated?.(); });
  await page.getByRole('button', { name: 'Сохранить и выйти', exact: true }).click();
  await expect(page.locator('.activities-screen')).toBeVisible();
  await page.reload(); await expect(page.locator('.home-screen')).toBeVisible(); await enterTower(page);
  await expect(page.locator('.tower-game')).toHaveAttribute('data-tower-state', 'paused');
  expect(active(f).runId).toBe(initial.runId);
  await page.getByRole('button', { name: 'Продолжить защиту', exact: true }).click();
  await expect(page.locator('.tower-game')).toHaveAttribute('data-tower-state', 'playing');
  await expect(page.getByRole('button', { name: 'Начать волну 2', exact: true })).toBeEnabled({ timeout: 45000 });
  expect(active(f).state.completedWave).toBe(1);
  await page.screenshot({ path: qa04Path('tower-recovered-wave-one-dark-390.png') });
  for (const wave of [2, 3]) {
    await cell(page, sites[wave - 2]);
    await page.getByRole('button', { name: 'Улучшить за 28', exact: true }).click();
    await page.getByRole('button', { name: `Начать волну ${wave}`, exact: true }).click();
    await expect(page.getByRole('button', { name: `Начать волну ${wave + 1}`, exact: true })).toBeEnabled({ timeout: 45000 });
    expect(active(f).state.completedWave).toBe(wave);
  }
  await page.getByRole('button', { name: 'Выйти из защиты гнезда', exact: true }).click();
  await page.getByRole('button', { name: 'Завершить и получить результат', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Результат защиты гнезда', exact: true })).toBeVisible();
  const state = (await f.store.read('101')).state;
  expect(state.player.games['nest-defense'].bestScore).toBe(3);
  expect(state.player.games['nest-defense'].completedRuns).toBe(1);
  expect(state.player.feathers).toBe(1);
  expect(state.player.games['chippster-flaps'].lastRewardAt).toBeNull();
  expect(state.player.dailyBonus?.lastClaimAt ?? null).toBeNull();
  await page.screenshot({ path: qa04Path('tower-recovered-reward-three-dark-390.png') });
});

test('v0.4 lost committed checkpoint and finish responses retry the exact intent once', async ({ page }) => {
  const f = communityFixture(); await f.initial();
  const dispatch = f.dispatch, checkpointInputs: Record<string, unknown>[] = [], finishInputs: Record<string, unknown>[] = [];
  let loseCheckpoint = true, loseFinish = true;
  f.dispatch = async (method, input = {}, owner = 101) => {
    const response = await dispatch(method, input, owner);
    if (method === 'checkpointTowerRun') checkpointInputs.push(structuredClone(input));
    if (method === 'finishTowerRun') finishInputs.push(structuredClone(input));
    if (response.ok && ((method === 'checkpointTowerRun' && loseCheckpoint) || (method === 'finishTowerRun' && loseFinish))) {
      if (method === 'checkpointTowerRun') loseCheckpoint = false; else loseFinish = false;
      return { ok: false, error: { code: 'NETWORK', message: 'Синтетически потерян ответ после реального commit.', retryable: true } };
    }
    return response;
  };
  await bridge04(page, f, { theme: 'dark' }); await enterTower(page);
  const site = generateTowerMap(active(f).seed).buildable[0];
  await cell(page, site); await page.getByRole('button', { name: 'Поставить за 40', exact: true }).click();
  await expect(page.locator('.tower-game')).toHaveAttribute('data-tower-state', 'error');
  expect(active(f).state.towers).toHaveLength(1); expect(active(f).state.coins).toBe(80);
  await page.getByRole('button', { name: 'Повторить сохранение', exact: true }).click();
  await expect(page.locator('.tower-game')).toHaveAttribute('data-tower-state', 'paused');
  expect(checkpointInputs).toHaveLength(2); expect(checkpointInputs[1]).toEqual(checkpointInputs[0]);
  await page.getByRole('button', { name: 'Продолжить защиту', exact: true }).click();
  await expect(page.locator('.tower-game')).toHaveAttribute('data-tower-state', 'build');
  expect(active(f).state.towers).toHaveLength(1); expect(active(f).state.coins).toBe(80);
  await page.getByRole('button', { name: 'Выйти из защиты гнезда', exact: true }).click();
  await page.getByRole('button', { name: 'Завершить и получить результат', exact: true }).click();
  await expect(page.locator('.tower-game')).toHaveAttribute('data-tower-state', 'error');
  expect((await f.store.read('101')).state.player.games['nest-defense'].completedRuns).toBe(1);
  await page.getByRole('button', { name: 'Повторить сохранение', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Результат защиты гнезда', exact: true })).toBeVisible();
  expect(finishInputs).toHaveLength(2); expect(finishInputs[1]).toEqual(finishInputs[0]);
  expect((await f.store.read('101')).state.player.games['nest-defense'].completedRuns).toBe(1);
  expect((await f.store.read('101')).state.player.feathers).toBe(0);
});

test('v0.4 Tower keeps working with reduced motion and sound and haptics disabled', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    localStorage.setItem('chipper:preferences', JSON.stringify({ sound: false, haptics: false, animation: false }));
    let audioContexts = 0;
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: class { constructor() { audioContexts++; throw new Error('Unexpected disabled audio'); } } });
    Object.assign(window, { __qaAudioContexts: () => audioContexts });
  });
  const f = communityFixture(); await f.initial();
  await bridge04(page, f, { theme: 'dark' }); await enterTower(page);
  await expect(page.locator('.app')).toHaveAttribute('data-motion', 'off');
  await cell(page, generateTowerMap(active(f).seed).buildable[0]);
  await page.getByRole('button', { name: 'Поставить за 40', exact: true }).click();
  await page.getByRole('button', { name: 'Начать волну 1', exact: true }).click();
  await expect.poll(async () => Number(await page.locator('.tower-game').getAttribute('data-tick'))).toBeGreaterThan(20);
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  await expect(page.locator('.tower-game')).toHaveAttribute('data-tower-state', 'paused');
  expect(await page.evaluate(() => window.telegramCalls.filter(call => call === 'haptic'))).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as { __qaAudioContexts(): number }).__qaAudioContexts())).toBe(0);
});
