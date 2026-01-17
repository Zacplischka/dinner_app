import { Page, Locator, expect } from '@playwright/test';

/**
 * BasePage - Abstract base class for all page objects
 *
 * Provides common functionality:
 * - Navigation helpers
 * - Wait utilities
 * - Toast/notification handling
 * - Loading state management
 * - Accessibility checks
 */
export abstract class BasePage {
  readonly page: Page;

  // Common elements across pages
  protected readonly loadingSpinner: Locator;
  protected readonly toastContainer: Locator;

  constructor(page: Page) {
    this.page = page;
    this.loadingSpinner = page.locator('[class*="animate-spin"]');
    this.toastContainer = page.locator('[data-testid="toast"]');
  }

  /**
   * Navigate to this page's URL
   */
  abstract goto(): Promise<void>;

  /**
   * Wait for the page to be fully loaded
   */
  async waitForPageLoad(): Promise<void> {
    // Wait for React suspense fallback to disappear
    await this.page.waitForSelector('text=Loading...', {
      state: 'hidden',
      timeout: 15_000,
    }).catch(() => {
      // Loading may have already finished
    });

    // Wait for network to be idle
    await this.page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {
      // Network may never be fully idle with WebSocket
    });
  }

  /**
   * Wait for loading spinner to disappear
   */
  async waitForLoadingComplete(): Promise<void> {
    await this.loadingSpinner.waitFor({ state: 'hidden', timeout: 30_000 });
  }

  /**
   * Check if toast notification is visible with specific text
   */
  async hasToast(text: string): Promise<boolean> {
    const toast = this.page.getByText(text);
    return toast.isVisible();
  }

  /**
   * Wait for and verify toast message
   */
  async expectToast(text: string | RegExp): Promise<void> {
    await expect(this.page.getByText(text)).toBeVisible({ timeout: 5_000 });
  }

  /**
   * Get current URL path
   */
  async getCurrentPath(): Promise<string> {
    const url = new URL(this.page.url());
    return url.pathname;
  }

  /**
   * Take a screenshot for visual regression
   */
  async takeScreenshot(name: string): Promise<void> {
    await this.page.screenshot({
      path: `./test-results/screenshots/${name}.png`,
      fullPage: true,
    });
  }

  /**
   * Check basic accessibility - no ARIA violations
   */
  async checkAccessibility(): Promise<void> {
    // Verify all buttons have accessible names
    const buttons = await this.page.getByRole('button').all();
    for (const button of buttons) {
      const name = await button.getAttribute('aria-label') || await button.textContent();
      expect(name?.trim()).toBeTruthy();
    }

    // Verify all inputs have labels
    const inputs = await this.page.locator('input').all();
    for (const input of inputs) {
      const id = await input.getAttribute('id');
      if (id) {
        const label = this.page.locator(`label[for="${id}"]`);
        const ariaLabel = await input.getAttribute('aria-label');
        const hasLabel = await label.count() > 0 || !!ariaLabel;
        expect(hasLabel).toBeTruthy();
      }
    }
  }

  /**
   * Simulate mobile viewport
   */
  async setMobileViewport(): Promise<void> {
    await this.page.setViewportSize({ width: 390, height: 844 });
  }

  /**
   * Simulate tablet viewport
   */
  async setTabletViewport(): Promise<void> {
    await this.page.setViewportSize({ width: 768, height: 1024 });
  }

  /**
   * Simulate desktop viewport
   */
  async setDesktopViewport(): Promise<void> {
    await this.page.setViewportSize({ width: 1280, height: 720 });
  }
}
