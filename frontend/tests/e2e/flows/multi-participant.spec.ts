import { multiParticipantTest as test } from '../fixtures';
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

  test('host can create session and participants can join', async ({ setupSession }) => {
    const { sessionCode, host, participants, all } = await setupSession(2);

    // Verify session code was generated
    expect(sessionCode).toMatch(/^[A-Z0-9]{5}$/);

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

  test('host can start session and all move to selection', async ({ setupSession }) => {
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

  test('all participants can make selections and submit', async ({ setupSession }) => {
    const { sessionCode, host, participants, all } = await setupSession(1);

    // Host starts session
    await host.lobbyPage.startSession();

    // Wait for selection pages to load
    await Promise.all(
      all.map(async (p) => {
        await p.selectionPage.loadingState
          .waitFor({ state: 'hidden', timeout: 30_000 })
          .catch(() => {});
      })
    );

    // All participants make selections. Likes are DISJOINT (participant i
    // likes cards 3i..3i+2) — a shared like between two participants is a
    // Full House since #187, and the takeover would interrupt this flow.
    await Promise.all(
      all.map(async (p, idx) => {
        for (let i = 0; i < idx * 3; i++) {
          await p.selectionPage.passRestaurant();
        }
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
    await Promise.all(all.map((p) => expect(p.page).toHaveURL(/\/results/, { timeout: 30_000 })));
  });

  test('results show matching restaurants', async ({ setupSession }) => {
    const { sessionCode, host, participants, all } = await setupSession(1);

    // Quick flow: start, like same restaurants, submit
    await host.lobbyPage.startSession();

    // Wait for restaurants to load
    await Promise.all(
      all.map(async (p) => {
        await p.selectionPage.loadingState
          .waitFor({ state: 'hidden', timeout: 30_000 })
          .catch(() => {});
      })
    );

    // Host likes the first restaurant and finishes the deck the long way.
    // The guest then likes the same card, which since #187 is a Full House —
    // the takeover interrupts their deck and `Finish here` submits for them.
    await host.selectionPage.likeRestaurant();
    await host.selectionPage.passAllRemaining();
    if (await host.selectionPage.submitButton.isVisible()) {
      await host.selectionPage.submitSelections();
    }

    const guest = participants[0];
    await guest.selectionPage.likeRestaurant();
    await expect(guest.page.getByRole('dialog')).toBeVisible({ timeout: 10_000 });
    await guest.page.getByRole('button', { name: 'Finish here' }).click();

    // Wait for results
    await Promise.all(all.map((p) => expect(p.page).toHaveURL(/\/results/, { timeout: 30_000 })));

    // Verify results page shows matches
    await host.resultsPage.verifyPageElements();
  });
});

test.describe('Top Pick crown on empty match (#165/#166, supersedes #72)', () => {
  test('empty match with three participants crowns the closest pick on every screen', async ({
    setupSession,
  }) => {
    test.setTimeout(120_000); // three full decks of swiping
    const { host, participants, all } = await setupSession(2); // host + 2 guests = 3

    await host.lobbyPage.startSession();

    await Promise.all(
      all.map(async (p) => {
        await p.selectionPage.loadingState
          .waitFor({ state: 'hidden', timeout: 30_000 })
          .catch(() => {});
      })
    );

    // Host and Guest1 like only the first restaurant; Guest2 passes it and
    // likes the second. No restaurant is liked by all three (empty Match),
    // and the first is liked by two of three (the crowned Top Pick).
    const [guest1, guest2] = participants;
    const finishDeck = async (p: (typeof all)[number]) => {
      await p.selectionPage.passAllRemaining();
      if (await p.selectionPage.submitButton.isVisible()) {
        await p.selectionPage.submitSelections();
      }
    };
    await Promise.all([
      (async () => {
        await host.selectionPage.likeRestaurant();
        await finishDeck(host);
      })(),
      (async () => {
        await guest1.selectionPage.likeRestaurant();
        await finishDeck(guest1);
      })(),
      (async () => {
        await guest2.selectionPage.passRestaurant();
        await guest2.selectionPage.likeRestaurant();
        await finishDeck(guest2);
      })(),
    ]);

    await Promise.all(all.map((p) => expect(p.page).toHaveURL(/\/results/, { timeout: 30_000 })));

    // The crowned Top Pick appears on every participant's screen in real time
    // (the crown supersedes the bare Near Miss card on an empty Match).
    for (const p of all) {
      await expect(p.page.getByText("TONIGHT'S PICK").first()).toBeVisible({
        timeout: 10_000,
      });
      await expect(
        p.page.getByText('2 of 3 swiped yes — the closest you got.').first()
      ).toBeVisible();
    }
  });
});

test.describe('Live Swipe Room (#183-#187)', () => {
  test('unanimous like raises the Full House takeover on every phone and Finish here completes the Session', async ({
    setupSession,
  }) => {
    test.setTimeout(120_000);
    const { host, all } = await setupSession(2); // host + 2 guests = 3

    await host.lobbyPage.startSession();

    await Promise.all(
      all.map(async (p) => {
        await p.selectionPage.loadingState
          .waitFor({ state: 'hidden', timeout: 30_000 })
          .catch(() => {});
      })
    );

    // Everyone likes the first restaurant. Each phone's own like is the last
    // piece of its Full House, so the takeover must interrupt every deck.
    for (const p of all) {
      await p.selectionPage.likeRestaurant();
    }

    for (const p of all) {
      const dialog = p.page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 10_000 });
      await expect(dialog.getByText('EVERYONE LIKED THIS')).toBeVisible();
    }

    await host.page.screenshot({ path: 'test-results/full-house-takeover.png' });

    // A unanimous `Finish here` is the good ending: everyone submits their
    // one like, the SINTER necessarily contains it, the Full House IS the Match.
    for (const p of all) {
      await p.page.getByRole('button', { name: 'Finish here' }).click();
    }

    await Promise.all(all.map((p) => expect(p.page).toHaveURL(/\/results/, { timeout: 30_000 })));
    await expect(host.page.getByText(/It's a Match|Match/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test('a Live Selection is revealed in the deck strip once you have decided that card', async ({
    setupSession,
  }) => {
    test.setTimeout(120_000);
    const { host, participants, all } = await setupSession(2);

    await host.lobbyPage.startSession();

    await Promise.all(
      all.map(async (p) => {
        await p.selectionPage.loadingState
          .waitFor({ state: 'hidden', timeout: 30_000 })
          .catch(() => {});
      })
    );

    // Guest2 passes the first card (deciding it), then host and guest1 like
    // it. Two of three liking a card guest2 passed is a reveal, never a Full
    // House, so only the strip can fire.
    const [guest1, guest2] = participants;
    await guest2.selectionPage.passRestaurant();
    await host.selectionPage.likeRestaurant();
    await guest1.selectionPage.likeRestaurant();

    // The strip replaces the pill row's right-hand text for 4 seconds.
    await expect(guest2.page.getByText(/\d of 3 liked/).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});

test.describe('Select Again restart (#14, #85)', () => {
  test('Select Again returns every participant to Restaurant Selection', async ({
    setupSession,
  }) => {
    const { host, all } = await setupSession(1);

    await host.lobbyPage.startSession();

    await Promise.all(
      all.map(async (p) => {
        await p.selectionPage.loadingState
          .waitFor({ state: 'hidden', timeout: 30_000 })
          .catch(() => {});
      })
    );

    // Everyone selects the first restaurant so the session produces a Match.
    // The last liker completes a Full House (#187), so their deck is
    // interrupted by the takeover — `Finish here` is their submit.
    const [firstP, ...rest] = all;
    await firstP.selectionPage.likeRestaurant();
    await firstP.selectionPage.passAllRemaining();
    if (await firstP.selectionPage.submitButton.isVisible()) {
      await firstP.selectionPage.submitSelections();
    }
    for (const p of rest) {
      await p.selectionPage.likeRestaurant();
      await expect(p.page.getByRole('dialog')).toBeVisible({ timeout: 10_000 });
      await p.page.getByRole('button', { name: 'Finish here' }).click();
    }

    await Promise.all(all.map((p) => expect(p.page).toHaveURL(/\/results/, { timeout: 30_000 })));

    // The host taps Select Again; every participant's tab — not just the
    // host's — must leave the results screen for the fresh deck (#14).
    await host.page.getByRole('button', { name: /select again/i }).click();

    await Promise.all(
      all.map((p) => expect(p.page).toHaveURL(/\/session\/[A-Z0-9]+\/select/, { timeout: 15_000 }))
    );
  });
});

test.describe('Session Edge Cases', () => {
  test('participant cannot join full session (max 4)', async ({
    browser,
    setupSession,
    baseURL,
  }) => {
    // Create session with 3 participants (total 4 including host)
    const { sessionCode } = await setupSession(3);

    // Try to join as 5th participant. Manually-created contexts don't inherit the
    // config baseURL, so pass it or the relative goto('/join') hits about:blank.
    const extraContext = await browser.newContext({ baseURL });
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

  test('participant sees error for invalid session code', async ({ browser, baseURL }) => {
    // Manually-created contexts don't inherit the config baseURL; pass it so the
    // relative goto('/join') resolves against the app rather than about:blank.
    const context = await browser.newContext({ baseURL });
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
