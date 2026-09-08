import { expect, test, type Locator } from '@playwright/test';
import { CookSetupPage } from './pages';

const contrastRatio = (foreground: number[], background: number[]) => {
  const luminance = ([red, green, blue]: number[]) => {
    const channels = [red, green, blue].map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };

  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
};

// Every rgb() in one computed CSS property, as [r, g, b] — a gradient yields
// each of its stops.
const rgbStops = async (locator: Locator, property: string): Promise<number[][]> => {
  const value = await locator.evaluate(
    (el, prop) => getComputedStyle(el).getPropertyValue(prop),
    property
  );
  return [...value.matchAll(/rgba?\((\d+), (\d+), (\d+)/g)].map((m) => m.slice(1, 4).map(Number));
};

test('uses the Heykeen foundation', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#FFF4E8');

  await expect(page).toHaveTitle('Heykeen');
  await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute('content', 'Heykeen');
  const manifest = await (await page.request.get('/manifest.webmanifest')).json();
  expect(manifest.name).toBe('Heykeen');
  expect(manifest.theme_color).toBe('#FFF4E8');
  for (const icon of manifest.icons) {
    const response = await page.request.get(icon.src);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('image/png');
  }
  const shareImage = await page.request.get('/images/heykeen-share.png');
  expect(shareImage.ok()).toBe(true);
  expect(shareImage.headers()['content-type']).toContain('image/png');

  const body = page.locator('body');
  await expect(body).toHaveCSS('font-family', /system-ui/);
  await expect(body).toHaveCSS('color', 'rgb(48, 35, 49)');
  await expect(body).toHaveCSS('background-color', 'rgb(255, 244, 232)');

  // Cook entry's `Create session` is an
  // enabled btn-primary once a name is entered.
  const cook = new CookSetupPage(page);
  await cook.goto();
  await cook.nameInput.fill('Zac');
  const primary = cook.startButton;
  await expect(primary).toHaveCSS('background-color', 'rgb(234, 112, 88)');

  await primary.focus();
  await expect(primary).toHaveCSS('outline-color', 'rgb(48, 35, 49)');
  await expect(primary).toHaveCSS('outline-width', '3px');
});

test('keeps representative Heykeen text pairs WCAG AA readable', async ({ page }) => {
  const cook = new CookSetupPage(page);
  await cook.goto();
  await cook.nameInput.fill('Zac');

  const body = page.locator('body');
  const primary = cook.startButton;
  const label = page.locator('label[for="hostName"]');
  await expect(body).toHaveCSS('color', 'rgb(48, 35, 49)');
  await expect(primary).toHaveCSS('color', 'rgb(48, 35, 49)');

  // Ratios over the rendered theme, not restated literals: an edit to
  // tailwind.config.ts or index.css that breaks AA has to fail here.
  const [ink] = await rgbStops(body, 'background-color');
  const [bodyText] = await rgbStops(body, 'color');
  const [primaryText] = await rgbStops(primary, 'color');
  const [labelText] = await rgbStops(label, 'color');
  const primaryStops = await rgbStops(primary, 'background-color');

  expect(contrastRatio(bodyText, ink)).toBeGreaterThanOrEqual(4.5);
  expect(primaryStops).toHaveLength(1); // solid coral action surface
  for (const stop of primaryStops) {
    expect(contrastRatio(primaryText, stop)).toBeGreaterThanOrEqual(4.5);
  }
  expect(contrastRatio(labelText, ink)).toBeGreaterThanOrEqual(4.5);
});

test('uses the Heykeen card and field treatments', async ({ page }) => {
  await page.goto('/create');

  const form = page.locator('form');
  await expect(form).toHaveCSS('background-color', 'rgb(255, 251, 246)');
  await expect(form).toHaveCSS('border-radius', '28px');

  const name = page.getByLabel('Your Name');
  await expect(name).toHaveCSS('background-color', 'rgb(255, 251, 246)');
  await expect(name).toHaveCSS('border-color', 'rgb(48, 35, 49)');
  await expect(page.locator('label[for="hostName"]')).toHaveCSS('color', 'rgb(48, 35, 49)');

  const submit = page.getByRole('button', { name: 'Create session' });
  await expect(submit).toBeDisabled();
  await expect(submit).toHaveCSS('background-image', 'none');
  await expect(submit).toHaveCSS('background-color', 'rgb(243, 231, 220)');
});

test('renders the warm entry fork at mobile width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await expect(page.getByRole('link', { name: 'Heykeen home' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /What are we doing tonight/i })).toBeVisible();

  const eatOut = page.getByRole('button', { name: /eat out/i });
  const takeaway = page.getByRole('button', { name: /order in/i });
  const cook = page.getByRole('button', { name: /Cook together/i });
  expect((await eatOut.boundingBox())?.height).toBeGreaterThanOrEqual(48);
  expect((await takeaway.boundingBox())?.height).toBeGreaterThanOrEqual(48);
  expect((await cook.boundingBox())?.height).toBeGreaterThanOrEqual(48);
  await expect(page.getByRole('button', { name: /join with a code/i })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Compare delivery prices', exact: true })
  ).toBeVisible();
});

test('uses the five-character Heykeen join field', async ({ page }) => {
  await page.goto('/join');

  const label = page.locator('label[for="sessionCode"]');
  await expect(label).toHaveCSS('color', 'rgb(48, 35, 49)');
  await expect(label).toHaveCSS('text-transform', 'uppercase');

  const code = page.getByLabel('Session code');
  await code.fill('abcdef');
  await expect(code).toHaveValue('ABCDE');
  await page.getByLabel('Your Name').fill('Zac');

  const join = page.getByRole('button', { name: 'Join session' });
  await expect(join).toBeEnabled();
  await expect(join).toHaveCSS('background-color', 'rgb(234, 112, 88)');
});

test('uses Heykeen panels and micro-labels on secondary pages', async ({ page }) => {
  await page.goto('/compare');

  const panel = page.getByRole('heading', { name: 'Find nearby venues' }).locator('..');
  await expect(panel).toHaveCSS('border-color', 'rgb(214, 197, 186)');
  await expect(page.locator('label[for="comparison-radius"]')).toHaveCSS(
    'color',
    'rgb(48, 35, 49)'
  );

  const locate = page.getByRole('button', { name: 'Use my location' });
  await expect(locate).toHaveCSS('background-color', 'rgb(234, 112, 88)');
});
