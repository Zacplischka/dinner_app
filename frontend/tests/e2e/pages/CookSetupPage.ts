import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * CookSetupPage - Page object for the Cook Branch's setup form (#259)
 *
 * Routes: /cook
 * Name, Craving chips and Headcount. `Start swiping` is the page's only
 * primary action and stays disabled until a name is entered.
 */
export class CookSetupPage extends BasePage {
  readonly heading: Locator;
  readonly nameInput: Locator;
  readonly startButton: Locator;

  constructor(page: Page) {
    super(page);

    this.heading = page.getByRole('heading', { name: 'Cooking' });
    this.nameInput = page.getByLabel('Your Name');
    this.startButton = page.getByRole('button', { name: 'Start swiping' });
  }

  async goto(): Promise<void> {
    await this.page.goto('/cook');
    await this.waitForPageLoad();
  }

  /** Toggle one Craving chip (a cuisine or a diet) by its label. */
  async pickChip(label: string): Promise<void> {
    await this.page.getByRole('button', { name: label, exact: true }).click();
  }

  async enterName(name: string): Promise<void> {
    await this.nameInput.fill(name);
  }

  /** Deal the Deck and land in the lobby; resolves to the Session code. */
  async startSwiping(): Promise<string> {
    await this.startButton.click();
    await this.page.waitForURL(/\/session\/[A-Z0-9]{5}$/, { timeout: 15_000 });
    return this.page.url().split('/').pop() ?? '';
  }
}
