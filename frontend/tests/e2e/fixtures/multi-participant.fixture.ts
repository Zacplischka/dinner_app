import { test as base, Page, BrowserContext } from '@playwright/test';
import {
  HomePage,
  CreateSessionPage,
  JoinSessionPage,
  SessionLobbyPage,
  SelectionPage,
  ResultsPage,
} from '../pages';

/**
 * Multi-Participant Test Fixture
 *
 * Specialized fixture for testing multi-participant scenarios:
 * - Host creates session
 * - Participants join via separate browser contexts
 * - Coordinated actions across all participants
 *
 * This is essential for testing the core app flow where
 * multiple users must interact in real-time via WebSocket.
 */

type Participant = {
  context: BrowserContext;
  page: Page;
  name: string;
  homePage: HomePage;
  createPage: CreateSessionPage;
  joinPage: JoinSessionPage;
  lobbyPage: SessionLobbyPage;
  selectionPage: SelectionPage;
  resultsPage: ResultsPage;
};

type MultiParticipantFixture = {
  // Create host and specified number of participants
  setupSession: (participantCount: number) => Promise<{
    sessionCode: string;
    host: Participant;
    participants: Participant[];
    all: Participant[];
  }>;

  // Run action on all participants concurrently
  forAll: <T>(
    participants: Participant[],
    action: (p: Participant) => Promise<T>
  ) => Promise<T[]>;

  // Run action on all participants sequentially
  forAllSequential: <T>(
    participants: Participant[],
    action: (p: Participant, index: number) => Promise<T>
  ) => Promise<T[]>;
};

export const multiParticipantTest = base.extend<MultiParticipantFixture>({
  setupSession: async ({ browser }, use) => {
    const allContexts: BrowserContext[] = [];

    const setup = async (participantCount: number) => {
      // Create host context
      const hostContext = await browser.newContext({
        viewport: { width: 390, height: 844 },
      });
      const hostPage = await hostContext.newPage();
      allContexts.push(hostContext);

      const host: Participant = {
        context: hostContext,
        page: hostPage,
        name: 'Host',
        homePage: new HomePage(hostPage),
        createPage: new CreateSessionPage(hostPage),
        joinPage: new JoinSessionPage(hostPage),
        lobbyPage: new SessionLobbyPage(hostPage),
        selectionPage: new SelectionPage(hostPage),
        resultsPage: new ResultsPage(hostPage),
      };

      // Host creates session
      await host.createPage.goto();
      const sessionCode = await host.createPage.createSession('Host');

      // Create participant contexts
      const participants: Participant[] = [];
      for (let i = 0; i < participantCount; i++) {
        const context = await browser.newContext({
          viewport: { width: 390, height: 844 },
        });
        const page = await context.newPage();
        allContexts.push(context);

        const name = `Guest${i + 1}`;
        const participant: Participant = {
          context,
          page,
          name,
          homePage: new HomePage(page),
          createPage: new CreateSessionPage(page),
          joinPage: new JoinSessionPage(page),
          lobbyPage: new SessionLobbyPage(page),
          selectionPage: new SelectionPage(page),
          resultsPage: new ResultsPage(page),
        };

        // Participant joins session
        await participant.joinPage.goto();
        await participant.joinPage.joinSession(sessionCode, name);

        participants.push(participant);
      }

      // Wait for all participants to appear in host's lobby
      for (const p of participants) {
        await host.lobbyPage.waitForParticipant(p.name);
      }

      return {
        sessionCode,
        host,
        participants,
        all: [host, ...participants],
      };
    };

    await use(setup);

    // Cleanup all contexts
    for (const context of allContexts) {
      await context.close().catch(() => {});
    }
  },

  forAll: async ({}, use) => {
    const runForAll = async <T>(
      participants: Participant[],
      action: (p: Participant) => Promise<T>
    ): Promise<T[]> => {
      return Promise.all(participants.map(action));
    };
    await use(runForAll);
  },

  forAllSequential: async ({}, use) => {
    const runSequential = async <T>(
      participants: Participant[],
      action: (p: Participant, index: number) => Promise<T>
    ): Promise<T[]> => {
      const results: T[] = [];
      for (let i = 0; i < participants.length; i++) {
        results.push(await action(participants[i], i));
      }
      return results;
    };
    await use(runSequential);
  },
});

export { Participant };
