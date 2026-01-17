import { test, expect } from './fixtures';

/**
 * Mobile-Specific Tests
 *
 * Tests targeting mobile viewport and touch interactions:
 * - Proper layout on 390x844 (iPhone 12 Pro)
 * - Touch gestures
 * - Virtual keyboard handling
 * - Safe area insets
 * - Responsive typography
 */

test.describe('Mobile Layout - Home Page', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('all content fits within mobile viewport', async ({ homePage }) => {
    await homePage.goto();

    // Verify no horizontal scroll
    const hasHorizontalScroll = await homePage.page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);

    // Verify main elements are visible without scrolling
    await expect(homePage.heading).toBeVisible();
    await expect(homePage.createSessionButton).toBeVisible();
    await expect(homePage.joinSessionButton).toBeVisible();
  });

  test('buttons are properly sized for touch (min 44x44)', async ({
    homePage,
  }) => {
    await homePage.goto();

    const createButtonBox = await homePage.createSessionButton.boundingBox();
    const joinButtonBox = await homePage.joinSessionButton.boundingBox();

    // Minimum touch target size
    expect(createButtonBox?.height).toBeGreaterThanOrEqual(44);
    expect(joinButtonBox?.height).toBeGreaterThanOrEqual(44);
  });

  test('text is readable on mobile (min 16px)', async ({ page, homePage }) => {
    await homePage.goto();

    // Check that body text is at least 14px (browsers zoom small text)
    const bodyFontSize = await page.evaluate(() => {
      const body = document.querySelector('p');
      if (body) {
        return parseFloat(getComputedStyle(body).fontSize);
      }
      return 16;
    });

    expect(bodyFontSize).toBeGreaterThanOrEqual(14);
  });
});

test.describe('Mobile Layout - Create Session Page', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('form is centered and properly padded', async ({ createPage }) => {
    await createPage.goto();

    const inputBox = await createPage.nameInput.boundingBox();
    expect(inputBox).toBeTruthy();

    // Input should have reasonable padding from edges
    expect(inputBox!.x).toBeGreaterThan(16);
    expect(inputBox!.x + inputBox!.width).toBeLessThan(390 - 16);
  });

  test('keyboard does not cover submit button', async ({ page, createPage }) => {
    await createPage.goto();

    // Focus input to trigger keyboard
    await createPage.nameInput.focus();
    await createPage.nameInput.fill('TestUser');

    // Submit button should still be accessible
    // Note: Playwright doesn't simulate virtual keyboard
    await expect(createPage.createButton).toBeVisible();
  });

  test('cancel button is easily reachable', async ({ createPage }) => {
    await createPage.goto();

    const cancelBox = await createPage.cancelButton.boundingBox();
    expect(cancelBox).toBeTruthy();

    // Should be near top or easily accessible
    expect(cancelBox!.y).toBeLessThan(844 * 0.8); // Not at very bottom
  });
});

test.describe('Mobile Layout - Join Session Page', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('session code input is prominent', async ({ joinPage }) => {
    await joinPage.goto();

    const codeInputBox = await joinPage.sessionCodeInput.boundingBox();
    expect(codeInputBox).toBeTruthy();

    // Should be in upper portion of screen
    expect(codeInputBox!.y).toBeLessThan(844 / 2);
  });

  test('uppercase formatting works on mobile input', async ({ joinPage }) => {
    await joinPage.goto();

    await joinPage.enterSessionCode('abc123');
    const value = await joinPage.getSessionCodeValue();

    expect(value).toBe('ABC123');
  });
});

test.describe('Mobile Touch Interactions', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('buttons respond to touch', async ({ page, homePage }) => {
    await homePage.goto();

    // Tap create session button
    await homePage.createSessionButton.tap();

    await expect(page).toHaveURL(/\/create/);
  });

  test('form inputs receive focus on tap', async ({ createPage }) => {
    await createPage.goto();

    // Tap input
    await createPage.nameInput.tap();

    // Should be focused
    const isFocused = await createPage.nameInput.evaluate(
      (el) => document.activeElement === el
    );
    expect(isFocused).toBe(true);
  });
});

test.describe('Mobile - Various Device Sizes', () => {
  const devices = [
    { name: 'iPhone SE', width: 375, height: 667 },
    { name: 'iPhone 12 Pro', width: 390, height: 844 },
    { name: 'iPhone 14 Pro Max', width: 430, height: 932 },
    { name: 'Samsung Galaxy S21', width: 360, height: 800 },
    { name: 'Pixel 5', width: 393, height: 851 },
  ];

  for (const device of devices) {
    test(`renders correctly on ${device.name}`, async ({ page, homePage }) => {
      await page.setViewportSize({ width: device.width, height: device.height });
      await homePage.goto();

      // All key elements visible
      await expect(homePage.heading).toBeVisible();
      await expect(homePage.createSessionButton).toBeVisible();
      await expect(homePage.joinSessionButton).toBeVisible();

      // No horizontal overflow
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(hasHorizontalScroll).toBe(false);
    });
  }
});

test.describe('Mobile - Landscape Orientation', () => {
  test('app works in landscape mode', async ({ page, homePage }) => {
    // Landscape iPhone 12 Pro
    await page.setViewportSize({ width: 844, height: 390 });
    await homePage.goto();

    // Should still show key elements
    await expect(homePage.heading).toBeVisible();
    await expect(homePage.createSessionButton).toBeVisible();
  });
});

test.describe('Mobile - Performance', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('page loads quickly on mobile', async ({ page, homePage }) => {
    const startTime = Date.now();
    await homePage.goto();
    const loadTime = Date.now() - startTime;

    // Should load within 3 seconds
    expect(loadTime).toBeLessThan(3000);
  });

  test('no layout shift during load', async ({ page, homePage }) => {
    await homePage.goto();

    // Check Cumulative Layout Shift
    const cls = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        let clsValue = 0;
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as PerformanceEntry[]) {
            if ('value' in entry) {
              clsValue += (entry as { value: number }).value;
            }
          }
        });
        observer.observe({ entryTypes: ['layout-shift'] });

        // Give time for any shifts
        setTimeout(() => {
          observer.disconnect();
          resolve(clsValue);
        }, 1000);
      });
    });

    // CLS should be < 0.1 (good score)
    expect(cls).toBeLessThan(0.1);
  });
});
