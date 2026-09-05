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
  readonly progress: Locator;

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
    // The waiting screen's heading, not a /Waiting for/ text match: any other
    // sentence starting "Waiting for" would make that locator ambiguous.
    this.waitingState = page.getByRole('heading', { name: 'All Done!' });
    this.progress = page.getByRole('progressbar', { name: /Deck progress|Restaurant progress/ });
  }

  /**
   * Like the current restaurant (swipe right)
   */
  async likeRestaurant(): Promise<void> {
    await this.swipe(this.likeButton);
  }

  /**
   * Pass on the current restaurant (swipe left)
   */
  async passRestaurant(): Promise<void> {
    await this.swipe(this.passButton);
  }

  /**
   * Click a swipe button and wait on the Deck, not the clock: the header's
   * counter advanced past the card we were on, or the last card gave way to
   * the Submit screen.
   */
  private async swipe(button: Locator): Promise<void> {
    const before = await this.progress.getAttribute('aria-valuenow');
    await button.click();
    const advanced = this.page.locator(`[role="progressbar"]:not([aria-valuenow="${before}"])`);
    await expect(advanced.or(this.submitButton)).toBeVisible();
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

    // The Session holds us on the waiting screen or moves everyone on to the
    // Match. Anything else is a failed submit, and it fails here, loudly.
    await Promise.race([
      this.waitingState.waitFor({ state: 'visible', timeout: 10_000 }),
      this.page.waitForURL(/\/results/, { timeout: 10_000 }),
    ]);
  }
}
