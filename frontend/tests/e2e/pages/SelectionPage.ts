import { Page, Locator, expect } from '@playwright/test';

/**
 * SelectionPage - Page object for Tinder-style Deck selection (Restaurants, Recipes or Movies)
 *
 * Routes: /session/:sessionCode/select
 */
export class SelectionPage {
  readonly heading: Locator;
  readonly swipeCard: Locator;
  readonly scoreBadge: Locator;
  readonly likeButton: Locator;
  readonly passButton: Locator;
  readonly submitButton: Locator;
  readonly waitingState: Locator;
  readonly finishHereButton: Locator;
  readonly progress: Locator;

  constructor(readonly page: Page) {
    this.heading = page.locator('header').getByRole('heading').first();
    this.swipeCard = page.locator('[data-swipe-card]');
    this.scoreBadge = this.swipeCard.getByText(/\d+% on TMDB/);
    this.likeButton = page.getByRole('button', { name: /Like/i });
    this.passButton = page.getByRole('button', { name: /Pass|Nope/i });
    this.submitButton = page.getByRole('button', { name: /Submit/i });

    // The waiting screen's heading, not a /Waiting for/ text match: any other
    // sentence starting "Waiting for" would make that locator ambiguous.
    this.waitingState = page.getByRole('heading', { name: 'All done!' });
    this.progress = page.getByRole('progressbar', { name: /Deck progress|Restaurant progress/ });
    // Full House takeover (#187): submits the like that completed it
    this.finishHereButton = page.getByRole('dialog').getByRole('button', { name: 'Finish here' });
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
    while ((await this.passButton.isVisible()) && (await this.passButton.isEnabled())) {
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
