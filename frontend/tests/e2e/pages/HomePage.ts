import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * HomePage - Page object for the landing page
 *
 * Routes: /
 * User flows:
 * - Create new session
 * - Join existing session
 * - Sign in with Google
 */
export class HomePage extends BasePage {
  // Page elements
  readonly heading: Locator;
  readonly tagline: Locator;
  readonly createSessionButton: Locator;
  readonly joinSessionButton: Locator;
  readonly googleSignInButton: Locator;
  readonly userMenu: Locator;
  readonly friendsLink: Locator;

  // Info bullets
  readonly noSignUpText: Locator;
  readonly participantsText: Locator;
  readonly privateSelectionsText: Locator;

  constructor(page: Page) {
    super(page);

    this.heading = page.getByRole('heading', { name: /Dinder/i });
    this.tagline = page.getByText(/Find restaurants everyone agrees on/i);
    this.createSessionButton = page.getByRole('button', { name: /Create Session/i });
    this.joinSessionButton = page.getByRole('button', { name: /Join Session/i });
    this.googleSignInButton = page.getByRole('button', { name: /Sign in with Google/i });
    this.userMenu = page.locator('[data-testid="user-menu"]');
    this.friendsLink = page.getByRole('link', { name: /Friends/i });

    this.noSignUpText = page.getByText(/No sign-up required/i);
    this.participantsText = page.getByText(/Up to 4 participants/i);
    this.privateSelectionsText = page.getByText(/Private selections until everyone submits/i);
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
   * Check if user is signed in
   */
  async isSignedIn(): Promise<boolean> {
    return this.userMenu.isVisible();
  }

  /**
   * Verify all expected elements are visible
   */
  async verifyPageElements(): Promise<void> {
    await expect(this.heading).toBeVisible();
    await expect(this.tagline).toBeVisible();
    await expect(this.createSessionButton).toBeVisible();
    await expect(this.joinSessionButton).toBeVisible();
    await expect(this.noSignUpText).toBeVisible();
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
