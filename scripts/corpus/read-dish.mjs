// The corpus pipeline's reading stage (#329): one dish name in, one Fact
// Record out. This is the half of the re-authoring standard that touches the
// outside world, so its rules are compliance controls, not style — read
// docs/adr/0012-owned-recipes-are-authored-from-fact-records.md before
// changing any of them:
//
//   - sources are found by dish-name search only; this file never follows a
//     link, an index, a category page or a sitemap. `search` is the sole way a
//     URL can enter the run.
//   - robots.txt is honoured absolutely, including disallows aimed at other AI
//     agents, and every refusal is recorded on the record. A redirect is not
//     followed blind: it re-enters the candidate loop, so the host that finally
//     answers is one whose own robots.txt we read first. Only a 2xx robots.txt
//     is one we read: anything else but a 404/410 is a skip, never a licence.
//   - UK/EU publishers are skipped outright — the EU database right has no
//     Australian equivalent, so their compilations carry a claim we cannot
//     answer. The ADR words this as "avoided"; here it is a hard skip.
//   - at least three independent publishers, or no Fact Record at all.
//   - raw source text is returned in memory for the next stage's overlap check
//     and is never written anywhere, so it cannot outlive the run.
//
// A candidate that simply misbehaves — a dead domain, a reset, a timeout, a
// redirect loop, a URL that will not parse — is skipped and recorded, never
// allowed to end the dish.
//
// Pure Node, no build step. `search`, `get` and `extract` are injectable, which
// is what lets read-dish.test.mjs assert all of the above offline.

import Anthropic from '@anthropic-ai/sdk';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MIN_PUBLISHERS = 3;

export const USER_AGENT = 'DinderCorpusBot/1.0 (+https://github.com/Zacplischka/dinner_app)';

// The tokens whose disallow binds us. Ours first, then the AI-agent family:
// ADR 0012 honours an AI-agent disallow absolutely, so a group aimed at any
// peer is read as aimed at us even where the robots standard would let us
// through. `*` is the catch-all group.
const AGENT_TOKENS = ['dindercorpusbot', 'claudebot', 'claude-user', 'anthropic-ai', 'gptbot', '*'];

/** robots.txt as `agent token -> { allow, disallow }` path patterns. */
function parseRobots(text) {
  const groups = new Map();
  let agents = [];
  let sawRule = false;
  for (const line of text.split(/\r?\n/)) {
    const match = /^([a-z-]+)\s*:\s*([^#]*)/i.exec(line.trim());
    if (!match) continue;
    const field = match[1].toLowerCase();
    const value = match[2].trim();
    if (field === 'user-agent') {
      // A rule closes the group; the next User-agent starts a fresh one.
      if (sawRule) {
        agents = [];
        sawRule = false;
      }
      const agent = value.toLowerCase();
      agents.push(agent);
      if (!groups.has(agent)) groups.set(agent, { allow: [], disallow: [] });
    } else if ((field === 'allow' || field === 'disallow') && agents.length) {
      sawRule = true;
      for (const agent of agents) groups.get(agent)[field].push(value);
    }
  }
  return groups;
}

/** A robots path pattern, with `*` as a wildcard and a trailing `$` as an anchor. */
function patternToRegExp(pattern) {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const source = body
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${source}${anchored ? '$' : ''}`);
}

/** One group's verdict for a path: longest matching pattern wins, ties to Allow. */
function groupAllows(group, path) {
  let best = null;
  for (const field of ['allow', 'disallow']) {
    for (const pattern of group[field]) {
      if (!pattern || !patternToRegExp(pattern).test(path)) continue;
      const allow = field === 'allow';
      if (!best || pattern.length > best.length || (pattern.length === best.length && allow)) {
        best = { allow, length: pattern.length };
      }
    }
  }
  return best ? best.allow : true;
}

/** True only when every agent token we answer to may fetch `path`. */
export function robotsAllows(text, path) {
  const groups = parseRobots(text);
  return AGENT_TOKENS.every((token) => {
    const group = groups.get(token) ?? groups.get('*');
    return !group || groupAllows(group, path);
  });
}

// ponytail: two labels, or three when the suffix is a ccTLD like .com.au.
// No public-suffix list — swap one in if a real publisher ever slips through
// as two domains (or two publishers collapse into one).
const CCTLD_SECOND_LEVELS = new Set(['com', 'net', 'org', 'co', 'gov', 'edu', 'ac', 'id']);

/** The registrable domain. Two sources are independent when these differ. */
export function publisher(url) {
  const labels = new URL(url).hostname.toLowerCase().split('.');
  const threeParts =
    labels.length > 2 &&
    labels[labels.length - 1].length === 2 &&
    CCTLD_SECOND_LEVELS.has(labels[labels.length - 2]);
  return labels.slice(threeParts ? -3 : -2).join('.');
}

// ADR 0012 avoids UK/EU sources: the EU/EEA database right protects a
// compilation Australia would leave free, so reading one buys a claim we have
// no answer to. The ccTLD is the cheap tell — the search prompt asks for AU/US
// publishers on top of it.
// ponytail: a UK/EU publisher on a .com slips through. Add a host list if one
// ever does; a registry lookup is not worth it for a regional filter.
const DATABASE_RIGHT_TLD =
  /\.(uk|ie|de|fr|es|it|nl|be|lu|pt|at|dk|se|fi|no|is|pl|cz|sk|hu|ro|bg|gr|hr|si|ee|lv|lt|cy|mt|eu)$/;

/** True when the URL's ccTLD puts its publisher under the EU/EEA database right. */
const databaseRightRegion = (url) => DATABASE_RIGHT_TLD.test(new URL(url).hostname.toLowerCase());

const ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", '#x27': "'" };

/** HTML to plain text — enough for the overlap check's word shingles. */
export function htmlToText(html) {
  return html
    .replace(/<(script|style|noscript|svg|iframe)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(p|li|br|div|h[1-6]|tr)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(nbsp|amp|lt|gt|quot|#39|#x27);/g, (whole, name) => ENTITIES[name] ?? whole)
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

export const slugify = (dish) =>
  dish
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * Read one dish into a Fact Record.
 *
 * Returns `{ record, captures }` — `captures` is the raw source text, in
 * memory, for the overlap check that runs before the run ends. Nothing writes
 * it to disk, which is how ADR 0012's "raw source text does not survive the
 * run" is kept true by construction rather than by a cleanup step.
 *
 * Throws `PUBLISHER_FLOOR_UNMET` rather than emit a thin record.
 */
export async function readDish(dish, options = {}) {
  const {
    minPublishers = MIN_PUBLISHERS,
    search = searchByDishName,
    get = httpGet,
    extract = extractFacts,
  } = options;

  const candidates = await search(dish);
  const captures = [];
  const skipped = [];
  const robots = new Map();
  const seen = new Set();

  for (const candidate of candidates) {
    if (captures.length >= minPublishers) break;
    // A redirect re-enters this loop at its target rather than being followed,
    // so the host that finally answers has cleared its own robots.txt and
    // counts as its own publisher.
    let url = candidate.url;
    for (let hops = 0; ; hops++) {
      // A search result is untrusted model output and a Location header is
      // untrusted server text: one that will not parse is a spent candidate,
      // not a dead dish.
      if (!URL.canParse(url)) {
        skipped.push({ publisher: null, url, reason: 'bad-url' });
        break;
      }
      const name = publisher(url);
      if (seen.has(name)) break;
      if (hops > MAX_REDIRECTS) {
        skipped.push({ publisher: name, url, reason: 'redirect-loop' });
        break;
      }
      if (databaseRightRegion(url)) {
        seen.add(name);
        skipped.push({ publisher: name, url, reason: 'region-excluded' });
        break;
      }

      const { origin, pathname, search: query } = new URL(url);
      if (!robots.has(origin)) robots.set(origin, await tryGet(get, `${origin}/robots.txt`));
      const robotsResponse = robots.get(origin);
      // Only a 2xx is a robots.txt we read, and only a 404/410 is one that is
      // genuinely absent — that one leaves us unrestricted. Everything else is a
      // file we never read: a redirect (an apex that canonicalises to www), a
      // 403 or 429 from a bot-hostile CDN, a 5xx, a throw (DNS, reset, timeout).
      // We cannot claim to have honoured what we never read, so all of it skips.
      const status = robotsResponse?.status ?? 0;
      const readable = status >= 200 && status < 300;
      if (!readable && status !== 404 && status !== 410) {
        seen.add(name);
        skipped.push({ publisher: name, url, reason: 'robots-unreachable' });
        break;
      }
      if (readable && !robotsAllows(robotsResponse.body, pathname + query)) {
        seen.add(name);
        skipped.push({ publisher: name, url, reason: 'robots-disallowed' });
        break;
      }

      const page = await tryGet(get, url);
      if (page?.location && page.status >= 300 && page.status < 400) {
        // A Location that will not resolve re-enters at the guard above.
        url = URL.canParse(page.location, url) ? new URL(page.location, url).href : page.location;
        continue;
      }
      // A redirect we cannot follow is as unusable as a 404 — and is never a page.
      if (!page || page.status >= 300) {
        const reason = page ? `fetch-${page.status}` : 'fetch-error';
        skipped.push({ publisher: name, url, reason });
        break;
      }
      seen.add(name);
      captures.push({ url, publisher: name, text: htmlToText(page.body) });
      break;
    }
  }

  if (captures.length < minPublishers) {
    throw new Error(
      `PUBLISHER_FLOOR_UNMET: ${dish} reached ${captures.length} of ${minPublishers} independent publishers`
    );
  }

  const accessed = new Date().toISOString().slice(0, 10);
  const facts = await extract(dish, captures);
  return {
    record: {
      slug: slugify(dish),
      dish,
      sources: captures.map(({ url, publisher: name }) => ({
        url,
        publisher: name,
        accessed,
        robots_ok: true,
      })),
      skipped,
      ...facts,
    },
    captures,
  };
}

const MAX_REDIRECTS = 5;

/**
 * Default fetch: one request, our own user agent, and no automatic redirect —
 * following one would fetch a host whose robots.txt was never read, then file
 * the capture under the pre-redirect publisher with `robots_ok: true`. The
 * caller re-enters its candidate loop on `location` instead.
 */
async function httpGet(url) {
  const response = await fetch(url, {
    headers: { 'user-agent': USER_AGENT },
    redirect: 'manual',
    signal: AbortSignal.timeout(30_000),
  });
  return {
    status: response.status,
    location: response.headers.get('location'),
    body: response.ok ? await response.text() : '',
  };
}

/** A throw — DNS, reset, the timeout — is one spent candidate, not a dead dish. */
async function tryGet(get, url) {
  try {
    return await get(url);
  } catch {
    return null;
  }
}

const MODEL = 'claude-opus-5';

/**
 * Default search: the dish name, nothing else. Only the result URLs are used —
 * the pages themselves are fetched here, behind the robots check, so the
 * refusal cannot be bypassed by whatever the search tool read.
 */
async function searchByDishName(dish, client = new Anthropic()) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 2 }],
    messages: [
      {
        role: 'user',
        content:
          `Search the web for published recipes for the dish "${dish}". Search by the dish ` +
          `name alone. Do not open, list or search within any single site's index, category ` +
          `or sitemap pages. Prefer Australian and United States publishers — UK and EU ` +
          `results are discarded unread. Return nothing but the search results.`,
      },
    ],
  });

  const results = [];
  for (const block of response.content) {
    if (block.type !== 'web_search_tool_result' || !Array.isArray(block.content)) continue;
    for (const result of block.content) {
      if (result.type === 'web_search_result')
        results.push({ url: result.url, title: result.title });
    }
  }
  return results;
}

const FACT_SCHEMA = {
  type: 'object',
  properties: {
    canonicalIngredients: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          essential: { type: 'boolean' },
          observations: { type: 'array', items: { type: 'string' } },
        },
        required: ['name', 'essential', 'observations'],
        additionalProperties: false,
      },
    },
    causalSequence: { type: 'array', items: { type: 'string' } },
    techniqueFacts: { type: 'array', items: { type: 'string' } },
    servingsObserved: { type: 'array', items: { type: 'integer' } },
  },
  required: ['canonicalIngredients', 'causalSequence', 'techniqueFacts', 'servingsObserved'],
  additionalProperties: false,
};

const EXTRACTION_RULES = `You are the reading stage of a recipe corpus pipeline. You take facts only.

Emit no prose. Every field is a fact observed across the sources, never a source's own
wording:
- canonicalIngredients: the dish's ingredient set under plain Australian names. essential is
  true when most sources carry it. observations are the raw quantity fragments, each tagged
  with its source index, e.g. "500 g (s0)".
- causalSequence: the method as terse functional clauses ("brown mince in batches", "add
  stock; simmer 45 min"). Never a sentence from a source.
- techniqueFacts: what the sources agree or differ on and why it matters, with source counts.
- servingsObserved: the servings each source states, in source order.

Nothing you write here is ever published. A later stage authors the recipe from this record
with every source closed, so anything you copy verbatim becomes a defect there.`;

/** Default extraction: the facts, from the captured text, in one call. */
async function extractFacts(dish, captures, client = new Anthropic()) {
  // Streamed: three full pages in, and thinking shares the output budget, so a
  // non-streaming call is the one most likely to trip the request timeout.
  const response = await client.messages
    .stream({
      model: MODEL,
      max_tokens: 64000,
      thinking: { type: 'adaptive' },
      system: EXTRACTION_RULES,
      output_config: { format: { type: 'json_schema', schema: FACT_SCHEMA } },
      messages: [
        {
          role: 'user',
          content:
            `Dish: ${dish}\n\n` +
            captures.map((c, i) => `=== s${i} ${c.url} ===\n${c.text}`).join('\n\n'),
        },
      ],
    })
    .finalMessage();

  // A truncation (`max_tokens`) or a refusal arrives as a 200 with a half-written
  // body. Parsing it blind blames JSON for reads that are already spent.
  if (response.stop_reason !== 'end_turn') {
    throw new Error(`EXTRACTION_INCOMPLETE: ${dish} stopped on ${response.stop_reason}`);
  }

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
  return JSON.parse(text);
}

// CLI: read-dish.mjs "<dish>" [--out path]
// Without --out the Fact Record goes to stdout, so a run writes nothing at all.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [dish, ...rest] = process.argv.slice(2);
  if (!dish) {
    console.error('usage: read-dish.mjs "<dish>" [--out path]');
    process.exit(2);
  }
  const flag = rest.indexOf('--out');
  const out = flag === -1 ? undefined : rest[flag + 1];

  const { record } = await readDish(dish);
  const json = `${JSON.stringify(record, null, 2)}\n`;
  if (out) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, json);
    console.error(`${out}: ${record.sources.length} sources, ${record.skipped.length} skipped`);
  } else {
    process.stdout.write(json);
  }
}
