import { Page, Locator, expect } from '@playwright/test';

/**
 * CreateSessionPage - Page object for session creation
 *
 * Routes: /create
 */
export class CreateSessionPage {
  readonly heading: Locator;
  readonly nameInput: Locator;
  readonly nameCharacterCount: Locator;
  readonly createButton: Locator;
  readonly backButton: Locator;
  readonly useMyLocationButton: Locator;

  constructor(readonly page: Page) {
    this.heading = page.getByRole('heading', { name: /New session|Eat out|Order in/i });
    this.nameInput = page.getByLabel(/Your Name/i);
    this.nameCharacterCount = page.getByText(/\/50 characters/i);
    this.createButton = page.getByRole('button', { name: /Create session/i });
    this.backButton = page.getByRole('button', { name: /Back/i });
    this.useMyLocationButton = page.getByRole('button', { name: /Use My Current Location/i });
  }

  async goto(): Promise<void> {
    await this.page.goto('/create');
  }

  /**
   * Create a session with the given name
   * Returns the session code from the URL
   */
  async createSession(name: string): Promise<string> {
    await this.nameInput.fill(name);
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
    await this.backButton.click();
    await this.page.waitForURL('/');
  }

  /**
   * Grant browser geolocation and set the current location.
   */
  async setCurrentLocation(): Promise<void> {
    await this.page.context().grantPermissions(['geolocation']);
    await this.page.context().setGeolocation({
      latitude: 37.7749,
      longitude: -122.4194,
    });
    await this.useMyLocationButton.click();
    await expect(
      this.page
        .getByRole('region', { name: 'Shared search area' })
        .getByText(/37.7749|San Francisco/)
    ).toBeVisible();
  }
}
