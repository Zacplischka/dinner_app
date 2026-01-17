import { test as base, Page, BrowserContext, expect } from '@playwright/test';
import {
  HomePage,
  CreateSessionPage,
  JoinSessionPage,
  SessionLobbyPage,
  SelectionPage,
  ResultsPage,
} from '../pages';

/**
 * Custom Playwright Test Fixtures
 *
 * Extends the base test with:
 * - Page objects pre-instantiated
 * - Multi-participant support
 * - Session management helpers
 * - Mobile/desktop viewport helpers
 */

// Types for our custom fixtures
type PageObjects = {
  homePage: HomePage;
  createPage: CreateSessionPage;
  joinPage: JoinSessionPage;
  lobbyPage: SessionLobbyPage;
  selectionPage: SelectionPage;
  resultsPage: ResultsPage;
};

type TestHelpers = {
  // Create a session and return the code
  createTestSession: (hostName?: string) => Promise<string>;

  // Create multiple browser contexts for multi-participant tests
  createParticipantContexts: (count: number) => Promise<{
    contexts: BrowserContext[];
    pages: Page[];
  }>;

  // Wait for WebSocket connection
  waitForSocketConnection: (page: Page) => Promise<void>;

  // Generate random test data
  generateTestName: () => string;
  generateSessionCode: () => string;
};

// Extend Playwright's test with our fixtures
export const test = base.extend<PageObjects & TestHelpers>({
  // Page object fixtures - auto-instantiated per test
  homePage: async ({ page }, use) => {
    const homePage = new HomePage(page);
    await use(homePage);
  },

  createPage: async ({ page }, use) => {
    const createPage = new CreateSessionPage(page);
    await use(createPage);
  },

  joinPage: async ({ page }, use) => {
    const joinPage = new JoinSessionPage(page);
    await use(joinPage);
  },

  lobbyPage: async ({ page }, use) => {
    const lobbyPage = new SessionLobbyPage(page);
    await use(lobbyPage);
  },

  selectionPage: async ({ page }, use) => {
    const selectionPage = new SelectionPage(page);
    await use(selectionPage);
  },

  resultsPage: async ({ page }, use) => {
    const resultsPage = new ResultsPage(page);
    await use(resultsPage);
  },

  // Helper to create a test session
  createTestSession: async ({ page }, use) => {
    const createSession = async (hostName = 'TestHost'): Promise<string> => {
      const createPage = new CreateSessionPage(page);
      await createPage.goto();
      return await createPage.createSession(hostName);
    };
    await use(createSession);
  },

  // Helper to create multiple participant contexts
  createParticipantContexts: async ({ browser }, use) => {
    const createdContexts: BrowserContext[] = [];

    const createContexts = async (count: number) => {
      const contexts: BrowserContext[] = [];
      const pages: Page[] = [];

      for (let i = 0; i < count; i++) {
        const context = await browser.newContext({
          viewport: { width: 390, height: 844 },
        });
        const page = await context.newPage();
        contexts.push(context);
        pages.push(page);
        createdContexts.push(context);
      }

      return { contexts, pages };
    };

    await use(createContexts);

    // Cleanup all created contexts
    for (const context of createdContexts) {
      await context.close();
    }
  },

  // Wait for WebSocket connection to be established
  waitForSocketConnection: async ({}, use) => {
    const waitForSocket = async (page: Page): Promise<void> => {
      // Wait for connection status indicator or socket.connected state
      await page.waitForFunction(() => {
        // Check if socket.io is connected
        const win = window as unknown as { io?: { connected?: boolean } };
        return win.io?.connected === true;
      }, { timeout: 10_000 }).catch(() => {
        // Fallback: wait for connection indicator in UI
      });

      // Also wait for any connection status UI
      await page.locator('[class*="connected"]').waitFor({
        state: 'visible',
        timeout: 5_000,
      }).catch(() => {});
    };
    await use(waitForSocket);
  },

  // Generate random test name
  generateTestName: async ({}, use) => {
    const generate = () => {
      const adjectives = ['Happy', 'Hungry', 'Quick', 'Eager', 'Savvy'];
      const nouns = ['Diner', 'Foodie', 'Guest', 'Taster', 'Picker'];
      const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
      const noun = nouns[Math.floor(Math.random() * nouns.length)];
      const num = Math.floor(Math.random() * 100);
      return `${adj}${noun}${num}`;
    };
    await use(generate);
  },

  // Generate fake session code (for testing invalid codes)
  generateSessionCode: async ({}, use) => {
    const generate = () => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let code = '';
      for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
      }
      return code;
    };
    await use(generate);
  },
});

// Re-export expect for convenience
export { expect };

// Export page object types for use in tests
export type { PageObjects, TestHelpers };
