// The reading stage's runnable self-check (#329). Offline: search, HTTP and
// fact extraction are all injected, so nothing here touches the network or
// spends a token. Covers the rules the re-authoring standard (ADR 0012) cannot
// be allowed to lose — robots.txt refusal (including across a redirect), the
// UK/EU skip, and the three-publisher floor.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { htmlToText, publisher, readDish, robotsAllows } from './read-dish.mjs';

/** A fake web: robots.txt bodies, page HTML, redirects and dead hosts by URL. */
function fakeWeb({ robots = {}, pages = {}, redirects = {}, dead = [] } = {}) {
  const requested = [];
  return {
    requested,
    async get(url) {
      requested.push(url);
      if (dead.includes(url)) throw new Error(`ECONNRESET ${url}`);
      if (redirects[url]) return { status: 301, location: redirects[url], body: '' };
      const { origin, pathname } = new URL(url);
      if (pathname === '/robots.txt') {
        const body = robots[origin];
        return body === undefined ? { status: 404, body: '' } : { status: 200, body };
      }
      const body = pages[url];
      return body === undefined ? { status: 404, body: '' } : { status: 200, body };
    },
  };
}

const page = (dish) =>
  `<html><body><h1>${dish}</h1><p>Brown the mince, add stock.</p></body></html>`;

const FACTS = {
  canonicalIngredients: [{ name: 'beef mince', essential: true, observations: ['500 g (s0)'] }],
  causalSequence: ['brown mince'],
  techniqueFacts: ['long simmer is the flavour lever (2 sources)'],
  servingsObserved: [4],
};

const extract = async () => FACTS;

test('robotsAllows: no rules, empty disallow and unrelated groups all permit', () => {
  assert.equal(robotsAllows('', '/recipes/x'), true);
  assert.equal(robotsAllows('User-agent: *\nDisallow:', '/recipes/x'), true);
  assert.equal(robotsAllows('User-agent: Bingbot\nDisallow: /', '/recipes/x'), true);
});

test('robotsAllows: a blanket disallow, our own token and any AI-agent token all bind', () => {
  assert.equal(robotsAllows('User-agent: *\nDisallow: /', '/recipes/x'), false);
  assert.equal(robotsAllows('User-agent: DinderCorpusBot\nDisallow: /', '/recipes/x'), false);
  // We are an AI agent: a group aimed at one of our peers is aimed at us.
  assert.equal(robotsAllows('User-agent: GPTBot\nDisallow: /', '/recipes/x'), false);
  assert.equal(robotsAllows('User-agent: anthropic-ai\nDisallow: /', '/recipes/x'), false);
});

test('robotsAllows: longest match wins and $ anchors the end', () => {
  const txt = 'User-agent: *\nDisallow: /recipes\nAllow: /recipes/public/';
  assert.equal(robotsAllows(txt, '/recipes/private/x'), false);
  assert.equal(robotsAllows(txt, '/recipes/public/x'), true);
  assert.equal(robotsAllows('User-agent: *\nDisallow: /*.pdf$', '/a/b.pdf'), false);
  assert.equal(robotsAllows('User-agent: *\nDisallow: /*.pdf$', '/a/b.pdf.html'), true);
});

test('publisher: the registrable domain, so www and subdomains are one publisher', () => {
  assert.equal(publisher('https://www.example.com/a'), 'example.com');
  assert.equal(publisher('https://blog.example.com/a'), 'example.com');
  assert.equal(publisher('https://www.recipetin.com.au/a'), 'recipetin.com.au');
});

test('htmlToText: strips scripts and tags, keeps the words the overlap check needs', () => {
  const text = htmlToText(
    '<p>Brown the mince.</p><script>bad()</script><li>Add stock &amp; simmer</li>'
  );
  assert.match(text, /Brown the mince\./);
  assert.match(text, /Add stock & simmer/);
  assert.doesNotMatch(text, /bad\(\)/);
});

test('a dish name yields a Fact Record over three independent publishers', async () => {
  const urls = ['https://a.com/dish', 'https://b.com/dish', 'https://c.com/dish'];
  const web = fakeWeb({ pages: Object.fromEntries(urls.map((u) => [u, page('Beef stew')])) });
  const { record, captures } = await readDish('Beef stew', {
    search: async () => urls.map((url) => ({ url })),
    get: web.get,
    extract,
  });

  assert.equal(record.dish, 'Beef stew');
  assert.equal(record.slug, 'beef-stew');
  assert.deepEqual(
    record.sources.map((s) => s.url),
    urls
  );
  assert.equal(new Set(record.sources.map((s) => s.publisher)).size, 3);
  assert.ok(record.sources.every((s) => s.robots_ok === true && s.accessed));
  assert.deepEqual(record.canonicalIngredients, FACTS.canonicalIngredients);
  assert.equal(captures.length, 3);
});

test('a robots.txt disallow skips the domain and the skip is recorded', async () => {
  const web = fakeWeb({
    robots: { 'https://blocked.com': 'User-agent: *\nDisallow: /' },
    pages: {
      'https://a.com/dish': page('Beef stew'),
      'https://b.com/dish': page('Beef stew'),
      'https://c.com/dish': page('Beef stew'),
      'https://blocked.com/dish': page('SECRET'),
    },
  });
  const { record, captures } = await readDish('Beef stew', {
    search: async () => [
      { url: 'https://blocked.com/dish' },
      { url: 'https://a.com/dish' },
      { url: 'https://b.com/dish' },
      { url: 'https://c.com/dish' },
    ],
    get: web.get,
    extract,
  });

  assert.deepEqual(record.skipped, [
    { publisher: 'blocked.com', url: 'https://blocked.com/dish', reason: 'robots-disallowed' },
  ]);
  assert.ok(!record.sources.some((s) => s.publisher === 'blocked.com'));
  // The refusal is absolute: the disallowed page is never fetched at all.
  assert.ok(!web.requested.includes('https://blocked.com/dish'));
  assert.ok(!captures.some((c) => c.text.includes('SECRET')));
});

test('an unreachable robots.txt is a skip, not a licence to fetch', async () => {
  const web = {
    requested: [],
    async get(url) {
      web.requested.push(url);
      if (new URL(url).origin === 'https://flaky.com') return { status: 503, body: '' };
      if (url.endsWith('/robots.txt')) return { status: 404, body: '' };
      return { status: 200, body: page('Beef stew') };
    },
  };
  const { record } = await readDish('Beef stew', {
    search: async () => [
      { url: 'https://flaky.com/dish' },
      { url: 'https://a.com/dish' },
      { url: 'https://b.com/dish' },
      { url: 'https://c.com/dish' },
    ],
    get: web.get,
    extract,
  });

  assert.deepEqual(record.skipped, [
    { publisher: 'flaky.com', url: 'https://flaky.com/dish', reason: 'robots-unreachable' },
  ]);
  assert.ok(!web.requested.includes('https://flaky.com/dish'));
});

test('a robots.txt that redirects or is refused is a skip, not a licence to fetch', async () => {
  // Two ordinary configurations that answer neither 200 nor 404: an apex that
  // canonicalises robots.txt to www, and a CDN that 403s bot requests for it.
  const web = {
    requested: [],
    async get(url) {
      web.requested.push(url);
      if (url === 'https://redir.com/robots.txt')
        return { status: 301, location: 'https://www.redir.com/robots.txt', body: '' };
      if (url === 'https://cdn.com/robots.txt') return { status: 403, body: '' };
      if (url.endsWith('/robots.txt')) return { status: 404, body: '' };
      return { status: 200, body: page('Beef stew') };
    },
  };
  const { record } = await readDish('Beef stew', {
    search: async () => [
      { url: 'https://redir.com/dish' },
      { url: 'https://cdn.com/dish' },
      { url: 'https://a.com/dish' },
      { url: 'https://b.com/dish' },
      { url: 'https://c.com/dish' },
    ],
    get: web.get,
    extract,
  });

  assert.deepEqual(record.skipped, [
    { publisher: 'redir.com', url: 'https://redir.com/dish', reason: 'robots-unreachable' },
    { publisher: 'cdn.com', url: 'https://cdn.com/dish', reason: 'robots-unreachable' },
  ]);
  assert.equal(record.sources.length, 3);
  assert.ok(!web.requested.includes('https://redir.com/dish'));
  assert.ok(!web.requested.includes('https://cdn.com/dish'));
});

test('a URL that will not parse is a skip, not the end of the dish', async () => {
  const urls = ['https://a.com/dish', 'https://b.com/dish', 'https://c.com/dish'];
  const web = fakeWeb({
    redirects: { 'https://broken.com/dish': 'http://' },
    pages: Object.fromEntries(urls.map((u) => [u, page('Beef stew')])),
  });
  const { record } = await readDish('Beef stew', {
    // A search result that arrived without a scheme, then a broken Location.
    search: async () => [
      { url: 'www.example.com/dish' },
      { url: 'https://broken.com/dish' },
      ...urls.map((url) => ({ url })),
    ],
    get: web.get,
    extract,
  });

  assert.deepEqual(record.skipped, [
    { publisher: null, url: 'www.example.com/dish', reason: 'bad-url' },
    { publisher: null, url: 'http://', reason: 'bad-url' },
  ]);
  assert.equal(record.sources.length, 3);
});

test("a redirect is cleared through the destination's own robots.txt", async () => {
  const web = fakeWeb({
    robots: { 'https://real.com': 'User-agent: *\nDisallow: /' },
    redirects: { 'https://mirror.com/dish': 'https://real.com/dish' },
    pages: {
      'https://real.com/dish': page('SECRET'),
      'https://a.com/dish': page('Beef stew'),
      'https://b.com/dish': page('Beef stew'),
      'https://c.com/dish': page('Beef stew'),
    },
  });
  const { record, captures } = await readDish('Beef stew', {
    search: async () => [
      { url: 'https://mirror.com/dish' },
      { url: 'https://a.com/dish' },
      { url: 'https://b.com/dish' },
      { url: 'https://c.com/dish' },
    ],
    get: web.get,
    extract,
  });

  // The refusal belongs to the host that answers, not the one that was asked.
  assert.deepEqual(record.skipped, [
    { publisher: 'real.com', url: 'https://real.com/dish', reason: 'robots-disallowed' },
  ]);
  assert.ok(web.requested.includes('https://real.com/robots.txt'));
  assert.ok(!web.requested.includes('https://real.com/dish'));
  assert.ok(!captures.some((c) => c.text.includes('SECRET')));
});

test('a redirect counts as its destination publisher, once that robots.txt allows', async () => {
  const web = fakeWeb({
    redirects: { 'https://old.com/dish': 'https://new.com/dish' },
    pages: {
      'https://new.com/dish': page('Beef stew'),
      'https://b.com/dish': page('Beef stew'),
      'https://c.com/dish': page('Beef stew'),
    },
  });
  const { record } = await readDish('Beef stew', {
    search: async () => [
      { url: 'https://old.com/dish' },
      { url: 'https://b.com/dish' },
      { url: 'https://c.com/dish' },
    ],
    get: web.get,
    extract,
  });

  assert.equal(record.sources[0].url, 'https://new.com/dish');
  assert.equal(record.sources[0].publisher, 'new.com');
  assert.ok(web.requested.includes('https://new.com/robots.txt'));
});

test('a UK or EU publisher is skipped unread — the database right Australia lacks', async () => {
  const web = fakeWeb({
    pages: {
      'https://taste.co.uk/dish': page('Beef stew'),
      'https://a.com/dish': page('Beef stew'),
      'https://b.com/dish': page('Beef stew'),
      'https://c.com/dish': page('Beef stew'),
    },
  });
  const { record } = await readDish('Beef stew', {
    search: async () => [
      { url: 'https://taste.co.uk/dish' },
      { url: 'https://a.com/dish' },
      { url: 'https://b.com/dish' },
      { url: 'https://c.com/dish' },
    ],
    get: web.get,
    extract,
  });

  assert.deepEqual(record.skipped, [
    { publisher: 'taste.co.uk', url: 'https://taste.co.uk/dish', reason: 'region-excluded' },
  ]);
  // Not even its robots.txt: the region rule settles it before any request.
  assert.ok(!web.requested.some((u) => u.includes('taste.co.uk')));
});

test('a domain that throws is a skip, not the end of the dish', async () => {
  const web = fakeWeb({
    dead: ['https://dns-fail.com/robots.txt', 'https://reset.com/dish'],
    pages: {
      'https://reset.com/dish': page('Beef stew'),
      'https://a.com/dish': page('Beef stew'),
      'https://b.com/dish': page('Beef stew'),
      'https://c.com/dish': page('Beef stew'),
    },
  });
  const { record } = await readDish('Beef stew', {
    search: async () => [
      { url: 'https://dns-fail.com/dish' },
      { url: 'https://reset.com/dish' },
      { url: 'https://a.com/dish' },
      { url: 'https://b.com/dish' },
      { url: 'https://c.com/dish' },
    ],
    get: web.get,
    extract,
  });

  assert.deepEqual(record.skipped, [
    { publisher: 'dns-fail.com', url: 'https://dns-fail.com/dish', reason: 'robots-unreachable' },
    { publisher: 'reset.com', url: 'https://reset.com/dish', reason: 'fetch-error' },
  ]);
  assert.equal(record.sources.length, 3);
  // An unread robots.txt is never a licence to fetch the page behind it.
  assert.ok(!web.requested.includes('https://dns-fail.com/dish'));
});

test('fewer than three independent publishers emits no Fact Record', async () => {
  const web = fakeWeb({
    pages: {
      'https://a.com/dish': page('Beef stew'),
      'https://a.com/other': page('Beef stew'),
      'https://b.com/dish': page('Beef stew'),
    },
  });
  await assert.rejects(
    readDish('Beef stew', {
      search: async () => [
        { url: 'https://a.com/dish' },
        { url: 'https://a.com/other' },
        { url: 'https://b.com/dish' },
      ],
      get: web.get,
      extract,
    }),
    /PUBLISHER_FLOOR_UNMET/
  );
});

test('a domain skipped for robots cannot be made up by a second page of another site', async () => {
  const web = fakeWeb({
    robots: { 'https://blocked.com': 'User-agent: ClaudeBot\nDisallow: /' },
    pages: {
      'https://blocked.com/dish': page('Beef stew'),
      'https://a.com/dish': page('Beef stew'),
      'https://a.com/other': page('Beef stew'),
      'https://b.com/dish': page('Beef stew'),
    },
  });
  await assert.rejects(
    readDish('Beef stew', {
      search: async () => [
        { url: 'https://blocked.com/dish' },
        { url: 'https://a.com/dish' },
        { url: 'https://a.com/other' },
        { url: 'https://b.com/dish' },
      ],
      get: web.get,
      extract,
    }),
    /PUBLISHER_FLOOR_UNMET/
  );
});

test('sources come only from dish-name search — no index, category or sitemap walking', async () => {
  const urls = ['https://a.com/dish', 'https://b.com/dish', 'https://c.com/dish'];
  const web = fakeWeb({ pages: Object.fromEntries(urls.map((u) => [u, page('Beef stew')])) });
  await readDish('Beef stew', {
    search: async () => urls.map((url) => ({ url })),
    get: web.get,
    extract,
  });

  const allowed = new Set([...urls, ...urls.map((u) => new URL('/robots.txt', u).href)]);
  assert.deepEqual(
    web.requested.filter((u) => !allowed.has(u)),
    []
  );
});

test('raw source text stays in memory — the Fact Record carries URLs, not pages', async () => {
  const urls = ['https://a.com/dish', 'https://b.com/dish', 'https://c.com/dish'];
  const web = fakeWeb({
    pages: Object.fromEntries(urls.map((u) => [u, '<p>Brown the mince in a heavy pot.</p>'])),
  });
  const { record, captures } = await readDish('Beef stew', {
    search: async () => urls.map((url) => ({ url })),
    get: web.get,
    extract,
  });

  assert.doesNotMatch(JSON.stringify(record), /Brown the mince in a heavy pot/);
  assert.ok(captures.every((c) => c.text.includes('Brown the mince in a heavy pot')));
});
