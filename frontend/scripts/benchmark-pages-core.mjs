export const ROUTES = Object.freeze([
  '/',
  '/compare',
  '/compare/test-place',
  '/create',
  '/join',
  '/session/ABCDE',
  '/session/ABCDE/select',
  '/session/ABCDE/results',
  '/friends',
]);

export const SAMPLE_COUNT = 30;
export const VIEWPORT = Object.freeze({ width: 1280, height: 720 });
export const THROTTLING = 'none';
export const CLIENT_STATE_SEED = Object.freeze({
  id: 'dinder-route-evidence-v2',
  localStorage: {
    'dinner-session-storage': JSON.stringify({
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
    }),
    'dinder-comparison': JSON.stringify({
      version: 0,
      state: {
        location: { latitude: -37.8136, longitude: 144.9631 },
        radiusKm: 8,
        suburb: 'Melbourne',
      },
    }),
    'sb-hcjuqvicwuszwqkreklc-auth-token': JSON.stringify({
      access_token:
        'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjo0MTAyNDQ0ODAwLCJyb2xlIjoiYXV0aGVudGljYXRlZCIsInN1YiI6IjAwMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAxIn0.YmVuY2htYXJr',
      refresh_token: 'benchmark-refresh-token',
      expires_in: 2_147_483_647,
      expires_at: 4_102_444_800,
      token_type: 'bearer',
      user: {
        id: '00000000-0000-4000-8000-000000000001',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'benchmark@example.invalid',
        app_metadata: { provider: 'benchmark', providers: ['benchmark'] },
        user_metadata: { display_name: 'Benchmark User' },
        created_at: '2026-01-01T00:00:00.000Z',
      },
    }),
  },
});

export const THRESHOLDS = Object.freeze({
  coldRouteReadyMedianMs: 600,
  coldRouteReadyP95Ms: 900,
  coldDocumentTtfbP95Ms: 200,
  warmRouteReadyP95Ms: 50,
});

const STATISTIC_NAMES = Object.keys(THRESHOLDS);
const INVALID_EDGE_STATUSES = new Set(['MISS', 'BYPASS', 'DYNAMIC', 'UPDATING']);
const SAMPLE_FIELDS = [
  'timestamp',
  'url',
  'pageUrl',
  'route',
  'phase',
  'sample',
  'browserVersion',
  'viewport',
  'throttling',
  'commit',
  'deployment',
  'clientStateSeed',
  'routeReadyMs',
  'documentTtfbMs',
  'status',
  'bodyHash',
  'etag',
  'cacheControl',
  'cfCacheStatus',
  'age',
  'cfRay',
  'error',
];

function finiteValues(values, name) {
  if (
    !Array.isArray(values) ||
    values.length === 0 ||
    values.some((value) => !Number.isFinite(value))
  ) {
    throw new Error(`${name} requires a non-empty array of finite numbers`);
  }
  return [...values].sort((left, right) => left - right);
}

export function median(values) {
  const sorted = finiteValues(values, 'median');
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[midpoint - 1] + sorted[midpoint]) / 2 : sorted[midpoint];
}

export function nearestRank(values, percentile = 0.95) {
  if (!(percentile > 0 && percentile <= 1)) throw new Error('percentile must be in (0, 1]');
  const sorted = finiteValues(values, 'nearest-rank percentile');
  return sorted[Math.ceil(percentile * sorted.length) - 1];
}

export function documentTtfbMs({ requestStart, responseStart }) {
  if (
    !Number.isFinite(requestStart) ||
    !Number.isFinite(responseStart) ||
    responseStart < requestStart
  ) {
    throw new Error('navigation timing must contain ordered requestStart and responseStart values');
  }
  return responseStart - requestStart;
}

export function summarizeSamples(cold, warm) {
  const coldRouteReady = cold.map(({ routeReadyMs }) => routeReadyMs);
  const coldTtfb = cold.map(({ documentTtfbMs: ttfb }) => ttfb);
  const warmRouteReady = warm.map(({ routeReadyMs }) => routeReadyMs);

  return {
    coldRouteReadyMedianMs: median(coldRouteReady),
    coldRouteReadyP95Ms: nearestRank(coldRouteReady),
    coldDocumentTtfbP95Ms: nearestRank(coldTtfb),
    warmRouteReadyP95Ms: nearestRank(warmRouteReady),
  };
}

function cfPop(cfRay) {
  if (typeof cfRay !== 'string') return null;
  const separator = cfRay.lastIndexOf('-');
  return separator === -1
    ? null
    : cfRay
        .slice(separator + 1)
        .trim()
        .toUpperCase() || null;
}

// fallow-ignore-next-line complexity
export function resolveConfig(options, env = {}) {
  const config = {
    mode: options.mode,
    baseUrl: options.baseUrl,
    commit: options.commit,
    deployment: options.deployment,
    runnerLocation: options.runnerLocation,
    output: options.output,
    baseline: options.baseline,
  };
  const errors = [];

  if (!['baseline', 'post-cutover'].includes(config.mode)) {
    errors.push('--mode must be baseline or post-cutover');
  }
  let target;
  try {
    target = new URL(config.baseUrl);
    if (!['http:', 'https:'].includes(target.protocol)) throw new Error();
    config.baseUrl = target.href.replace(/\/$/, '');
  } catch {
    errors.push('--base-url must be an absolute HTTP(S) URL');
  }
  if (target && config.mode === 'baseline' && !target.hostname.endsWith('.up.railway.app')) {
    errors.push('baseline evidence must target the direct Railway frontend');
  }
  if (
    target &&
    config.mode === 'post-cutover' &&
    !['dinder.it.com', 'www.dinder.it.com'].includes(target.hostname)
  ) {
    errors.push('post-cutover evidence must target dinder.it.com or www.dinder.it.com');
  }
  if (!/^[0-9a-f]{40}$/i.test(config.commit ?? '')) errors.push('--commit must be a full Git SHA');
  if (!config.deployment?.trim()) errors.push('--deployment is required');
  if (config.runnerLocation !== 'Melbourne, Australia') {
    errors.push('--runner-location must be "Melbourne, Australia"');
  }
  if (!config.output?.endsWith('.json')) errors.push('--output must name a JSON artifact');
  if (config.mode === 'post-cutover' && !config.baseline?.endsWith('.json')) {
    errors.push('--baseline is required for post-cutover evidence');
  }
  if (env.GITHUB_ACTIONS === 'true') {
    errors.push('GitHub-hosted CI cannot claim the fixed-Melbourne performance gate');
  }
  if (errors.length > 0) throw new Error(errors.join('\n'));
  return config;
}

// fallow-ignore-next-line complexity
function validateRecordedSample(sample, route, phase, index) {
  const errors = [];
  const prefix = `${route} ${phase} sample ${index}`;

  for (const field of SAMPLE_FIELDS) {
    if (!Object.hasOwn(sample, field)) errors.push(`${prefix} is missing ${field}`);
  }
  if (Number.isNaN(Date.parse(sample.timestamp))) errors.push(`${prefix} has an invalid timestamp`);
  if (!sample.browserVersion?.trim()) errors.push(`${prefix} has no browser version`);
  if (!/^[0-9a-f]{40}$/i.test(sample.commit ?? '')) errors.push(`${prefix} has an invalid commit`);
  if (!sample.deployment?.trim()) errors.push(`${prefix} has no deployment`);
  if (sample.route !== route) errors.push(`${prefix} records route ${sample.route}`);
  if (sample.phase !== phase) errors.push(`${prefix} records phase ${sample.phase}`);
  if (sample.sample !== index) errors.push(`${prefix} records index ${sample.sample}`);
  if (!Number.isFinite(sample.routeReadyMs) || sample.routeReadyMs < 0) {
    errors.push(`${prefix} has invalid route-ready time`);
  }
  if (!Number.isFinite(sample.documentTtfbMs) || sample.documentTtfbMs < 0) {
    errors.push(`${prefix} has invalid document TTFB`);
  }
  if (!Number.isInteger(sample.status) || sample.status < 200 || sample.status >= 300) {
    errors.push(`${prefix} has status ${sample.status}`);
  }
  if (!sample.bodyHash && !sample.etag) errors.push(`${prefix} has no body hash or ETag`);
  if (sample.clientStateSeed !== CLIENT_STATE_SEED.id)
    errors.push(`${prefix} has the wrong client-state seed`);
  if (sample.throttling !== THROTTLING) errors.push(`${prefix} is not unthrottled`);
  if (sample.viewport?.width !== VIEWPORT.width || sample.viewport?.height !== VIEWPORT.height) {
    errors.push(`${prefix} has the wrong viewport`);
  }
  try {
    if (new URL(sample.url).pathname !== route) errors.push(`${prefix} ended at ${sample.url}`);
  } catch {
    errors.push(`${prefix} has invalid URL ${sample.url}`);
  }
  try {
    if (new URL(sample.pageUrl).pathname !== route)
      errors.push(`${prefix} rendered at ${sample.pageUrl}`);
  } catch {
    errors.push(`${prefix} has invalid page URL ${sample.pageUrl}`);
  }
  for (const field of ['etag', 'cacheControl', 'cfCacheStatus', 'age', 'cfRay']) {
    if (sample[field] !== null && typeof sample[field] !== 'string') {
      errors.push(`${prefix} has invalid ${field}`);
    }
  }
  if (sample.error) errors.push(`${prefix} failed: ${sample.error}`);
  return errors;
}

// fallow-ignore-next-line complexity
export function validateRouteBatch(batch, mode) {
  const errors = [];
  const { route, prime, cold, warm } = batch;

  if (!ROUTES.includes(route)) errors.push(`unknown route ${route}`);
  if (!Array.isArray(cold) || cold.length !== SAMPLE_COUNT) {
    errors.push(`${route} must contain exactly ${SAMPLE_COUNT} cold samples`);
  }
  if (!Array.isArray(warm) || warm.length !== SAMPLE_COUNT) {
    errors.push(`${route} must contain exactly ${SAMPLE_COUNT} warm reloads`);
  }
  if (mode === 'baseline' && prime !== null)
    errors.push(`${route} baseline must not contain a prime`);
  if (mode === 'post-cutover' && !prime)
    errors.push(`${route} post-cutover batch requires one excluded prime`);

  if (prime) errors.push(...validateRecordedSample(prime, route, 'prime', 1));
  for (const [index, sample] of (cold ?? []).entries()) {
    errors.push(...validateRecordedSample(sample, route, 'cold', index + 1));
  }
  for (const [index, sample] of (warm ?? []).entries()) {
    errors.push(...validateRecordedSample(sample, route, 'warm', index + 1));
  }

  if (mode === 'post-cutover' && prime) {
    const primeStatus = prime.cfCacheStatus?.toUpperCase();
    const pop = cfPop(prime.cfRay);
    if (primeStatus !== 'MISS')
      errors.push(`${route} excluded prime must be MISS, got ${primeStatus ?? 'missing'}`);
    if (!pop) errors.push(`${route} excluded prime has no CF-Ray POP`);

    for (const sample of [...(cold ?? []), ...(warm ?? [])]) {
      const status = sample.cfCacheStatus?.toUpperCase();
      if (INVALID_EDGE_STATUSES.has(status)) {
        errors.push(
          `${route} ${sample.phase} sample ${sample.sample} returned invalidating ${status}`
        );
      } else if (sample.phase === 'cold' && status !== 'HIT') {
        errors.push(
          `${route} cold sample ${sample.sample} must be HIT, got ${status ?? 'missing'}`
        );
      }
      const samplePop = cfPop(sample.cfRay);
      if (samplePop !== pop) {
        errors.push(
          `${route} ${sample.phase} sample ${sample.sample} changed POP from ${pop ?? 'missing'} to ${samplePop ?? 'missing'}`
        );
      }
    }
  }

  return errors;
}

export function evaluatePostCutover(statistics, baselineStatistics) {
  const checks = [];
  for (const name of STATISTIC_NAMES) {
    const actual = statistics[name];
    const threshold = THRESHOLDS[name];
    const baseline = baselineStatistics[name];
    checks.push({
      kind: 'threshold',
      statistic: name,
      actual,
      limit: threshold,
      pass: actual <= threshold,
    });
    checks.push({
      kind: 'baseline',
      statistic: name,
      actual,
      limit: baseline,
      pass: actual <= baseline,
    });
  }
  return checks;
}

// fallow-ignore-next-line complexity
export function validateComparableBaseline(baseline, runner) {
  const errors = [];
  if (baseline.mode !== 'baseline' || baseline.result !== 'PASS') {
    errors.push('comparison artifact must be a passing baseline');
  }
  if (baseline.runner?.location !== runner.location)
    errors.push('baseline runner location differs');
  if (baseline.runner?.machine !== runner.machine) errors.push('baseline machine differs');
  if (baseline.runner?.browserVersion !== runner.browserVersion)
    errors.push('baseline browser version differs');
  if (JSON.stringify(baseline.runner?.viewport) !== JSON.stringify(runner.viewport)) {
    errors.push('baseline viewport differs');
  }
  if (baseline.runner?.throttling !== runner.throttling) errors.push('baseline throttling differs');
  if (JSON.stringify(baseline.clientStateSeed) !== JSON.stringify(CLIENT_STATE_SEED)) {
    errors.push('baseline client-state seed differs');
  }
  if (JSON.stringify(baseline.routes?.map(({ route }) => route)) !== JSON.stringify(ROUTES)) {
    errors.push('baseline route set differs');
  }
  return errors;
}

// fallow-ignore-next-line complexity
export function validateArtifactShape(artifact) {
  const errors = [];
  if (artifact.schemaVersion !== 1) errors.push('unsupported artifact schemaVersion');
  if (artifact.kind !== 'dinder-route-performance-evidence')
    errors.push('unsupported artifact kind');
  if (!['baseline', 'post-cutover'].includes(artifact.mode))
    errors.push('unsupported artifact mode');
  if (!['PASS', 'FAIL'].includes(artifact.result))
    errors.push('artifact result must be PASS or FAIL');
  if (!Array.isArray(artifact.routes) || artifact.routes.length !== ROUTES.length) {
    errors.push(`artifact must contain exactly ${ROUTES.length} route batches`);
  }
  for (const [index, batch] of (artifact.routes ?? []).entries()) {
    if (batch.route !== ROUTES[index])
      errors.push(`route batch ${index + 1} is not ${ROUTES[index]}`);
    for (const sample of [batch.prime, ...(batch.cold ?? []), ...(batch.warm ?? [])].filter(
      Boolean
    )) {
      for (const field of SAMPLE_FIELDS) {
        if (!Object.hasOwn(sample, field)) errors.push(`${batch.route} sample is missing ${field}`);
      }
      if (sample.browserVersion !== artifact.runner?.browserVersion) {
        errors.push(`${batch.route} sample browser version differs from the runner`);
      }
      if (JSON.stringify(sample.viewport) !== JSON.stringify(artifact.runner?.viewport)) {
        errors.push(`${batch.route} sample viewport differs from the runner`);
      }
      if (sample.throttling !== artifact.runner?.throttling) {
        errors.push(`${batch.route} sample throttling differs from the runner`);
      }
      if (sample.commit !== artifact.target?.commit) {
        errors.push(`${batch.route} sample commit differs from the target`);
      }
      if (sample.deployment !== artifact.target?.deployment) {
        errors.push(`${batch.route} sample deployment differs from the target`);
      }
      if (sample.clientStateSeed !== artifact.clientStateSeed?.id) {
        errors.push(`${batch.route} sample client-state seed differs from the artifact`);
      }
    }
    if (batch.statistics) {
      try {
        const calculated = summarizeSamples(batch.cold, batch.warm);
        for (const name of STATISTIC_NAMES) {
          if (batch.statistics[name] !== calculated[name]) {
            errors.push(`${batch.route} ${name} does not match its raw samples`);
          }
        }
      } catch (error) {
        errors.push(`${batch.route} statistics cannot be reproduced: ${error.message}`);
      }
    }
    const batchFailed =
      validateRouteBatch(batch, artifact.mode).length > 0 ||
      (batch.checks ?? []).some(({ pass }) => !pass);
    if (batch.result !== (batchFailed ? 'FAIL' : 'PASS')) {
      errors.push(`${batch.route} result does not match its samples and checks`);
    }
  }
  const artifactFailed = (artifact.routes ?? []).some(({ result }) => result !== 'PASS');
  if (artifact.result !== (artifactFailed ? 'FAIL' : 'PASS')) {
    errors.push('artifact result does not match its route batches');
  }
  return errors;
}

export function serializeArtifact(artifact) {
  const errors = validateArtifactShape(artifact);
  if (errors.length > 0) throw new Error(errors.join('\n'));
  return `${JSON.stringify(artifact, null, 2)}\n`;
}
