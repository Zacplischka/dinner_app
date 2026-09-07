import { test, expect } from '@playwright/test';
import type { ShoppingList } from '@dinder/shared/types';

const listId = 'c819f8aa-dc36-4ec2-b314-150ec8f12d02';
const list: ShoppingList = {
  listId,
  recipeName: 'Penne Arrabbiata',
  headcount: 4,
  servings: 4,
  mintedAt: '2026-09-07T10:00:00.000Z',
  provenance: 'owned',
  steps: ['Heat the olive oil and add the garlic.', 'Add the tomatoes and simmer.'],
  lines: ['UAT Cooking Host', 'Alexandria'.repeat(5)].map(
    (claimedBy, index): ShoppingList['lines'][number] => ({
      id: String(index),
      text: '500 g penne',
      state: 'priced',
      claimedBy,
      needs: { amount: 500, unit: 'g' },
      packs: 1,
      priceCents: 280,
      product: { stockcode: 6026650, name: 'La Gina Penne Pasta', packageSize: '500g' },
      runnersUp: [],
    })
  ),
};

// Fixed list responses exercise the built UI without spending grocery calls.
test.beforeEach(async ({ context }) => {
  await context.route('**/api/lists/**', (route) =>
    route.fulfill({
      json: { ...list, listId: new URL(route.request().url()).pathname.split('/')[3] },
    })
  );
});

test('claimed shopping rows wrap within narrow phones and retain usable actions', async ({
  page,
}, info) => {
  await page.goto(`/list/${listId}`);
  await expect(page.getByText('Claimed by UAT Cooking Host')).toBeVisible();
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    for (const action of await page
      .getByRole('button', { name: /^(Release|Wrong product\?)$/ })
      .all()) {
      const box = await action.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({
      animations: 'disabled',
      path: info.outputPath(`shopping-claims-${width}.png`),
      fullPage: true,
    });
  }
});

test('Cook progress survives List navigation and reload without leaking to another list or viewer', async ({
  page,
  context,
}) => {
  await page.goto(`/list/${listId}/cook`);
  const firstStep = page.getByRole('button', { name: /^1 Heat/ });
  await firstStep.click();
  await expect(firstStep).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await page.getByRole('link', { name: 'Cook', exact: true }).click();
  await expect(firstStep).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(firstStep).toHaveAttribute('aria-pressed', 'true');

  await page.goto('/list/82563fd4-2ff2-4782-a9ec-2a9bab7e2a40/cook');
  await expect(firstStep).toHaveAttribute('aria-pressed', 'false');
  const otherViewer = await context.newPage();
  await otherViewer.goto(`/list/${listId}/cook`);
  await expect(otherViewer.getByRole('button', { name: /^1 Heat/ })).toHaveAttribute(
    'aria-pressed',
    'false'
  );
  await otherViewer.close();
});
