import { test, expect } from '@playwright/test';
import { seed } from './fixtures';

// This is local Chromium evidence, not physical Telegram/WebView acceptance.
test('v0.5 idle animates cached rig nodes without replacing the character SVG', async ({ page }) => {
  await seed(page); await page.goto('/');
  await expect(page.locator('.living-world')).toHaveAttribute('data-running', 'true');
  const evidence = await page.locator('.world-chick-action .chick-art').evaluate(async svg => {
    const body = svg.querySelector('[data-rig=body]')!, head = svg.querySelector('[data-rig=head]')!;
    let replacements = 0, jointUpdates = 0;
    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'childList') replacements += record.addedNodes.length + record.removedNodes.length;
        if (record.type === 'attributes' && record.attributeName === 'transform') jointUpdates++;
      }
    });
    observer.observe(svg, { childList: true, subtree: true, attributes: true, attributeFilter: ['transform'] });
    await new Promise<void>(resolve => setTimeout(resolve, 1200)); observer.disconnect();
    return { replacements, jointUpdates, sameBody: svg.querySelector('[data-rig=body]') === body,
      sameHead: svg.querySelector('[data-rig=head]') === head, connected: body.isConnected && head.isConnected };
  });
  expect(evidence.replacements).toBe(0);
  expect(evidence.jointUpdates).toBeGreaterThan(20);
  expect(evidence.sameBody && evidence.sameHead && evidence.connected).toBe(true);
});

test('v0.5 reduced motion keeps the new landscape and stable character identity', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await seed(page); await page.goto('/');
  await expect(page.locator('.living-world')).toHaveAttribute('data-running', 'false');
  await expect(page.locator('.world-sky')).toBeVisible();
  await expect(page.locator('.world-landscape')).toBeVisible();
  await expect(page.locator('.world-chick-action .chick-art')).toHaveAttribute('data-visual-version', '3');
  await expect(page.locator('.world-chick-action .chick-art')).toHaveAttribute('data-reduced-motion', 'true');
  const body = page.locator('.world-chick-action [data-rig=body]'); const before = await body.getAttribute('transform');
  await page.waitForTimeout(400); expect(await body.getAttribute('transform')).toBe(before);
  await page.locator('.world-chick-action').click();
  await expect(page.locator('.living-world')).toHaveAttribute('data-gesture', 'tap');
  await expect(page.locator('.living-world')).toHaveAttribute('data-gesture', 'idle');
  await expect(page.locator('.living-world')).toHaveAttribute('data-running', 'false');
});
