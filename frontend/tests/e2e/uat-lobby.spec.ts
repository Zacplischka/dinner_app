import { test, expect } from '@playwright/test';
import { WatchSetupPage, JoinSessionPage, SessionLobbyPage } from './pages';

for (const [branch, unit, max] of [
  ['watch', 'titles', 50],
  ['cook', 'recipes', 50],
  ['eatout', 'restaurants', 20],
  ['takeaway', 'restaurants', 20],
] as const) {
  test(`${branch} photo Deck grows and shrinks within a 320px Lobby`, async ({ page }, info) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto(
      branch === 'watch' ? '/watch' : branch === 'cook' ? '/cook' : `/create?branch=${branch}`
    );
    await page.getByLabel('Your Name').fill('Deck preview check');
    await page.getByRole('button', { name: 'Create session', exact: true }).click();
    await expect(page).toHaveURL(/\/session\/[A-Z0-9]+$/);
    const preview = page.locator('[data-deck-preview]');
    const controls = page.getByRole('group', { name: 'Deck size', exact: true });
    const count = controls.locator('[aria-live]');
    const smaller = controls.getByRole('button', { name: 'Smaller Deck' });
    const bigger = controls.getByRole('button', { name: 'Bigger Deck' });
    try {
      await expect(preview).toHaveAttribute('data-deck-preview', branch);
      await expect(preview).toHaveAttribute('aria-hidden', 'true');
      await expect
        .poll(() =>
          preview
            .locator('img')
            .evaluateAll((images) =>
              images.every(
                (image) =>
                  image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0
              )
            )
        )
        .toBe(true);
      const sources = await preview
        .locator('img')
        .evaluateAll((images) => [...new Set(images.map((image) => image.getAttribute('src')))]);
      expect(sources).toHaveLength(3);
      expect(sources.every((src) => src?.includes('watch-'))).toBe(branch === 'watch');
      const initial = parseInt((await count.textContent())!);
      for (let next = initial - 5; next >= 5; next -= 5) {
        await smaller.click();
        await expect(count).toHaveText(`${next} ${unit}`);
      }
      await expect(smaller).toBeDisabled();
      await expect(preview.locator('[data-active="true"]')).toHaveCount(5);
      if (branch === 'watch') await new SessionLobbyPage(page).ready();
      for (let next = 10; next <= max; next += 5) {
        await bigger.click();
        await expect(count).toHaveText(`${next} ${unit}`);
      }
      await expect(bigger).toBeDisabled();
      await expect(preview.locator('[data-active="true"]')).toHaveCount(max);
      if (branch === 'watch')
        await expect(page.getByRole('button', { name: 'I’m ready', exact: true })).toBeEnabled();
      await expect
        .poll(() => preview.evaluate((element) => element.getAnimations({ subtree: true }).length))
        .toBe(0);
      const bounds = await preview.evaluate((element) => {
        const frame = element.getBoundingClientRect();
        return [...element.querySelectorAll('[data-active="true"]')].flatMap((card, index) => {
          const box = card.getBoundingClientRect();
          return box.left >= frame.left &&
            box.right <= frame.right &&
            box.top >= frame.top &&
            box.bottom <= frame.bottom
            ? []
            : [
                {
                  index,
                  left: box.left - frame.left,
                  right: box.right - frame.right,
                  top: box.top - frame.top,
                  bottom: box.bottom - frame.bottom,
                },
              ];
        });
      });
      expect(bounds).toEqual([]);
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true);
      await preview.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath(`${branch}-deck.png`) });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await smaller.click();
      await expect(count).toHaveText(`${max - 5} ${unit}`);
      await expect(preview.locator('[data-deck-preview-card]').first()).toHaveCSS(
        'transition-property',
        'none'
      );
    } finally {
      await new SessionLobbyPage(page).leaveSession();
    }
  });
}

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
