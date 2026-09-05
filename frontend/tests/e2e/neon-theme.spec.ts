import { expect, test, type Locator } from '@playwright/test';

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

test('uses the Neon Night Market foundation', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#030712');

  const body = page.locator('body');
  await expect(body).toHaveCSS('font-family', /system-ui/);
  await expect(body).toHaveCSS('color', 'rgb(248, 250, 252)');
  await expect(body).toHaveCSS('background-color', 'rgb(3, 7, 18)');

  // The fork has no primary CTA; the Cook screen carries an enabled btn-primary.
  await page.goto('/cook');
  const primary = page.getByRole('button', { name: /back to tonight/i });
  await expect(primary).toHaveCSS('background-image', /rgb\(255, 56, 88\)/);

  await primary.focus();
  await expect(primary).toHaveCSS('outline-color', 'rgb(53, 231, 255)');
  await expect(primary).toHaveCSS('outline-width', '3px');
});

test('keeps representative Neon text pairs WCAG AA readable', async ({ page }) => {
  await page.goto('/cook');

  const body = page.locator('body');
  const primary = page.getByRole('button', { name: /back to tonight/i });
  const label = page.locator('label[for="hostName"]');
  await expect(body).toHaveCSS('color', 'rgb(248, 250, 252)');
  await expect(primary).toHaveCSS('color', 'rgb(3, 7, 18)');

  // Ratios over the rendered theme, not restated literals: an edit to
  // tailwind.config.ts or index.css that breaks AA has to fail here.
  const [ink] = await rgbStops(body, 'background-color');
  const [bodyText] = await rgbStops(body, 'color');
  const [primaryText] = await rgbStops(primary, 'color');
  const [labelText] = await rgbStops(label, 'color');
  const primaryStops = await rgbStops(primary, 'background-image');

  expect(contrastRatio(bodyText, ink)).toBeGreaterThanOrEqual(4.5);
  expect(primaryStops.length).toBeGreaterThanOrEqual(2); // both ends of the coral gradient
  for (const stop of primaryStops) {
    expect(contrastRatio(primaryText, stop)).toBeGreaterThanOrEqual(4.5);
  }
  expect(contrastRatio(labelText, ink)).toBeGreaterThanOrEqual(4.5);
});

test('uses the Neon card and field treatments', async ({ page }) => {
  await page.goto('/create');

  const form = page.locator('form');
  await expect(form).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(form).toHaveCSS('border-radius', '28px');

  const name = page.getByLabel('Your Name');
  await expect(name).toHaveCSS('background-color', 'rgb(5, 13, 25)');
  await expect(name).toHaveCSS('border-color', 'rgb(53, 231, 255)');
  await expect(page.locator('label[for="hostName"]')).toHaveCSS('color', 'rgb(53, 231, 255)');

  const submit = page.getByRole('button', { name: 'Create Session' });
  await expect(submit).toBeDisabled();
  await expect(submit).toHaveCSS('background-image', 'none');
  await expect(submit).toHaveCSS('background-color', 'rgb(12, 23, 39)');
});

test('renders the Neon entry fork at mobile width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await expect(page.getByRole('link', { name: 'Dinder home' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Tonight you/i })).toBeVisible();

  const eatOut = page.getByRole('button', { name: /eating out/i });
  const takeaway = page.getByRole('button', { name: /getting takeaway/i });
  const cook = page.getByRole('button', { name: /cooking/i });
  expect((await eatOut.boundingBox())?.height).toBeGreaterThanOrEqual(48);
  expect((await takeaway.boundingBox())?.height).toBeGreaterThanOrEqual(48);
  expect((await cook.boundingBox())?.height).toBeGreaterThanOrEqual(48);
  await expect(page.getByRole('button', { name: /join with a code/i })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Compare delivery prices' })).toBeVisible();
});

test('uses the five-character Neon join field', async ({ page }) => {
  await page.goto('/join');

  const label = page.locator('label[for="sessionCode"]');
  await expect(label).toHaveCSS('color', 'rgb(53, 231, 255)');
  await expect(label).toHaveCSS('text-transform', 'uppercase');

  const code = page.getByLabel('Session Code');
  await code.fill('abcdef');
  await expect(code).toHaveValue('ABCDE');
  await page.getByLabel('Your Name').fill('Zac');

  const join = page.getByRole('button', { name: 'Join Session' });
  await expect(join).toBeEnabled();
  await expect(join).toHaveCSS('background-image', /rgb\(255, 56, 88\)/);
});

test('uses Neon panels and micro-labels on secondary pages', async ({ page }) => {
  await page.goto('/compare');

  const panel = page.getByRole('heading', { name: 'Find nearby Venues' }).locator('..');
  await expect(panel).toHaveCSS('border-color', 'rgb(36, 48, 68)');
  await expect(page.locator('label[for="comparison-radius"]')).toHaveCSS(
    'color',
    'rgb(53, 231, 255)'
  );

  const locate = page.getByRole('button', { name: 'Use my location' });
  await expect(locate).toHaveCSS('background-image', /rgb\(255, 56, 88\)/);
});
