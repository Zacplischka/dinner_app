import { fork, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { loadEnv } from 'vite';
import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { WatchSetupPage, SessionLobbyPage, SelectionPage } from './pages';

// Four isolated identities against a disposable backend running production handlers.
// Supabase Auth/Profile HTTP responses are fixtures: no real Google/Supabase accounts.
const names = ['Alice', 'Bob', 'Cara', 'Dan'];
const ids = names.map((_, i) => `00000000-0000-4000-8000-00000000000${i + 1}`);
const authUrl =
  process.env.VITE_SUPABASE_URL || loadEnv('production', process.cwd(), 'VITE_').VITE_SUPABASE_URL;
const storageKey = `sb-${new URL(authUrl).hostname.split('.')[0]}-auth-token`;
let child: ChildProcess;
let backend: string;
const photos = await Promise.all(
  ['#EA7058', '#302331', '#339977', '#5577BB'].map((background) =>
    sharp({ create: { width: 280, height: 320, channels: 3, background } })
      .png()
      .toBuffer()
  )
);

test.beforeAll(async ({ baseURL }) => {
  child = fork(
    fileURLToPath(new URL('../../../backend/tests/fixtures/profile-server.ts', import.meta.url)),
    [],
    {
      cwd: fileURLToPath(new URL('../../../backend/', import.meta.url)),
      execArgv: ['--import', 'tsx'],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        FRONTEND_URL: baseURL!,
        GOOGLE_PLACES_API_KEY: 'unused-fixture',
        MOVIES_FILE: fileURLToPath(
          new URL('../../../backend/tests/fixtures/movies.json', import.meta.url)
        ),
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    }
  );
  let logs = '';
  child.stdout?.on('data', (data) => {
    logs += String(data);
  });
  child.stderr?.on('data', (data) => {
    logs += String(data);
  });
  backend = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Fixture did not start: ${logs}`)), 15000);
    child.once('message', (message: { url: string }) => {
      clearTimeout(timeout);
      resolve(message.url);
    });
    child.once('exit', () => {
      clearTimeout(timeout);
      reject(new Error(`Fixture exited: ${logs}`));
    });
  });
});
test.afterAll(() => {
  child?.kill('SIGTERM');
});

async function contextFor(
  browser: Browser,
  baseURL: string | undefined,
  person?: number
): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  // Route only transport destinations; application contracts and UI are untouched.
  await context.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: `${backend}${url.pathname}${url.search}` });
    await route.fulfill({ response });
  });
  await context.route('**/socket.io/**', async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({
      url: `${backend}${url.pathname}${url.search}`,
      timeout: 0,
    });
    await route.fulfill({ response });
  });
  await context.route(`${authUrl}/**`, (route) => route.fulfill({ json: {} }));
  await context.route('https://example.test/**', (route) => route.fulfill({ status: 404 }));
  await context.route('https://image.tmdb.org/**', (route) => route.fulfill({ status: 404 }));
  if (person !== undefined)
    await context.addInitScript(
      ({ id, name, key }) => {
        if (localStorage.getItem(key)) return;
        const expiresAt = Math.floor(Date.now() / 1000) + 3600;
        localStorage.setItem(
          key,
          JSON.stringify({
            access_token: `${btoa('{"alg":"HS256"}')}.${btoa(JSON.stringify({ sub: id, exp: expiresAt }))}.${id}`,
            refresh_token: 'local-fixture',
            token_type: 'bearer',
            expires_at: expiresAt,
            user: {
              id,
              aud: 'authenticated',
              role: 'authenticated',
              email: `${name.toLowerCase()}@example.test`,
              app_metadata: { provider: 'google' },
              user_metadata: {
                full_name: name,
                avatar_url: 'https://example.test/stale-google.jpg',
              },
              created_at: '2026-09-09T00:00:00Z',
            },
          })
        );
      },
      { id: ids[person], name: names[person], key: storageKey }
    );
  return context;
}
async function savePhoto(page: Page, photo: Buffer, filename = 'portrait.png') {
  await page
    .getByLabel('Choose profile photo', { exact: true })
    .setInputFiles({ name: filename, mimeType: 'image/png', buffer: photo });
  await page.getByRole('button', { name: 'Save photo', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Profile photo', exact: true }).getByRole('status')
  ).toHaveText('Photo saved.');
  const image = page.getByRole('img', { name: 'Saved profile photo', exact: true }).locator('img');
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(256);
  return (await image.getAttribute('src'))!;
}
async function join(page: Page, code: string) {
  await page.goto(`/join?code=${code}`);
  await expect(page).toHaveURL(new RegExp(`/session/${code}(?:/select)?$`));
}

test('four saved Profile photos survive late join, refresh, Ready, four submissions and Restart; removal remains removed after reauthentication', async ({
  browser,
  baseURL,
}, info) => {
  test.setTimeout(120_000);
  const contexts = await Promise.all(names.map((_, i) => contextFor(browser, baseURL, i)));
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
  try {
    const urls: string[] = [];
    for (let i = 0; i < 4; i++) {
      await pages[i].goto('/');
      await pages[i].getByRole('link', { name: 'Profile settings', exact: true }).click();
      await expect(pages[i].getByRole('heading', { name: 'Profile settings' })).toBeVisible();
      await expect(pages[i].getByRole('button', { name: 'Add photo', exact: true })).toBeEnabled();
      urls.push(await savePhoto(pages[i], photos[i]));
      expect(
        await pages[i].evaluate(() => document.documentElement.scrollWidth <= innerWidth)
      ).toBe(true);
    }
    expect(new Set(urls).size).toBe(4);
    await pages[0].screenshot({ path: info.outputPath('profile-settings-390.png') });
    const host = new WatchSetupPage(pages[0]);
    await host.goto();
    await expect(pages[0]).toHaveURL(/\/session\/[A-Z0-9]+$/);
    const code = pages[0].url().split('/').at(-1)!;
    await join(pages[1], code);
    await join(pages[2], code);
    // Fourth profile arrives late to the gathering and receives the full roster.
    await join(pages[3], code);
    for (const page of pages) {
      await expect(page.getByTestId('participant')).toHaveCount(4);
      for (let i = 0; i < 4; i++) {
        const row = page.getByTestId('participant').filter({
          has: page
            .getByTestId('participant-name')
            .filter({ hasText: new RegExp(`^${names[i]}$`) }),
        });
        await expect(row.locator('img')).toHaveAttribute('src', urls[i]);
      }
    }
    await expect(pages[0].getByRole('button', { name: 'Dismiss notification' })).toHaveCount(0, {
      timeout: 15000,
    });
    await pages[0].screenshot({ path: info.outputPath('four-profile-lobby-390.png') });
    await pages[1].reload();
    await expect(pages[1].getByTestId('participant')).toHaveCount(4);
    await expect(pages[0].getByTestId('participant')).toHaveCount(4);
    for (const page of pages) await new SessionLobbyPage(page).ready();
    await new SessionLobbyPage(pages[0]).startSession();
    for (const page of pages) {
      await expect(page).toHaveURL(new RegExp(`/session/${code}/select$`));
      for (let i = 0; i < 4; i++)
        await expect(
          page.getByLabel(`${names[i]} is choosing`, { exact: true }).locator('img')
        ).toHaveAttribute('src', urls[i]);
    }
    await expect(pages[0].getByRole('button', { name: 'Dismiss notification' })).toHaveCount(0, {
      timeout: 15000,
    });
    await pages[0].screenshot({
      path: info.outputPath('four-profile-swiping-390.png'),
      animations: 'disabled',
    });
    await pages[2].reload();
    await expect(
      pages[2].getByLabel('Cara is choosing', { exact: true }).locator('img')
    ).toHaveAttribute('src', urls[2]);
    const title = await pages[0]
      .locator('[data-swipe-card]')
      .first()
      .getByRole('heading')
      .innerText();
    const selections = pages.map((page) => new SelectionPage(page));
    for (const selection of selections) await selection.likeRestaurant();
    for (const page of pages) {
      const fullHouse = page.getByRole('dialog', { name: 'EVERYONE LIKED THIS' });
      await expect(fullHouse).toBeVisible();
      await fullHouse.getByRole('button', { name: 'Finish here', exact: true }).click();
    }
    for (const page of pages) {
      await expect(page).toHaveURL(new RegExp(`/session/${code}/results$`));
      await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
    }
    await pages[0].getByRole('button', { name: /Try another deck|Select again/i }).click();
    for (const page of pages) {
      await expect(page.getByTestId('participant')).toHaveCount(4);
      await expect(page.getByRole('button', { name: 'I’m ready', exact: true })).toBeVisible();
    }
    // A separate authenticated device edits Bob's Profile, without changing Ready in the existing Session.
    const otherDevice = await contextFor(browser, baseURL, 1);
    contexts.push(otherDevice);
    const editor = await otherDevice.newPage();
    await editor.goto('/profile');
    await expect(
      editor.getByRole('img', { name: 'Saved profile photo', exact: true }).locator('img')
    ).toHaveAttribute('src', urls[1]);
    const replacement = await savePhoto(editor, photos[0], 'replacement.png');
    expect(replacement).not.toBe(urls[1]);
    await editor.getByRole('button', { name: 'Remove photo', exact: true }).click();
    await expect(
      editor.getByRole('region', { name: 'Profile photo', exact: true }).getByRole('status')
    ).toHaveText('Photo removed.');
    await editor.goto('/');
    await editor.getByRole('button', { name: 'Sign out', exact: true }).click();
    await editor.reload(); // fixture performs a fresh Google-style sign-in with the original OAuth photo metadata
    await editor.goto('/profile');
    await expect(editor.getByRole('button', { name: 'Add photo', exact: true })).toBeEnabled();
    await expect(
      editor.getByRole('img', { name: 'Saved profile photo', exact: true }).locator('img')
    ).toHaveCount(0);
    await pages[1].reload();
    await expect(
      pages[0].getByTestId('participant').filter({ hasText: 'Bob' }).locator('img')
    ).toHaveCount(0);
  } finally {
    await Promise.all(
      contexts.map(async (context) => {
        await context.unrouteAll({ behavior: 'ignoreErrors' });
        await context.close();
      })
    );
  }
});

test('mobile editor retries invalid uploads; an authenticated Host and late guest keep initials fallback without changing the round', async ({
  browser,
  baseURL,
}, info) => {
  test.setTimeout(60_000);
  const hostContext = await contextFor(browser, baseURL, 0);
  const guestContext = await contextFor(browser, baseURL);
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  try {
    await host.setViewportSize({ width: 375, height: 812 });
    await host.goto('/profile');
    await expect(host.getByRole('button', { name: /Add photo|Change photo/ })).toBeEnabled();
    const prior = await savePhoto(host, photos[0]);
    await host.getByLabel('Choose profile photo', { exact: true }).setInputFiles({
      name: 'invalid.png',
      mimeType: 'image/png',
      buffer: Buffer.from('invalid'),
    });
    await host.getByRole('button', { name: 'Save photo', exact: true }).click();
    await expect(host.getByRole('alert')).toContainText('Choose a JPEG, PNG or WebP');
    await expect(
      host.getByRole('img', { name: 'Saved profile photo', exact: true }).locator('img')
    ).toHaveAttribute('src', prior);
    const saved = await savePhoto(host, photos[2]);
    expect(saved).not.toBe(prior);
    const change = host.getByRole('button', { name: 'Change photo', exact: true });
    await change.focus();
    await host.keyboard.press('Tab');
    await expect(host.getByRole('button', { name: 'Remove photo', exact: true })).toBeFocused();
    for (const button of await host
      .getByRole('region', { name: 'Profile photo', exact: true })
      .locator('button')
      .all())
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    expect(await host.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    await host.screenshot({ path: info.outputPath('profile-settings-375.png') });
    await host.goto('/watch');
    await expect(host).toHaveURL(/\/session\/[A-Z0-9]+$/);
    const code = host.url().split('/').at(-1)!;
    await new SessionLobbyPage(host).startSession();
    // Guest has no Auth fixture/token and arrives after the fixed Deck started.
    await guest.goto(`/join?code=${code}`);
    await guest.getByLabel('Your Name', { exact: true }).fill('Guest');
    await guest.getByRole('button', { name: 'Join session', exact: true }).click();
    await expect(guest).toHaveURL(new RegExp(`/session/${code}/select$`));
    for (const page of [host, guest]) {
      await expect(
        page.getByLabel('Alice is choosing', { exact: true }).locator('img')
      ).toHaveAttribute('src', saved);
      await expect(page.getByLabel('Guest is choosing', { exact: true })).toHaveText('G');
      await expect(
        page.getByLabel('Guest is choosing', { exact: true }).locator('img')
      ).toHaveCount(0);
    }
    // A network/image failure affects only its fixed circle; the Deck remains usable.
    await guestContext.route('**/api/profile-photos/**', (route) => route.fulfill({ status: 404 }));
    await guest.reload();
    await expect(guest.getByLabel('Alice is choosing', { exact: true })).toHaveText('A');
    await expect(guest.getByRole('button', { name: 'Like', exact: true })).toBeEnabled();
    await expect(guest.getByRole('button', { name: 'Dismiss notification' })).toHaveCount(0, {
      timeout: 15000,
    });
    await guest.screenshot({
      path: info.outputPath('mixed-guest-photo-fallback-390.png'),
      animations: 'disabled',
    });
  } finally {
    for (const context of [hostContext, guestContext]) {
      await context.unrouteAll({ behavior: 'ignoreErrors' });
      await context.close();
    }
  }
});
