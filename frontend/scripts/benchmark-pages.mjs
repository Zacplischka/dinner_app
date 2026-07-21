import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { hostname, platform, arch } from 'node:os';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';
import {
  CLIENT_STATE_SEED,
  ROUTES,
  SAMPLE_COUNT,
  THRESHOLDS,
  THROTTLING,
  VIEWPORT,
  documentTtfbMs,
  evaluatePostCutover,
  resolveConfig,
  serializeArtifact,
  summarizeSamples,
  validateArtifactShape,
  validateComparableBaseline,
  validateRouteBatch,
} from './benchmark-pages-core.mjs';

const usage = `Usage:
  npm run benchmark:pages --workspace=frontend -- \\
    --mode=baseline|post-cutover \\
    --base-url=https://... \\
    --commit=<40-character-sha> \\
    --deployment=<railway-deployment-id-or-url> \\
    --runner-location="Melbourne, Australia" \\
    --output=../docs/evidence/route-performance/<artifact>.json \\
    [--baseline=../docs/evidence/route-performance/pre-cutover-direct-railway.json]

The sample counts, Chromium viewport, and no-throttling profile are fixed by issue #147.
GitHub Actions is intentionally ineligible to claim the Melbourne performance gate.`;

function cliConfig() {
  const { values } = parseArgs({
    options: {
      help: { type: 'boolean', short: 'h' },
      mode: { type: 'string' },
      'base-url': { type: 'string' },
      commit: { type: 'string' },
      deployment: { type: 'string' },
      'runner-location': { type: 'string' },
      output: { type: 'string' },
      baseline: { type: 'string' },
    },
  });
  if (values.help) {
    console.log(usage);
    process.exit(0);
  }
  return resolveConfig(
    {
      mode: values.mode,
      baseUrl: values['base-url'],
      commit: values.commit,
      deployment: values.deployment,
      runnerLocation: values['runner-location'],
      output: values.output,
      baseline: values.baseline,
    },
    process.env
  );
}

async function newSeededContext(browser) {
  const context = await browser.newContext({ viewport: VIEWPORT });
  await context.addInitScript((seed) => {
    window.__routeReady = null;
    const markReady = () => {
      if (window.__routeReady === null && document.querySelector('#root > .animate-slide-up')) {
        window.__routeReady = performance.now();
        observer.disconnect();
      }
    };
    const observer = new MutationObserver(markReady);
    observer.observe(document, { childList: true, subtree: true });
    markReady();

    if (location.origin !== 'null') {
      for (const [key, value] of Object.entries(seed.localStorage))
        localStorage.setItem(key, value);
    }
  }, CLIENT_STATE_SEED);
  return context;
}

function emptySample({ route, phase, sample, browserVersion, config }) {
  return {
    timestamp: new Date().toISOString(),
    url: new URL(route, config.baseUrl).href,
    pageUrl: new URL(route, config.baseUrl).href,
    route,
    phase,
    sample,
    browserVersion,
    viewport: { ...VIEWPORT },
    throttling: THROTTLING,
    commit: config.commit,
    deployment: config.deployment,
    clientStateSeed: CLIENT_STATE_SEED.id,
    routeReadyMs: null,
    documentTtfbMs: null,
    status: null,
    bodyHash: null,
    etag: null,
    cacheControl: null,
    cfCacheStatus: null,
    age: null,
    cfRay: null,
    error: null,
  };
}

// fallow-ignore-next-line complexity
async function captureNavigation(page, action, metadata) {
  const sample = emptySample(metadata);
  let response;

  try {
    response = await action();
    if (!response) throw new Error('navigation returned no document response');
    await page.waitForFunction(() => window.__routeReady !== null, null, {
      polling: 10,
      timeout: 10_000,
    });
    const timing = await page.evaluate(() => {
      const [navigation] = performance.getEntriesByType('navigation');
      return {
        routeReadyMs: window.__routeReady,
        requestStart: navigation?.requestStart,
        responseStart: navigation?.responseStart,
      };
    });
    const headers = await response.allHeaders();
    let bodyHash = null;
    try {
      bodyHash = createHash('sha256')
        .update(await response.body())
        .digest('hex');
    } catch {
      // A validator is sufficient when Chromium does not expose a cached body.
    }

    Object.assign(sample, {
      url: response.url(),
      pageUrl: page.url(),
      routeReadyMs: timing.routeReadyMs,
      documentTtfbMs: documentTtfbMs(timing),
      status: response.status(),
      bodyHash,
      etag: headers.etag ?? null,
      cacheControl: headers['cache-control'] ?? null,
      cfCacheStatus: headers['cf-cache-status'] ?? null,
      age: headers.age ?? null,
      cfRay: headers['cf-ray'] ?? null,
    });
  } catch (error) {
    sample.error = error instanceof Error ? error.message : String(error);
    if (response) {
      sample.url = response.url();
      sample.status = response.status();
    }
    sample.pageUrl = page.url();
  }

  return sample;
}

// fallow-ignore-next-line complexity
async function measureRoute(browser, browserVersion, route, config) {
  let prime = null;
  if (config.mode === 'post-cutover') {
    const context = await newSeededContext(browser);
    try {
      const page = await context.newPage();
      prime = await captureNavigation(
        page,
        () => page.goto(new URL(route, config.baseUrl).href, { waitUntil: 'commit' }),
        { route, phase: 'prime', sample: 1, browserVersion, config }
      );
    } finally {
      await context.close();
    }
  }

  const cold = [];
  let warmContext;
  let warmPage;
  try {
    for (let index = 1; index <= SAMPLE_COUNT; index += 1) {
      const context = await newSeededContext(browser);
      const page = await context.newPage();
      cold.push(
        await captureNavigation(
          page,
          () => page.goto(new URL(route, config.baseUrl).href, { waitUntil: 'commit' }),
          { route, phase: 'cold', sample: index, browserVersion, config }
        )
      );
      if (index === SAMPLE_COUNT) {
        warmContext = context;
        warmPage = page;
      } else {
        await context.close();
      }
    }

    const warm = [];
    for (let index = 1; index <= SAMPLE_COUNT; index += 1) {
      warm.push(
        await captureNavigation(warmPage, () => warmPage.reload({ waitUntil: 'commit' }), {
          route,
          phase: 'warm',
          sample: index,
          browserVersion,
          config,
        })
      );
    }
    return { route, prime, cold, warm };
  } finally {
    await warmContext?.close();
  }
}

async function loadBaseline(path, runner) {
  const baseline = JSON.parse(await readFile(resolve(path), 'utf8'));
  const errors = [
    ...validateArtifactShape(baseline),
    ...validateComparableBaseline(baseline, runner),
    ...(baseline.routes ?? []).flatMap((batch) => validateRouteBatch(batch, 'baseline')),
  ];
  if (errors.length > 0) throw new Error(`Invalid baseline:\n${errors.join('\n')}`);
  return baseline;
}

function logRoute(batch) {
  if (!batch.statistics) {
    console.log(`${batch.route.padEnd(30)} FAIL ${batch.reasons[0]}`);
    return;
  }
  const stats = batch.statistics;
  console.log(
    `${batch.route.padEnd(30)} cold median ${stats.coldRouteReadyMedianMs.toFixed(1)} ms  ` +
      `cold p95 ${stats.coldRouteReadyP95Ms.toFixed(1)} ms  ` +
      `TTFB p95 ${stats.coldDocumentTtfbP95Ms.toFixed(1)} ms  ` +
      `warm p95 ${stats.warmRouteReadyP95Ms.toFixed(1)} ms  ${batch.result}`
  );
}

// fallow-ignore-next-line complexity
async function run(config) {
  const browser = await chromium.launch({ headless: true });
  try {
    const runner = {
      location: config.runnerLocation,
      machine: hostname(),
      platform: platform(),
      architecture: arch(),
      browser: 'Chromium',
      browserVersion: browser.version(),
      viewport: { ...VIEWPORT },
      throttling: THROTTLING,
      hostedCIEligibleForMelbourneGate: false,
    };
    const baseline =
      config.mode === 'post-cutover' ? await loadBaseline(config.baseline, runner) : null;
    const batches = [];
    const failureReasons = [];

    for (const route of ROUTES) {
      const measured = await measureRoute(browser, runner.browserVersion, route, config);
      const reasons = validateRouteBatch(measured, config.mode);
      let statistics = null;
      let checks = [];
      try {
        statistics = summarizeSamples(measured.cold, measured.warm);
      } catch (error) {
        reasons.push(error instanceof Error ? error.message : String(error));
      }
      if (statistics && baseline) {
        const baselineRoute = baseline.routes.find((batch) => batch.route === route);
        checks = evaluatePostCutover(statistics, baselineRoute.statistics);
        for (const check of checks.filter(({ pass }) => !pass)) {
          reasons.push(
            `${check.kind} failed for ${check.statistic}: ${check.actual.toFixed(3)} > ${check.limit.toFixed(3)}`
          );
        }
      }

      const batch = {
        ...measured,
        statistics,
        checks,
        result: reasons.length === 0 ? 'PASS' : 'FAIL',
        reasons,
      };
      batches.push(batch);
      failureReasons.push(...reasons.map((reason) => `${route}: ${reason}`));
      logRoute(batch);
    }

    return {
      schemaVersion: 1,
      kind: 'dinder-route-performance-evidence',
      mode: config.mode,
      result: failureReasons.length === 0 ? 'PASS' : 'FAIL',
      failureReasons,
      generatedAt: new Date().toISOString(),
      runner,
      target: {
        baseUrl: config.baseUrl,
        commit: config.commit,
        deployment: config.deployment,
      },
      clientStateSeed: CLIENT_STATE_SEED,
      measurement: {
        routes: [...ROUTES],
        coldSamplesPerRoute: SAMPLE_COUNT,
        warmReloadsPerRoute: SAMPLE_COUNT,
        excludedPrimePerRoute: config.mode === 'post-cutover' ? 1 : 0,
        coldContext: 'new non-persistent browser context per sample',
        warmContext: '30 reloads of the context retained from cold sample 30',
        median: 'mean of the two middle sorted values; for 30 samples, positions 15 and 16',
        p95: 'nearest-rank: sorted[ceil(0.95 * count) - 1]',
        documentTtfb: 'PerformanceNavigationTiming.responseStart - requestStart',
        thresholds: config.mode === 'post-cutover' ? THRESHOLDS : null,
        hostedCISemantics:
          'GitHub-hosted CI cannot claim this fixed-Melbourne performance gate; it may only run deterministic contract checks.',
      },
      baseline:
        baseline === null
          ? null
          : {
              artifact: resolve(config.baseline),
              target: baseline.target,
            },
      routes: batches,
    };
  } finally {
    await browser.close();
  }
}

async function main() {
  try {
    const config = cliConfig();
    const artifact = await run(config);
    const output = resolve(config.output);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, serializeArtifact(artifact), 'utf8');
    console.log(`Evidence: ${output}`);
    if (artifact.result !== 'PASS') process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage);
    process.exitCode = 1;
  }
}

await main();
