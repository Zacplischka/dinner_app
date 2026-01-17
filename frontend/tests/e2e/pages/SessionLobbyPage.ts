import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * SessionLobbyPage - Page object for session waiting room
 *
 * Routes: /session/:sessionCode
 * User flows:
 * - Host waits for participants
 * - Copy session code to share
 * - Participant joins and sees lobby
 * - Start session when ready
 * - Leave session
 */
export class SessionLobbyPage extends BasePage {
  // Page elements
  readonly heading: Locator;
  readonly sessionCodeDisplay: Locator;
  readonly copyCodeButton: Locator;
  readonly participantsList: Locator;
  readonly startButton: Locator;
  readonly leaveButton: Locator;
  readonly waitingMessage: Locator;
  readonly connectionStatus: Locator;

  // Participant indicators
  readonly participantCount: Locator;

  constructor(page: Page) {
    super(page);

    this.heading = page.getByRole('heading', { name: /Session|Lobby|Waiting/i });
    this.sessionCodeDisplay = page.getByTestId('session-code').or(
      page.locator('[class*="session-code"]')
    );
    this.copyCodeButton = page.getByRole('button', { name: /Copy|Share/i });
    this.participantsList = page.locator('[data-testid="participants-list"]').or(
      page.locator('[class*="participants"]')
    );
    this.startButton = page.getByRole('button', { name: /Start/i });
    this.leaveButton = page.getByRole('button', { name: /Leave|Exit/i });
    this.waitingMessage = page.getByText(/Waiting for/i);
    this.connectionStatus = page.locator('[class*="connection"]').or(
      page.getByText(/Connected|Disconnected/i)
    );
    this.participantCount = page.locator('[data-testid="participant-count"]');
  }

  async goto(sessionCode?: string): Promise<void> {
    if (sessionCode) {
      await this.page.goto(`/session/${sessionCode}`);
    }
    await this.waitForPageLoad();
  }

  /**
   * Get displayed session code
   */
  async getSessionCode(): Promise<string> {
    // Try to find session code in various locations
    const codeElement = this.page.locator('[class*="session"]').filter({ hasText: /[A-Z0-9]{6}/ });
    const text = await codeElement.first().textContent();
    const match = text?.match(/[A-Z0-9]{6}/);
    return match?.[0] || '';
  }

  /**
   * Copy session code to clipboard
   */
  async copySessionCode(): Promise<void> {
    await this.copyCodeButton.click();
    // Optionally verify toast
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

  /**
   * Check if current user is host (can see start button)
   */
  async isHost(): Promise<boolean> {
    return this.startButton.isVisible();
  }

  /**
   * Verify lobby elements
   */
  async verifyPageElements(): Promise<void> {
    await expect(this.waitingMessage.or(this.heading)).toBeVisible();
    await expect(this.leaveButton.or(this.page.getByRole('button', { name: /Back/i }))).toBeVisible();
  }

  /**
   * Wait for session to start (non-host participants)
   */
  async waitForSessionStart(timeout = 30_000): Promise<void> {
    await this.page.waitForURL(/\/session\/[A-Z0-9]+\/select/, { timeout });
  }
}
