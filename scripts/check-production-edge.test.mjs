import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ASSET_CACHE_CONTROL,
  CACHE_TAG,
  DOCUMENT_CACHE_CONTROL,
  ORIGIN_CDN_CACHE_CONTROL,
  ORIGIN_CLOUDFLARE_CACHE_CONTROL,
  PURGE_BODY,
  assertAssetHeaders,
  assertDocumentHeaders,
  assertEdgeCacheSequence,
  assertNonHtmlBypass,
  assertPurgeResponse,
  deployPath,
  pickAssetPath,
  resolveRollout,
} from './check-production-edge.mjs';

const SHA = 'a'.repeat(40);
const purgeOk = JSON.stringify({
  result: { id: 'zone-id' },
  success: true,
  errors: [],
  messages: [],
});
const originDocument = {
  'cache-control': DOCUMENT_CACHE_CONTROL,
  'cdn-cache-control': ORIGIN_CDN_CACHE_CONTROL,
  'cloudflare-cdn-cache-control': ORIGIN_CLOUDFLARE_CACHE_CONTROL,
  'cache-tag': CACHE_TAG,
};
const edgeDocument = { 'cache-control': DOCUMENT_CACHE_CONTROL, 'cf-cache-status': 'HIT' };
const hit = (age, pop = 'MEL') => ({ cacheStatus: 'HIT', ray: `9a0${age}b-${pop}`, age });

test('rollout state is explicit, defaults to bootstrap, and rejects anything else', () => {
  assert.deepEqual(resolveRollout(undefined), {
    state: 'bootstrap',
    proxiedHosts: [],
    edgeActive: false,
  });
  assert.deepEqual(resolveRollout('  '), {
    state: 'bootstrap',
    proxiedHosts: [],
    edgeActive: false,
  });
  assert.deepEqual(resolveRollout('apex-only'), {
    state: 'apex-only',
    proxiedHosts: ['dinder.it.com'],
    edgeActive: true,
  });
  assert.deepEqual(resolveRollout('both-hosts'), {
    state: 'both-hosts',
    proxiedHosts: ['dinder.it.com', 'www.dinder.it.com'],
    edgeActive: true,
  });
  for (const bad of ['apex', 'Both-Hosts', 'true', 'proxied']) {
    assert.throws(() => resolveRollout(bad), /unknown DINDER_EDGE_ROLLOUT_STATE/);
  }
});

test('purge sends exactly the route-html tag body', () => {
  assert.equal(PURGE_BODY, '{"tags":["dinder-route-html"]}');
  assert.deepEqual(JSON.parse(PURGE_BODY), { tags: ['dinder-route-html'] });
});

test('purge validation fails closed on transport, status, JSON, and success errors', () => {
  assert.equal(
    assertPurgeResponse('200', purgeOk),
    'purged cache tag dinder-route-html (zone zone-id)'
  );
  assert.equal(assertPurgeResponse(' 200 ', purgeOk), assertPurgeResponse(200, purgeOk));
  assert.throws(() => assertPurgeResponse('000', ''), /cache purge failed: HTTP 000/);
  assert.throws(() => assertPurgeResponse('', ''), /cache purge failed/);
  assert.throws(() => assertPurgeResponse('403', purgeOk), /cache purge failed: HTTP 403/);
  assert.throws(() => assertPurgeResponse('500', purgeOk), /cache purge failed: HTTP 500/);
  assert.throws(() => assertPurgeResponse('200', '<html>gateway</html>'), /invalid JSON/);
  assert.throws(
    () => assertPurgeResponse('200', JSON.stringify({ success: false, errors: [{ code: 1012 }] })),
    /success=false.*1012/s
  );
  assert.throws(
    () => assertPurgeResponse('200', JSON.stringify({ result: null })),
    /success=undefined/
  );
  assert.throws(
    () => assertPurgeResponse('200', JSON.stringify({ success: 'true' })),
    /success="true"/
  );
});

test('post-purge lifecycle requires MISS, same-POP HITs, and increasing Age', () => {
  const miss = { cacheStatus: 'MISS', ray: '9a00a-MEL', age: null };
  assert.equal(assertEdgeCacheSequence('doc', [miss, hit(0), hit(3)]), 'MEL');
  assert.throws(() => assertEdgeCacheSequence('doc', [miss, hit(0)]), /at least three samples/);
  assert.throws(
    () => assertEdgeCacheSequence('doc', [hit(0), hit(1), hit(3)]),
    /expected MISS after the tag purge, got HIT/
  );
  assert.throws(
    () =>
      assertEdgeCacheSequence('doc', [
        miss,
        hit(0),
        { cacheStatus: 'EXPIRED', ray: '9a-MEL', age: 0 },
      ]),
    /expected HIT after MISS, got EXPIRED/
  );
  assert.throws(
    () => assertEdgeCacheSequence('doc', [miss, hit(0), hit(3, 'SYD')]),
    /mixed edge POPs MEL and SYD/
  );
  assert.throws(
    () => assertEdgeCacheSequence('doc', [{ ...miss, ray: '9a00a' }, hit(0), hit(3)]),
    /no cf-ray POP/
  );
  assert.throws(
    () => assertEdgeCacheSequence('doc', [miss, hit(0), hit(0)]),
    /Age did not increase/
  );
  assert.throws(
    () => assertEdgeCacheSequence('doc', [miss, hit(4), hit(1)]),
    /Age decreased 4 -> 1/
  );
  assert.throws(
    () => assertEdgeCacheSequence('doc', [miss, { cacheStatus: 'HIT', ray: '9a-MEL' }, hit(3)]),
    /no integer Age/
  );
});

test('document headers separate direct-origin from proxied expectations', () => {
  assertDocumentHeaders('origin', originDocument, { proxied: false });
  assertDocumentHeaders('edge', edgeDocument, { proxied: true });
  // A bootstrap-declared host that is silently proxied must fail, not downgrade.
  assert.throws(
    () =>
      assertDocumentHeaders(
        'origin',
        { ...originDocument, 'cf-cache-status': 'HIT' },
        { proxied: false }
      ),
    /expected no cf-cache-status/
  );
  // An active-edge-declared host that is not actually proxied must fail too.
  assert.throws(
    () => assertDocumentHeaders('edge', originDocument, { proxied: true }),
    /expected a cf-cache-status header/
  );
  assert.throws(
    () =>
      assertDocumentHeaders('edge', { ...edgeDocument, 'cache-tag': CACHE_TAG }, { proxied: true }),
    /expected no cache-tag header/
  );
  assert.throws(
    () =>
      assertDocumentHeaders(
        'origin',
        { ...originDocument, 'cache-control': 'public, max-age=60' },
        { proxied: false }
      ),
    /expected cache-control: max-age=0, must-revalidate/
  );
  for (const missing of ['cdn-cache-control', 'cloudflare-cdn-cache-control', 'cache-tag']) {
    const headers = { ...originDocument };
    delete headers[missing];
    assert.throws(() => assertDocumentHeaders('origin', headers, { proxied: false }), /<missing>/);
  }
});

test('fingerprinted assets keep the immutable policy and never carry the HTML tag', () => {
  assertAssetHeaders('asset', { 'cache-control': ASSET_CACHE_CONTROL }, { proxied: false });
  assertAssetHeaders(
    'asset',
    { 'cache-control': ASSET_CACHE_CONTROL, 'cf-cache-status': 'HIT' },
    { proxied: true }
  );
  assert.throws(
    () =>
      assertAssetHeaders('asset', { 'cache-control': DOCUMENT_CACHE_CONTROL }, { proxied: false }),
    /expected cache-control: public, max-age=31536000, immutable/
  );
  assert.throws(
    () =>
      assertAssetHeaders(
        'asset',
        { 'cache-control': ASSET_CACHE_CONTROL, 'cache-tag': CACHE_TAG },
        { proxied: false }
      ),
    /expected no cache-tag header/
  );
});

test('non-HTML requests must stay out of the public document cache', () => {
  assertNonHtmlBypass('json', {}, { proxied: false });
  assertNonHtmlBypass('json', { 'cf-cache-status': 'DYNAMIC' }, { proxied: true });
  assertNonHtmlBypass('json', { 'cf-cache-status': 'BYPASS' }, { proxied: true });
  assert.throws(
    () => assertNonHtmlBypass('json', { 'cf-cache-status': 'HIT' }, { proxied: true }),
    /entered the document cache \(HIT\)/
  );
  assert.throws(
    () => assertNonHtmlBypass('json', { 'cache-tag': CACHE_TAG }, { proxied: false }),
    /expected no cache-tag header/
  );
});

test('the sampled path is per-commit and the sampled asset is deterministic', () => {
  assert.equal(deployPath(SHA), `/__deploy-check/${SHA}`);
  assert.notEqual(deployPath(SHA), deployPath('b'.repeat(40)));
  for (const bad of ['', undefined, 'main', 'a'.repeat(39), `${SHA}x`]) {
    assert.throws(() => deployPath(bad), /40-character commit SHA/);
  }

  const html = '<link href="/assets/index-B54mdXn3.css"><script src="/assets/index-Y9kJZUbs.js">';
  assert.equal(pickAssetPath(html), '/assets/index-B54mdXn3.css');
  assert.equal(pickAssetPath(html), pickAssetPath(`${html}${html}`));
  assert.throws(() => pickAssetPath('<script src="/assets/plain.js">'), /no fingerprinted asset/);
  assert.throws(() => pickAssetPath('<html></html>'), /no fingerprinted asset/);
});
