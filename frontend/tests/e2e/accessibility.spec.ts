import { test, expect } from './fixtures';
import { checkAccessibility } from './utils/test-helpers';

/**
 * Accessibility Tests
 *
 * Verify the app meets basic accessibility standards:
 * - All interactive elements have accessible names
 * - Form inputs have labels
 * - Errors surface as visible text
 * - Keyboard navigation reaches the main actions; focus is visible
 * - Heading structure and a main landmark exist
 * (Color contrast is covered by neon-theme.spec.ts.)
 */

test.describe('Accessibility - Home Page', () => {
  test('all buttons have accessible names', async ({ homePage }) => {
    await homePage.goto();

    await expect(homePage.eatOutCard).toHaveAccessibleName(/Eating out/i);
    await expect(homePage.joinLink).toHaveAccessibleName(/Join with a code/i);
  });

  test('page passes accessibility checks', async ({ page, homePage }) => {
    await homePage.goto();

    const result = await checkAccessibility(page);
    expect(result.issues).toEqual([]);
  });

  test('focus is visible on interactive elements', async ({ page, homePage }) => {
    await homePage.goto();

    // Tab through elements and verify focus visibility
    await page.keyboard.press('Tab');
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();
  });
});

test.describe('Accessibility - Create Session Page', () => {
  test('form inputs have associated labels', async ({ createPage }) => {
    await createPage.goto();

    // Name input should have a label
    const nameLabel = createPage.page.locator('label', { hasText: /Your Name/i });
    await expect(nameLabel).toBeVisible();
  });

  test('submit button state is announced', async ({ createPage }) => {
    await createPage.goto();

    // Button should have disabled state communicated
    await expect(createPage.createButton).toBeDisabled();

    // After entering the required name and location, button should be enabled
    await createPage.enterName('TestUser');
    await createPage.setCurrentLocation();
    await expect(createPage.createButton).toBeEnabled();
  });

  test('character count is accessible', async ({ createPage }) => {
    await createPage.goto();
    await createPage.enterName('Test');

    // Character count should be present
    const charCount = await createPage.getCharacterCountText();
    expect(charCount).toContain('4');
  });
});

test.describe('Accessibility - Join Session Page', () => {
  test('all form fields have labels', async ({ joinPage }) => {
    await joinPage.goto();

    await expect(joinPage.sessionCodeInput).toBeVisible();
    await expect(joinPage.nameInput).toBeVisible();

    // Verify labels exist
    const sessionCodeLabel = joinPage.page.locator('label', {
      hasText: /Session Code/i,
    });
    const nameLabel = joinPage.page.locator('label', { hasText: /Your Name/i });

    await expect(sessionCodeLabel).toBeVisible();
    await expect(nameLabel).toBeVisible();
  });

  test('error messages are accessible', async ({ joinPage, page }) => {
    await joinPage.goto();

    // A well-formed code that names no Session — the join must fail visibly.
    await joinPage.enterSessionCode('AAAAA');
    await joinPage.enterName('Test');
    await joinPage.joinButton.click();

    // The failure must surface as visible text a screen reader reaches, not a
    // silent no-op. toBeVisible auto-waits, so no blind timeout.
    await expect(page.getByText('Session not found or has expired')).toBeVisible();
  });
});

test.describe('Accessibility - Keyboard Navigation', () => {
  test('can navigate entire home page with keyboard', async ({ page, homePage }) => {
    await homePage.goto();

    // Tab through all interactive elements
    const interactiveElements: string[] = [];

    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => {
        const element = document.activeElement;
        if (!(element instanceof HTMLElement)) return null;
        return {
          tagName: element.tagName.toLowerCase(),
          name: element.getAttribute('aria-label') || element.textContent || '',
        };
      });
      if (focused?.tagName === 'button' || focused?.tagName === 'a') {
        interactiveElements.push(focused.name.trim());
      }
    }

    // Main actions should all be reachable in the tab order.
    expect(interactiveElements.some((name) => name.includes('Eating out'))).toBe(true);
    expect(interactiveElements.some((name) => name.includes('Join with a code'))).toBe(true);
    expect(interactiveElements).toContain('Compare delivery prices');
  });

  test('Enter key activates buttons', async ({ page, homePage }) => {
    await homePage.goto();

    // Focus on Create Session button
    await homePage.eatOutCard.focus();

    // Press Enter
    await page.keyboard.press('Enter');

    // Should navigate to create page
    await expect(page).toHaveURL(/\/create/);
  });

  // Escape-closes-modal is covered at the component seam in
  // liveSwipeRoom.test.tsx ('Escape dismisses exactly as Keep swiping does');
  // no modal exists on the pages this suite visits, so a spec here could only
  // ever be skipped.
});

test.describe('Accessibility - Screen Reader Support', () => {
  // Home and every setup page, not just Home.
  for (const path of ['/', '/create', '/join', '/cook']) {
    test(`${path} has one main landmark, one h1, and passes the basic checks`, async ({ page }) => {
      await page.goto(path);

      // getByRole is strict: zero or two mains (or h1s) both fail.
      await expect(page.getByRole('main')).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      const result = await checkAccessibility(page);
      expect(result.issues).toEqual([]);
    });
  }

  test('buttons have descriptive text', async ({ homePage }) => {
    await homePage.goto();

    // Verify buttons have clear, descriptive text
    const eatOutText = await homePage.eatOutCard.textContent();
    const joinText = await homePage.joinLink.textContent();

    expect(eatOutText?.toLowerCase()).toContain('eating out');
    expect(joinText?.toLowerCase()).toContain('join');
  });
});
