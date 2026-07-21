import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const load = (path) => JSON.parse(readFileSync(`${root}/${path}`, 'utf8'));
const manifest = load('cloudflare/zone-manifest.json');
const policy = load('cloudflare/staging-policy.json');
const evidence = load('docs/evidence/cloudflare/staging-evidence.json');
const registrarExportPath = 'docs/evidence/cloudflare/namecheap-zone-export-2026-07-21.json';
const registrarExportText = readFileSync(`${root}/${registrarExportPath}`, 'utf8');
const registrarExport = JSON.parse(registrarExportText);
const requireLive = process.argv.includes('--require-live');

assert.equal(manifest.zone, 'dinder.it.com');
assert.equal(manifest.proxyPolicy.importedRecordState, 'dns-only');
assert.deepEqual(manifest.proxyPolicy.currentProxiedHosts, []);
assert.deepEqual(manifest.proxyPolicy.futureFrontendOnlyHosts, [
  'dinder.it.com',
  'www.dinder.it.com',
]);
assert.deepEqual(manifest.proxyPolicy.neverProxyCategories, [
  'backend',
  'supabase',
  'email',
  'verification',
  'unrelated',
]);
assert.ok(manifest.records.length > 0);
assert.equal(registrarExport.exportedBeforeCloudflareImport, true);
assert.deepEqual(registrarExport.records, manifest.records);
assert.equal(manifest.source.registrarExport.path, registrarExportPath);
assert.equal(
  createHash('sha256').update(registrarExportText).digest('hex'),
  manifest.source.registrarExport.sha256
);

const recordKeys = new Set();
for (const record of manifest.records) {
  assert.deepEqual(Object.keys(record).sort(), [
    'category',
    'content',
    'intendedTtl',
    'owner',
    'priority',
    'proxied',
    'type',
  ]);
  assert.ok(record.owner.length > 0);
  assert.match(record.type, /^[A-Z]+$/);
  assert.ok(record.content.length > 0);
  assert.ok(Number.isInteger(record.intendedTtl));
  assert.ok(record.intendedTtl >= 60 && record.intendedTtl <= 86400);
  assert.equal(record.proxied, false);
  record.type === 'MX'
    ? assert.ok(Number.isInteger(record.priority))
    : assert.equal(record.priority, null);

  const key = [record.owner, record.type, record.content, record.priority].join('|');
  assert.equal(recordKeys.has(key), false, `duplicate record: ${key}`);
  recordKeys.add(key);
}

const rule = policy.ruleset.rules[0];
assert.equal(policy.representation, 'normalized-live-state-not-api-payload');
assert.equal(policy.ruleset.rules.length, 1);
assert.equal(policy.ruleset.phase, 'http_request_cache_settings');
assert.equal(
  rule.expression,
  '(http.host in {"dinder.it.com" "www.dinder.it.com"} and http.request.method in {"GET" "HEAD"} and any(lower(http.request.headers["accept"][*])[*] contains "text/html"))'
);
assert.equal(rule.action, 'set_cache_settings');
assert.equal(rule.action_parameters.cache, true);
assert.deepEqual(rule.action_parameters.edge_ttl, { mode: 'bypass_by_default' });
assert.deepEqual(rule.action_parameters.browser_ttl, { mode: 'respect_origin' });
assert.equal(rule.action_parameters.origin_cache_control, true);
assert.equal(rule.action_parameters.serve_stale.disable_stale_while_updating, true);
assert.deepEqual(rule.action_parameters.cache_key, {
  cache_deception_armor: true,
  free_plan_query_string_mode: 'ignore',
  added_custom_dimensions: [],
});
assert.equal('vary' in rule.action_parameters, false);
assert.deepEqual(policy.providerConstraints.cacheKey, {
  freePlanSettings: ['cache_deception_armor', 'ignore_query_string'],
  providerDefaultComponentsRetained: [
    'scheme',
    'host',
    'path',
    'Origin header',
    'documented override headers',
  ],
  addedCustomIdentityVariation: [],
});
assert.deepEqual(policy.zoneSettings, {
  ssl: 'full_strict',
  alwaysOnline: 'off',
  tieredCache: 'off',
});
assert.deepEqual(policy.proxyScope.current, []);
assert.deepEqual(policy.proxyScope.futureFrontendOnly, ['dinder.it.com', 'www.dinder.it.com']);
assert.deepEqual(policy.credentialPolicy, {
  zoneId: {
    name: 'CLOUDFLARE_ZONE_ID',
    secret: false,
    store: 'GitHub environment variable',
    environment: 'Dinner-App / production',
  },
  purgeToken: {
    name: 'CLOUDFLARE_CACHE_PURGE_TOKEN',
    secret: true,
    store: 'GitHub environment secret',
    environment: 'Dinner-App / production',
    resource: { type: 'zone', name: 'dinder.it.com' },
    permissions: ['Cache Purge:Purge'],
  },
});

assert.equal(evidence.credentialsExposed, false);
assert.deepEqual(evidence.authoritativeDns.records, manifest.records);
assert.deepEqual(evidence.plannedFrontendOnlyProxyScope, ['dinder.it.com', 'www.dinder.it.com']);
assert.ok(['blocked', 'staged'].includes(evidence.status));

const serialized = JSON.stringify({ manifest, policy, evidence });
assert.doesNotMatch(serialized, /Authorization:\s*Bearer/i);
assert.doesNotMatch(serialized, /"(?:apiKey|secretValue|tokenValue)"\s*:/i);
assert.doesNotMatch(serialized, /\bgh[opsu]_[A-Za-z0-9_]{20,}\b/);

if (requireLive) {
  assert.equal(
    evidence.status,
    'staged',
    `live staging incomplete:\n- ${evidence.blockers.join('\n- ')}`
  );
  assert.equal(manifest.complete, true, 'registrar export is not complete');
  assert.equal(manifest.source.registrarExport.status, 'captured');
  assert.match(manifest.source.registrarExport.sha256, /^[a-f0-9]{64}$/);
  assert.equal(evidence.canonicalManifest.registrarExportCapturedBeforeImport, true);
  assert.ok(evidence.cloudflare.zone);
  assert.ok(evidence.cloudflare.records);
  assert.ok(evidence.cloudflare.cacheRule);
  assert.ok(evidence.cloudflare.cacheSettings);
  assert.deepEqual(evidence.cloudflare.zone.assignedNameservers, [
    'ada.ns.cloudflare.com',
    'keenan.ns.cloudflare.com',
  ]);
  assert.equal(evidence.cloudflare.zone.status, 'pending');
  assert.equal(evidence.cloudflare.zone.authoritativeNameserversChanged, false);
  assert.equal(evidence.cloudflare.records.count, manifest.records.length);
  assert.equal(evidence.cloudflare.records.fullParityWithCanonicalManifest, true);
  assert.equal(evidence.cloudflare.records.allDnsOnly, true);
  assert.equal(evidence.cloudflare.records.cloudflareTtl, '30 minutes (1800 seconds)');
  assert.equal(evidence.cloudflare.records.canonicalTtl, 1800);
  assert.deepEqual(
    evidence.cloudflare.records.inventory,
    manifest.records.map(({ category: _category, ...record }) => record)
  );
  assert.equal(evidence.cloudflare.cacheRule.expression, rule.expression);
  assert.equal(evidence.cloudflare.cacheRule.cacheDeceptionArmor, true);
  assert.equal(evidence.cloudflare.cacheRule.queryString, 'ignore all');
  assert.equal(evidence.cloudflare.cacheRule.cacheByDeviceType, false);
  assert.equal(evidence.cloudflare.cacheRule.sortQueryString, false);
  assert.deepEqual(evidence.cloudflare.cacheRule.customHeaders, []);
  assert.deepEqual(evidence.cloudflare.cacheRule.customCookies, []);
  assert.deepEqual(evidence.cloudflare.cacheRule.customUserFeatures, []);
  assert.equal(evidence.cloudflare.cacheRule.varyConfigured, false);
  assert.equal(evidence.cloudflare.cacheRule.serveStaleWhileUpdating, false);
  assert.deepEqual(evidence.cloudflare.cacheRule.providerDefaultCacheKey.originHeaderControl, {
    checked: true,
    disabled: true,
    availabilityToChange: 'enterprise-only',
    configuredByThisRule: false,
  });
  assert.deepEqual(
    evidence.cloudflare.cacheRule.providerDefaultCacheKey.addedCustomIdentityVariation,
    []
  );
  assert.deepEqual(evidence.cloudflare.cacheSettings, {
    sharedHtmlLifetimeOverridden: false,
    alwaysOnline: 'off',
    tieredCache: 'off',
  });
  assert.equal(evidence.cloudflare.tlsMode, 'full_strict');
  assert.ok(evidence.cloudflare.tokenMetadata);
  assert.equal(evidence.cloudflare.tokenMetadata.permission, 'Zone.Cache Purge:Purge');
  assert.deepEqual(evidence.cloudflare.tokenMetadata.resources, ['dinder.it.com']);
  assert.equal(evidence.cloudflare.tokenMetadata.tokenValueCaptured, false);
  assert.equal(evidence.productionConfig.zoneIdVariablePresent, true);
  assert.equal(evidence.productionConfig.purgeTokenSecretPresent, true);
}

console.log(`Cloudflare staging artifacts valid (external evidence: ${evidence.status})`);
