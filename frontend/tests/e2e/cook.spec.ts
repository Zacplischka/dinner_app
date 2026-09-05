import { test, expect } from './fixtures';
import { CookSetupPage } from './pages/CookSetupPage';
import { SelectionPage, SessionLobbyPage } from './pages';

/**
 * Cook Branch E2E (#259)
 *
 * Fork → Cook card → Craving → Start swiping → lobby → Recipe Deck. The
 * Craving is one the Owned Recipe Store answers alone: with no Spoonacular key
 * the source is dark and the Deck is dealt owned-only (#333), so this needs no
 * key and no location — only the backend and Redis the Playwright webServer
 * boots locally.
 */

test.describe('Cook Branch', () => {
  test('deals a Recipe Deck from a Craving', async ({ homePage, page }) => {
    await homePage.goto();
    await homePage.cookCard.click();

    const cookPage = new CookSetupPage(page);
    await expect(cookPage.heading).toBeVisible();

    // Italian is the corpus's largest tagged cuisine cell, so it deals keyless.
    await cookPage.pickChip('italian');
    await cookPage.enterName('Host');
    const sessionCode = await cookPage.startSwiping();
    expect(sessionCode).toMatch(/^[A-Z0-9]{5}$/);

    await new SessionLobbyPage(page).startSession();

    const selectionPage = new SelectionPage(page);
    await expect(selectionPage.heading).toHaveText('Choose Recipes');
    await expect(selectionPage.swipeCard.first()).toBeVisible();
  });
});
