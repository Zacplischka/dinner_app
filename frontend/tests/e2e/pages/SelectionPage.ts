import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * SelectionPage - Page object for Tinder-style restaurant selection
 *
 * Routes: /session/:sessionCode/select
 * User flows:
 * - Swipe right to like restaurants
 * - Swipe left to pass
 * - View restaurant details
 * - Submit selections
 * - Wait for other participants
 */
export class SelectionPage extends BasePage {
  // Page elements
  readonly heading: Locator;
  readonly restaurantCard: Locator;
  readonly restaurantName: Locator;
  readonly restaurantRating: Locator;
  readonly restaurantPrice: Locator;
  readonly restaurantCuisine: Locator;

  // Action buttons
  readonly likeButton: Locator;
  readonly passButton: Locator;
  readonly undoButton: Locator;
  readonly submitButton: Locator;

  // Progress indicators
  readonly progressIndicator: Locator;
  readonly likesCount: Locator;
  readonly participantStatus: Locator;

  // States
  readonly loadingState: Locator;
  readonly waitingState: Locator;
  readonly allDoneState: Locator;
  readonly submitState: Locator;

  constructor(page: Page) {
    super(page);

    this.heading = page.getByRole('heading', { name: /Choose|Select|Restaurant/i });
    this.restaurantCard = page.locator('[class*="card"]').first();
    this.restaurantName = page.locator('[class*="restaurant-name"]').or(
      page.locator('[data-testid="restaurant-name"]')
    );
    this.restaurantRating = page.locator('[class*="rating"]');
    this.restaurantPrice = page.locator('[class*="price"]');
    this.restaurantCuisine = page.locator('[class*="cuisine"]');

    this.likeButton = page.getByRole('button', { name: /Like/i }).or(
      page.locator('button[aria-label="Like"]')
    );
    this.passButton = page.getByRole('button', { name: /Pass|Nope/i }).or(
      page.locator('button[aria-label="Pass"]')
    );
    this.undoButton = page.getByRole('button', { name: /Undo/i }).or(
      page.locator('button[aria-label="Undo"]')
    );
    this.submitButton = page.getByRole('button', { name: /Submit/i });

    this.progressIndicator = page.locator('[class*="progress"]');
    this.likesCount = page.locator('[class*="likes"]').or(
      page.locator('text=/\\d+ liked/i')
    );
    this.participantStatus = page.locator('[class*="participant-status"]');

    this.loadingState = page.getByText(/Finding restaurants/i);
    this.waitingState = page.getByText(/Waiting for|other diners/i);
    this.allDoneState = page.getByText(/All Done|You've seen them all/i);
    this.submitState = page.getByText(/Submit/i);
  }

  async goto(sessionCode: string): Promise<void> {
    await this.page.goto(`/session/${sessionCode}/select`);
    await this.waitForPageLoad();
    // Wait for restaurants to load
    await this.loadingState.waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {});
  }

  /**
   * Like the current restaurant (swipe right)
   */
  async likeRestaurant(): Promise<void> {
    await this.likeButton.click();
    // Brief wait for animation
    await this.page.waitForTimeout(300);
  }

  /**
   * Pass on the current restaurant (swipe left)
   */
  async passRestaurant(): Promise<void> {
    await this.passButton.click();
    await this.page.waitForTimeout(300);
  }

  /**
   * Undo last action
   */
  async undoLastAction(): Promise<void> {
    await this.undoButton.click();
    await this.page.waitForTimeout(300);
  }

  /**
   * Simulate swipe gesture to the right (like)
   */
  async swipeRight(): Promise<void> {
    const card = this.restaurantCard;
    const box = await card.boundingBox();
    if (!box) return;

    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    await this.page.mouse.move(startX, startY);
    await this.page.mouse.down();
    await this.page.mouse.move(startX + 200, startY, { steps: 10 });
    await this.page.mouse.up();

    await this.page.waitForTimeout(500);
  }

  /**
   * Simulate swipe gesture to the left (pass)
   */
  async swipeLeft(): Promise<void> {
    const card = this.restaurantCard;
    const box = await card.boundingBox();
    if (!box) return;

    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    await this.page.mouse.move(startX, startY);
    await this.page.mouse.down();
    await this.page.mouse.move(startX - 200, startY, { steps: 10 });
    await this.page.mouse.up();

    await this.page.waitForTimeout(500);
  }

  /**
   * Go through all restaurants with specified actions
   * @param actions Array of 'like' or 'pass' for each restaurant
   */
  async selectRestaurants(actions: ('like' | 'pass')[]): Promise<void> {
    for (const action of actions) {
      if (action === 'like') {
        await this.likeRestaurant();
      } else {
        await this.passRestaurant();
      }
    }
  }

  /**
   * Like all remaining restaurants
   */
  async likeAllRemaining(): Promise<void> {
    while (await this.likeButton.isVisible() && await this.likeButton.isEnabled()) {
      await this.likeRestaurant();
      // Check if we've reached the end
      if (await this.submitButton.isVisible()) {
        break;
      }
    }
  }

  /**
   * Pass all remaining restaurants
   */
  async passAllRemaining(): Promise<void> {
    while (await this.passButton.isVisible() && await this.passButton.isEnabled()) {
      await this.passRestaurant();
      if (await this.submitButton.isVisible()) {
        break;
      }
    }
  }

  /**
   * Submit selections and wait for results or waiting state
   */
  async submitSelections(): Promise<void> {
    await expect(this.submitButton).toBeVisible();
    await this.submitButton.click();

    // Wait for either waiting state or results navigation
    await Promise.race([
      this.waitingState.waitFor({ state: 'visible', timeout: 10_000 }),
      this.page.waitForURL(/\/results/, { timeout: 10_000 }),
    ]).catch(() => {});
  }

  /**
   * Get current number of likes
   */
  async getLikesCount(): Promise<number> {
    const text = await this.likesCount.textContent();
    const match = text?.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * Check if we're in the "all done" state
   */
  async isAllDone(): Promise<boolean> {
    return this.allDoneState.isVisible();
  }

  /**
   * Check if we're waiting for other participants
   */
  async isWaitingForOthers(): Promise<boolean> {
    return this.waitingState.isVisible();
  }

  /**
   * Wait for results to be ready
   */
  async waitForResults(timeout = 60_000): Promise<void> {
    await this.page.waitForURL(/\/session\/[A-Z0-9]+\/results/, { timeout });
  }
}
