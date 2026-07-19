import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * ResultsPage - Page object for session results display
 *
 * Routes: /session/:sessionCode/results
 */
export class ResultsPage extends BasePage {
  readonly restaurantCards: Locator;
  readonly noMatchesMessage: Locator;
  readonly startNewSessionButton: Locator;
  readonly goHomeButton: Locator;

  constructor(page: Page) {
    super(page);

    this.restaurantCards = page.locator('[data-match-card]');
    this.noMatchesMessage = page.getByText(
      /No restaurants were selected|No matches|No overlaps|Try again/i
    );
    this.startNewSessionButton = page.getByRole('button', {
      name: /New Session|Start Over|Start Fresh/i,
    });
    this.goHomeButton = page.getByRole('button', { name: /Home|Done/i });
  }

  /**
   * Check if there are any matches
   */
  async hasMatches(): Promise<boolean> {
    return (await this.restaurantCards.count()) > 0;
  }

  /**
   * Verify the Match results page. This is the Match scenario's assertion: a
   * Match card MUST be shown. The no-match fallback is a failure here — an
   * either/or check would let a broken Match silently pass as "no matches".
   */
  async verifyPageElements(): Promise<void> {
    await expect(this.restaurantCards.first()).toBeVisible();
    await expect(this.noMatchesMessage).toBeHidden();

    // Navigation should always be visible
    await expect(this.goHomeButton.or(this.startNewSessionButton)).toBeVisible();
  }
}
