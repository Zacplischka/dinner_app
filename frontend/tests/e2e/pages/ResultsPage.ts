import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * ResultsPage - Page object for session results display
 *
 * Routes: /session/:sessionCode/results
 * User flows:
 * - View overlapping restaurant choices
 * - See restaurant details
 * - Start new session
 * - Return home
 */
export class ResultsPage extends BasePage {
  // Page elements
  readonly heading: Locator;
  readonly resultsContainer: Locator;
  readonly restaurantCards: Locator;
  readonly noMatchesMessage: Locator;
  readonly matchCount: Locator;

  // Restaurant details
  readonly topMatch: Locator;
  readonly restaurantName: Locator;
  readonly restaurantRating: Locator;
  readonly restaurantAddress: Locator;
  readonly restaurantLink: Locator;

  // Actions
  readonly startNewSessionButton: Locator;
  readonly goHomeButton: Locator;
  readonly shareResultsButton: Locator;

  constructor(page: Page) {
    super(page);

    this.heading = page.getByRole('heading', { name: /Results|Matches|Top Picks/i });
    this.resultsContainer = page.locator('[data-testid="results"]').or(
      page.locator('[class*="results"]')
    );
    this.restaurantCards = page.locator('[data-testid="result-card"]').or(
      page.locator('[class*="result-card"]')
    );
    this.noMatchesMessage = page.getByText(/No matches|No overlaps|Try again/i);
    this.matchCount = page.locator('[data-testid="match-count"]').or(
      page.getByText(/\d+ match/i)
    );

    this.topMatch = page.locator('[data-testid="top-match"]').or(
      page.locator('[class*="top-match"]')
    );
    this.restaurantName = page.locator('[class*="restaurant-name"]').first();
    this.restaurantRating = page.locator('[class*="rating"]').first();
    this.restaurantAddress = page.locator('[class*="address"]').first();
    this.restaurantLink = page.getByRole('link', { name: /View|Directions|Google Maps/i });

    this.startNewSessionButton = page.getByRole('button', { name: /New Session|Start Over/i });
    this.goHomeButton = page.getByRole('button', { name: /Home|Done/i });
    this.shareResultsButton = page.getByRole('button', { name: /Share/i });
  }

  async goto(sessionCode: string): Promise<void> {
    await this.page.goto(`/session/${sessionCode}/results`);
    await this.waitForPageLoad();
  }

  /**
   * Get number of matching restaurants
   */
  async getMatchCount(): Promise<number> {
    const cards = await this.restaurantCards.all();
    return cards.length;
  }

  /**
   * Check if there are any matches
   */
  async hasMatches(): Promise<boolean> {
    const count = await this.getMatchCount();
    return count > 0;
  }

  /**
   * Get details of the top match
   */
  async getTopMatchDetails(): Promise<{
    name: string;
    rating?: string;
    address?: string;
  }> {
    const name = await this.restaurantName.textContent() || '';
    const rating = await this.restaurantRating.textContent().catch(() => undefined);
    const address = await this.restaurantAddress.textContent().catch(() => undefined);

    return {
      name: name.trim(),
      rating: rating?.trim(),
      address: address?.trim(),
    };
  }

  /**
   * Get all match names
   */
  async getAllMatchNames(): Promise<string[]> {
    const cards = await this.restaurantCards.all();
    const names: string[] = [];

    for (const card of cards) {
      const nameEl = card.locator('[class*="name"]').first();
      const name = await nameEl.textContent();
      if (name) names.push(name.trim());
    }

    return names;
  }

  /**
   * Start a new session
   */
  async startNewSession(): Promise<void> {
    await this.startNewSessionButton.click();
    await this.page.waitForURL(/\/create/);
  }

  /**
   * Go back to home
   */
  async goHome(): Promise<void> {
    await this.goHomeButton.click();
    await this.page.waitForURL('/');
  }

  /**
   * Share results
   */
  async shareResults(): Promise<void> {
    await this.shareResultsButton.click();
    // Handle share dialog or clipboard copy
  }

  /**
   * Click on a restaurant link
   */
  async clickRestaurantLink(index = 0): Promise<void> {
    const links = await this.restaurantLink.all();
    if (links[index]) {
      await links[index].click();
    }
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
