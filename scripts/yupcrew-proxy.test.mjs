import assert from 'node:assert/strict';
import { test } from 'node:test';
import proxy from './yupcrew-proxy.mjs';

const DOCUMENT_EDGE_CACHE = {
  cacheEverything: true,
  cacheTtlByStatus: { '200-299': 60, '300-599': -1 },
  cacheTags: ['dinder-route-html'],
};

test('routes both branded hosts to the fixed frontend without losing cache headers', async (t) => {
  const upstream = t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response('frontend', { headers: { 'Cache-Control': 'max-age=0, must-revalidate' } })
  );
  for (const host of ['yupcrew.com', 'www.yupcrew.com']) {
    const result = await proxy.fetch(
      new Request(`https://${host}/join?code=ABCDE`, {
        method: 'HEAD',
        headers: { Host: host, Accept: 'text/html' },
      })
    );
    const forwarded = upstream.mock.calls.at(-1).arguments[0];
    assert.equal(forwarded.url, 'https://frontend-production-bdfc.up.railway.app/join');
    assert.equal(forwarded.headers.get('Host'), 'frontend-production-bdfc.up.railway.app');
    assert.equal(forwarded.headers.get('Accept'), 'text/html');
    assert.equal(forwarded.method, 'HEAD');
    assert.equal(forwarded.redirect, 'manual');
    assert.equal(result.headers.get('Cache-Control'), 'max-age=0, must-revalidate');
  }
});

test('edge-caches GET and HEAD documents under the purged tag while browsers keep revalidating', async (t) => {
  // Stands in for the edge rewriting the browser policy on a response it cached.
  const upstream = t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response('<title>YupCrew</title>', {
        headers: { 'Cache-Control': 'public, max-age=14400', 'Content-Type': 'text/html' },
      })
  );
  for (const method of ['GET', 'HEAD']) {
    // Every invite link shares one cached shell; the browser keeps its own ?code=.
    for (const query of ['?code=ABCDE', '?code=FGHIJ']) {
      const result = await proxy.fetch(
        new Request(`https://yupcrew.com/join${query}`, {
          method,
          // The shell is the same static file for everyone, so identity never splits it.
          headers: { Accept: 'text/html,application/xhtml+xml,*/*;q=0.8', Cookie: 'a=b' },
        })
      );
      const [forwarded, init] = upstream.mock.calls.at(-1).arguments;
      assert.equal(forwarded.url, 'https://frontend-production-bdfc.up.railway.app/join');
      assert.deepEqual(init, { cf: DOCUMENT_EDGE_CACHE });
      assert.equal(result.headers.get('Cache-Control'), 'max-age=0, must-revalidate');
      assert.equal(result.headers.get('Content-Type'), 'text/html');
    }
  }
  assert.equal(
    await (
      await proxy.fetch(new Request('https://yupcrew.com/', { headers: { Accept: 'text/html' } }))
    ).text(),
    '<title>YupCrew</title>'
  );
});

test('passes assets, non-HTML clients and writes straight through without edge caching', async (t) => {
  const response = new Response('asset', {
    headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
  const upstream = t.mock.method(globalThis, 'fetch', async () => response);
  for (const [path, init] of [
    ['/assets/index-AbCdEf12.js?v=1', { headers: { Accept: '*/*' } }],
    ['/join?code=ABCDE', { headers: { Accept: 'application/json' } }],
    ['/join?code=ABCDE', { method: 'POST', headers: { Accept: 'text/html' }, body: 'x' }],
  ]) {
    const result = await proxy.fetch(new Request(`https://yupcrew.com${path}`, init));
    const call = upstream.mock.calls.at(-1).arguments;
    assert.equal(call.length, 1, `${path} ${init.method ?? 'GET'}`);
    assert.equal(call[0].url, `https://frontend-production-bdfc.up.railway.app${path}`);
    assert.equal(result, response);
  }
});
