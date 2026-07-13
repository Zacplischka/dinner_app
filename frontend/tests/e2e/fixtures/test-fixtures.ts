import { test as base, expect } from '@playwright/test';
import { HomePage, CreateSessionPage, JoinSessionPage } from '../pages';

/**
 * Custom Playwright Test Fixtures
 *
 * Extends the base test with pre-instantiated page objects.
 */
type PageObjects = {
  homePage: HomePage;
  createPage: CreateSessionPage;
  joinPage: JoinSessionPage;
};

export const test = base.extend<PageObjects>({
  homePage: async ({ page }, use) => {
    await use(new HomePage(page));
  },

  createPage: async ({ page }, use) => {
    await use(new CreateSessionPage(page));
  },

  joinPage: async ({ page }, use) => {
    await use(new JoinSessionPage(page));
  },
});

export { expect };
