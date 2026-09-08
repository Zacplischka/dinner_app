import { test, expect } from '@playwright/test';
import { WatchSetupPage, JoinSessionPage, SessionLobbyPage } from './pages';

test('everyone chooses and confirms Ready, then returns from home to the shared round', async ({
  page,
  browser,
  baseURL,
}) => {
  const host = new WatchSetupPage(page);
  await host.goto();
  await host.enterName('Host');
  const code = await host.createSession();
  const guestContext = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  try {
    const guest = await guestContext.newPage();
    const join = new JoinSessionPage(guest);
    await join.goto();
    await join.joinSession(code, 'Guest');
    const hostLobby = new SessionLobbyPage(page);
    const guestLobby = new SessionLobbyPage(guest);
    await hostLobby.waitForParticipant('Guest');
    await host.pickChip('Action');
    await guest.getByRole('button', { name: 'Mystery', exact: true }).click();
    await expect(guest.getByRole('button', { name: 'Mystery', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await guestLobby.ready();
    await hostLobby.ready();
    await expect(hostLobby.startButton).toBeEnabled();

    // A guest edits their own interests; the Host cannot start using stale consent.
    await guest.getByRole('button', { name: 'Series', exact: true }).click();
    await expect(guest.getByRole('button', { name: 'I’m ready', exact: true })).toBeEnabled();
    await expect(hostLobby.startButton).toBeDisabled();
    await guestLobby.ready();
    await guest.getByRole('link', { name: 'Heykeen home', exact: true }).click();
    await expect(guest.getByRole('button', { name: 'Return to session' })).toBeVisible();
    await hostLobby.startSession();
    await guest.getByRole('button', { name: 'Return to session' }).click();
    await expect(guest).toHaveURL(new RegExp(`/session/${code}/select$`));
    const hostCard = page.locator('[data-swipe-card]').first();
    const guestCard = guest.locator('[data-swipe-card]').first();
    await expect(hostCard).toBeVisible();
    await expect(guestCard).toBeVisible();
    await expect(guestCard.getByRole('heading')).toHaveText(
      await hostCard.getByRole('heading').innerText()
    );

    // Reload rejoins the same Participant and keeps the fixed Deck.
    const title = await guestCard.getByRole('heading').innerText();
    await guest.reload();
    await expect(guest.locator('[data-swipe-card]').first().getByRole('heading')).toHaveText(title);
    await expect(page.getByLabel('Guest is choosing', { exact: true })).toBeVisible();
  } finally {
    await guestContext.close();
  }
});
