import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CLIENT_STATE_SEED,
  ROUTES,
  SAMPLE_COUNT,
  THRESHOLDS,
  VIEWPORT,
  documentTtfbMs,
  evaluatePostCutover,
  median,
  nearestRank,
  resolveConfig,
  serializeArtifact,
  summarizeSamples,
  validateArtifactShape,
  validateComparableBaseline,
  validateRouteBatch,
} from './benchmark-pages-core.mjs';

const BASELINE_URL = 'https://frontend-production-bdfc.up.railway.app';
const POST_URL = 'https://www.dinder.it.com';

function sample(route, phase, index, overrides = {}, baseUrl = BASELINE_URL) {
  return {
    timestamp: '2026-07-21T00:00:00.000Z',
    url: new URL(route, baseUrl).href,
    pageUrl: new URL(route, baseUrl).href,
    route,
    phase,
    sample: index,
    browserVersion: '140.0.0.0',
    viewport: { ...VIEWPORT },
    throttling: 'none',
    commit: 'a'.repeat(40),
    deployment: 'railway-deployment',
    clientStateSeed: CLIENT_STATE_SEED.id,
    routeReadyMs: index,
    documentTtfbMs: index,
    status: 200,
    bodyHash: 'sha256',
    etag: null,
    cacheControl: 'max-age=0, must-revalidate',
    cfCacheStatus: null,
    age: null,
    cfRay: null,
    error: null,
    ...overrides,
  };
}

function batch(
  route,
  mode = 'baseline',
  baseUrl = mode === 'post-cutover' ? POST_URL : BASELINE_URL
) {
  const edge = mode === 'post-cutover';
  const recorded = (phase) =>
    Array.from({ length: SAMPLE_COUNT }, (_, index) =>
      sample(
        route,
        phase,
        index + 1,
        edge ? { cfCacheStatus: 'HIT', cfRay: 'ray-MEL' } : {},
        baseUrl
      )
    );
  return {
    route,
    prime: edge
      ? sample(route, 'prime', 1, { cfCacheStatus: 'MISS', cfRay: 'prime-MEL' }, baseUrl)
      : null,
    cold: recorded('cold'),
    warm: recorded('warm'),
  };
}

function artifact(mode = 'baseline', baselineArtifact = null) {
  const baseUrl = mode === 'post-cutover' ? POST_URL : BASELINE_URL;
  return {
    schemaVersion: 1,
    kind: 'dinder-route-performance-evidence',
    mode,
    result: 'PASS',
    target: {
      baseUrl,
      commit: 'a'.repeat(40),
      deployment: 'railway-deployment',
    },
    baseline:
      baselineArtifact === null
        ? null
        : { artifact: 'baseline.json', target: baselineArtifact.target },
    clientStateSeed: CLIENT_STATE_SEED,
    runner: {
      location: 'Melbourne, Australia',
      machine: 'fixed-mac',
      browserVersion: '140.0.0.0',
      viewport: { ...VIEWPORT },
      throttling: 'none',
    },
    routes: ROUTES.map((route) => {
      const measured = batch(route, mode, baseUrl);
      const statistics = {
        coldRouteReadyMedianMs: 15.5,
        coldRouteReadyP95Ms: 29,
        coldDocumentTtfbP95Ms: 29,
        warmRouteReadyP95Ms: 29,
      };
      const baselineStatistics = baselineArtifact?.routes.find(
        (baselineRoute) => baselineRoute.route === route
      )?.statistics;
      return {
        ...measured,
        statistics,
        checks: mode === 'post-cutover' ? evaluatePostCutover(statistics, baselineStatistics) : [],
        result: 'PASS',
        reasons: [],
      };
    }),
  };
}

test('statistics use the exact 30-sample median and nearest-rank p95', () => {
  const values = Array.from({ length: 30 }, (_, index) => index + 1);
  assert.equal(median(values), 15.5);
  assert.equal(nearestRank(values), 29);
  assert.deepEqual(
    summarizeSamples(
      values.map((value) => ({ routeReadyMs: value, documentTtfbMs: value })),
      values.map((value) => ({ routeReadyMs: value, documentTtfbMs: value }))
    ),
    {
      coldRouteReadyMedianMs: 15.5,
      coldRouteReadyP95Ms: 29,
      coldDocumentTtfbP95Ms: 29,
      warmRouteReadyP95Ms: 29,
    }
  );
});

test('document TTFB is responseStart minus requestStart', () => {
  assert.equal(documentTtfbMs({ requestStart: 100.25, responseStart: 245.75 }), 145.5);
  assert.throws(() => documentTtfbMs({ requestStart: 10, responseStart: 9 }), /ordered/);
});

test('configuration fixes Railway baseline, Melbourne runner, and hosted-CI semantics', () => {
  const options = {
    mode: 'baseline',
    baseUrl: 'https://frontend-production-bdfc.up.railway.app/',
    commit: 'a'.repeat(40),
    deployment: 'railway-deployment',
    runnerLocation: 'Melbourne, Australia',
    output: 'baseline.json',
  };
  assert.equal(resolveConfig(options).baseUrl, 'https://frontend-production-bdfc.up.railway.app');
  assert.throws(
    () => resolveConfig({ ...options, baseUrl: 'http://frontend-production-bdfc.up.railway.app' }),
    /absolute HTTPS origin/
  );
  assert.throws(() => resolveConfig(options, { GITHUB_ACTIONS: 'true' }), /cannot claim/);
  assert.throws(
    () => resolveConfig({ ...options, baseUrl: 'https://www.dinder.it.com' }),
    /direct Railway/
  );
  assert.throws(
    () => resolveConfig({ ...options, mode: 'post-cutover', baseline: undefined }),
    /--baseline is required/
  );
});

test('route validation requires exactly 30 cold samples and 30 warm reloads', () => {
  const measured = batch('/');
  measured.cold.pop();
  assert.match(
    validateRouteBatch(measured, 'baseline', BASELINE_URL).join('\n'),
    /exactly 30 cold samples/
  );
});

test('route validation rejects HTTPS same-path redirects to every other origin', () => {
  const cases = [
    [POST_URL, 'url', 'https://dinder.it.com/compare'],
    ['https://dinder.it.com', 'pageUrl', 'https://www.dinder.it.com/compare'],
    [POST_URL, 'url', 'https://example.com/compare'],
    [POST_URL, 'pageUrl', 'http://www.dinder.it.com/compare'],
  ];

  for (const [expectedBaseUrl, field, redirectedUrl] of cases) {
    const measured = batch('/compare', 'post-cutover', expectedBaseUrl);
    measured.cold[0][field] = redirectedUrl;
    const errors = validateRouteBatch(measured, 'post-cutover', expectedBaseUrl).join('\n');
    assert.match(errors, field === 'url' ? /response URL/ : /final page URL/);
    assert.match(errors, redirectedUrl.startsWith('http:') ? /must use HTTPS/ : /does not match/);
  }

  const evidence = artifact();
  evidence.routes[0].cold[0].url = 'https://www.dinder.it.com/';
  assert.throws(() => serializeArtifact(evidence), /response URL origin .* does not match/);
});

test('post-prime invalid cache status and POP change invalidate the whole route batch', () => {
  for (const status of ['MISS', 'BYPASS', 'DYNAMIC', 'UPDATING']) {
    const measured = batch('/', 'post-cutover');
    measured.cold[4].cfCacheStatus = status;
    const errors = validateRouteBatch(measured, 'post-cutover', POST_URL).join('\n');
    assert.match(errors, new RegExp(`cold sample 5 returned invalidating ${status}`));
  }

  const mixedPop = batch('/', 'post-cutover');
  mixedPop.warm[7].cfRay = 'ray-SYD';
  assert.match(
    validateRouteBatch(mixedPop, 'post-cutover', POST_URL).join('\n'),
    /warm sample 8 changed POP from MEL to SYD/
  );
});

test('warm revalidation is retained while cold documents must be HIT', () => {
  const measured = batch('/', 'post-cutover');
  measured.warm[0].cfCacheStatus = 'REVALIDATED';
  assert.deepEqual(validateRouteBatch(measured, 'post-cutover', POST_URL), []);

  measured.cold[0].cfCacheStatus = 'REVALIDATED';
  assert.match(
    validateRouteBatch(measured, 'post-cutover', POST_URL).join('\n'),
    /cold sample 1 must be HIT/
  );
});

test('warm cache status rejects missing, stale, expired, and unknown values', () => {
  for (const status of [null, 'STALE', 'EXPIRED', 'UNKNOWN']) {
    const measured = batch('/', 'post-cutover');
    measured.warm[0].cfCacheStatus = status;
    assert.match(
      validateRouteBatch(measured, 'post-cutover', POST_URL).join('\n'),
      new RegExp(`warm sample 1 must be HIT or REVALIDATED, got ${status ?? 'missing'}`)
    );
  }
});

test('threshold and same-route baseline comparisons are inclusive', () => {
  const checks = evaluatePostCutover({ ...THRESHOLDS }, { ...THRESHOLDS });
  assert.equal(checks.length, 8);
  assert.ok(checks.every(({ pass }) => pass));

  const failed = evaluatePostCutover(
    { ...THRESHOLDS, warmRouteReadyP95Ms: THRESHOLDS.warmRouteReadyP95Ms + 0.001 },
    { ...THRESHOLDS }
  );
  assert.ok(failed.some(({ statistic, pass }) => statistic === 'warmRouteReadyP95Ms' && !pass));
});

test('baseline comparison rejects a different machine or browser batch', () => {
  const baseline = artifact();
  const runner = { ...baseline.runner, machine: 'other-mac', browserVersion: '141.0.0.0' };
  assert.deepEqual(validateComparableBaseline(baseline, runner), [
    'baseline machine differs',
    'baseline browser version differs',
  ]);
});

test('serialization preserves every raw sample field and rejects incomplete artifacts', () => {
  const evidence = artifact();
  assert.deepEqual(validateArtifactShape(evidence), []);
  const parsed = JSON.parse(serializeArtifact(evidence));
  assert.equal(parsed.routes.length, 9);
  assert.equal(parsed.routes[0].cold.length, 30);
  assert.equal(parsed.routes[0].warm.length, 30);
  assert.equal(parsed.routes[0].cold[0].clientStateSeed, CLIENT_STATE_SEED.id);

  delete evidence.routes[0].cold[0].cfRay;
  assert.throws(() => serializeArtifact(evidence), /missing cfRay/);
});

test('serialization requires reproduced statistics and empty baseline checks', () => {
  const missingStatistics = artifact();
  delete missingStatistics.routes[0].statistics;
  assert.throws(() => serializeArtifact(missingStatistics), /must contain statistics/);

  const tamperedStatistics = artifact();
  tamperedStatistics.routes[0].statistics.coldRouteReadyMedianMs += 1;
  assert.throws(() => serializeArtifact(tamperedStatistics), /does not match its raw samples/);

  const extraStatistic = artifact();
  extraStatistic.routes[0].statistics.other = 1;
  assert.throws(() => serializeArtifact(extraStatistic), /exactly the four named values/);

  const missingChecks = artifact();
  delete missingChecks.routes[0].checks;
  assert.throws(() => serializeArtifact(missingChecks), /must contain checks/);

  const baselineCheck = artifact();
  baselineCheck.routes[0].checks.push({ pass: true });
  assert.throws(() => serializeArtifact(baselineCheck), /baseline checks must be empty/);
});

test('post-cutover serialization requires the exact eight checks from raw data and baseline', () => {
  const baseline = artifact();
  const evidence = artifact('post-cutover', baseline);
  assert.deepEqual(validateArtifactShape(evidence, baseline), []);
  assert.equal(JSON.parse(serializeArtifact(evidence, baseline)).routes[0].checks.length, 8);

  for (const mutate of [
    (checks) => checks.pop(),
    (checks) => {
      checks[0].actual += 1;
    },
    (checks) => {
      checks[0].limit += 1;
    },
    (checks) => {
      checks[0].pass = !checks[0].pass;
    },
  ]) {
    const tampered = artifact('post-cutover', baseline);
    mutate(tampered.routes[0].checks);
    assert.throws(
      () => serializeArtifact(tampered, baseline),
      /checks do not match raw statistics and baseline/
    );
  }

  const missingChecks = artifact('post-cutover', baseline);
  delete missingChecks.routes[0].checks;
  assert.throws(() => serializeArtifact(missingChecks, baseline), /must contain checks/);
});

test('serialization rejects mixed browser batches', () => {
  const evidence = artifact();
  evidence.routes[0].cold[0].browserVersion = '141.0.0.0';
  assert.throws(() => serializeArtifact(evidence), /browser version differs from the runner/);
});
