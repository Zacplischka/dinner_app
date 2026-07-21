#!/usr/bin/env node
// Phase-aware production frontend verification for the verify-production-deploy job.
//
// DINDER_EDGE_ROLLOUT_STATE (non-secret GitHub environment variable) is the ONLY
// source of rollout state. State is never inferred from the presence or absence of a
// Cloudflare header; instead the declared state is asserted against reality, so an
// unrecorded orange-cloud flip (either direction) fails the deploy rather than
// silently downgrading the checks.
//
//   bootstrap  - no frontend host is proxied; every host must answer as direct Railway origin.
//   apex-only  - dinder.it.com is proxied; www.dinder.it.com is still DNS-only.
//   both-hosts - both frontend hosts are proxied.
//
// Commands:
//   prewarm         warm the per-commit document and its fingerprinted asset (pre-purge)
//   purge-response  validate a curl purge response: node ... purge-response <http_status> <body_file>
//   verify          post-purge cache lifecycle plus document/asset/health/identity contracts
//
// Hosted CI proves portable cache and health semantics only. It never measures or
// reports the fixed-Melbourne performance gate.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const CACHE_TAG = 'dinder-route-html';
export const PURGE_BODY = `{"tags":["${CACHE_TAG}"]}`;
export const FRONTEND_HOSTS = ['dinder.it.com', 'www.dinder.it.com'];
// Railway's servable domain for the frontend service, which never traverses Cloudflare.
export const DIRECT_ORIGIN = 'https://frontend-production-bdfc.up.railway.app';
export const ROLLOUT_STATES = {
  bootstrap: [],
  'apex-only': [FRONTEND_HOSTS[0]],
  'both-hosts': FRONTEND_HOSTS,
};

export const DOCUMENT_CACHE_CONTROL = 'max-age=0, must-revalidate';
export const ASSET_CACHE_CONTROL = 'public, max-age=31536000, immutable';
export const ORIGIN_CDN_CACHE_CONTROL = 'no-store';
export const ORIGIN_CLOUDFLARE_CACHE_CONTROL = 'public, max-age=60, must-revalidate';

// Cloudflare statuses meaning "this response did not come from the document cache".
const BYPASS_STATUSES = new Set(['BYPASS', 'DYNAMIC', 'NONE/UNKNOWN']);

// Identity variants that must all share one public document object.
export const IDENTITY_VARIANTS = [
  { name: 'auth cookie', cookie: 'sb-access-token=representative-value' },
  { name: 'session cookie', cookie: 'dinder-session=ABCDE' },
  { name: 'invite query', query: '?invite=ABCDE' },
  { name: 'auth query', query: '?code=representative-auth-code' },
  { name: 'tracking query', query: '?utm_source=verify&utm_medium=ci' },
];

export function resolveRollout(rawState) {
  const state = String(rawState ?? '').trim() || 'bootstrap';
  const proxiedHosts = ROLLOUT_STATES[state];
  if (!proxiedHosts) {
    throw new Error(
      `unknown DINDER_EDGE_ROLLOUT_STATE ${JSON.stringify(state)}; expected one of: ${Object.keys(
        ROLLOUT_STATES
      ).join(', ')}`
    );
  }
  return { state, proxiedHosts, edgeActive: proxiedHosts.length > 0 };
}

// A low-traffic, per-commit SPA fallback path: nothing else warms it, so a post-purge
// MISS is caused by this job's purge rather than by unrelated production traffic.
export function deployPath(commit) {
  const sha = String(commit ?? '').toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error(`expected a 40-character commit SHA, got ${JSON.stringify(commit)}`);
  }
  return `/__deploy-check/${sha}`;
}

// Deterministic so prewarm and verify pick the same already-warm asset.
export function pickAssetPath(html) {
  const fingerprinted = [...new Set(html.match(/\/assets\/[A-Za-z0-9._-]+/g) ?? [])]
    .filter((path) => /-[A-Za-z0-9_-]{8,}\.[^/]+$/.test(path))
    .sort();
  if (fingerprinted.length === 0) {
    throw new Error('document references no fingerprinted asset');
  }
  return fingerprinted[0];
}

export function assertPurgeResponse(httpStatus, bodyText) {
  const status = Number(String(httpStatus).trim());
  if (!Number.isInteger(status) || status < 200 || status > 299) {
    throw new Error(
      `cache purge failed: HTTP ${String(httpStatus).trim() || '<none>'} (000 means transport error)`
    );
  }
  let payload;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    throw new Error('cache purge returned invalid JSON');
  }
  if (payload?.success !== true) {
    throw new Error(
      `cache purge reported success=${JSON.stringify(payload?.success)} errors=${JSON.stringify(
        payload?.errors ?? []
      )}`
    );
  }
  return `purged cache tag ${CACHE_TAG} (zone ${payload.result?.id ?? '<none>'})`;
}

export function popOf(cfRay) {
  return String(cfRay ?? '').split('-')[1] || null;
}

// Post-purge MISS, then same-POP HITs with a strictly increasing Age.
export function assertEdgeCacheSequence(label, samples) {
  if (samples.length < 3) {
    throw new Error(`${label}: cache lifecycle needs at least three samples`);
  }
  const [first, ...hits] = samples;
  if (first.cacheStatus !== 'MISS') {
    throw new Error(
      `${label}: expected MISS after the tag purge, got ${first.cacheStatus ?? '<missing>'}`
    );
  }
  const pop = popOf(first.ray);
  if (!pop) {
    throw new Error(`${label}: response carries no cf-ray POP`);
  }
  for (const item of samples) {
    if (popOf(item.ray) !== pop) {
      throw new Error(`${label}: mixed edge POPs ${pop} and ${popOf(item.ray) ?? '<missing>'}`);
    }
  }
  for (const item of hits) {
    if (item.cacheStatus !== 'HIT') {
      throw new Error(`${label}: expected HIT after MISS, got ${item.cacheStatus ?? '<missing>'}`);
    }
    if (!Number.isInteger(item.age)) {
      throw new Error(`${label}: HIT response has no integer Age (${item.age})`);
    }
  }
  for (let index = 1; index < hits.length; index += 1) {
    if (hits[index].age < hits[index - 1].age) {
      throw new Error(`${label}: Age decreased ${hits[index - 1].age} -> ${hits[index].age}`);
    }
  }
  if (hits.at(-1).age <= hits[0].age) {
    throw new Error(
      `${label}: Age did not increase across HITs (${hits.map((item) => item.age).join(', ')})`
    );
  }
  return pop;
}

function expectHeader(label, headers, name, expected) {
  const actual = headers[name] ?? null;
  if (actual !== expected) {
    throw new Error(`${label}: expected ${name}: ${expected}, got ${actual ?? '<missing>'}`);
  }
}

function expectAbsent(label, headers, name) {
  if (headers[name] != null) {
    throw new Error(`${label}: expected no ${name} header, got ${headers[name]}`);
  }
}

function expectPresent(label, headers, name) {
  if (headers[name] == null) {
    throw new Error(`${label}: expected a ${name} header`);
  }
}

export function assertDocumentHeaders(label, headers, { proxied }) {
  expectHeader(label, headers, 'cache-control', DOCUMENT_CACHE_CONTROL);
  if (proxied) {
    // Cloudflare consumes and strips its private directives before the visitor sees them.
    expectPresent(label, headers, 'cf-cache-status');
    expectAbsent(label, headers, 'cloudflare-cdn-cache-control');
    expectAbsent(label, headers, 'cache-tag');
    return;
  }
  expectAbsent(label, headers, 'cf-cache-status');
  expectHeader(label, headers, 'cdn-cache-control', ORIGIN_CDN_CACHE_CONTROL);
  expectHeader(label, headers, 'cloudflare-cdn-cache-control', ORIGIN_CLOUDFLARE_CACHE_CONTROL);
  expectHeader(label, headers, 'cache-tag', CACHE_TAG);
}

export function assertAssetHeaders(label, headers, { proxied }) {
  expectHeader(label, headers, 'cache-control', ASSET_CACHE_CONTROL);
  expectAbsent(label, headers, 'cache-tag');
  proxied
    ? expectPresent(label, headers, 'cf-cache-status')
    : expectAbsent(label, headers, 'cf-cache-status');
}

export function assertNonHtmlBypass(label, headers, { proxied }) {
  // The origin only emits the document policy to clients that accept HTML, so a
  // non-HTML client can never enter the public document cache.
  expectAbsent(label, headers, 'cloudflare-cdn-cache-control');
  expectAbsent(label, headers, 'cache-tag');
  const status = headers['cf-cache-status'];
  if (proxied && status != null && !BYPASS_STATUSES.has(status)) {
    throw new Error(`${label}: non-HTML Accept entered the document cache (${status})`);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function headerMap(headers) {
  return Object.fromEntries([...headers].map(([name, value]) => [name.toLowerCase(), value]));
}

async function request(url, { accept = 'text/html', cookie = null, expect = 200, method = 'GET' } = {}) {
  const headers = { accept };
  if (cookie) {
    headers.cookie = cookie;
  }
  const response = await fetch(url, { method, headers, redirect: 'manual' });
  // A HEAD response has no body, so its hash is never compared against a document.
  const body = method === 'HEAD' ? '' : await response.text();
  if (response.status !== expect) {
    throw new Error(`${method} ${url} returned ${response.status}, expected ${expect}`);
  }
  const map = headerMap(response.headers);
  return {
    url,
    headers: map,
    body,
    hash: createHash('sha256').update(body).digest('hex'),
    cacheStatus: map['cf-cache-status'] ?? null,
    ray: map['cf-ray'] ?? null,
    age: map.age == null ? null : Number(map.age),
  };
}

async function warmUntilHit(url, options) {
  let sample;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    sample = await request(url, options);
    if (sample.cacheStatus === 'HIT') {
      return sample;
    }
    await sleep(2000);
  }
  throw new Error(
    `${url}: never reached HIT while warming (last cf-cache-status: ${sample?.cacheStatus ?? '<missing>'})`
  );
}

function assertSameDocument(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${label}: document body hash ${actual} differs from the route document`);
  }
}

async function prewarm({ proxiedHosts }, path) {
  for (const host of proxiedHosts) {
    const base = `https://${host}`;
    const document = await warmUntilHit(`${base}${path}`);
    const assetPath = pickAssetPath(document.body);
    await warmUntilHit(`${base}${assetPath}`, { accept: '*/*' });
    console.log(`warmed ${base}${path} and ${base}${assetPath}`);
  }
}

async function verifyLifecycle(base, path, assetPath) {
  const first = await request(`${base}${path}`);
  const second = await request(`${base}${path}`);
  await sleep(3000);
  const third = await request(`${base}${path}`);
  const pop = assertEdgeCacheSequence(`${base}${path}`, [first, second, third]);

  const asset = await request(`${base}${assetPath}`, { accept: '*/*' });
  if (asset.cacheStatus !== 'HIT') {
    throw new Error(
      `${base}${assetPath}: warm fingerprinted asset was invalidated by the HTML tag purge (${asset.cacheStatus ?? '<missing>'})`
    );
  }
  assertAssetHeaders(`${base}${assetPath}`, asset.headers, { proxied: true });
  console.log(`edge lifecycle ok on ${base}: MISS -> HIT -> HIT at POP ${pop}, asset still HIT`);
}

async function verifyHost(base, path, { proxied }) {
  const root = await request(`${base}/`);
  assertDocumentHeaders(`${base}/`, root.headers, { proxied });
  const assetPath = pickAssetPath(root.body);

  if (proxied) {
    await verifyLifecycle(base, path, assetPath);
  }

  const route = await request(`${base}${path}`);
  assertDocumentHeaders(`${base}${path}`, route.headers, { proxied });
  assertSameDocument(`${base}${path}`, route.hash, root.hash);

  for (const variant of IDENTITY_VARIANTS) {
    const label = `${base}${path} (${variant.name})`;
    const sample = await request(`${base}${path}${variant.query ?? ''}`, {
      cookie: variant.cookie,
    });
    assertDocumentHeaders(label, sample.headers, { proxied });
    assertSameDocument(label, sample.hash, root.hash);
    if (proxied && sample.cacheStatus !== 'HIT') {
      throw new Error(
        `${label}: variant did not share the public document object (${sample.cacheStatus ?? '<missing>'})`
      );
    }
  }

  // HEAD carries the same document policy. The bracketing GETs are compared to each
  // other, not to the run's opening document, so the assertion isolates HEAD's effect
  // instead of straddling an edge revalidation boundary.
  const beforeHead = await request(`${base}${path}`);
  const head = await request(`${base}${path}`, { method: 'HEAD' });
  assertDocumentHeaders(`${base}${path} (HEAD)`, head.headers, { proxied });
  const afterHead = await request(`${base}${path}`);
  assertSameDocument(`${base}${path} (GET after HEAD)`, afterHead.hash, beforeHead.hash);
  if (proxied && BYPASS_STATUSES.has(afterHead.cacheStatus)) {
    throw new Error(
      `${base}${path}: HEAD dropped the public document object (${afterHead.cacheStatus ?? '<missing>'})`
    );
  }

  const nonHtml = await request(`${base}${path}`, { accept: 'application/json' });
  assertNonHtmlBypass(`${base}${path} (non-HTML Accept)`, nonHtml.headers, { proxied });

  await request(`${base}${assetPath}`, { accept: '*/*' }).then((asset) =>
    assertAssetHeaders(`${base}${assetPath}`, asset.headers, { proxied })
  );
  await request(`${base}/health`, { accept: '*/*' });

  console.log(`${base}: ${proxied ? 'edge' : 'direct-origin'} contracts ok`);
}

async function verify(rollout, path) {
  // Proxied hosts run first so the lifecycle samples the pristine post-purge state.
  for (const host of rollout.proxiedHosts) {
    await verifyHost(`https://${host}`, path, { proxied: true });
  }
  for (const host of FRONTEND_HOSTS.filter((host) => !rollout.proxiedHosts.includes(host))) {
    await verifyHost(`https://${host}`, path, { proxied: false });
  }
  await verifyHost(DIRECT_ORIGIN, path, { proxied: false });
  await verifyEdgeDocumentParity(rollout, path);
  console.log(
    'performance: NOT EVALUATED — the fixed-Melbourne gate is a release gate, not hosted CI.'
  );
}

// The edge must hand back the origin's bytes. Cloudflare will silently inject content
// into HTML responses when features such as the RUM/Web Analytics beacon, Rocket Loader
// or email obfuscation are on, so this compares the served document against the origin's
// rather than trusting that those features stay off.
async function verifyEdgeDocumentParity({ proxiedHosts }, path) {
  if (proxiedHosts.length === 0) {
    return;
  }
  const origin = await request(`${DIRECT_ORIGIN}${path}`);
  for (const host of proxiedHosts) {
    const edge = await request(`https://${host}${path}`);
    if (edge.hash !== origin.hash) {
      throw new Error(
        `https://${host}${path}: edge document differs from the origin document ` +
          `(${edge.body.length} vs ${origin.body.length} chars); Cloudflare is rewriting the HTML`
      );
    }
  }
  console.log(`edge document parity ok: ${proxiedHosts.join(', ')} match the origin byte for byte`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2);
  try {
    const rollout = resolveRollout(process.env.DINDER_EDGE_ROLLOUT_STATE);
    console.log(
      `rollout state: ${rollout.state} (proxied: ${rollout.proxiedHosts.join(', ') || 'none'})`
    );

    if (command === 'purge-response') {
      console.log(assertPurgeResponse(args[0], readFileSync(args[1], 'utf8')));
    } else if (command === 'prewarm') {
      await prewarm(rollout, deployPath(process.env.COMMIT_SHA));
    } else if (command === 'verify') {
      await verify(rollout, deployPath(process.env.COMMIT_SHA));
    } else {
      throw new Error(`unknown command ${JSON.stringify(command)}`);
    }
  } catch (error) {
    console.error(`FAIL: ${error.message}`);
    process.exit(1);
  }
}
