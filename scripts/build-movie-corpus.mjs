#!/usr/bin/env node
// The Watch Branch's Movie corpus builder (#369, ADR 0014). Asks TMDB for the
// best-known films and series and writes backend/movies/movies.json — the
// committed corpus the Movie Deck is dealt from. Reference data (ADR 0011):
// reviewed in a pull request, shipped with the deploy, read in memory. Nothing
// at runtime calls TMDB; the key exists only where this script runs.
//
// TMDB's terms allow non-commercial use with attribution and forbid caching
// its data for longer than six months, so the corpus is rebuilt at least
// quarterly (.github/workflows/movie-corpus.yml) and reviewed like any batch.
//
// Seeds are /discover pages sorted by vote count, taken until the target.
// ponytail: vote_count.desc, not popularity — popularity is a daily trending
// signal that would fill the file with this month's releases.
// ponytail: English-original only; a language axis on the Mood is the upgrade
// if anime or K-drama demand shows.
//
// Operator vehicle: ~6,000 detail calls in batches of 20 at ~30 a second is
// about four minutes; one retry on 429/5xx, Retry-After honoured. The summary
// names any chip that would deal nothing — MovieDeckService's unit test pins
// that, so fix it here (or in shared/types/watch.ts) before committing. The
// pure functions below are asserted by build-movie-corpus.test.mjs.
//
//   TMDB_API_KEY=… node scripts/build-movie-corpus.mjs

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'backend', 'movies', 'movies.json');
const API = 'https://api.themoviedb.org/3';
const POSTER = 'https://image.tmdb.org/t/p/w500';
/** Nothing older than the 1950s chip. */
const FLOOR = '1950-01-01';
export const TARGETS = { movie: 5000, tv: 1000 };
/** TV genres a table does not sit down to, excluded at the query: News, Reality, Soap, Talk. */
const TV_EXCLUDED_GENRE_IDS = '10763,10764,10766,10767';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chunk = (a, n) =>
  Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, (i + 1) * n));

// TMDB's genre names → the chip vocabulary shared/types/watch.ts offers.
// GENRES there is exactly the set the emitted corpus contains: the loader
// refuses anything else at boot, so a name missing here is dropped and
// tallied rather than emitted — 'TV Movie' deliberately.
export const GENRE_MAP = {
  Action: ['Action'],
  Adventure: ['Adventure'],
  Animation: ['Animation'],
  Comedy: ['Comedy'],
  Crime: ['Crime'],
  Documentary: ['Documentary'],
  Drama: ['Drama'],
  Family: ['Family'],
  Fantasy: ['Fantasy'],
  History: ['History'],
  Horror: ['Horror'],
  Music: ['Music'],
  Mystery: ['Mystery'],
  Romance: ['Romance'],
  'Science Fiction': ['Sci-Fi'],
  Thriller: ['Thriller'],
  War: ['War'],
  Western: ['Western'],
  // Television's compound genres, split onto the film chips.
  'Action & Adventure': ['Action', 'Adventure'],
  Kids: ['Family'],
  'Sci-Fi & Fantasy': ['Sci-Fi', 'Fantasy'],
  'War & Politics': ['War'],
};
const CHIPS = [...new Set(Object.values(GENRE_MAP).flat())];

/** TMDB genre names → at most four chip genres in TMDB's order, unknown names dropped. */
export function toGenres(names) {
  const out = [];
  for (const name of names) {
    for (const genre of GENRE_MAP[name] ?? []) if (!out.includes(genre)) out.push(genre);
  }
  return out.slice(0, 4);
}

/** The official YouTube trailer, else any YouTube trailer, else null. */
export function trailerUrl(videos = []) {
  const trailers = videos.filter(
    (v) => v.site === 'YouTube' && v.type === 'Trailer' && /^[\w-]{11}$/.test(v.key ?? '')
  );
  const pick = trailers.find((v) => v.official) ?? trailers[0];
  return pick ? `https://www.youtube.com/watch?v=${pick.key}` : null;
}

const trimOverview = (s = '') => {
  s = s.replace(/\s+/g, ' ').trim();
  return s.length <= 300 ? s : `${s.slice(0, 300).replace(/\s+\S*$/, '')}…`;
};

/**
 * A /movie or /tv detail (external_ids and videos appended) → the shared
 * `Movie` shape with absent facts omitted, or the reason it is unusable.
 * `rating` is vote_average × 10 on the 0–100 scale the Top Pick rung compares
 * on; a zero means no votes and is omitted rather than crowned last.
 */
export function toMovie(detail, mediaType) {
  const date = mediaType === 'tv' ? detail.first_air_date : detail.release_date;
  const year = Number(date?.slice(0, 4));
  if (!detail.poster_path) return { drop: 'no poster' };
  if (!year) return { drop: 'no year' };
  // A title no genre chip can reach only ever deals into an any-genre Mood.
  const genres = toGenres((detail.genres ?? []).map((g) => g.name));
  if (genres.length === 0) return { drop: 'no genres' };
  const runtime = mediaType === 'tv' ? detail.episode_run_time?.[0] : detail.runtime;
  const rating = Math.round((detail.vote_average ?? 0) * 10);
  const imdbId = detail.external_ids?.imdb_id;
  const movie = {
    kind: 'movie',
    placeId: `tmdb:${mediaType}:${detail.id}`,
    mediaType,
    name: mediaType === 'tv' ? detail.name : detail.title,
    year,
    genres,
    runtimeMinutes: runtime > 0 ? Math.round(runtime) : undefined,
    seasons:
      mediaType === 'tv' && detail.number_of_seasons > 0 ? detail.number_of_seasons : undefined,
    rating: rating > 0 ? rating : undefined,
    overview: trimOverview(detail.overview) || undefined,
    photoUrl: `${POSTER}${detail.poster_path}`,
    trailerUrl: trailerUrl(detail.videos?.results) ?? undefined,
    imdbId: /^tt\d+$/.test(imdbId ?? '') ? imdbId : undefined,
  };
  return { movie: Object.fromEntries(Object.entries(movie).filter(([, v]) => v !== undefined)) };
}

/**
 * TMDB is community-edited and the render sites trust these fields verbatim
 * (`<img src>`, `<a href>`), so the builder is the trust boundary: the reason
 * a record is unsafe, else null. The loader's schema re-checks the same at boot.
 */
export function unsafeReason({ placeId, name, photoUrl, trailerUrl: trailer, imdbId }) {
  if (!/^tmdb:(movie|tv):\d+$/.test(placeId ?? '')) return 'bad id';
  if (typeof name !== 'string' || !name.trim()) return 'no name';
  let poster;
  try {
    poster = new URL(photoUrl);
  } catch {
    return 'poster not a URL';
  }
  if (poster.protocol !== 'https:' || poster.host !== 'image.tmdb.org') {
    return 'poster off image.tmdb.org';
  }
  if (!/^\/t\/p\/w500\/[\w-]+\.(jpe?g|png)$/i.test(poster.pathname)) return 'odd poster path';
  if (trailer != null && !/^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}$/.test(trailer)) {
    return 'bad trailer';
  }
  if (imdbId != null && !/^tt\d+$/.test(imdbId)) return 'bad imdb id';
  return null;
}

/** The JSON the backend reads at boot: one Movie per line, so a rebuild diffs Movie by Movie. */
export function emitCorpus(movies) {
  return `[\n${movies.map((m) => JSON.stringify(m)).join(',\n')}\n]\n`;
}

// One retry on 429 (Retry-After) or 5xx; anything else is the operator's to
// read. The key rides the query string, so errors name the path, never the URL.
async function tmdb(key, path, params = {}, attempt = 0) {
  const url = `${API}${path}?${new URLSearchParams({ ...params, api_key: key })}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (res.ok) return res.json();
  if (attempt === 0 && (res.status === 429 || res.status >= 500)) {
    await sleep(res.status === 429 ? Number(res.headers.get('retry-after') ?? 3) * 1000 : 3000);
    return tmdb(key, path, params, 1);
  }
  throw new Error(`HTTP ${res.status} for ${path}`);
}

async function discover(key, type) {
  const ids = [];
  const dateKey = type === 'tv' ? 'first_air_date.gte' : 'primary_release_date.gte';
  for (let page = 1; ids.length < TARGETS[type] && page <= 500; page++) {
    const { results, total_pages } = await tmdb(key, `/discover/${type}`, {
      sort_by: 'vote_count.desc',
      include_adult: 'false',
      with_original_language: 'en',
      [dateKey]: FLOOR,
      page,
      ...(type === 'tv'
        ? { without_genres: TV_EXCLUDED_GENRE_IDS, include_null_first_air_dates: 'false' }
        : { include_video: 'false' }),
    });
    ids.push(...results.map((r) => r.id));
    process.stderr.write(`${type} seeds ${ids.length}/${TARGETS[type]}\r`);
    if (page >= total_pages) break;
  }
  return ids.slice(0, TARGETS[type]);
}

async function main() {
  const key = process.env.TMDB_API_KEY;
  if (!key) {
    console.error(
      'TMDB_API_KEY is not set — a free key is at https://www.themoviedb.org/settings/api'
    );
    process.exit(1);
  }
  const kept = [];
  const dropped = {};
  const drop = (why, what) => (dropped[why] ??= []).push(what);
  for (const type of ['movie', 'tv']) {
    const ids = await discover(key, type);
    let done = 0;
    for (const batch of chunk(ids, 20)) {
      const details = await Promise.all(
        batch.map((id) =>
          tmdb(key, `/${type}/${id}`, { append_to_response: 'external_ids,videos' })
        )
      );
      for (const detail of details) {
        const { movie, drop: why } = toMovie(detail, type);
        const unsafe = movie && unsafeReason(movie);
        if (why || unsafe)
          drop(why ?? unsafe, `${type}:${detail.id} ${detail.title ?? detail.name}`);
        else kept.push({ movie, votes: detail.vote_count ?? 0 });
      }
      done += batch.length;
      process.stderr.write(`${type} details ${done}/${ids.length}        \r`);
      await sleep(600);
    }
  }
  // Best-known first — the deal reads the file in order — then A–Z so a tie
  // cannot reorder the diff between rebuilds. Discover pages can shift under a
  // run, so the same id may arrive twice; the second copy is dropped.
  kept.sort((a, b) => b.votes - a.votes || a.movie.name.localeCompare(b.movie.name, 'en'));
  const seen = new Set();
  const movies = kept
    .map((k) => k.movie)
    .filter((m) => !seen.has(m.placeId) && seen.add(m.placeId));

  writeFileSync(OUT, emitCorpus(movies));
  const count = (f) =>
    Object.entries(movies.flatMap(f).reduce((h, k) => ((h[k] = (h[k] ?? 0) + 1), h), {}));
  const hist = (f) =>
    count(f)
      .sort()
      .map(([k, n]) => `${k} ${n}`)
      .join(', ');
  const by = (t) => movies.filter((m) => m.mediaType === t).length;
  console.log(`\nkept ${movies.length} (${by('movie')} films, ${by('tv')} series) → ${OUT}`);
  for (const [why, whats] of Object.entries(dropped)) {
    console.log(
      `dropped (${why}) ${whats.length}: ${whats.slice(0, 5).join('; ')}${whats.length > 5 ? '; …' : ''}`
    );
  }
  console.log(`genres: ${hist((m) => (m.genres.length ? m.genres : ['(none)']))}`);
  console.log(`decades: ${hist((m) => [`${Math.floor(m.year / 10) * 10}s`])}`);
  const has = (k) => movies.filter((m) => m[k] !== undefined).length;
  console.log(
    `rating ${has('rating')}, trailer ${has('trailerUrl')}, runtime ${has('runtimeMinutes')}, imdb ${has('imdbId')}`
  );
  const genresSeen = new Set(movies.flatMap((m) => m.genres));
  const empty = CHIPS.filter((chip) => !genresSeen.has(chip));
  if (empty.length)
    console.log(`CHIPS WITH NO TITLES (the unit test will fail): ${empty.join(', ')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
