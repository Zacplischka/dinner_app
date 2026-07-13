import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * SelectionPage - Page object for Tinder-style restaurant selection
 *
 * Routes: /session/:sessionCode/select
 */
export class SelectionPage extends BasePage {
  readonly likeButton: Locator;
  readonly passButton: Locator;
  readonly submitButton: Locator;
  readonly loadingState: Locator;
  readonly waitingState: Locator;

  constructor(page: Page) {
    super(page);

    this.likeButton = page.getByRole('button', { name: /Like/i }).or(
      page.locator('button[aria-label="Like"]')
    );
    this.passButton = page.getByRole('button', { name: /Pass|Nope/i }).or(
      page.locator('button[aria-label="Pass"]')
    );
    this.submitButton = page.getByRole('button', { name: /Submit/i });

    this.loadingState = page.getByText(/Finding restaurants/i);
    this.waitingState = page.getByText(/Waiting for|other diners/i);
  }

  /**
   * Like the current restaurant (swipe right)
   */
  async likeRestaurant(): Promise<void> {
    await this.likeButton.click();
    // Brief wait for animation
    await this.page.waitForTimeout(300);
  }

  /**
   * Pass on the current restaurant (swipe left)
   */
  async passRestaurant(): Promise<void> {
    await this.passButton.click();
    await this.page.waitForTimeout(300);
  }

  /**
   * Pass all remaining restaurants
   */
  async passAllRemaining(): Promise<void> {
    while (await this.passButton.isVisible() && await this.passButton.isEnabled()) {
      await this.passRestaurant();
      if (await this.submitButton.isVisible()) {
        break;
      }
    }
  }

  /**
   * Submit selections and wait for results or waiting state
   */
  async submitSelections(): Promise<void> {
    await expect(this.submitButton).toBeVisible();
    await this.submitButton.click();

    // Wait for either waiting state or results navigation
    await Promise.race([
      this.waitingState.waitFor({ state: 'visible', timeout: 10_000 }),
      this.page.waitForURL(/\/results/, { timeout: 10_000 }),
    ]).catch(() => {});
  }
}
