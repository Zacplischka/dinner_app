import { test, expect } from '@playwright/test';
import type { Comparison } from '@dinder/shared/types';

// Real page, HTTP and EventSource boundaries; no paid Platform requests.
test.beforeEach(async ({ page }, info) => {
  if (info.project.name === 'mobile-chrome')
    await page.setViewportSize({ width: 320, height: 740 });
  await page.addInitScript(() => {
    localStorage.setItem(
      'dinder-comparison',
      JSON.stringify({
        version: 0,
        state: {
          location: { latitude: -37.82, longitude: 145 },
          suburb: 'Richmond',
          radiusKm: 8,
        },
      })
    );
  });
});

test('long comparisons keep the next action near the verdict and every price labelled', async ({
  page,
}, info) => {
  const menu = Array.from({ length: 97 }, (_, index) => ({
    name: `Original Crispy Bacon and Cheese Burger Combo ${index + 1}`,
    price_cents: 1800,
    tags: [],
  }));
  const comparison: Comparison = {
    placeId: 'uat-long-menu',
    venueName: 'UAT Pizza Menu',
    fetchedAt: new Date().toISOString(),
    storefronts: {
      ubereats: {
        status: 'resolved',
        storeUrl: 'https://www.ubereats.com/store/uat-menu',
        deals: [],
        menu,
      },
      doordash: {
        status: 'resolved',
        storeUrl: 'https://www.doordash.com/store/uat-menu',
        deals: [],
        menu,
      },
    },
    matchedItems: menu.map((item) => ({ name: item.name, ubereats: item, doordash: item })),
    unmatched: { ubereats: [], doordash: [] },
  };
  await page.route('**/api/comparison/uat-long-menu/stream', (route) =>
    route.fulfill({
      contentType: 'text/event-stream',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: `event: comparison\ndata: ${JSON.stringify({ type: 'comparison', comparison })}\n\n`,
    })
  );
  await page.goto('/compare/uat-long-menu');
  for (const name of ['Open in Uber Eats', 'Open in DoorDash']) {
    const action = page.getByRole('link', { name });
    await expect(action).toBeInViewport();
    const height = await action.evaluate((element) => parseFloat(getComputedStyle(element).height));
    expect(height).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({
    animations: 'disabled',
    path: info.outputPath('comparison-verdict-actions.png'),
  });
  const row = page.getByTestId('matched-item-80');
  await row.scrollIntoViewIfNeeded();
  await expect(row.getByText('Uber Eats', { exact: true })).toBeInViewport();
  await expect(row.getByText('DoorDash', { exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    animations: 'disabled',
    path: info.outputPath('comparison-price-labels.png'),
  });
});

test('Choose another venue restores the area, search, filter and sort without another lookup', async ({
  page,
}, info) => {
  let searches = 0;
  await page.route('**/api/comparison/venues?**', (route) => {
    searches++;
    return route.fulfill({
      json: {
        suburb: 'Richmond',
        venues: [
          {
            placeId: 'uat-missing',
            name: 'Missing Pizza Venue',
            cuisineType: 'Pizza restaurant',
            rating: 4.5,
            distanceMiles: 0.2,
          },
        ],
      },
    });
  });
  const notFound = { status: 'not_found', deals: [], menu: [] };
  await page.route('**/api/comparison/uat-missing/stream', (route) =>
    route.fulfill({
      contentType: 'text/event-stream',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: `event: comparison\ndata: ${JSON.stringify({
        type: 'comparison',
        comparison: {
          placeId: 'uat-missing',
          venueName: 'Missing Pizza Venue',
          fetchedAt: new Date().toISOString(),
          storefronts: { ubereats: notFound, doordash: notFound },
          matchedItems: [],
          unmatched: { ubereats: [], doordash: [] },
        },
      })}\n\n`,
    })
  );
  await page.goto('/compare');
  await page.getByRole('searchbox', { name: 'Search venues' }).fill('Missing');
  await page.getByRole('button', { name: '🍕 Pizza', exact: true }).click();
  await page.getByRole('button', { name: 'Top rated' }).click();
  await page.getByRole('button', { name: /^Missing Pizza Venue/ }).click();
  await expect(page.getByText('Couldn’t find this venue on either delivery app.')).toBeVisible();
  await page.screenshot({
    animations: 'disabled',
    path: info.outputPath('empty-comparison-recovery.png'),
  });
  await page.getByRole('button', { name: 'Choose another venue' }).click();
  await expect(page.getByRole('button', { name: 'near Richmond · change' })).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Search venues' })).toHaveValue('Missing');
  await expect(page.getByRole('button', { name: '🍕 Pizza', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect(page.getByRole('button', { name: 'Top rated' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect(page.getByRole('button', { name: /^Missing Pizza Venue/ })).toBeVisible();
  expect(searches).toBe(1);
});
