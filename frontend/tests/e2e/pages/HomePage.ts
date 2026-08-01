import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * HomePage - Page object for the entry fork (#255)
 *
 * Routes: /
 * `/` asks "Tonight you're…" with three Branch cards; Join-with-code and
 * Compare are a demoted text row.
 */
export class HomePage extends BasePage {
  readonly heading: Locator;
  readonly eatOutCard: Locator;
  readonly takeawayCard: Locator;
  readonly cookCard: Locator;
  readonly joinLink: Locator;
  readonly compareLink: Locator;
  readonly guestModeText: Locator;

  constructor(page: Page) {
    super(page);

    this.heading = page.getByRole('heading', { name: /Tonight you/i });
    this.eatOutCard = page.getByRole('button', { name: /Eating out/i });
    this.takeawayCard = page.getByRole('button', { name: /Getting takeaway/i });
    this.cookCard = page.getByRole('button', { name: /Cooking/i });
    this.joinLink = page.getByRole('button', { name: /Join with a code/i });
    this.compareLink = page.getByRole('button', { name: /Compare delivery prices/i });
    this.guestModeText = page.getByText(/Sign in to save history & invite friends/i);
  }

  async goto(): Promise<void> {
    await this.page.goto('/');
    await this.waitForPageLoad();
  }

  /**
   * Pick the Eat Out Branch card and land on the create flow
   */
  async clickCreateSession(): Promise<void> {
    await this.eatOutCard.click();
    await this.page.waitForURL(/\/create/);
  }

  /**
   * Open Join with a code from the text row
   */
  async clickJoinSession(): Promise<void> {
    await this.joinLink.click();
    await this.page.waitForURL(/\/join/);
  }

  /**
   * Verify all expected elements are visible
   */
  async verifyPageElements(): Promise<void> {
    await expect(this.heading).toBeVisible();
    await expect(this.eatOutCard).toBeVisible();
    await expect(this.takeawayCard).toBeVisible();
    await expect(this.cookCard).toBeVisible();
    await expect(this.joinLink).toBeVisible();
    await expect(this.compareLink).toBeVisible();
    await expect(this.guestModeText).toBeVisible();
  }

  /**
   * Verify buttons are enabled and clickable
   */
  async verifyButtonsEnabled(): Promise<void> {
    await expect(this.eatOutCard).toBeEnabled();
    await expect(this.takeawayCard).toBeEnabled();
    await expect(this.cookCard).toBeEnabled();
    await expect(this.joinLink).toBeEnabled();
  }
}
