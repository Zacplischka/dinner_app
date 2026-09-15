import { Page, Locator, expect } from '@playwright/test';

/**
 * SessionLobbyPage - Page object for session waiting room
 *
 * Routes: /session/:sessionCode
 */
export class SessionLobbyPage {
  readonly participantsList: Locator;
  readonly startButton: Locator;
  readonly leaveButton: Locator;

  constructor(readonly page: Page) {
    this.participantsList = page.locator('[data-testid="participants-list"]');
    this.startButton = page.getByRole('button', { name: /Start/i });
    this.leaveButton = page.getByRole('button', { name: /Back|Leave|Exit/i });
  }

  /**
   * Wait for a specific participant to join
   */
  async waitForParticipant(name: string, timeout = 10_000): Promise<void> {
    await this.page.getByText(name, { exact: true }).waitFor({ state: 'visible', timeout });
  }

  /**
   * Start the session (host only)
   */
  async ready(): Promise<void> {
    const ready = this.page.getByRole('button', { name: 'I’m ready', exact: true });
    const confirmed = this.page.getByRole('button', { name: 'Ready — change my confirmation' });
    // The URL can arrive before the lazy page/reconciliation has finished.
    await expect(ready.or(confirmed)).toBeVisible();
    if (await ready.isVisible()) {
      await ready.click();
      await expect(confirmed).toBeEnabled();
    }
  }

  async startSession(): Promise<void> {
    await this.ready();
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
    const confirmButton = this.page
      .getByRole('dialog')
      .getByRole('button', { name: /^Leave session$/i });
    if (await confirmButton.isVisible()) {
      await confirmButton.click();
    }

    await this.page.waitForURL('/');
  }
}
