import { test, expect } from './fixtures';
import { SelectionPage, SessionLobbyPage } from './pages';

/**
 * Watch Branch E2E (#369)
 *
 * Fork → Watch card → Mood → Start swiping → lobby → Movie Deck. The Deck is
 * dealt from the committed corpus, so this needs no key and no location — only
 * the backend and Redis, which the Playwright webServer boots locally.
 */

test.describe('Watch Branch', () => {
  test('deals a Movie Deck from a Mood', async ({ homePage, watchPage, page }) => {
    await homePage.goto();
    await homePage.clickWatch();
    await expect(watchPage.heading).toBeVisible();

    await watchPage.pickChip('Comedy');
    await watchPage.enterName('Host');
    const sessionCode = await watchPage.startSwiping();
    expect(sessionCode).toMatch(/^[A-Z0-9]{5}$/);

    await new SessionLobbyPage(page).startSession();

    const selectionPage = new SelectionPage(page);
    await expect(selectionPage.heading).toHaveText('Choose Movies');
    await expect(selectionPage.swipeCard.first()).toBeVisible();
    await expect(selectionPage.criticsBadge.first()).toBeVisible();
  });
});
