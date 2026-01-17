import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * CreateSessionPage - Page object for session creation
 *
 * Routes: /create
 * User flows:
 * - Enter name and create session
 * - Set location for restaurant search
 * - Cancel and return home
 */
export class CreateSessionPage extends BasePage {
  // Page elements
  readonly heading: Locator;
  readonly nameInput: Locator;
  readonly nameCharacterCount: Locator;
  readonly createButton: Locator;
  readonly cancelButton: Locator;

  // Location elements (if available)
  readonly locationInput: Locator;
  readonly useMyLocationButton: Locator;

  constructor(page: Page) {
    super(page);

    this.heading = page.getByRole('heading', { name: /Create Session/i });
    this.nameInput = page.getByLabel(/Your Name/i);
    this.nameCharacterCount = page.getByText(/\/50 characters/i);
    this.createButton = page.getByRole('button', { name: /Create Session/i });
    this.cancelButton = page.getByRole('button', { name: /Cancel/i });

    this.locationInput = page.getByLabel(/Location/i);
    this.useMyLocationButton = page.getByRole('button', { name: /Use my location/i });
  }

  async goto(): Promise<void> {
    await this.page.goto('/create');
    await this.waitForPageLoad();
  }

  /**
   * Fill in the name field
   */
  async enterName(name: string): Promise<void> {
    await this.nameInput.fill(name);
  }

  /**
   * Create a session with the given name
   * Returns the session code from the URL
   */
  async createSession(name: string): Promise<string> {
    await this.enterName(name);
    await this.createButton.click();

    // Wait for navigation to session lobby
    await this.page.waitForURL(/\/session\/[A-Z0-9]+$/, { timeout: 10_000 });

    // Extract session code from URL
    const url = this.page.url();
    const match = url.match(/\/session\/([A-Z0-9]+)/);
    return match?.[1] || '';
  }

  /**
   * Click cancel and return to home
   */
  async cancel(): Promise<void> {
    await this.cancelButton.click();
    await this.page.waitForURL('/');
  }

  /**
   * Get current character count display
   */
  async getCharacterCountText(): Promise<string> {
    return await this.nameCharacterCount.textContent() || '';
  }

  /**
   * Verify page elements are visible
   */
  async verifyPageElements(): Promise<void> {
    await expect(this.heading).toBeVisible();
    await expect(this.nameInput).toBeVisible();
    await expect(this.createButton).toBeVisible();
    await expect(this.cancelButton).toBeVisible();
  }

  /**
   * Verify submit button state based on name
   */
  async verifySubmitButtonState(shouldBeEnabled: boolean): Promise<void> {
    if (shouldBeEnabled) {
      await expect(this.createButton).toBeEnabled();
    } else {
      await expect(this.createButton).toBeDisabled();
    }
  }
}
