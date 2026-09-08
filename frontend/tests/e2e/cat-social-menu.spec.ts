import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { test, expect, type Page } from '@playwright/test';
import type {
  Branch,
  DeckEntry,
  SessionLobbyState,
  SessionResultsEvent,
} from '@dinder/shared/types';

// A real Socket.IO transport with deterministic server messages. No production
// Sessions or paid menu fetches: the actual routes, stores and bindings still run.
async function sessionFixture(page: Page, branch: Branch, entryOverride?: DeckEntry) {
  const http = createServer();
  const io = new Server(http, { transports: ['polling'], cors: { origin: true } });
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const address = http.address();
  if (!address || typeof address === 'string') throw new Error('Missing fixture port');
  await page.route('**/socket.io/**', async (route) => {
    const url = new URL(route.request().url());
    url.host = `127.0.0.1:${address.port}`;
    const response = await route.fetch({ url: url.toString(), timeout: 0 });
    await route.fulfill({ response });
  });
  const entry: DeckEntry =
    entryOverride ??
    (branch === 'watch'
      ? {
          kind: 'movie',
          placeId: 'tmdb:movie:348',
          mediaType: 'movie',
          name: 'Alien',
          year: 1979,
          rating: 93,
          genres: ['Sci-Fi'],
          runtimeMinutes: 117,
          overview: 'A crew answers a mysterious signal.',
          imdbId: 'tt0078748',
        }
      : { placeId: 'cat-pizza', name: 'Pizza Palace', address: 'Test Street', rating: 4.7 });
  const lobby: SessionLobbyState = {
    sessionCode: 'CAT45',
    branch,
    state: 'waiting',
    revision: 1,
    round: 1,
    participants: [
      {
        participantId: 'host',
        displayName: 'Alice',
        isHost: true,
        isOnline: true,
        hasSubmitted: false,
        ready: false,
        waitingForNextRound: false,
      },
    ],
    mealType: 'main course',
    headcount: 2,
    deckSize: 10,
    searchRadiusMiles: 5,
  };
  const results: SessionResultsEvent = {
    sessionCode: lobby.sessionCode,
    overlappingOptions: [entry],
    allSelections: { Alice: [entry.placeId], Bob: [entry.placeId] },
    restaurantNames: { [entry.placeId]: entry.name },
    hasOverlap: true,
    topPick: { restaurant: entry, likedBy: 2, of: 2 },
  };
  let menuReady = false;
  let noMenu = false;
  const menu = {
    sessionCode: lobby.sessionCode,
    placeId: entry.placeId,
    venueName: entry.name,
    platform: 'ubereats',
    pricesAt: new Date().toISOString(),
    lines: [],
    feeCents: 0,
    itemsCents: 0,
    totalCents: 0,
    shares: [],
    state: 'building',
    menu: [{ name: 'Margherita', price_cents: 2300, section: 'Pizza', tags: [] }],
  };
  io.on('connection', (socket) => {
    socket.on('session:join', (_payload, ack) => {
      lobby.participants[0].participantId = socket.id;
      ack({
        success: true,
        data: {
          participantId: socket.id,
          sessionCode: lobby.sessionCode,
          displayName: 'Alice',
          participantCount: lobby.participants.length,
          rejoinToken: 'test-token',
          participants: lobby.participants,
          branch,
          state: lobby.state,
          lobby,
          ...(lobby.state === 'complete' ? { results } : {}),
        },
      });
    });
    socket.on('order:open', (_payload, ack) =>
      ack(
        menuReady
          ? { success: true, data: menu }
          : {
              success: false,
              error: {
                code: 'NOT_FOUND',
                reason: noMenu ? 'no_menu' : 'stale',
                message: noMenu ? 'No menu' : 'Fetching menu',
              },
            }
      )
    );
  });
  await page.route('**/api/sessions/CAT45', (route) =>
    route.fulfill({
      json: {
        sessionCode: lobby.sessionCode,
        hostName: 'Alice',
        participantCount: lobby.participants.length,
        state: lobby.state,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        shareableLink: 'http://localhost/join?code=CAT45',
        branch,
        lobby,
      },
    })
  );
  await page.route('**/api/options/CAT45', (route) =>
    route.fulfill({ json: { sessionCode: lobby.sessionCode, restaurants: [entry] } })
  );
  await page.addInitScript(
    ({ lobby, entry }) => {
      sessionStorage.setItem(
        'dinner-session-storage',
        JSON.stringify({
          version: 1,
          state: {
            sessionCode: lobby.sessionCode,
            currentUserId: 'host',
            sessionStatus: lobby.state,
            participants: lobby.participants.map((p) => ({
              ...p,
              sessionCode: lobby.sessionCode,
              joinedAt: 1,
            })),
            branch: lobby.branch,
            lobby,
            restaurants: [entry],
          },
        })
      );
    },
    { lobby, entry }
  );
  return {
    lobby,
    results,
    io,
    publish() {
      lobby.revision++;
      io.emit('session:lobby', lobby);
    },
    finishMenu() {
      menuReady = true;
    },
    withoutMenu() {
      noMenu = true;
    },
    close: async () => {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await page.close();
      await new Promise<void>((resolve) => io.close(() => resolve()));
    },
  };
}

async function fits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('a rejected lower lobby choice stays visible below the sticky header', async ({
  page,
}, info) => {
  const fixture = await sessionFixture(page, 'watch');
  const message = 'The choices changed. Review the latest choices and try again.';
  fixture.io.on('connection', (socket) => {
    socket.on('session:choices', (_payload, ack) =>
      ack({ success: false, error: { code: 'VALIDATION_ERROR', message } })
    );
  });
  try {
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto('/session/CAT45');
    await page.getByRole('button', { name: '2020s', exact: true }).click();
    const alert = page.getByRole('alert').filter({ hasText: message });
    await expect(alert).toBeInViewport({ ratio: 1 });
    const header = (await page.locator('header').boundingBox())!;
    expect((await alert.boundingBox())!.y).toBeGreaterThanOrEqual(header.y + header.height);
    await page.screenshot({
      path: info.outputPath('lobby-rejected-choice.png'),
      animations: 'disabled',
    });
  } finally {
    await fixture.close();
  }
});

test('Recipe Details previews the existing method and effort at 320px', async ({ page }, info) => {
  const fixture = await sessionFixture(page, 'cook', {
    kind: 'recipe',
    placeId: 'owned:penne-arrabbiata',
    name: 'Penne Arrabbiata',
    details: {
      cuisines: ['italian'],
      ingredients: ['500 g penne', '800 g tomatoes'],
      servings: 4,
      steps: ['Boil the penne.', 'Simmer the tomatoes and toss with the penne.'],
      provenance: 'owned',
    },
  });
  try {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto('/session/CAT45');
    await expect(page.getByRole('button', { name: 'I’m ready', exact: true })).toBeVisible();
    fixture.lobby.state = 'selecting';
    fixture.publish();
    await page.getByRole('button', { name: 'Details', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('2 ingredients · 2 steps')).toBeVisible();
    await expect(
      dialog.getByText('Cooking time is not available. Check the method before choosing.')
    ).toBeVisible();
    const preview = dialog.locator('summary', { hasText: 'Preview the method' });
    const close = dialog.getByRole('button', { name: 'Close', exact: true });
    await expect(close).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(preview).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(dialog.getByText('Simmer the tomatoes and toss with the penne.')).toBeVisible();
    expect((await preview.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await fits(page);
    await page.screenshot({
      path: info.outputPath('recipe-method-preview-320.png'),
      animations: 'disabled',
    });
    await page.keyboard.press('Shift+Tab');
    await expect(close).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('status', { name: '0 liked' })).toBeVisible();
  } finally {
    await fixture.close();
  }
});

for (const control of ['Back to the Match', 'Back'] as const) {
  test(`no-menu Group Order returns through ${control} without a basket warning`, async ({
    page,
  }, info) => {
    const fixture = await sessionFixture(page, 'takeaway');
    fixture.lobby.state = 'complete';
    fixture.withoutMenu();
    try {
      await page.setViewportSize({ width: 320, height: 844 });
      await page.goto('/session/CAT45/results');
      await page.getByRole('button', { name: 'Order together', exact: true }).click();
      await expect(
        page.getByText('No menu for this venue on Uber Eats or DoorDash.')
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Back to the Match', exact: true })
      ).toBeInViewport();
      await fits(page);
      await page.screenshot({
        path: info.outputPath(`group-order-no-menu-${control}.png`),
        animations: 'disabled',
      });
      await page.getByRole('button', { name: control, exact: true }).click();
      await expect(page).toHaveURL(/\/session\/CAT45\/results$/);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.getByText('Pizza Palace', { exact: true }).first()).toBeVisible();
    } finally {
      await fixture.close();
    }
  });
}

for (const branch of ['watch', 'takeaway'] as const) {
  test(`${branch}: actual roster, submitted waiting and crown drive the social scenes`, async ({
    page,
  }, info) => {
    const fixture = await sessionFixture(page, branch);
    try {
      if (info.project.name === 'mobile-chrome')
        await page.setViewportSize({ width: 320, height: 740 });
      await page.goto('/session/CAT45');
      const gathering = page.getByRole('group', { name: 'Getting together', exact: true });
      await expect(gathering).toBeVisible();
      await expect(page.getByRole('button', { name: 'I’m ready', exact: true })).toBeEnabled();
      await gathering.getByRole('button', { name: 'Pause animation' }).click();
      const beforeJoin = await gathering
        .locator('canvas')
        .evaluate((el: HTMLCanvasElement) => el.toDataURL());
      fixture.lobby.participants[0].ready = true;
      fixture.lobby.participants.push({
        participantId: 'guest',
        displayName: 'Bob',
        isHost: false,
        isOnline: true,
        hasSubmitted: false,
        ready: true,
        waitingForNextRound: false,
      });
      fixture.publish();
      await expect(page.getByText('Bob', { exact: true })).toBeVisible();
      await expect
        .poll(() => gathering.locator('canvas').evaluate((el: HTMLCanvasElement) => el.toDataURL()))
        .not.toBe(beforeJoin);
      await fits(page);
      await gathering.screenshot({ path: info.outputPath(`gather-${branch}.png`) });

      fixture.lobby.state = 'selecting';
      fixture.lobby.participants[0].hasSubmitted = true;
      fixture.publish();
      const saved = page.getByRole('group', { name: 'Saved you a seat', exact: true });
      await expect(saved).toBeVisible();
      await expect(page.getByRole('status').filter({ hasText: 'Waiting for Bob' })).toBeVisible();
      await saved.getByRole('button', { name: 'Pause animation' }).click();
      await fits(page);
      await page.screenshot({ path: info.outputPath(`saved-seat-${branch}.png`), fullPage: true });

      await page.emulateMedia({ reducedMotion: 'reduce' });
      await expect(saved.getByRole('button')).toHaveCount(0);
      const savedStill = await saved
        .locator('canvas')
        .evaluate((el: HTMLCanvasElement) => el.toDataURL());
      await page.waitForTimeout(120);
      expect(
        await saved.locator('canvas').evaluate((el: HTMLCanvasElement) => el.toDataURL())
      ).toBe(savedStill);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      fixture.lobby.state = 'complete';
      fixture.lobby.participants[1].hasSubmitted = true;
      fixture.publish();
      fixture.io.emit('session:results', fixture.results);
      const reveal = page.getByRole('group', { name: 'Tonight’s pick', exact: true });
      await expect(reveal).toBeVisible();
      await expect(
        page.getByText(branch === 'watch' ? 'Alien' : 'Pizza Palace', { exact: true }).first()
      ).toBeVisible();
      await expect(page.getByRole('link', { name: 'Heykeen home', exact: true })).toBeVisible();
      await fits(page);
      await page.waitForTimeout(3300);
      const finalFrame = await reveal
        .locator('canvas')
        .evaluate((el: HTMLCanvasElement) => el.toDataURL());
      await page.waitForTimeout(120);
      expect(
        await reveal.locator('canvas').evaluate((el: HTMLCanvasElement) => el.toDataURL())
      ).toBe(finalFrame);
      await page.screenshot({
        path: info.outputPath(`tonights-pick-${branch}.png`),
        fullPage: true,
      });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const reducedPick = await reveal
        .locator('canvas')
        .evaluate((el: HTMLCanvasElement) => el.toDataURL());
      await page.waitForTimeout(120);
      expect(
        await reveal.locator('canvas').evaluate((el: HTMLCanvasElement) => el.toDataURL())
      ).toBe(reducedPick);
      fixture.lobby.state = 'waiting';
      fixture.lobby.round = 2;
      fixture.lobby.participants.forEach((p) => {
        p.ready = false;
        p.hasSubmitted = false;
      });
      fixture.publish();
      await expect(reveal).toHaveCount(0);
      await expect(gathering).toBeVisible();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await expect(gathering.getByRole('button')).toHaveCount(0);
      const still = await gathering
        .locator('canvas')
        .evaluate((el: HTMLCanvasElement) => el.toDataURL());
      await page.waitForTimeout(120);
      expect(
        await gathering.locator('canvas').evaluate((el: HTMLCanvasElement) => el.toDataURL())
      ).toBe(still);
    } finally {
      await fixture.close();
    }
  });
}

test('Menu Delivery pauses independently and yields to the actual pinned menu', async ({
  page,
}, info) => {
  const fixture = await sessionFixture(page, 'takeaway');
  fixture.lobby.state = 'complete';
  await page.addInitScript(() => {
    class ComparisonSource extends EventTarget {
      static CLOSED = 2;
      readyState = 1;
      constructor() {
        super();
        window.addEventListener('menu-fixture', this.receive);
      }
      receive = () =>
        this.dispatchEvent(
          new MessageEvent('comparison', {
            data: JSON.stringify({
              type: 'comparison',
              comparison: {
                placeId: 'cat-pizza',
                venueName: 'Pizza Palace',
                fetchedAt: new Date().toISOString(),
                storefronts: {
                  ubereats: { status: 'resolved', deals: [], menu: [] },
                  doordash: { status: 'not_found', deals: [], menu: [] },
                },
                matchedItems: [],
                unmatched: { ubereats: [], doordash: [] },
              },
            }),
          })
        );
      close() {
        this.readyState = 2;
        window.removeEventListener('menu-fixture', this.receive);
      }
    }
    Object.defineProperty(window, 'EventSource', { value: ComparisonSource });
  });
  try {
    await page.goto('/session/CAT45/results');
    await expect(page.getByText('Pizza Palace', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Order together', exact: true }).click();
    const scene = page.getByRole('group', { name: 'Menu delivery', exact: true });
    await expect(scene).toBeVisible();
    await page.screenshot({ path: info.outputPath('menu-delivery-original-viewport.png') });
    await page.setViewportSize({ width: 320, height: 568 });
    await scene.getByRole('button', { name: 'Pause animation' }).click();
    const paused = await scene
      .locator('canvas')
      .evaluate((el: HTMLCanvasElement) => el.toDataURL());
    await page.waitForTimeout(120);
    expect(await scene.locator('canvas').evaluate((el: HTMLCanvasElement) => el.toDataURL())).toBe(
      paused
    );
    await fits(page);
    await expect(
      page.getByRole('button', { name: 'Back to the Match', exact: true })
    ).toBeInViewport();
    await page.screenshot({ path: info.outputPath('menu-delivery.png'), fullPage: true });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(scene.getByRole('button')).toHaveCount(0);
    const reducedMenu = await scene
      .locator('canvas')
      .evaluate((el: HTMLCanvasElement) => el.toDataURL());
    await page.waitForTimeout(120);
    expect(await scene.locator('canvas').evaluate((el: HTMLCanvasElement) => el.toDataURL())).toBe(
      reducedMenu
    );
    fixture.finishMenu();
    await page.evaluate(() => window.dispatchEvent(new Event('menu-fixture')));
    await expect(scene).toHaveCount(0);
    await page.locator('summary').filter({ hasText: 'Pizza (1)' }).click();
    await expect(
      page.getByRole('button', { name: 'Add Margherita, $23.00', exact: true })
    ).toBeVisible();
  } finally {
    await fixture.close();
  }
});
