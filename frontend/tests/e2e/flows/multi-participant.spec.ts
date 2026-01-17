import { multiParticipantTest as test, Participant } from '../fixtures';
import { expect } from '@playwright/test';

/**
 * Multi-Participant Flow Tests
 *
 * Tests the complete user journey with multiple participants:
 * 1. Host creates session
 * 2. Participants join via session code
 * 3. Host starts selection
 * 4. All participants make selections
 * 5. Results are calculated and displayed
 *
 * These tests require both frontend and backend running.
 */

test.describe('Multi-Participant Session Flow', () => {
  test.describe.configure({ mode: 'serial' }); // Run tests in order

  test('host can create session and participants can join', async ({
    setupSession,
  }) => {
    const { sessionCode, host, participants, all } = await setupSession(2);

    // Verify session code was generated
    expect(sessionCode).toMatch(/^[A-Z0-9]{6}$/);

    // Verify host is in lobby
    await expect(host.page).toHaveURL(/\/session\/[A-Z0-9]+$/);

    // Verify all participants are in lobby
    for (const p of participants) {
      await expect(p.page).toHaveURL(/\/session\/[A-Z0-9]+$/);
    }

    // Verify host can see all participants
    const participantNames = await host.lobbyPage.getParticipants();
    expect(participantNames.length).toBeGreaterThanOrEqual(all.length);
  });

  test('host can start session and all move to selection', async ({
    setupSession,
    forAll,
  }) => {
    const { sessionCode, host, participants, all } = await setupSession(2);

    // Host starts the session
    await host.lobbyPage.startSession();

    // Verify host is on selection page
    await expect(host.page).toHaveURL(/\/session\/[A-Z0-9]+\/select/);

    // Verify participants are redirected to selection
    await Promise.all(
      participants.map((p) =>
        expect(p.page).toHaveURL(/\/session\/[A-Z0-9]+\/select/, { timeout: 10_000 })
      )
    );
  });

  test('all participants can make selections and submit', async ({
    setupSession,
    forAll,
  }) => {
    const { sessionCode, host, participants, all } = await setupSession(1);

    // Host starts session
    await host.lobbyPage.startSession();

    // Wait for selection pages to load
    await Promise.all(
      all.map(async (p) => {
        await p.selectionPage.loadingState.waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {});
      })
    );

    // All participants make selections (like first 3, pass rest)
    await Promise.all(
      all.map(async (p) => {
        // Like first 3 restaurants
        for (let i = 0; i < 3; i++) {
          if (await p.selectionPage.likeButton.isVisible()) {
            await p.selectionPage.likeRestaurant();
          }
        }

        // Pass remaining restaurants
        await p.selectionPage.passAllRemaining();

        // Submit selections
        if (await p.selectionPage.submitButton.isVisible()) {
          await p.selectionPage.submitSelections();
        }
      })
    );

    // Wait for results (all participants should be redirected)
    await Promise.all(
      all.map((p) =>
        expect(p.page).toHaveURL(/\/results/, { timeout: 30_000 })
      )
    );
  });

  test('results show matching restaurants', async ({ setupSession }) => {
    const { sessionCode, host, participants, all } = await setupSession(1);

    // Quick flow: start, like same restaurants, submit
    await host.lobbyPage.startSession();

    // Wait for restaurants to load
    await Promise.all(
      all.map(async (p) => {
        await p.selectionPage.loadingState.waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {});
      })
    );

    // All like first 2 restaurants, pass rest
    for (const p of all) {
      if (await p.selectionPage.likeButton.isVisible()) {
        await p.selectionPage.likeRestaurant();
        await p.selectionPage.likeRestaurant();
      }
      await p.selectionPage.passAllRemaining();
      if (await p.selectionPage.submitButton.isVisible()) {
        await p.selectionPage.submitSelections();
      }
    }

    // Wait for results
    await Promise.all(
      all.map((p) => expect(p.page).toHaveURL(/\/results/, { timeout: 30_000 }))
    );

    // Verify results page shows matches
    await host.resultsPage.verifyPageElements();
  });
});

test.describe('Session Edge Cases', () => {
  test('participant cannot join full session (max 4)', async ({
    browser,
    setupSession,
  }) => {
    // Create session with 3 participants (total 4 including host)
    const { sessionCode } = await setupSession(3);

    // Try to join as 5th participant
    const extraContext = await browser.newContext();
    const extraPage = await extraContext.newPage();

    try {
      await extraPage.goto('/join');
      await extraPage.getByLabel(/Session Code/i).fill(sessionCode);
      await extraPage.getByLabel(/Your Name/i).fill('ExtraGuest');
      await extraPage.getByRole('button', { name: /Join Session/i }).click();

      // Should show error about session being full
      await expect(extraPage.getByText(/full|maximum/i)).toBeVisible({
        timeout: 5_000,
      });
    } finally {
      await extraContext.close();
    }
  });

  test('participant sees error for invalid session code', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await page.goto('/join');
      await page.getByLabel(/Session Code/i).fill('INVALID');
      await page.getByLabel(/Your Name/i).fill('TestUser');
      await page.getByRole('button', { name: /Join Session/i }).click();

      // Should show error
      await expect(page.getByText(/not found|invalid|doesn't exist/i)).toBeVisible({
        timeout: 5_000,
      });
    } finally {
      await context.close();
    }
  });

  test('participant can leave session mid-flow', async ({ setupSession }) => {
    const { host, participants } = await setupSession(1);

    // Participant leaves from lobby
    await participants[0].lobbyPage.leaveSession();

    // Verify participant is back home
    await expect(participants[0].page).toHaveURL('/');

    // Host should still be in session
    await expect(host.page).toHaveURL(/\/session\//);
  });
});
