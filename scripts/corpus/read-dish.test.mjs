// The reading stage's runnable self-check (#329). Offline: search, HTTP and
// fact extraction are all injected, so nothing here touches the network or
// spends a token. Covers the two rules the re-authoring standard (ADR 0012)
// cannot be allowed to lose — robots.txt refusal and the three-publisher floor.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { htmlToText, publisher, readDish, robotsAllows } from './read-dish.mjs';

/** A fake web: robots.txt bodies and page HTML keyed by URL. */
function fakeWeb({ robots = {}, pages = {} } = {}) {
  const requested = [];
  return {
    requested,
    async get(url) {
      requested.push(url);
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
    cell: { mealType: 'main course', cuisine: 'modern australian', diets: [] },
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
