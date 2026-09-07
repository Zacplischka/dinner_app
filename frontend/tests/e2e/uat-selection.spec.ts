import { test, expect } from '@playwright/test';
import { JoinSessionPage, SelectionPage, SessionLobbyPage, WatchSetupPage } from './pages';

test('corrects the final swipe, then recovers an all-pass Watch round through shared choices', async ({
  page,
  browser,
  baseURL,
}, info) => {
  const host = new WatchSetupPage(page);
  await host.goto();
  await host.enterName('UAT Host');
  const code = await host.createSession();
  await page.getByRole('button', { name: 'Smaller Deck' }).click();
  await expect(page.getByText('10 movies', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Smaller Deck' }).click();
  await expect(page.getByText('5 movies', { exact: true })).toBeVisible();

  const guestContext = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  try {
    const guest = await guestContext.newPage();
    const join = new JoinSessionPage(guest);
    await join.goto();
    await join.joinSession(code, 'UAT Guest');
    const hostLobby = new SessionLobbyPage(page);
    const guestLobby = new SessionLobbyPage(guest);
    await hostLobby.waitForParticipant('UAT Guest');
    await expect(guest.getByRole('button', { name: 'I’m ready', exact: true })).toBeEnabled();
    await guestLobby.ready();
    await hostLobby.startSession();
    await expect(guest).toHaveURL(new RegExp(`/session/${code}/select$`));

    const hostDeck = new SelectionPage(page);
    const guestDeck = new SelectionPage(guest);
    await expect(hostDeck.swipeCard.first()).toBeVisible();
    await page.getByRole('button', { name: 'Details', exact: true }).click();
    const details = page.getByRole('dialog');
    const synopsis = details.getByRole('link', { name: 'Read full synopsis on TMDB' });
    await expect(synopsis).toBeVisible();
    await expect(synopsis).toHaveAttribute(
      'href',
      /^https:\/\/www\.themoviedb\.org\/(movie|tv)\/\d+$/
    );
    await expect(synopsis).toHaveAttribute('target', '_blank');
    await details.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(details).not.toBeVisible();
    for (let i = 0; i < 4; i++) await hostDeck.passRestaurant();
    const lastTitle = await hostDeck.swipeCard.first().getByRole('heading').innerText();
    await hostDeck.passRestaurant();
    await page.getByRole('button', { name: 'Undo last choice' }).click();
    await expect(hostDeck.swipeCard.first().getByRole('heading')).toHaveText(lastTitle);
    await hostDeck.likeRestaurant();
    await page.keyboard.press('Backspace');
    await expect(hostDeck.swipeCard.first().getByRole('heading')).toHaveText(lastTitle);
    await expect(page.getByRole('status', { name: '0 liked' })).toBeVisible();
    await hostDeck.passRestaurant();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Undo last choice' })).toBeEnabled();

    await guestDeck.passAllRemaining();
    await hostDeck.submitSelections();
    await guestDeck.submitSelections();
    await expect(page.getByRole('heading', { name: 'None of these worked' })).toBeVisible();
    await expect(
      guest.getByText('The host can try another deck or return everyone to change their choices.')
    ).toBeVisible();
    await expect(guest.getByRole('button', { name: 'Try another deck' })).toHaveCount(0);
    await page.screenshot({
      animations: 'disabled',
      path: info.outputPath('all-pass-host.png'),
      fullPage: true,
    });
    await guest.screenshot({
      animations: 'disabled',
      path: info.outputPath('all-pass-guest.png'),
      fullPage: true,
    });
    const fallback = page
      .locator('details')
      .filter({ has: page.getByText('Optional Top Pick', { exact: true }) });
    await expect(fallback.locator('[data-match-card]')).not.toBeVisible();
    await fallback.locator('summary').click();
    await expect(fallback.locator('[data-match-card]')).toBeVisible();
    await expect(
      fallback.getByText("Nobody liked anything, so here's the highest rated.")
    ).toBeVisible();
    await expect(fallback.getByRole('link', { name: 'Where to watch' })).toBeVisible();

    await page.getByRole('button', { name: 'Try another deck' }).click();
    await expect(page).toHaveURL(new RegExp(`/session/${code}$`));
    await expect(guest).toHaveURL(new RegExp(`/session/${code}$`));
    await expect(page.getByRole('button', { name: 'I’m ready', exact: true })).toBeVisible();
    await expect(guest.getByRole('button', { name: 'I’m ready', exact: true })).toBeVisible();
    await expect(hostLobby.startButton).toBeDisabled();
    await guestLobby.leaveSession();
    await hostLobby.leaveSession();
  } finally {
    await guestContext.close();
  }
});
