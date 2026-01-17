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
    await expect(homePage.createSessionButton).toBeVisible();
    await expect(homePage.joinSessionButton).toBeVisible();
  });
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

  test('should enable submit button when name is filled', async ({ createPage }) => {
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
    await joinPage.verifySessionCodeUppercase('ABC123');
  });

  test('should limit session code to 6 characters', async ({ joinPage }) => {
    await joinPage.goto();
    await joinPage.enterSessionCode('ABCDEFGHIJ');

    const value = await joinPage.getSessionCodeValue();
    expect(value).toBe('ABCDEF');
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
