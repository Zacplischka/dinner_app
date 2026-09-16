import { Page, Locator } from '@playwright/test';

/**
 * JoinSessionPage - Page object for joining existing sessions
 *
 * Routes: /join
 */
export class JoinSessionPage {
  readonly heading: Locator;
  readonly sessionCodeInput: Locator;
  readonly nameInput: Locator;
  readonly joinButton: Locator;
  readonly backButton: Locator;

  constructor(readonly page: Page) {
    this.heading = page.getByRole('heading', { name: /Join a session/i });
    this.sessionCodeInput = page.getByLabel(/Session code/i);
    this.nameInput = page.getByLabel(/Your Name/i);
    this.joinButton = page.getByRole('button', { name: /Join session/i });
    this.backButton = page.getByRole('button', { name: /Back/i });
  }

  async goto(): Promise<void> {
    await this.page.goto('/join');
  }

  /**
   * Join a session with given code and name
   */
  async joinSession(sessionCode: string, name: string): Promise<void> {
    await this.sessionCodeInput.fill(sessionCode);
    await this.nameInput.fill(name);
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
}
