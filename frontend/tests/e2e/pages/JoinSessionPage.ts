import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * JoinSessionPage - Page object for joining existing sessions
 *
 * Routes: /join
 */
export class JoinSessionPage extends BasePage {
  readonly heading: Locator;
  readonly sessionCodeInput: Locator;
  readonly nameInput: Locator;
  readonly joinButton: Locator;
  readonly backButton: Locator;

  constructor(page: Page) {
    super(page);

    this.heading = page.getByRole('heading', { name: /Join Session/i });
    this.sessionCodeInput = page.getByLabel(/Session Code/i);
    this.nameInput = page.getByLabel(/Your Name/i);
    this.joinButton = page.getByRole('button', { name: /Join Session/i });
    this.backButton = page.getByRole('button', { name: /Back/i });
  }

  async goto(): Promise<void> {
    await this.page.goto('/join');
    await this.waitForPageLoad();
  }

  /**
   * Fill in session code (auto-uppercased)
   */
  async enterSessionCode(code: string): Promise<void> {
    await this.sessionCodeInput.fill(code);
  }

  /**
   * Fill in name
   */
  async enterName(name: string): Promise<void> {
    await this.nameInput.fill(name);
  }

  /**
   * Join a session with given code and name
   */
  async joinSession(sessionCode: string, name: string): Promise<void> {
    await this.enterSessionCode(sessionCode);
    await this.enterName(name);
    await this.joinButton.click();

    // Wait for navigation to session lobby
    await this.page.waitForURL(/\/session\/[A-Z0-9]+$/, { timeout: 10_000 });
  }

  /**
   * Cancel and return home
   */
  async cancel(): Promise<void> {
    await this.backButton.click();
    await this.page.waitForURL('/');
  }

  /**
   * Get the current value of session code input
   */
  async getSessionCodeValue(): Promise<string> {
    return await this.sessionCodeInput.inputValue();
  }

  /**
   * Verify session code is uppercase
   */
  async verifySessionCodeUppercase(expectedCode: string): Promise<void> {
    const value = await this.getSessionCodeValue();
    expect(value).toBe(expectedCode.toUpperCase());
  }

  /**
   * Verify page elements
   */
  async verifyPageElements(): Promise<void> {
    await expect(this.heading).toBeVisible();
    await expect(this.sessionCodeInput).toBeVisible();
    await expect(this.nameInput).toBeVisible();
    await expect(this.joinButton).toBeVisible();
    await expect(this.backButton).toBeVisible();
  }
}
