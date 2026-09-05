import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * CookSetupPage - Page object for the Cook Branch's setup form (#259)
 *
 * Routes: /cook
 * Name, Craving chips and headcount. `Start swiping` is the page's only
 * primary action and stays disabled until a name is entered.
 */
export class CookSetupPage extends BasePage {
  readonly nameInput: Locator;
  readonly startButton: Locator;

  constructor(page: Page) {
    super(page);

    this.nameInput = page.getByLabel('Your Name');
    this.startButton = page.getByRole('button', { name: 'Start swiping' });
  }

  async goto(): Promise<void> {
    await this.page.goto('/cook');
    await this.waitForPageLoad();
  }
}
