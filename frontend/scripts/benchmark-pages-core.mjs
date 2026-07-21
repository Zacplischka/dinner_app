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
const ALLOWED_EDGE_STATUSES = { cold: ['HIT'], warm: ['HIT', 'REVALIDATED'] };
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

export function nearestRank(values) {
  const sorted = finiteValues(values, 'nearest-rank percentile');
  return sorted[Math.ceil(0.95 * sorted.length) - 1];
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

function statisticOrNull(calculate) {
  try {
    return calculate();
  } catch {
    return null;
  }
}

export function reproduceStatistics(cold, warm) {
  const coldSamples = Array.isArray(cold) ? cold : [];
  const warmSamples = Array.isArray(warm) ? warm : [];
  const coldRouteReady = coldSamples.map(({ routeReadyMs }) => routeReadyMs);
  const coldTtfb = coldSamples.map(({ documentTtfbMs: ttfb }) => ttfb);
  const warmRouteReady = warmSamples.map(({ routeReadyMs }) => routeReadyMs);

  return {
    coldRouteReadyMedianMs: statisticOrNull(() => median(coldRouteReady)),
    coldRouteReadyP95Ms: statisticOrNull(() => nearestRank(coldRouteReady)),
    coldDocumentTtfbP95Ms: statisticOrNull(() => nearestRank(coldTtfb)),
    warmRouteReadyP95Ms: statisticOrNull(() => nearestRank(warmRouteReady)),
  };
}

export function summarizeSamples(cold, warm) {
  const statistics = reproduceStatistics(cold, warm);
  if (Object.values(statistics).some((value) => value === null)) {
    throw new Error('statistics require complete finite sample metrics');
  }
  return statistics;
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
function exactHttpsOrigin(value) {
  const target = new URL(value);
  if (
    target.protocol !== 'https:' ||
    target.username ||
    target.password ||
    target.pathname !== '/' ||
    target.search ||
    target.hash
  ) {
    throw new Error();
  }
  return target.origin;
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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
    config.baseUrl = exactHttpsOrigin(config.baseUrl);
    target = new URL(config.baseUrl);
  } catch {
    errors.push('--base-url must be an absolute HTTPS origin');
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
function validateSampleUrl(value, expectedOrigin, route, prefix, label) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return `${prefix} ${label} must use HTTPS`;
    if (url.origin !== expectedOrigin) {
      return `${prefix} ${label} origin ${url.origin} does not match ${expectedOrigin}`;
    }
    if (url.pathname !== route) return `${prefix} ${label} ended at ${url.pathname}`;
  } catch {
    return `${prefix} has invalid ${label} ${value}`;
  }
  return null;
}

// fallow-ignore-next-line complexity
function validateMeasuredSample(sample, route, phase, index, expectedOrigin) {
  const errors = [];
  const prefix = `${route} ${phase} sample ${index}`;

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
  for (const [value, label] of [
    [sample.url, 'response URL'],
    [sample.pageUrl, 'final page URL'],
  ]) {
    const error = validateSampleUrl(value, expectedOrigin, route, prefix, label);
    if (error) errors.push(error);
  }
  if (sample.error) errors.push(`${prefix} failed: ${sample.error}`);
  return errors;
}

// fallow-ignore-next-line complexity
function validateBatchShape(batch, mode, artifact) {
  const errors = [];
  const { route, prime, cold, warm } = batch;
  if (!Array.isArray(cold) || cold.length !== SAMPLE_COUNT) {
    errors.push(`${route} must contain exactly ${SAMPLE_COUNT} cold samples`);
  }
  if (!Array.isArray(warm) || warm.length !== SAMPLE_COUNT) {
    errors.push(`${route} must contain exactly ${SAMPLE_COUNT} warm reloads`);
  }
  if (mode === 'baseline' && prime !== null) errors.push(`${route} baseline prime must be null`);
  if (mode === 'post-cutover' && (!prime || Array.isArray(prime))) {
    errors.push(`${route} post-cutover batch requires one excluded prime`);
  }

  const samples = [
    ...(prime ? [[prime, 'prime', 1]] : []),
    ...(Array.isArray(cold) ? cold : []).map((sample, index) => [sample, 'cold', index + 1]),
    ...(Array.isArray(warm) ? warm : []).map((sample, index) => [sample, 'warm', index + 1]),
  ];
  for (const [sample, phase, index] of samples) {
    const prefix = `${route} ${phase} sample ${index}`;
    if (!isRecord(sample)) {
      errors.push(`${prefix} must be an object`);
      continue;
    }
    for (const field of SAMPLE_FIELDS) {
      if (!Object.hasOwn(sample, field)) errors.push(`${prefix} is missing ${field}`);
    }
    if (Number.isNaN(Date.parse(sample.timestamp)))
      errors.push(`${prefix} has an invalid timestamp`);
    if (!sample.browserVersion?.trim()) errors.push(`${prefix} has no browser version`);
    if (!/^[0-9a-f]{40}$/i.test(sample.commit ?? ''))
      errors.push(`${prefix} has an invalid commit`);
    if (!sample.deployment?.trim()) errors.push(`${prefix} has no deployment`);
    if (sample.route !== route) errors.push(`${prefix} records route ${sample.route}`);
    if (sample.phase !== phase) errors.push(`${prefix} records phase ${sample.phase}`);
    if (sample.sample !== index) errors.push(`${prefix} records index ${sample.sample}`);
    if (sample.browserVersion !== artifact.runner?.browserVersion) {
      errors.push(`${prefix} browser version differs from the runner`);
    }
    if (JSON.stringify(sample.viewport) !== JSON.stringify(artifact.runner?.viewport)) {
      errors.push(`${prefix} viewport differs from the runner`);
    }
    if (sample.throttling !== artifact.runner?.throttling) {
      errors.push(`${prefix} throttling differs from the runner`);
    }
    if (sample.commit !== artifact.target?.commit) {
      errors.push(`${prefix} commit differs from the target`);
    }
    if (sample.deployment !== artifact.target?.deployment) {
      errors.push(`${prefix} deployment differs from the target`);
    }
    if (sample.clientStateSeed !== artifact.clientStateSeed?.id) {
      errors.push(`${prefix} client-state seed differs from the artifact`);
    }
    if (sample.clientStateSeed !== CLIENT_STATE_SEED.id) {
      errors.push(`${prefix} has the wrong client-state seed`);
    }
    if (sample.throttling !== THROTTLING) errors.push(`${prefix} is not unthrottled`);
    if (sample.viewport?.width !== VIEWPORT.width || sample.viewport?.height !== VIEWPORT.height) {
      errors.push(`${prefix} has the wrong viewport`);
    }
    for (const field of ['etag', 'cacheControl', 'cfCacheStatus', 'age', 'cfRay', 'error']) {
      if (sample[field] !== null && typeof sample[field] !== 'string') {
        errors.push(`${prefix} has invalid ${field}`);
      }
    }
  }
  return errors;
}

// fallow-ignore-next-line complexity
export function validateRouteBatch(batch, mode, expectedBaseUrl) {
  const errors = [];
  const { route, prime, cold, warm } = batch;
  const coldSamples = Array.isArray(cold) ? cold : [];
  const warmSamples = Array.isArray(warm) ? warm : [];
  let expectedOrigin;

  try {
    expectedOrigin = exactHttpsOrigin(expectedBaseUrl);
  } catch {
    errors.push(`${route} expected base URL must be an absolute HTTPS origin`);
  }

  if (expectedOrigin) {
    if (isRecord(prime)) {
      errors.push(...validateMeasuredSample(prime, route, 'prime', 1, expectedOrigin));
    }
    for (const [index, sample] of coldSamples.entries()) {
      if (isRecord(sample)) {
        errors.push(...validateMeasuredSample(sample, route, 'cold', index + 1, expectedOrigin));
      }
    }
    for (const [index, sample] of warmSamples.entries()) {
      if (isRecord(sample)) {
        errors.push(...validateMeasuredSample(sample, route, 'warm', index + 1, expectedOrigin));
      }
    }
  }

  if (mode === 'post-cutover' && prime) {
    const primeStatus = prime.cfCacheStatus?.toUpperCase();
    const pop = cfPop(prime.cfRay);
    if (primeStatus !== 'MISS')
      errors.push(`${route} excluded prime must be MISS, got ${primeStatus ?? 'missing'}`);
    if (!pop) errors.push(`${route} excluded prime has no CF-Ray POP`);

    for (const sample of [...coldSamples, ...warmSamples]) {
      if (!isRecord(sample)) continue;
      const status = sample.cfCacheStatus?.toUpperCase();
      const allowedStatuses = ALLOWED_EDGE_STATUSES[sample.phase];
      if (INVALID_EDGE_STATUSES.has(status)) {
        errors.push(
          `${route} ${sample.phase} sample ${sample.sample} returned invalidating ${status}`
        );
      } else if (allowedStatuses && !allowedStatuses.includes(status)) {
        errors.push(
          `${route} ${sample.phase} sample ${sample.sample} must be ${allowedStatuses.join(' or ')}, got ${status ?? 'missing'}`
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

// fallow-ignore-next-line complexity
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
      pass: Number.isFinite(actual) && actual <= threshold,
    });
    checks.push({
      kind: 'baseline',
      statistic: name,
      actual,
      limit: baseline,
      pass: Number.isFinite(actual) && Number.isFinite(baseline) && actual <= baseline,
    });
  }
  return checks;
}

// fallow-ignore-next-line complexity
function failedCheckReason(check) {
  const actual = Number.isFinite(check.actual) ? check.actual.toFixed(3) : String(check.actual);
  const limit = Number.isFinite(check.limit) ? check.limit.toFixed(3) : String(check.limit);
  const comparison =
    Number.isFinite(check.actual) && Number.isFinite(check.limit)
      ? `${actual} > ${limit}`
      : `${actual} (limit ${limit})`;
  return `${check.kind} failed for ${check.statistic}: ${comparison}`;
}

export function expectedBatchReasons(batch, mode, expectedBaseUrl, checks = []) {
  return [
    ...validateRouteBatch(batch, mode, expectedBaseUrl),
    ...checks.filter(({ pass }) => !pass).map(failedCheckReason),
  ];
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
export function validateArtifactShape(artifact, baseline = null) {
  const errors = [];
  const flattenedReasons = [];
  const routeBatches = Array.isArray(artifact.routes) ? artifact.routes : [];
  if (artifact.schemaVersion !== 1) errors.push('unsupported artifact schemaVersion');
  if (artifact.kind !== 'dinder-route-performance-evidence')
    errors.push('unsupported artifact kind');
  if (!['baseline', 'post-cutover'].includes(artifact.mode))
    errors.push('unsupported artifact mode');
  if (!['PASS', 'FAIL'].includes(artifact.result))
    errors.push('artifact result must be PASS or FAIL');
  if (routeBatches.length !== ROUTES.length) {
    errors.push(`artifact must contain exactly ${ROUTES.length} route batches`);
  }
  try {
    exactHttpsOrigin(artifact.target?.baseUrl);
  } catch {
    errors.push('artifact target base URL must be an absolute HTTPS origin');
  }
  if (JSON.stringify(artifact.clientStateSeed) !== JSON.stringify(CLIENT_STATE_SEED)) {
    errors.push('artifact client-state seed differs');
  }
  if (artifact.mode === 'post-cutover') {
    if (!baseline) {
      errors.push('post-cutover artifact validation requires its baseline artifact');
    } else {
      errors.push(...validateArtifactShape(baseline).map((error) => `baseline: ${error}`));
      if (baseline.mode !== 'baseline' || baseline.result !== 'PASS') {
        errors.push('post-cutover comparison must reference a passing baseline');
      }
      if (JSON.stringify(artifact.baseline?.target) !== JSON.stringify(baseline.target)) {
        errors.push('post-cutover artifact references a different baseline target');
      }
    }
  }
  for (const [index, batch] of routeBatches.entries()) {
    if (!isRecord(batch)) {
      errors.push(`route batch ${index + 1} must be an object`);
      continue;
    }
    if (batch.route !== ROUTES[index])
      errors.push(`route batch ${index + 1} is not ${ROUTES[index]}`);
    errors.push(...validateBatchShape(batch, artifact.mode, artifact));
    const calculated = reproduceStatistics(batch.cold, batch.warm);
    if (!batch.statistics || typeof batch.statistics !== 'object') {
      errors.push(`${batch.route} must contain statistics`);
    } else {
      const statisticKeys = Object.keys(batch.statistics);
      if (
        statisticKeys.length !== STATISTIC_NAMES.length ||
        STATISTIC_NAMES.some((name) => !Object.hasOwn(batch.statistics, name))
      ) {
        errors.push(`${batch.route} statistics must contain exactly the four named values`);
      }
      for (const name of STATISTIC_NAMES) {
        if (batch.statistics[name] !== calculated[name]) {
          errors.push(`${batch.route} ${name} does not match its raw samples`);
        }
      }
    }
    let expectedChecks = [];
    if (!Array.isArray(batch.checks)) {
      errors.push(`${batch.route} must contain checks`);
    } else if (artifact.mode === 'baseline') {
      if (batch.checks.length !== 0) errors.push(`${batch.route} baseline checks must be empty`);
    } else if (baseline) {
      const baselineRoute = baseline.routes?.find(({ route }) => route === batch.route);
      expectedChecks = isRecord(baselineRoute?.statistics)
        ? evaluatePostCutover(calculated, baselineRoute.statistics)
        : [];
      if (JSON.stringify(batch.checks) !== JSON.stringify(expectedChecks)) {
        errors.push(`${batch.route} post-cutover checks do not match raw statistics and baseline`);
      }
    }
    const expectedReasons = expectedBatchReasons(
      batch,
      artifact.mode,
      artifact.target?.baseUrl,
      expectedChecks
    );
    if (!Array.isArray(batch.reasons)) {
      errors.push(`${batch.route} must contain reasons`);
    } else {
      if (JSON.stringify(batch.reasons) !== JSON.stringify(expectedReasons)) {
        errors.push(`${batch.route} reasons do not match its samples and checks`);
      }
      flattenedReasons.push(...batch.reasons.map((reason) => `${batch.route}: ${reason}`));
    }
    const expectedResult = expectedReasons.length > 0 ? 'FAIL' : 'PASS';
    if (batch.result !== expectedResult) {
      errors.push(`${batch.route} result does not match its reasons`);
    }
  }
  if (!Array.isArray(artifact.failureReasons)) {
    errors.push('artifact must contain failureReasons');
  } else if (JSON.stringify(artifact.failureReasons) !== JSON.stringify(flattenedReasons)) {
    errors.push('artifact failureReasons do not match its route batches');
  }
  const expectedArtifactResult = flattenedReasons.length > 0 ? 'FAIL' : 'PASS';
  if (artifact.result !== expectedArtifactResult) {
    errors.push('artifact result does not match its failureReasons');
  }
  return errors;
}

export function serializeArtifact(artifact, baseline = null) {
  const errors = validateArtifactShape(artifact, baseline);
  if (errors.length > 0) throw new Error(errors.join('\n'));
  return `${JSON.stringify(artifact, null, 2)}\n`;
}
