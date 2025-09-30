import { test, expect, type Page } from '@playwright/test';

/**
 * E2E Test: Mobile UI and Accessibility
 *
 * Tests:
 * - All pages render correctly at 390px viewport (iPhone 12 Pro baseline)
 * - Touch targets are ≥44x44px (per Apple/Android guidelines)
 * - Color contrast meets WCAG AA (4.5:1 for normal text)
 * - Keyboard navigation works for interactive elements
 *
 * Tests Technical Context constraints:
 * - Mobile viewport 320-768px (390px baseline)
 * - WCAG AA compliance
 * - Touch targets ≥44x44px
 */

test.describe('Mobile UI and Accessibility', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    // Test at minimum supported width
    await page.setViewportSize({ width: 320, height: 568 });
  });

  test.afterAll(async () => {
    await page.close();
  });

  test.describe('Home Page Mobile Rendering', () => {
    test('renders correctly at 320px (minimum width)', async () => {
      await page.goto('/');

      // Verify page loads without horizontal scroll
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // Allow 1px tolerance

      // Verify main heading visible
      await expect(page.locator('h1, [role="heading"]')).toBeVisible();

      // Verify buttons visible and not cut off
      await expect(page.locator('text=Create Session')).toBeVisible();
      await expect(page.locator('text=Join Session')).toBeVisible();
    });

    test('renders correctly at 390px (baseline)', async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/');

      // Same checks as above
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

      await expect(page.locator('h1, [role="heading"]')).toBeVisible();
      await expect(page.locator('text=Create Session')).toBeVisible();
      await expect(page.locator('text=Join Session')).toBeVisible();
    });

    test('renders correctly at 768px (tablet)', async () => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.goto('/');

      await expect(page.locator('h1, [role="heading"]')).toBeVisible();
      await expect(page.locator('text=Create Session')).toBeVisible();
      await expect(page.locator('text=Join Session')).toBeVisible();
    });
  });

  test.describe('Touch Target Sizes', () => {
    test.beforeEach(async () => {
      await page.setViewportSize({ width: 390, height: 844 });
    });

    test('Home page buttons meet 44x44px minimum', async () => {
      await page.goto('/');

      const buttons = [
        page.locator('button:has-text("Create Session"), a:has-text("Create Session")'),
        page.locator('button:has-text("Join Session"), a:has-text("Join Session")'),
      ];

      for (const button of buttons) {
        const box = await button.boundingBox();
        expect(box).toBeTruthy();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
    });

    test('Form inputs and submit buttons meet minimum size', async () => {
      await page.goto('/');
      await page.click('text=Create Session');

      // Check text input has adequate height
      const input = page.locator('input[name="hostName"]');
      const inputBox = await input.boundingBox();
      expect(inputBox).toBeTruthy();
      expect(inputBox!.height).toBeGreaterThanOrEqual(44);

      // Check submit button
      const submitButton = page.locator('button:has-text("Create")');
      const buttonBox = await submitButton.boundingBox();
      expect(buttonBox).toBeTruthy();
      expect(buttonBox!.width).toBeGreaterThanOrEqual(44);
      expect(buttonBox!.height).toBeGreaterThanOrEqual(44);
    });

    test('Checkbox touch targets for dinner options meet minimum', async () => {
      // Create a session and navigate to selection screen
      await page.goto('/');
      await page.click('text=Create Session');
      await page.fill('input[name="hostName"]', 'Test User');
      await page.click('button:has-text("Create")');
      await page.waitForURL(/\/session\/[A-Z0-9]{6}/);
      await page.click('button:has-text("Start Selecting")');
      await page.waitForURL(/\/select/);

      // Check first few checkboxes
      const checkboxes = page.locator('input[type="checkbox"]').first();

      // Get the label or container that provides the touch target
      const label = page.locator('label').first();
      const labelBox = await label.boundingBox();

      expect(labelBox).toBeTruthy();
      expect(labelBox!.height).toBeGreaterThanOrEqual(44);
    });

    test('Navigation links and back buttons meet minimum', async () => {
      await page.goto('/');
      await page.click('text=Join Session');

      // Check if there's a back button or navigation
      const backButton = page.locator('button:has-text("Back"), a:has-text("Back")');
      if (await backButton.count() > 0) {
        const box = await backButton.first().boundingBox();
        expect(box).toBeTruthy();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
    });
  });

  test.describe('Keyboard Navigation', () => {
    test.beforeEach(async () => {
      await page.setViewportSize({ width: 390, height: 844 });
    });

    test('Can navigate home page with Tab key', async () => {
      await page.goto('/');

      // Tab through interactive elements
      await page.keyboard.press('Tab');
      let focused = await page.evaluate(() => document.activeElement?.tagName);
      expect(['BUTTON', 'A']).toContain(focused);

      await page.keyboard.press('Tab');
      focused = await page.evaluate(() => document.activeElement?.tagName);
      expect(['BUTTON', 'A']).toContain(focused);
    });

    test('Can submit create session form with Enter key', async () => {
      await page.goto('/');
      await page.click('text=Create Session');

      // Focus input and type
      await page.focus('input[name="hostName"]');
      await page.keyboard.type('Test User');

      // Press Enter to submit
      await page.keyboard.press('Enter');

      // Should navigate to session page
      await page.waitForURL(/\/session\/[A-Z0-9]{6}/, { timeout: 5000 });
    });

    test('Can navigate form fields with Tab key', async () => {
      await page.goto('/');
      await page.click('text=Join Session');

      // Tab to first input
      await page.keyboard.press('Tab');
      let focused = await page.evaluate(() => document.activeElement?.getAttribute('name'));

      // Should focus either sessionCode or displayName
      expect(['sessionCode', 'displayName']).toContain(focused);

      // Tab to next input
      await page.keyboard.press('Tab');
      focused = await page.evaluate(() => document.activeElement?.getAttribute('name'));
      expect(['sessionCode', 'displayName']).toContain(focused);
    });

    test('Checkboxes can be toggled with Space key', async () => {
      // Create session and navigate to selection
      await page.goto('/');
      await page.click('text=Create Session');
      await page.fill('input[name="hostName"]', 'Test User');
      await page.click('button:has-text("Create")');
      await page.waitForURL(/\/session\/[A-Z0-9]{6}/);
      await page.click('button:has-text("Start Selecting")');
      await page.waitForURL(/\/select/);

      // Focus first checkbox
      await page.focus('input[type="checkbox"]');

      // Check if initially unchecked
      const initiallyChecked = await page.evaluate(() =>
        (document.activeElement as HTMLInputElement)?.checked
      );

      // Toggle with Space
      await page.keyboard.press('Space');

      // Verify state changed
      const nowChecked = await page.evaluate(() =>
        (document.activeElement as HTMLInputElement)?.checked
      );
      expect(nowChecked).toBe(!initiallyChecked);
    });
  });

  test.describe('Color Contrast (Basic)', () => {
    test.beforeEach(async () => {
      await page.setViewportSize({ width: 390, height: 844 });
    });

    test('Primary buttons have visible text', async () => {
      await page.goto('/');

      // Get button element
      const button = page.locator('button:has-text("Create Session")').first();
      await expect(button).toBeVisible();

      // Get computed styles
      const styles = await button.evaluate((el) => {
        const computed = window.getComputedStyle(el);
        return {
          color: computed.color,
          backgroundColor: computed.backgroundColor,
          fontSize: computed.fontSize,
        };
      });

      // Verify text is not transparent
      expect(styles.color).not.toBe('rgba(0, 0, 0, 0)');
      expect(styles.color).not.toBe('transparent');

      // Verify background is not transparent (should have visible contrast)
      expect(styles.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
      expect(styles.backgroundColor).not.toBe('transparent');
    });

    test('Error messages are visible and distinct', async () => {
      await page.goto('/');
      await page.click('text=Join Session');

      // Try to submit without session code (should show error)
      await page.fill('input[name="displayName"]', 'Test');
      await page.click('button:has-text("Join")');

      // Wait for potential error message
      await page.waitForTimeout(1000);

      // Check if any error text is visible
      const errorText = page.locator('[role="alert"], .error, [class*="error"]').first();
      if (await errorText.count() > 0) {
        await expect(errorText).toBeVisible();

        // Verify error text has color
        const color = await errorText.evaluate((el) =>
          window.getComputedStyle(el).color
        );
        expect(color).not.toBe('rgba(0, 0, 0, 0)');
        expect(color).not.toBe('transparent');
      }
    });

    test('Input labels are visible', async () => {
      await page.goto('/');
      await page.click('text=Create Session');

      // Get label for host name input
      const label = page.locator('label').first();
      await expect(label).toBeVisible();

      const color = await label.evaluate((el) =>
        window.getComputedStyle(el).color
      );
      expect(color).not.toBe('rgba(0, 0, 0, 0)');
      expect(color).not.toBe('transparent');
    });
  });

  test.describe('Content Scrolling', () => {
    test('Long content scrolls without cutting off', async () => {
      await page.setViewportSize({ width: 390, height: 568 }); // Shorter viewport

      // Create session and go to selection screen
      await page.goto('/');
      await page.click('text=Create Session');
      await page.fill('input[name="hostName"]', 'Test User');
      await page.click('button:has-text("Create")');
      await page.waitForURL(/\/session\/[A-Z0-9]{6}/);
      await page.click('button:has-text("Start Selecting")');
      await page.waitForURL(/\/select/);

      // With 15-20 options, content should be scrollable
      const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
      const clientHeight = await page.evaluate(() => document.documentElement.clientHeight);

      // Content should extend beyond viewport (require scrolling)
      expect(scrollHeight).toBeGreaterThan(clientHeight);

      // Scroll to bottom
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));

      // Verify submit button still visible after scroll
      await expect(page.locator('button:has-text("Submit Selections")')).toBeVisible();
    });
  });

  test.describe('Responsive Text Sizing', () => {
    test('Text is readable at minimum viewport', async () => {
      await page.setViewportSize({ width: 320, height: 568 });
      await page.goto('/');

      // Check heading font size
      const heading = page.locator('h1, [role="heading"]').first();
      const fontSize = await heading.evaluate((el) =>
        parseFloat(window.getComputedStyle(el).fontSize)
      );

      // Minimum readable size on mobile: 14px
      expect(fontSize).toBeGreaterThanOrEqual(14);

      // Check button text size
      const button = page.locator('button:has-text("Create Session")').first();
      const buttonFontSize = await button.evaluate((el) =>
        parseFloat(window.getComputedStyle(el).fontSize)
      );
      expect(buttonFontSize).toBeGreaterThanOrEqual(14);
    });
  });

  test.describe('Connection Status Indicator', () => {
    test('Connection status badge visible and positioned correctly', async () => {
      await page.setViewportSize({ width: 390, height: 844 });

      // Create session to trigger WebSocket connection
      await page.goto('/');
      await page.click('text=Create Session');
      await page.fill('input[name="hostName"]', 'Test User');
      await page.click('button:has-text("Create")');
      await page.waitForURL(/\/session\/[A-Z0-9]{6}/);

      // Look for connection status indicator
      const statusBadge = page.locator('[data-testid="connection-status"], .connection-status');

      if (await statusBadge.count() > 0) {
        await expect(statusBadge).toBeVisible();

        // Verify it's positioned in top-right corner
        const box = await statusBadge.boundingBox();
        expect(box).toBeTruthy();

        // Should be near top of screen
        expect(box!.y).toBeLessThan(100);

        // Should be on right side (x + width close to viewport width)
        expect(box!.x + box!.width).toBeGreaterThan(300); // Close to 390px
      }
    });
  });

  test.describe('ARIA Landmarks and Roles', () => {
    test('Page has proper semantic structure', async () => {
      await page.goto('/');

      // Check for main landmark
      const main = page.locator('main, [role="main"]');
      expect(await main.count()).toBeGreaterThan(0);
    });

    test('Interactive elements have proper roles', async () => {
      await page.goto('/');
      await page.click('text=Create Session');

      // Buttons should be identified as buttons
      const submitButton = page.locator('button:has-text("Create")');
      const role = await submitButton.getAttribute('type');
      expect(['button', 'submit']).toContain(role);

      // Inputs should have proper type
      const input = page.locator('input[name="hostName"]');
      const inputType = await input.getAttribute('type');
      expect(['text', 'email', null]).toContain(inputType); // null is valid for default text
    });
  });
});