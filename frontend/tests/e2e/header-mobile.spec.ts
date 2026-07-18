import { expect, Page } from '@playwright/test';
import { multiParticipantTest as test } from './fixtures';

/**
 * Mobile-safe focused-flow header tests (#78)
 *
 * Verifies at the primary 390x844 mobile viewport (and a narrow 360px pass)
 * that the NavigationHeader:
 * - fits without horizontal overflow, clipping or overlap
 * - keeps a stable >=44px back target and an optically centred title
 * - shows no unrelated navigation links on focused flows
 * - separates session metadata into the secondary region
 *
 * Also captures the demonstration screenshots required by the issue into
 * docs/screenshots (join.png, create.png, lobby.png, selection.png,
 * results.png).
 *
 * Requires frontend (:3000) and backend (:3001) running locally.
 */

const SCREENSHOT_DIR = '../docs/screenshots';

async function expectMobileSafeHeader(page: Page) {
  const header = page.locator('header').first();
  await expect(header).toBeVisible();

  // No horizontal overflow
  const hasHorizontalScroll = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(hasHorizontalScroll).toBe(false);

  // Focused flows show no unrelated navigation links
  await expect(header.locator('a')).toHaveCount(0);

  // Back action: stable, full-size touch target
  const back = header.getByRole('button', { name: 'Back' });
  await expect(back).toBeVisible();
  const backMinHeight = await back.evaluate((el) => getComputedStyle(el).minHeight);
  expect(backMinHeight).toBe('44px');
  const backBox = await back.boundingBox();
  // boundingBox can land a hair under 44 at 3x device scale factor (sub-pixel rounding)
  expect(backBox!.width).toBeGreaterThanOrEqual(43.9);
  expect(backBox!.height).toBeGreaterThanOrEqual(43.9);

  // Title optically centred within the header
  const title = header.getByRole('heading').first();
  const titleBox = await title.boundingBox();
  const headerBox = await header.boundingBox();
  const titleCentre = titleBox!.x + titleBox!.width / 2;
  const headerCentre = headerBox!.x + headerBox!.width / 2;
  expect(Math.abs(titleCentre - headerCentre)).toBeLessThanOrEqual(8);

  // Secondary region (when present) sits below the title, never overlapping
  const secondary = page.getByTestId('nav-header-secondary');
  if ((await secondary.count()) > 0) {
    const secondaryBox = await secondary.boundingBox();
    expect(secondaryBox!.y).toBeGreaterThanOrEqual(titleBox!.y + titleBox!.height);
  }
}

test.describe('Mobile-safe focused-flow header (#78)', () => {
  test.skip(({ isMobile }) => !isMobile, 'Header layout is verified at mobile widths only');
  test.use({ viewport: { width: 390, height: 844 } });

  test('Join Session header fits the mobile viewport', async ({ page }) => {
    await page.goto('/join');
    await expect(page.getByRole('heading', { name: 'Join Session' })).toBeVisible();

    await expectMobileSafeHeader(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/join.png` });

    // Narrow widths must not break the header either
    await page.setViewportSize({ width: 360, height: 800 });
    await expectMobileSafeHeader(page);
  });

  test('Create Session header fits the mobile viewport', async ({ page }) => {
    await page.goto('/create');
    await expect(page.getByRole('heading', { name: 'Create Session' })).toBeVisible();

    await expectMobileSafeHeader(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/create.png` });
  });

  test('Session waiting, Restaurant Selection and Match headers fit the mobile viewport', async ({
    setupSession,
  }) => {
    test.setTimeout(120_000);
    const { host, all } = await setupSession(1);

    // Session waiting (lobby) screen
    await expect(host.page).toHaveURL(/\/session\/[A-Z0-9]+$/);
    await expectMobileSafeHeader(host.page);
    await host.page.screenshot({ path: `${SCREENSHOT_DIR}/lobby.png` });

    await host.lobbyPage.startSession();
    await Promise.all(
      all.map(async (p) => {
        await p.selectionPage.loadingState
          .waitFor({ state: 'hidden', timeout: 30_000 })
          .catch(() => {});
      })
    );
    await expect(host.page).toHaveURL(/\/session\/[A-Z0-9]+\/select/);

    // Restaurant Selection screen
    await expectMobileSafeHeader(host.page);
    await expect(host.page.getByTestId('nav-header-secondary')).toBeVisible();
    await host.page.screenshot({ path: `${SCREENSHOT_DIR}/selection.png` });

    // Both like the first restaurant to force a Match, then finish the deck
    await Promise.all(
      all.map(async (p) => {
        if (await p.selectionPage.likeButton.isVisible()) {
          await p.selectionPage.likeRestaurant();
        }
        await p.selectionPage.passAllRemaining();
        if (await p.selectionPage.submitButton.isVisible()) {
          await p.selectionPage.submitSelections();
        }
      })
    );
    await Promise.all(all.map((p) => expect(p.page).toHaveURL(/\/results/, { timeout: 30_000 })));

    // Match screen
    await expect(host.page.getByRole('heading', { name: 'Perfect Match!' })).toBeVisible();
    await expectMobileSafeHeader(host.page);
    await host.page.screenshot({ path: `${SCREENSHOT_DIR}/results.png` });
  });
});
