import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * WatchSetupPage - Page object for the Watch Branch's Mood setup (#369)
 *
 * Routes: /watch
 * Genre and decade chips are toggle buttons (`aria-pressed`); the Session is
 * created and its Movie Deck dealt on "Start swiping".
 */
export class WatchSetupPage extends BasePage {
  readonly heading: Locator;
  readonly nameInput: Locator;
  readonly startButton: Locator;
  readonly backButton: Locator;

  constructor(page: Page) {
    super(page);

    this.heading = page.getByRole('heading', { name: /Watch something/i });
    this.nameInput = page.getByLabel(/Your Name/i);
    this.startButton = page.getByRole('button', { name: /Create session/i });
    this.backButton = page.getByRole('button', { name: /Back/i });
  }

  async goto(): Promise<void> {
    await this.page.goto('/watch');
    await this.waitForPageLoad();
  }

  /**
   * A genre or decade chip by its exact label ("Comedy", "1990s")
   */
  chip(label: string): Locator {
    return this.page.getByRole('button', { name: label, exact: true });
  }

  /**
   * Toggle a chip on and confirm it took
   */
  async pickChip(label: string): Promise<void> {
    const interests = this.page
      .locator('details')
      .filter({ has: this.page.locator('summary').filter({ hasText: /^Optional interests/ }) });
    if (!(await interests.evaluate((element) => element.hasAttribute('open'))))
      await interests.locator('summary').click();
    await this.chip(label).click();
    await expect(this.chip(label)).toHaveAttribute('aria-pressed', 'true');
  }

  async enterName(name: string): Promise<void> {
    await this.nameInput.fill(name);
  }

  /**
   * Start swiping and land in the lobby
   * Returns the session code from the URL
   */
  async createSession(): Promise<string> {
    await this.startButton.click();
    await this.page.waitForURL(/\/session\/[A-Z0-9]+$/, { timeout: 10_000 });
    return this.page.url().match(/\/session\/([A-Z0-9]+)/)?.[1] ?? '';
  }
}
