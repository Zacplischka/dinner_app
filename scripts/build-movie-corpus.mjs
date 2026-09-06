#!/usr/bin/env node
// The Watch Branch's movie corpus builder (#369). Turns the seed list in
// movie-titles.json into backend/src/data/movies.generated.ts — the committed,
// pre-enriched ~300-Movie corpus the Movie Deck is dealt from. Reference data
// (ADR 0011): reviewed in a pull request, shipped with the deploy, read in
// memory; nothing at runtime calls Wikipedia or Wikidata.
//
// Sources, both keyless behind a descriptive User-Agent: the en.wikipedia
// Action API (poster thumbnail, intro extract, QID) and Wikidata SPARQL (year,
// runtime, genres, critics score, trailer id). The rating is a critics score
// on one 0–100 scale — the Rotten Tomatoes Tomatometer %, else Metacritic's
// Metascore, else absent — so the Top Pick's middle rung compares like with
// like; IMDb's 0–10 covered a third of the seeds and sat on a different scale.
//
// Operator vehicle, run by a human, occasionally (~30 s, sequential, 200 ms
// apart, one retry on 429/5xx). The summary lists any seed that went missing or
// redirected — fix movie-titles.json to the printed target so the seed list
// stays canonical (a franchise or disambiguation page silently yields the wrong
// QID). The pure functions below are asserted by build-movie-corpus.test.mjs.
//
//   node scripts/build-movie-corpus.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SEEDS = join(here, 'movie-titles.json');
const OUT = join(here, '..', 'backend', 'src', 'data', 'movies.generated.ts');
const UA = 'Dinder/1.0 (https://www.dinder.it.com; movie corpus builder)';
const WIKI = 'https://en.wikipedia.org/w/api.php';
const WDQS = 'https://query.wikidata.org/sparql';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chunk = (a, n) =>
  Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, (i + 1) * n));

// Sequential, ~200 ms apart, one retry on 429/5xx (API:Etiquette says serialise, don't hammer).
async function getJson(url, accept = 'application/json') {
  for (let attempt = 0; ; attempt++) {
    await sleep(200);
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept } });
    if (res.ok) return res.json();
    if (attempt === 0 && (res.status === 429 || res.status >= 500)) {
      await sleep(3000);
      continue;
    }
    throw new Error(`HTTP ${res.status} for ${url.slice(0, 160)}`);
  }
}

// extracts caps at 20 pages/request when exintro is set, so 20 titles per call. Follows `continue`.
async function wikiBatch(titles) {
  const base = {
    action: 'query',
    format: 'json',
    formatversion: '2',
    redirects: '1',
    titles: titles.join('|'),
    prop: 'pageimages|pageprops|extracts|info',
    piprop: 'thumbnail',
    pithumbsize: '600',
    pilicense: 'any',
    pilimit: '50',
    ppprop: 'wikibase_item',
    exintro: '1',
    explaintext: '1',
    exsentences: '2',
    exlimit: '20',
    inprop: 'url',
  };
  const pages = new Map();
  const redirects = [];
  let cont = {};
  do {
    const { query, continue: next } = await getJson(
      `${WIKI}?${new URLSearchParams({ ...base, ...cont })}`
    );
    for (const p of query.pages) pages.set(p.title, { ...pages.get(p.title), ...p });
    redirects.push(...(query.redirects ?? []));
    cont = next;
  } while (cont);
  return { pages: [...pages.values()], redirects };
}

const sparql = (qids) => `
SELECT ?film (MIN(?dur) AS ?runtime) (MIN(?y) AS ?year)
  (GROUP_CONCAT(DISTINCT ?gl; separator="|") AS ?genres) (GROUP_CONCAT(DISTINCT ?cl; separator="|") AS ?types)
  (SAMPLE(?rt) AS ?tomatometer) (SAMPLE(?mc) AS ?metacritic) (MIN(?yt) AS ?youtube)
WHERE {
  VALUES ?film { ${qids.map((q) => `wd:${q}`).join(' ')} }
  OPTIONAL { ?film wdt:P2047 ?dur . }
  OPTIONAL { ?film wdt:P577 ?d . BIND(YEAR(?d) AS ?y) }
  OPTIONAL { ?film wdt:P136 ?g . ?g rdfs:label ?gl FILTER(LANG(?gl) = "en") }
  OPTIONAL { ?film wdt:P31 ?c . ?c rdfs:label ?cl FILTER(LANG(?cl) = "en") }  # "animated feature film" lives here, not in P136
  OPTIONAL { ?film p:P444 ?s . ?s ps:P444 ?rt ; pq:P447 wd:Q105584 ; pq:P459 wd:Q108403393 . }  # Rotten Tomatoes, Tomatometer (not the 0–10 average of reviews)
  OPTIONAL { ?film p:P444 ?t . ?t ps:P444 ?mc ; pq:P447 wd:Q150248 . }  # Metacritic
  OPTIONAL { ?film wdt:P1651 ?yt . }
} GROUP BY ?film`;

// Wikidata's genre taxonomy is huge ("neo-noir", "isekai"); bucket by keyword,
// drop the rest. The names are the chip vocabulary shared/types/watch.ts
// offers — GENRES there is exactly the set the emitted corpus contains, which
// MovieDeckService's unit test pins.
export const GENRE_BUCKETS = [
  ['Animation', /animat|anime/],
  ['Documentary', /documentary/],
  ['War', /\bwar film|anti-war|military/],
  ['Musical', /musical/],
  ['Horror', /horror|slasher|zombie|ghost film|monster film|found footage/],
  [
    'Sci-Fi',
    /science fiction|sci-fi|cyberpunk|time.travel|dystopian|post-apocalyptic|space opera|kaiju|alien invasion/,
  ],
  ['Fantasy', /fantasy|fairy tale|sword and sorcery|isekai|magical/],
  ['Romance', /romanti|romance|chick flick/],
  ['Comedy', /comedy|comedic|parody|satir|mockumentary|buddy film|slapstick|screwball|stoner/],
  ['Thriller', /thriller|suspense|spy film|espionage|noir/],
  ['Mystery', /mystery|detective|whodunit/],
  ['Crime', /crime|gangster|heist|mafia|police|prison film/],
  ['Action', /(?<!live-)action|martial arts|superhero|disaster film|swashbuckl/],
  ['Adventure', /adventure|survival film|road movie|pirate film|treasure/],
  ['Family', /family film|children's/],
  [
    'Drama',
    /drama|biographical|biopic|historical|coming-of-age|sports film|period|legal film|tragedy|docudrama/,
  ],
];

/** Wikidata genre/type labels → at most four bucketed genres, most-hit first. */
export function bucketGenres(labels) {
  const hits = new Map();
  // Animation outweighs everything so the 4-genre cap never drops it (it's the filter people actually use).
  for (const label of labels) {
    for (const [name, re] of GENRE_BUCKETS) {
      if (re.test(label)) hits.set(name, (hits.get(name) ?? 0) + (name === 'Animation' ? 100 : 1));
    }
  }
  return [...hits]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name]) => name);
}

/**
 * P444 is a free string. The Tomatometer reads "94%", the Metascore "78/100";
 * either → 0–100, Tomatometer first. Anything else (Metacritic's "7.9/10" user
 * score, say) → null.
 */
export function criticsScore(tomatometer, metacritic) {
  const rt = /^(\d{1,3})%$/.exec(tomatometer?.trim() ?? '');
  if (rt) return Number(rt[1]);
  const mc = /^(\d{1,3})\/100$/.exec(metacritic?.trim() ?? '');
  return mc ? Number(mc[1]) : null;
}

/**
 * Wikipedia and Wikidata are publicly editable and the render sites trust
 * these three fields verbatim (`<img src>`, `<a href>`, a Wikidata link), so
 * the builder is the trust boundary: the reason a record is unsafe, else null.
 */
export function unsafeReason({ placeId, photoUrl, youtube }) {
  if (!/^Q\d+$/.test(placeId ?? '')) return 'bad QID';
  let poster;
  try {
    poster = new URL(photoUrl);
  } catch {
    return 'poster not a URL';
  }
  if (poster.protocol !== 'https:' || poster.host !== 'upload.wikimedia.org') {
    return 'poster off upload.wikimedia.org';
  }
  if (youtube != null && !/^[\w-]{11}$/.test(youtube)) return 'bad trailer id';
  return null;
}

const cleanTitle = (t) => t.replace(/\s*\((?:\d{4}\s+)?(?:[\w-]+\s+)?film\)$/i, '');
const trimOverview = (s = '') => {
  s = s.replace(/\s+/g, ' ').trim();
  return s.length <= 300 ? s : `${s.slice(0, 300).replace(/\s+\S*$/, '')}…`;
};

/**
 * The TypeScript module the backend imports: `MOVIES` in the shared `Movie`
 * shape (placeId = QID, name = title, photoUrl = poster). Absent facts are
 * omitted, never `null` — every optional on `Movie` is `?:`. One Movie per
 * line, so a rebuild diffs Movie by Movie.
 */
export function emitModule(movies, generatedOn) {
  const lines = movies.map((m) => `  ${JSON.stringify(m, (_k, v) => v ?? undefined)},`);
  return `// GENERATED FILE — DO NOT EDIT. Rebuilt by \`node scripts/build-movie-corpus.mjs\`
// from the seed list in scripts/movie-titles.json; generated ${generatedOn}.
//
// The Watch Branch's movie corpus (#369): reference data (ADR 0011), committed
// and shipped with the deploy, dealt in memory by MovieDeckService.
// ponytail: a static ${movies.length}-Movie corpus; TMDB behind the same MovieSource seam when it runs thin.
//
// Attribution. Overviews are the opening sentences of each Movie's English
// Wikipedia article, CC BY-SA 4.0 — the article for a Movie is
// https://www.wikidata.org/wiki/Special:GoToLinkedPage/enwiki/<placeId>.
// Posters are English Wikipedia's fair-use uploads, hot-linked at thumbnail
// size from upload.wikimedia.org — a fair-use call this app makes itself, not
// one it inherits from the article (ADR 0013; TMDB grants poster use with
// attribution when it takes the seam). Year, runtime, genres, critics score and
// trailer id are Wikidata (CC0); the rating is Wikidata's hand-entered snapshot
// of the Rotten Tomatoes Tomatometer (else Metacritic's Metascore), not live.
import type { Movie } from '@dinder/shared/types';

// prettier-ignore
export const MOVIES: readonly Movie[] = [
${lines.join('\n')}
];
`;
}

async function main() {
  const seeds = JSON.parse(readFileSync(SEEDS, 'utf8')).map((s) => s.wikiTitle);
  const pages = [];
  const redirects = [];
  for (const titles of chunk(seeds, 20)) {
    const r = await wikiBatch(titles);
    pages.push(...r.pages);
    redirects.push(...r.redirects);
    process.stderr.write(`wikipedia ${pages.length}/${seeds.length}\r`);
  }
  const withQid = pages.filter((p) => p.pageprops?.wikibase_item);
  const wd = new Map();
  for (const batch of chunk(
    withQid.map((p) => p.pageprops.wikibase_item),
    50
  )) {
    const url = `${WDQS}?${new URLSearchParams({ query: sparql(batch), format: 'json' })}`;
    const { results } = await getJson(url, 'application/sparql-results+json');
    for (const row of results.bindings) {
      const v = Object.fromEntries(Object.entries(row).map(([k, x]) => [k, x.value]));
      wd.set(v.film.split('/').pop(), v);
    }
    process.stderr.write(`wikidata ${wd.size}/${withQid.length}          \r`);
  }

  const dropped = {};
  const drop = (why, t) => {
    (dropped[why] ??= []).push(t);
  };
  const movies = [];
  for (const p of pages) {
    if (p.missing || p.invalid) {
      drop('missing page', p.title);
      continue;
    }
    const qid = p.pageprops?.wikibase_item;
    const w = wd.get(qid);
    if (!qid || !w) {
      drop('no wikidata item', p.title);
      continue;
    }
    if (!p.thumbnail?.source) {
      drop('no poster', p.title);
      continue;
    }
    if (!w.year) {
      drop('no year', p.title);
      continue;
    }
    const photoUrl = p.thumbnail.source.split('?')[0];
    const unsafe = unsafeReason({ placeId: qid, photoUrl, youtube: w.youtube });
    if (unsafe) {
      drop(unsafe, p.title);
      continue;
    }
    const runtime = Number(w.runtime) || null;
    movies.push({
      kind: 'movie',
      placeId: qid,
      name: cleanTitle(p.title),
      year: Number(w.year),
      // Sorted so GROUP_CONCAT's arbitrary order can't flip a tie in the 4-genre cut between rebuilds.
      genres: bucketGenres(`${w.genres ?? ''}|${w.types ?? ''}`.split('|').filter(Boolean).sort()),
      runtimeMinutes: runtime && runtime > 1000 ? Math.round(runtime / 60) : runtime, // P2047 sometimes in seconds
      rating: criticsScore(w.tomatometer, w.metacritic),
      overview: trimOverview(p.extract),
      photoUrl,
      trailerUrl: w.youtube ? `https://www.youtube.com/watch?v=${w.youtube}` : null,
    });
  }
  movies.sort((a, b) => a.name.localeCompare(b.name, 'en'));

  // Self-check: the Deck keys on placeId and shows photoUrl; neither may collide.
  const dup = (k) => movies.map((m) => m[k]).filter((v, i, a) => a.indexOf(v) !== i);
  if (dup('placeId').length || dup('photoUrl').length) {
    throw new Error(`duplicates: ${[...dup('placeId'), ...dup('photoUrl')]}`);
  }

  writeFileSync(OUT, emitModule(movies, new Date().toISOString().slice(0, 10)));
  const hist = (f) =>
    Object.entries(
      movies.flatMap(f).reduce((h, k) => ((h[k] = (h[k] ?? 0) + 1), h), {})
    )
      .sort()
      .map(([k, n]) => `${k} ${n}`)
      .join(', ');
  console.log(`\nkept ${movies.length} of ${seeds.length} seeds → ${OUT}`);
  for (const [why, ts] of Object.entries(dropped)) {
    console.log(`dropped (${why}) ${ts.length}: ${ts.join('; ')}`);
  }
  if (redirects.length) {
    console.log(
      `redirected ${redirects.length} (fix movie-titles.json): ${redirects.map((r) => `${r.from} → ${r.to}`).join('; ')}`
    );
  }
  console.log(`genres: ${hist((m) => (m.genres.length ? m.genres : ['(none)']))}`);
  console.log(`decades: ${hist((m) => [`${Math.floor(m.year / 10) * 10}s`])}`);
  console.log(
    `critics score ${movies.filter((m) => m.rating != null).length}, trailer ${movies.filter((m) => m.trailerUrl).length}, runtime ${movies.filter((m) => m.runtimeMinutes).length}`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
