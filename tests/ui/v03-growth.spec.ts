import { test, expect } from '@playwright/test';
import { storageKey } from './fixtures';
import { seedStage, qa03Path } from './v03-fixtures';
import type { Stage } from '../../src/types';

for (const [stage, unlocked] of [['baby', 1], ['teen', 2], ['adult', 3]] as [Stage, number][]) {
  test(`v0.3 ${stage} growth history only renders unlocked ages with unchanged saved genes`, async ({ page }) => {
    const seeded = await seedStage(page, stage); await page.goto('/');
    await page.getByRole('button', { name: 'Коллекция', exact: true }).click(); await page.locator('.collection-card').first().click();
    const timeline = page.getByRole('group', { name: 'История роста', exact: true }); await expect(timeline).toBeVisible();
    await expect(timeline.locator('button')).toHaveCount(3);
    for (let index = 0; index < 3; index++) {
      const button = timeline.locator('button').nth(index);
      if (index < unlocked) await expect(button).toBeEnabled();
      else { await expect(button).toBeDisabled(); await expect(button).toContainText('?'); }
    }
    await expect(page.locator('.card-art .chick-art')).toHaveAttribute('data-stage', stage);
    expect(await page.locator('.card-art .chick-art').count()).toBe(1);
    const before = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).state.chicks[0], storageKey);
    if (unlocked > 1) {
      await timeline.locator('button').first().click();
      await expect(page.locator('.card-art .chick-art')).toHaveAttribute('data-stage', 'baby');
      await expect(timeline.locator('button').first()).toHaveAttribute('aria-pressed', 'true');
    }
    const after = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).state.chicks[0], storageKey);
    expect(after).toEqual(before); expect(after.genes).toEqual(seeded.state.chicks[0].genes);
    expect(after.stage).toBe(stage);
    await page.screenshot({ path: qa03Path(`growth-${stage}-past-preview-light.png`) });
    await page.reload(); await page.getByRole('button', { name: 'Коллекция', exact: true }).click(); await page.locator('.collection-card').first().click();
    await expect(page.locator('.card-art .chick-art')).toHaveAttribute('data-stage', stage);
  });
}
