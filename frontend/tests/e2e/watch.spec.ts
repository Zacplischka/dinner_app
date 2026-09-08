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
  test('deals a Movie Deck from a Mood', async ({ homePage, watchPage, page }, info) => {
    await homePage.goto();
    await homePage.clickWatch();
    await expect(watchPage.heading).toBeVisible();

    await watchPage.enterName('Host');
    const sessionCode = await watchPage.createSession();
    expect(sessionCode).toMatch(/^[A-Z0-9]{5}$/);
    await watchPage.pickChip('Comedy');

    await new SessionLobbyPage(page).startSession();

    const selectionPage = new SelectionPage(page);
    await expect(selectionPage.heading).toHaveText('Choose something to watch');
    await expect(selectionPage.swipeCard.first()).toBeVisible();
    await expect(selectionPage.scoreBadge.first()).toBeVisible();
    for (const width of info.project.name === 'chromium' ? [1280] : [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(selectionPage.heading).toBeInViewport({ ratio: 1 });
      expect(
        await selectionPage.heading.evaluate(
          (heading) => heading.scrollWidth <= heading.clientWidth
        )
      ).toBe(true);
      await expect(page.getByRole('button', { name: 'Pass', exact: true })).toBeInViewport({
        ratio: 1,
      });
      await expect(page.getByRole('button', { name: 'Like', exact: true })).toBeInViewport({
        ratio: 1,
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      );
      await page.screenshot({
        path: info.outputPath(`watch-selection-${width}.png`),
        animations: 'disabled',
      });
    }
  });
});
