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
   * Verify results page elements
   */
  async verifyPageElements(): Promise<void> {
    // Either show matches or no-matches message
    const hasMatches = await this.hasMatches();
    if (hasMatches) {
      await expect(this.restaurantCards.first()).toBeVisible();
    } else {
      await expect(this.noMatchesMessage).toBeVisible();
    }

    // Navigation should always be visible
    await expect(
      this.goHomeButton.or(this.startNewSessionButton)
    ).toBeVisible();
  }
}
