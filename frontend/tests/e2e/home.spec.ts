import { test, expect } from './fixtures';

/**
 * Home Page E2E Tests
 *
 * Tests the landing page functionality including:
 * - Content rendering
 * - Navigation
 * - Accessibility
 * - Mobile responsiveness
 *
 * Uses Page Object Model for maintainable selectors.
 */

test.describe('Home Page', () => {
  test('should display welcome screen with navigation options', async ({ homePage }) => {
    await homePage.goto();

    // Verify all key elements using page object
    await homePage.verifyPageElements();
  });

  test('should navigate to create session page', async ({ homePage, page }) => {
    await homePage.goto();
    await homePage.clickCreateSession();

    await expect(page).toHaveURL(/\/create/);
  });

  test('should navigate to join session page', async ({ homePage, page }) => {
    await homePage.goto();
    await homePage.clickJoinSession();

    await expect(page).toHaveURL(/\/join/);
  });

  test('should have accessible button elements', async ({ homePage }) => {
    await homePage.goto();
    await homePage.verifyButtonsEnabled();
  });

  test('should display mobile-friendly layout', async ({ homePage }) => {
    await homePage.setMobileViewport();
    await homePage.goto();

    // Verify content is visible in mobile viewport
    await expect(homePage.heading).toBeVisible();
    await expect(homePage.eatOutCard).toBeVisible();
    await expect(homePage.joinLink).toBeVisible();
  });
});

test('home remains usable with failed images, reduced motion and narrow screens', async ({
  page,
}) => {
  await page.route('**/images/tonight-*', (route) => route.abort());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.getByRole('heading', { name: /What are we doing tonight/i })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    for (const label of [
      /Eat out/i,
      /Order in/i,
      /Cook together/i,
      /Watch something/i,
      /Join with a code/i,
      /Compare delivery prices/i,
    ]) {
      const control = page.getByRole('button', { name: label });
      await expect(control).toBeVisible();
      const box = await control.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(box?.width).toBeGreaterThanOrEqual(44);
    }
  }
  await page.getByRole('button', { name: /Join with a code/i }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: /Compare delivery prices/i })).toBeFocused();
  const duration = await page
    .locator('img[src*="tonight-"]')
    .first()
    .evaluate((image) => parseFloat(getComputedStyle(image).transitionDuration));
  expect(duration).toBeLessThan(0.01);
});

test.describe('Create Session Page', () => {
  test('should display create session form', async ({ createPage }) => {
    await createPage.goto();
    await createPage.verifyPageElements();
  });

  test('should show character count for name input', async ({ createPage }) => {
    await createPage.goto();
    await createPage.enterName('John');

    const charCount = await createPage.getCharacterCountText();
    expect(charCount).toContain('4');
  });

  test('should disable submit button when name is empty', async ({ createPage }) => {
    await createPage.goto();
    await createPage.verifySubmitButtonState(false);
  });

  test('should enable submit button when the name is set', async ({ createPage }) => {
    await createPage.goto();
    await createPage.enterName('John');
    await createPage.verifySubmitButtonState(true);
  });

  test('should navigate back on cancel', async ({ createPage, page }) => {
    await createPage.goto();
    await createPage.cancel();

    await expect(page).toHaveURL('/');
  });
});

test.describe('Join Session Page', () => {
  test('should display join session form', async ({ joinPage }) => {
    await joinPage.goto();
    await joinPage.verifyPageElements();
  });

  test('should format session code to uppercase', async ({ joinPage }) => {
    await joinPage.goto();
    await joinPage.enterSessionCode('abc123');
    await joinPage.verifySessionCodeUppercase('ABC12');
  });

  test('should limit session code to 5 characters', async ({ joinPage }) => {
    await joinPage.goto();
    await joinPage.enterSessionCode('ABCDEGHIJ');

    const value = await joinPage.getSessionCodeValue();
    expect(value).toBe('ABCDE');
  });

  test('should show character count for name input', async ({ joinPage, page }) => {
    await joinPage.goto();
    await joinPage.enterName('Alice');

    await expect(page.getByText(/5\/50 characters/i)).toBeVisible();
  });

  test('should navigate back on cancel', async ({ joinPage, page }) => {
    await joinPage.goto();
    await joinPage.cancel();

    await expect(page).toHaveURL('/');
  });
});
