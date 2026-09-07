import { test, expect, type Page } from '@playwright/test';

// Exercise the real stream parser and page without making paid Platform requests.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    class ComparisonSource extends EventTarget {
      static CLOSED = 2;
      readyState = 1;
      constructor() {
        super();
        window.addEventListener('comparison-test-event', this.receive);
      }
      receive = (event: Event) => {
        const { type, data } = (event as CustomEvent<{ type: string; data: unknown }>).detail;
        this.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(data) }));
      };
      close() {
        this.readyState = ComparisonSource.CLOSED;
        window.removeEventListener('comparison-test-event', this.receive);
      }
    }
    Object.defineProperty(window, 'EventSource', { value: ComparisonSource });
  });
});

function emit(page: Page, type: string, data: unknown) {
  return page.evaluate(
    (detail) => window.dispatchEvent(new CustomEvent('comparison-test-event', { detail })),
    { type, data }
  );
}

test('Price Patrol animates while real stream states control progress and completion', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/compare/price-patrol-test');
  const scene = page.getByRole('region', { name: 'Fetching delivery prices' });
  await expect(scene).toBeVisible();
  await emit(page, 'venue', { type: 'venue', placeId: 'price-patrol-test', venueName: 'Tipo 00' });
  await expect(page.getByRole('heading', { name: 'Tipo 00' })).toBeVisible();
  await expect(scene.getByRole('status')).toHaveText('Checking Uber Eats and DoorDash…');
  const canvas = scene.locator('canvas');
  const firstFrame = await canvas.evaluate((el) => el.toDataURL());
  await expect.poll(() => canvas.evaluate((el) => el.toDataURL())).not.toBe(firstFrame);

  await page.getByRole('button', { name: 'Pause animation' }).click();
  const pausedFrame = await canvas.evaluate((el) => el.toDataURL());
  await page.waitForTimeout(200);
  expect(await canvas.evaluate((el) => el.toDataURL())).toBe(pausedFrame);
  const notFound = { status: 'not_found', deals: [], menu: [] };
  await emit(page, 'storefront', {
    type: 'storefront',
    platform: 'doordash',
    storefront: notFound,
  });
  await expect(scene.getByRole('status')).toHaveText('Still checking Uber Eats…');
  await expect(page.getByTestId('doordash-column')).toContainText('Not on DoorDash.');
  await scene.screenshot({ path: info.outputPath('price-patrol-partial.png') });

  const resolved = {
    status: 'resolved',
    deals: [],
    menu: [{ name: 'Margherita', price_cents: 2200, tags: [] }],
  };
  await emit(page, 'storefront', {
    type: 'storefront',
    platform: 'ubereats',
    storefront: resolved,
  });
  await expect(scene.getByRole('status')).toHaveText('Putting your comparison together…');
  await expect(page.getByTestId('ubereats-column')).toContainText('Ready');
  await expect(page.getByRole('button', { name: 'Play animation' })).toBeVisible();
  await emit(page, 'error', { type: 'error', code: 'UNKNOWN', message: 'Please retry.' });
  await expect(scene).toHaveCount(0);
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(scene.getByRole('status')).toHaveText('Checking Uber Eats and DoorDash…');
  await expect(page.getByRole('button', { name: 'Pause animation' })).toBeVisible();

  // A cached/final Comparison may be the first result; never wait for the cat.
  await emit(page, 'comparison', {
    type: 'comparison',
    comparison: {
      placeId: 'price-patrol-test',
      venueName: 'Tipo 00',
      fetchedAt: new Date().toISOString(),
      storefronts: { ubereats: resolved, doordash: notFound },
      matchedItems: [],
      unmatched: { ubereats: resolved.menu, doordash: [] },
    },
  });
  await expect(scene).toHaveCount(0);
  await expect(page.getByText('Only on Uber Eats', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('Price Patrol respects reduced motion and fits a 320px screen', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/compare/price-patrol-test');
  const scene = page.getByRole('region', { name: 'Fetching delivery prices' });
  await expect(scene).toBeVisible();
  await expect(scene.getByRole('button')).toHaveCount(0);
  const canvas = scene.locator('canvas');
  const still = await canvas.evaluate((el) => el.toDataURL());
  await page.waitForTimeout(250);
  expect(await canvas.evaluate((el) => el.toDataURL())).toBe(still);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await scene.screenshot({ path: info.outputPath('price-patrol-reduced-motion.png') });
});
