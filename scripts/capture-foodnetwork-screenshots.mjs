import { chromium } from 'playwright';

const TARGET_URL = 'https://www.foodnetwork.com/restaurants/packages/best-food-in-america';
const OUT_DIR = new URL('../docs/screenshots/foodnetwork/', import.meta.url);

function outPath(name) {
  // Convert file URL to path string for Playwright
  return decodeURIComponent(new URL(name, OUT_DIR).pathname);
}

async function safeClick(page, selectors) {
  for (const sel of selectors) {
    try {
      const loc = page.locator(sel).first();
      if (await loc.count()) {
        await loc.click({ timeout: 1500 });
        return true;
      }
    } catch {
      // ignore
    }
  }
  return false;
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();
  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' });

  // Give it a moment to render (Food Network can be heavy)
  await page.waitForTimeout(2000);

  // Try to accept cookies / close modals (best-effort)
  await safeClick(page, [
    'button:has-text("Accept")',
    'button:has-text("I Agree")',
    'button:has-text("Agree")',
    'button:has-text("OK")',
    '[aria-label="Close"]',
    'button[aria-label="Close"]',
    'button:has-text("Close")',
  ]);

  // Hero/top
  await page.screenshot({ path: outPath('00-top.png'), fullPage: false });

  // Full page
  await page.screenshot({ path: outPath('01-fullpage.png'), fullPage: true });

  // Scroll and capture a few key sections (viewport shots)
  const heights = [0.2, 0.4, 0.6, 0.8];
  const scrollHeight = await page.evaluate(() => document.body.scrollHeight);

  for (let i = 0; i < heights.length; i++) {
    const y = Math.floor(scrollHeight * heights[i]);
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: outPath(`02-scroll-${i + 1}.png`), fullPage: false });
  }

  // Also capture mobile-ish viewport
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const mpage = await mobile.newPage();
  await mpage.goto(TARGET_URL, { waitUntil: 'domcontentloaded' });
  await mpage.waitForTimeout(2500);
  await safeClick(mpage, [
    'button:has-text("Accept")',
    'button:has-text("I Agree")',
    'button:has-text("Agree")',
    'button:has-text("OK")',
    '[aria-label="Close"]',
    'button[aria-label="Close"]',
    'button:has-text("Close")',
  ]);

  await mpage.screenshot({ path: outPath('03-mobile-top.png'), fullPage: false });
  await mpage.screenshot({ path: outPath('04-mobile-fullpage.png'), fullPage: true });

  await mobile.close();
  await context.close();
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
