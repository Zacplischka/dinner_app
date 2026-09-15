import { Page, Locator } from '@playwright/test';

/**
 * HomePage - Page object for the entry fork (#255)
 *
 * Routes: /
 * `/` explains the shared choice with four Branch cards; Join-with-code and
 * Compare are prominent actions.
 */
export class HomePage {
  readonly heading: Locator;
  readonly eatOutCard: Locator;
  readonly takeawayCard: Locator;
  readonly cookCard: Locator;
  readonly watchCard: Locator;
  readonly joinLink: Locator;
  readonly compareLink: Locator;
  readonly eatOutDescription: Locator;
  readonly guestModeText: Locator;

  constructor(readonly page: Page) {
    this.heading = page.getByRole('heading', { name: /What are we doing tonight/i });
    this.eatOutCard = page.getByRole('button', { name: /Eat out/i });
    this.takeawayCard = page.getByRole('button', { name: /Order in/i });
    this.cookCard = page.getByRole('button', { name: /Cook together/i });
    this.watchCard = page.getByRole('button', { name: /Watch something/i });
    this.joinLink = page.getByRole('button', { name: /Join with a code/i });
    this.compareLink = page.getByRole('button', { name: 'Compare delivery prices', exact: true });
    this.eatOutDescription = page.getByText('Find somewhere you’re into.');
    this.guestModeText = page.getByText(/No account needed/i);
  }

  async goto(): Promise<void> {
    await this.page.goto('/');
  }
}
