import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * HomePage - Page object for the landing page
 *
 * Routes: /
 */
export class HomePage extends BasePage {
  readonly heading: Locator;
  readonly tagline: Locator;
  readonly createSessionButton: Locator;
  readonly joinSessionButton: Locator;
  readonly guestModeText: Locator;
  readonly participantsText: Locator;
  readonly privateSelectionsText: Locator;

  constructor(page: Page) {
    super(page);

    this.heading = page.getByRole('heading', { name: /Dinder/i });
    this.tagline = page.getByText(/Find restaurants everyone agrees on/i);
    this.createSessionButton = page.getByRole('button', { name: /Create Session/i });
    this.joinSessionButton = page.getByRole('button', { name: /Join Session/i });
    this.guestModeText = page.getByText(/Sign in to save history & invite friends/i);
    this.participantsText = page.getByText(/Up to 4/i);
    this.privateSelectionsText = page.getByText(/Private votes/i);
  }

  async goto(): Promise<void> {
    await this.page.goto('/');
    await this.waitForPageLoad();
  }

  /**
   * Click Create Session and navigate to create page
   */
  async clickCreateSession(): Promise<void> {
    await this.createSessionButton.click();
    await this.page.waitForURL(/\/create/);
  }

  /**
   * Click Join Session and navigate to join page
   */
  async clickJoinSession(): Promise<void> {
    await this.joinSessionButton.click();
    await this.page.waitForURL(/\/join/);
  }

  /**
   * Verify all expected elements are visible
   */
  async verifyPageElements(): Promise<void> {
    await expect(this.heading).toBeVisible();
    await expect(this.tagline).toBeVisible();
    await expect(this.createSessionButton).toBeVisible();
    await expect(this.joinSessionButton).toBeVisible();
    await expect(this.guestModeText).toBeVisible();
    await expect(this.participantsText).toBeVisible();
    await expect(this.privateSelectionsText).toBeVisible();
  }

  /**
   * Verify buttons are enabled and clickable
   */
  async verifyButtonsEnabled(): Promise<void> {
    await expect(this.createSessionButton).toBeEnabled();
    await expect(this.joinSessionButton).toBeEnabled();
  }
}
