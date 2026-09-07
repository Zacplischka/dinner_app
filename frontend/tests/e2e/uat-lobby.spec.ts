import { test, expect } from '@playwright/test';
import { WatchSetupPage, JoinSessionPage, SessionLobbyPage } from './pages';

test('four people can choose personal interests together without losing edits', async ({
  page,
  browser,
  baseURL,
}, info) => {
  const host = new WatchSetupPage(page);
  await host.goto();
  await host.enterName('UAT Host');
  const code = await host.createSession();
  const contexts = [];
  const people = [page];
  try {
    for (let i = 1; i <= 3; i++) {
      const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
      contexts.push(context);
      const guest = await context.newPage();
      people.push(guest);
      const join = new JoinSessionPage(guest);
      await join.goto();
      await join.joinSession(code, `UAT Guest ${i}`);
    }
    for (const person of people)
      await expect(person.getByTestId('participants-list').getByTestId('participant')).toHaveCount(
        4
      );
    const genres = ['Action', 'Comedy', 'Drama', 'Mystery'];
    await Promise.all(
      people.map((person, i) =>
        person.getByRole('button', { name: genres[i], exact: true }).click()
      )
    );
    for (const [i, person] of people.entries()) {
      await expect(person.getByRole('button', { name: genres[i], exact: true })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      await expect(person.getByRole('alert')).toHaveCount(0);
      for (const genre of genres)
        await expect(person.getByTestId('participants-list')).toContainText(genre);
    }
    // Existing Ready protection remains authoritative after the retried edits.
    for (const person of people) await new SessionLobbyPage(person).ready();
    await expect(new SessionLobbyPage(page).startButton).toBeEnabled();
    await page.screenshot({
      animations: 'disabled',
      path: info.outputPath('four-person-interests.png'),
      fullPage: true,
    });
    for (const person of people.slice().reverse())
      await new SessionLobbyPage(person).leaveSession();
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
