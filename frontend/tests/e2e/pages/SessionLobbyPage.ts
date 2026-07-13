import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * SessionLobbyPage - Page object for session waiting room
 *
 * Routes: /session/:sessionCode
 */
export class SessionLobbyPage extends BasePage {
  readonly participantsList: Locator;
  readonly startButton: Locator;
  readonly leaveButton: Locator;

  constructor(page: Page) {
    super(page);

    this.participantsList = page.locator('[data-testid="participants-list"]').or(
      page.locator('[class*="participants"]')
    );
    this.startButton = page.getByRole('button', { name: /Start/i });
    this.leaveButton = page.getByRole('button', { name: /Leave|Exit/i });
  }

  /**
   * Get list of participant names
   */
  async getParticipants(): Promise<string[]> {
    const participantElements = await this.participantsList.locator('li, [class*="participant"]').all();
    const names: string[] = [];
    for (const el of participantElements) {
      const name = await el.textContent();
      if (name) names.push(name.trim());
    }
    return names;
  }

  /**
   * Wait for a specific participant to join
   */
  async waitForParticipant(name: string, timeout = 10_000): Promise<void> {
    await this.page.getByText(name).waitFor({ state: 'visible', timeout });
  }

  /**
   * Start the session (host only)
   */
  async startSession(): Promise<void> {
    await expect(this.startButton).toBeEnabled();
    await this.startButton.click();

    // Wait for navigation to selection page
    await this.page.waitForURL(/\/session\/[A-Z0-9]+\/select/, { timeout: 10_000 });
  }

  /**
   * Leave the session
   */
  async leaveSession(): Promise<void> {
    await this.leaveButton.click();

    // Handle confirmation modal if present
    const confirmButton = this.page.getByRole('button', { name: /Confirm|Yes|Leave/i });
    if (await confirmButton.isVisible()) {
      await confirmButton.click();
    }

    await this.page.waitForURL('/');
  }
}
