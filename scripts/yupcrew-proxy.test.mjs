import assert from 'node:assert/strict';
import { test } from 'node:test';
import proxy from './yupcrew-proxy.mjs';

test('routes both branded hosts to the fixed frontend without losing join URLs or cache headers', async (t) => {
  const response = new Response('frontend', {
    headers: { 'Cache-Control': 'max-age=0, must-revalidate' },
  });
  const upstream = t.mock.method(globalThis, 'fetch', async () => response);
  for (const host of ['yupcrew.com', 'www.yupcrew.com']) {
    const result = await proxy.fetch(
      new Request(`https://${host}/join?code=ABCDE`, {
        method: 'HEAD',
        headers: { Host: host, Accept: 'text/html' },
      })
    );
    const forwarded = upstream.mock.calls.at(-1).arguments[0];
    assert.equal(forwarded.url, 'https://frontend-production-bdfc.up.railway.app/join?code=ABCDE');
    assert.equal(forwarded.headers.get('Host'), 'frontend-production-bdfc.up.railway.app');
    assert.equal(forwarded.headers.get('Accept'), 'text/html');
    assert.equal(forwarded.method, 'HEAD');
    assert.equal(forwarded.redirect, 'manual');
    assert.equal(result, response);
  }
});
