import { test, expect, type Locator, type Page, type Route } from '@playwright/test';
import type { ShoppingList } from '@dinder/shared/types';

const listId = '9f0ac1de-7c3a-4a1e-9a3b-2f9f0d1c8e77';
const listPath = `/list/${listId}`;
const pendingList: ShoppingList = {
  listId,
  recipeName: 'Tomato pasta',
  headcount: 2,
  servings: 2,
  mintedAt: '2026-09-07T10:00:00.000Z',
  provenance: 'owned',
  pricingStatus: 'pending',
  steps: ['Boil the pasta.', 'Stir in the tomatoes and serve.'],
  lines: [
    {
      id: '0',
      text: '250 g canned tomatoes',
      staple: false,
      state: 'unmatched',
      searchTerm: 'canned tomatoes',
    },
  ],
};
const pricedList: ShoppingList = {
  ...pendingList,
  pricingStatus: undefined,
  lines: [
    {
      id: '0',
      text: '250 g canned tomatoes',
      staple: false,
      state: 'priced',
      needs: { amount: 250, unit: 'g' },
      packs: 1,
      priceCents: 140,
      product: { stockcode: 12345, name: 'Diced Tomatoes', packageSize: '400g' },
    },
  ],
};

// Start at the persisted area, exactly as a returning visitor does. Every
// venue/list response below is intercepted: these tests spend no provider calls.
async function rememberArea(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'dinder-comparison',
      JSON.stringify({
        state: {
          location: { latitude: -37.81, longitude: 144.96 },
          suburb: 'Melbourne',
          radiusKm: 8,
        },
        version: 0,
      })
    );
  });
}

async function expectStill(scene: Locator) {
  const canvas = scene.locator('canvas');
  const frame = await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
  await scene.page().waitForTimeout(250);
  expect(await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL())).toBe(frame);
}

async function pauseMovingScene(scene: Locator) {
  const canvas = scene.locator('canvas');
  const frame = await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
  await expect
    .poll(() => canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL()))
    .not.toBe(frame);
  await scene.getByRole('button', { name: 'Pause animation' }).click();
  await expect(scene.getByRole('button', { name: 'Play animation' })).toBeVisible();
  await expectStill(scene);
}

async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test.beforeEach(async ({ page }, info) => {
  if (info.project.name === 'mobile-chrome')
    await page.setViewportSize({ width: 320, height: 740 });
});

test('Scout ends on an error; retry can reveal the finite empty-area scene', async ({
  page,
}, info) => {
  await rememberArea(page);
  const searches: Route[] = [];
  await page.route('**/api/comparison/venues?**', (route) => {
    searches.push(route);
  });
  await page.goto('/compare');
  const scout = page.getByRole('group', { name: 'Neighbourhood Scout' });
  await expect(scout).toBeVisible();
  await expect.poll(() => searches.length).toBe(1);
  await pauseMovingScene(scout);
  await expectNoOverflow(page);
  await page.screenshot({ path: info.outputPath('neighbourhood-scout-320.png') });

  await searches[0].fulfill({ status: 503, json: { message: 'Venue search unavailable' } });
  await expect(scout).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText('Venue search unavailable');
  await expect(page.getByRole('group', { name: 'A Little Further' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(scout).toBeVisible();
  await expect.poll(() => searches.length).toBe(2);
  await searches[1].fulfill({ json: { suburb: 'Melbourne', venues: [] } });
  await expect(scout).toHaveCount(0);

  const empty = page.getByRole('group', { name: 'A Little Further' });
  await expect(empty).toBeVisible();
  await expect(page.getByText('No venues within 8 km')).toBeVisible();
  await expect(empty.getByRole('button')).toHaveCount(0);
  // The map unfolds once, then stays still without delaying recovery controls.
  await expect(page.getByRole('button', { name: 'Change area', exact: true })).toBeEnabled();
  await page.waitForTimeout(3250);
  await expectStill(empty);
  await expectNoOverflow(page);
  await page.screenshot({ path: info.outputPath('a-little-further-320.png') });
  expect(searches).toHaveLength(2);
  await page.getByRole('button', { name: 'Change area', exact: true }).click();
  await expect(empty).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Find nearby venues' })).toBeVisible();
});

test('Grocery Run leaves ingredients and method usable, and ends when prices arrive', async ({
  page,
}, info) => {
  let response = pendingList;
  const reads: string[] = [];
  await page.route(`**/api/lists/${listId}?includePending=true`, async (route) => {
    reads.push(route.request().method());
    await route.fulfill({ json: response });
  });
  await page.goto(listPath);
  const scene = page.getByRole('group', { name: 'Grocery run' });
  await expect(scene).toBeVisible();
  await expect(page.getByText('250 g canned tomatoes', { exact: true })).toBeVisible();
  await expect(page.locator('[data-list-total]')).toHaveCount(0);
  await page.getByText('Read the method', { exact: true }).click();
  await expect(page.getByText('Boil the pasta.', { exact: true })).toBeVisible();
  await pauseMovingScene(scene);
  await expectNoOverflow(page);
  await scene.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('grocery-run-list-320.png') });

  response = pricedList;
  await expect(scene).toHaveCount(0);
  await expect(page.locator('[data-list-total]')).toContainText('$1.40');
  await expect(page.getByText('Boil the pasta.', { exact: true })).toBeVisible();
  expect(reads.length).toBeGreaterThanOrEqual(2);
  expect(reads.every((method) => method === 'GET')).toBe(true);
});

test('compact Grocery Run ends honestly on failure without losing the cook’s place', async ({
  page,
}, info) => {
  let response = pendingList;
  await page.route(`**/api/lists/${listId}?includePending=true`, (route) =>
    route.fulfill({ json: response })
  );
  await page.goto(`${listPath}/cook`);
  const scene = page.getByRole('group', { name: 'Grocery run' });
  await expect(scene).toBeVisible();
  await expect(scene).toHaveCSS('height', '96px');
  const firstStep = page.getByRole('button', { name: '1 Boil the pasta.' });
  await firstStep.click();
  await expect(firstStep).toHaveAttribute('aria-pressed', 'true');
  await pauseMovingScene(scene);
  await expectNoOverflow(page);
  await page.screenshot({ path: info.outputPath('grocery-run-cook-320.png') });

  response = { ...pendingList, pricingStatus: 'failed' };
  await expect(scene).toHaveCount(0);
  await expect(page.getByText('Prices are unavailable', { exact: true })).toBeVisible();
  await expect(firstStep).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await expect(page).toHaveURL(listPath);
  await expect(page.getByText('250 g canned tomatoes', { exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Grocery run' })).toHaveCount(0);
});

test('discovery and Grocery Run provide still scenes with reduced motion', async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await rememberArea(page);
  let search: Route | undefined;
  await page.route('**/api/comparison/venues?**', (route) => {
    search = route;
  });
  await page.route(`**/api/lists/${listId}?includePending=true`, (route) =>
    route.fulfill({ json: pendingList })
  );
  await page.goto('/compare');
  const scout = page.getByRole('group', { name: 'Neighbourhood Scout' });
  await expect(scout).toBeVisible();
  await expect(scout.getByRole('button')).toHaveCount(0);
  await expectStill(scout);
  await scout.screenshot({ path: info.outputPath('scout-reduced-motion.png') });
  await expect.poll(() => search !== undefined).toBe(true);
  await search!.fulfill({ json: { suburb: 'Melbourne', venues: [] } });
  const empty = page.getByRole('group', { name: 'A Little Further' });
  await expect(empty).toBeVisible();
  await expectStill(empty);
  await empty.screenshot({ path: info.outputPath('empty-area-reduced-motion.png') });

  for (const [path, screenshot] of [
    [listPath, 'grocery-list-reduced-motion.png'],
    [`${listPath}/cook`, 'grocery-cook-reduced-motion.png'],
  ]) {
    await page.goto(path);
    const grocery = page.getByRole('group', { name: 'Grocery run' });
    await expect(grocery).toBeVisible();
    await expect(grocery.getByRole('button')).toHaveCount(0);
    await expectStill(grocery);
    await expectNoOverflow(page);
    await grocery.screenshot({ path: info.outputPath(screenshot) });
  }
});
