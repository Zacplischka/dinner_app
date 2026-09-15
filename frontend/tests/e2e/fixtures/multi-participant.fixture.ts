import { test as base, Page, BrowserContext } from '@playwright/test';
import { CreateSessionPage } from '../pages/CreateSessionPage';
import { JoinSessionPage } from '../pages/JoinSessionPage';
import { SessionLobbyPage } from '../pages/SessionLobbyPage';
import { SelectionPage } from '../pages/SelectionPage';

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

export type Participant = {
  context: BrowserContext;
  page: Page;
  name: string;
  lobbyPage: SessionLobbyPage;
  selectionPage: SelectionPage;
};

type MultiParticipantFixture = {
  setupSession: (participantCount: number) => Promise<{
    sessionCode: string;
    host: Participant;
    participants: Participant[];
    all: Participant[];
  }>;
};

export const multiParticipantTest = base.extend<MultiParticipantFixture>({
  setupSession: async ({ browser, baseURL }, use) => {
    const allContexts: BrowserContext[] = [];

    // One phone per person. Manually-created contexts do NOT inherit the config
    // baseURL, so pass it explicitly or the page objects' relative navigations
    // resolve against about:blank.
    const participant = async (name: string): Promise<Participant> => {
      const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
      allContexts.push(context);
      const page = await context.newPage();
      return {
        context,
        page,
        name,
        lobbyPage: new SessionLobbyPage(page),
        selectionPage: new SelectionPage(page),
      };
    };

    const setup = async (participantCount: number) => {
      const host = await participant('Host');

      // Host creates session
      const createPage = new CreateSessionPage(host.page);
      await createPage.goto();
      const sessionCode = await createPage.createSession('Host');
      await createPage.setCurrentLocation();

      // Participants join session
      const participants: Participant[] = [];
      for (let i = 0; i < participantCount; i++) {
        const guest = await participant(`Guest${i + 1}`);
        const joinPage = new JoinSessionPage(guest.page);
        await joinPage.goto();
        await joinPage.joinSession(sessionCode, guest.name);
        participants.push(guest);
      }

      // Wait for all participants to appear in host's lobby
      for (const p of participants) {
        await host.lobbyPage.waitForParticipant(p.name);
      }

      for (const p of participants) await p.lobbyPage.ready();

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
});
