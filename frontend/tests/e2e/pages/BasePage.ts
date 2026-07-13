import { Page } from '@playwright/test';

/**
 * BasePage - shared functionality for all page objects.
 */
export abstract class BasePage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

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
   * Simulate mobile viewport
   */
  async setMobileViewport(): Promise<void> {
    await this.page.setViewportSize({ width: 390, height: 844 });
  }
}
