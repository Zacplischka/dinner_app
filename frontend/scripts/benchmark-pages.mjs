import { chromium } from '@playwright/test';

const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const limitMs = Number(process.env.PAGE_LOAD_LIMIT_MS ?? 50);
const sampleCount = Number(process.env.PAGE_LOAD_SAMPLES ?? 7);
const routes = [
  '/',
  '/compare',
  '/compare/test-place',
  '/create',
  '/join',
  '/session/ABCDE',
  '/session/ABCDE/select',
  '/session/ABCDE/results',
  '/friends',
];

const browser = await chromium.launch({ headless: true });
let failed = false;

try {
  for (const path of routes) {
    const samples = [];

    for (let run = 0; run <= sampleCount; run += 1) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      await context.addInitScript(() => {
        window.__routeReady = null;
        const observer = new MutationObserver(() => {
          if (window.__routeReady === null && document.querySelector('#root > .animate-slide-up')) {
            window.__routeReady = performance.now();
            observer.disconnect();
          }
        });
        observer.observe(document, { childList: true, subtree: true });
        localStorage.setItem(
          'dinner-session-storage',
          JSON.stringify({
            version: 1,
            state: {
              sessionCode: 'ABCDE',
              participants: [],
              currentUserId: 'benchmark-user',
              restaurants: [],
              selections: [],
              allSelections: {},
              restaurantNames: {},
              overlappingOptions: [],
              sessionStatus: 'waiting',
            },
          })
        );
      });

      const page = await context.newPage();
      await page.goto(`${baseUrl}${path}`, { waitUntil: 'commit' });
      await page.waitForFunction(() => window.__routeReady !== null, null, {
        polling: 10,
        timeout: 5_000,
      });
      const loadMs = await page.evaluate(() => window.__routeReady);
      if (run > 0) samples.push(loadMs);
      await context.close();
    }

    samples.sort((left, right) => left - right);
    const median = samples[Math.floor(samples.length / 2)];
    const p95 = samples[Math.ceil(samples.length * 0.95) - 1];
    failed ||= p95 >= limitMs;
    console.log(`${path.padEnd(30)} median ${median.toFixed(1)} ms  p95 ${p95.toFixed(1)} ms`);
  }
} finally {
  await browser.close();
}

if (failed) process.exitCode = 1;
