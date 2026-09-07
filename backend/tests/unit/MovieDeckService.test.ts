// MovieDeckService unit tests — pure functions over the committed corpus, with
// the shuffle stubbed to identity so every assertion is about the cut (#369).
// The unit project sets no MOVIES_FILE override, so `loadMovieCorpus()` here
// reads the batch that actually ships — the one place it is pinned.
import { describe, expect, it } from 'vitest';
import { DECADES, GENRES, MEDIA_TYPES, type Mood, type Movie } from '@dinder/shared/types';
import {
  DECK_SIZE,
  POOL_CAP,
  corpusMovieSource,
  dealMovieDeck,
  decadeOf,
  loadMovieCorpus,
  redealMovieDeck,
} from '../../src/services/MovieDeckService.js';

const MOVIES = loadMovieCorpus();
const source = corpusMovieSource(MOVIES);
const identity = <T>(entries: readonly T[]) => [...entries];
const reversed = <T>(entries: readonly T[]) => [...entries].reverse();
const anything: Mood = { genres: [], decades: [] };

const stub = (n: number, mediaType: 'movie' | 'tv' = 'movie'): Movie[] =>
  Array.from({ length: n }, (_, i) => ({
    kind: 'movie',
    placeId: `tmdb:${mediaType}:${i + 1}`,
    mediaType,
    name: `Title ${i + 1}`,
    year: 1990 + (i % 30),
    genres: ['Comedy'],
  }));

describe('the committed corpus', () => {
  // The chips are exactly the corpus's vocabulary: a chip that could deal
  // nothing is not offered, and a genre the builder starts emitting must be
  // offered. Rebuild the corpus or edit shared/types/watch.ts — never one alone.
  it('speaks exactly the GENRES, DECADES and MEDIA_TYPES the setup screen offers', () => {
    const genres = new Set(MOVIES.flatMap((movie) => movie.genres ?? []));
    expect([...genres].sort()).toEqual([...GENRES].sort());
    const decades = new Set(MOVIES.map((movie) => decadeOf(movie.year ?? 0)));
    expect([...decades].sort()).toEqual([...DECADES].sort());
    const mediaTypes = new Set(MOVIES.map((movie) => movie.mediaType));
    expect([...mediaTypes].sort()).toEqual([...MEDIA_TYPES].sort());
  });

  it('carries what a card renders, keyed by a distinct TMDB id', () => {
    for (const movie of MOVIES) {
      expect(movie).toMatchObject({
        kind: 'movie',
        placeId: expect.stringMatching(/^tmdb:(movie|tv):\d+$/),
        mediaType: movie.placeId.split(':')[1],
        name: expect.any(String),
        photoUrl: expect.stringMatching(/^https:\/\/image\.tmdb\.org\/t\/p\/w500\//),
        year: expect.any(Number),
        overview: expect.any(String),
      });
      if (movie.mediaType === 'movie') expect(movie.seasons).toBeUndefined();
    }
    expect(new Set(MOVIES.map((movie) => movie.placeId)).size).toBe(MOVIES.length);
  });

  it('is in the thousands, films and series both', () => {
    expect(MOVIES.filter((movie) => movie.mediaType === 'movie').length).toBeGreaterThan(3000);
    expect(MOVIES.filter((movie) => movie.mediaType === 'tv').length).toBeGreaterThan(500);
  });
});

describe('corpusMovieSource', () => {
  const film = stub(1)[0];
  const series = { ...stub(1, 'tv')[0], year: 2011 };
  const three = corpusMovieSource([
    film,
    series,
    { ...stub(1)[0], placeId: 'tmdb:movie:9', year: 1975 },
  ]);

  it('deals both films and series when the media-type axis is empty or absent', () => {
    expect(three(anything)).toHaveLength(3);
    expect(three({ ...anything, mediaTypes: [] })).toHaveLength(3);
  });

  it('deals only the chosen media type', () => {
    expect(three({ ...anything, mediaTypes: ['tv'] })).toEqual([series]);
    expect(three({ ...anything, mediaTypes: ['movie'] })).toHaveLength(2);
  });

  it('reads a Movie with no mediaType as a film', () => {
    const { mediaType: _m, ...legacy } = film;
    expect(corpusMovieSource([legacy])({ ...anything, mediaTypes: ['movie'] })).toEqual([legacy]);
    expect(corpusMovieSource([legacy])({ ...anything, mediaTypes: ['tv'] })).toEqual([]);
  });

  it('deals none for a Mood the corpus cannot answer', () => {
    // In vocabulary on both axes, empty by fact: no 1970s documentary here.
    expect(three({ genres: ['Documentary'], decades: ['1970s'] })).toEqual([]);
  });
});

describe('dealMovieDeck', () => {
  it('deals at most a Deck, every Movie matching every axis of the Mood', () => {
    const mood: Mood = { genres: ['Comedy', 'Horror'], decades: ['1990s'], mediaTypes: ['movie'] };

    const deck = dealMovieDeck(mood, { source, shuffle: identity }) as Movie[];

    expect(deck).toHaveLength(DECK_SIZE);
    for (const movie of deck) {
      expect(movie.kind).toBe('movie');
      expect(movie.mediaType).toBe('movie');
      expect(movie.genres?.some((genre) => genre === 'Comedy' || genre === 'Horror')).toBe(true);
      expect(decadeOf(movie.year ?? 0)).toBe('1990s');
    }
  });

  it('deals the best-known titles within each media type when the Mood filters nothing', () => {
    expect(source(anything)).toHaveLength(MOVIES.length);
    const deck = dealMovieDeck(anything, { source, shuffle: identity }) as Movie[];
    expect(deck.filter((m) => m.mediaType === 'movie')).toEqual(
      MOVIES.filter((m) => m.mediaType === 'movie').slice(0, 8)
    );
    expect(deck.filter((m) => m.mediaType === 'tv')).toEqual(
      MOVIES.filter((m) => m.mediaType === 'tv').slice(0, 7)
    );
    // The real shuffle deals a whole Deck too — the cut is after the shuffle.
    expect(dealMovieDeck(anything, { source })).toHaveLength(DECK_SIZE);
  });

  it('shuffles only the first POOL_CAP matches, so a broad Mood never deals the obscure', () => {
    const many = stub(POOL_CAP * 3);

    const deck = dealMovieDeck(anything, { source: () => many, shuffle: reversed });

    // Reversed within the cap: the cap's last title comes first, nothing past it appears.
    expect(deck).toEqual(many.slice(POOL_CAP - DECK_SIZE, POOL_CAP));
  });

  it('deals none for a Mood the corpus cannot answer', () => {
    expect(dealMovieDeck(anything, { source: () => [] })).toEqual([]);
  });
});

describe('redealMovieDeck', () => {
  it('leads with the Movies the wiped Deck did not show', () => {
    const first = dealMovieDeck(anything, { source, shuffle: identity });

    const next = redealMovieDeck(anything, first, { source, shuffle: identity });

    expect(next).toHaveLength(DECK_SIZE);
    expect(next.some((m) => first.some((old) => old.placeId === m.placeId))).toBe(false);
  });

  it('repeats only once the Mood has run out of unshown Movies', () => {
    const pool = stub(DECK_SIZE + 5);
    const first = dealMovieDeck(anything, { source: () => pool, shuffle: identity });

    const next = redealMovieDeck(anything, first, { source: () => pool, shuffle: identity });

    expect(next).toHaveLength(DECK_SIZE);
    expect(next.slice(0, 5)).toEqual(pool.slice(DECK_SIZE, DECK_SIZE + 5));
    expect(next.slice(5)).toEqual(pool.slice(0, DECK_SIZE - 5));
  });

  it('reshuffles the wiped Deck rather than dealing nothing when the Mood stops matching', () => {
    // Only a redeploy shrinking the corpus under a live Session gets here; a
    // Restart never leaves a Session without a Deck.
    const current = stub(3);
    expect(redealMovieDeck(anything, current, { source: () => [], shuffle: identity })).toEqual(
      current
    );
  });
});

describe('collaborative media allocation', () => {
  it.each([1, 5, 6, 15])(
    'balances both types from a movie-dominated corpus for size %i',
    (deckSize) => {
      const source = corpusMovieSource([...stub(500), ...stub(40, 'tv')]);
      const deck = dealMovieDeck(
        { genres: ['Comedy'], decades: ['1990s'], mediaTypes: ['movie', 'tv'] },
        { source, shuffle: identity, deckSize }
      );
      const films = deck.filter((m) => m.kind === 'movie' && m.mediaType === 'movie').length;
      expect(Math.abs(films - (deck.length - films))).toBeLessThanOrEqual(1);
      expect(deck).toHaveLength(deckSize);
      expect(new Set(deck.map((m) => m.placeId)).size).toBe(deckSize);
    }
  );

  it('fills scarce series with movies without inventing entries', () => {
    const deck = dealMovieDeck(anything, {
      source: corpusMovieSource([...stub(100), ...stub(2, 'tv')]),
      deckSize: 15,
      shuffle: identity,
    });
    expect(deck.filter((m) => m.kind === 'movie' && m.mediaType === 'tv')).toHaveLength(2);
    expect(deck).toHaveLength(15);
  });

  it('gives two people equal turns despite unequal genre counts, and retains both decades', () => {
    const action = stub(40).map((m) => ({
      ...m,
      year: 1995,
      genres: ['Action', 'Adventure', 'Comedy'],
    }));
    const music = stub(40).map((m) => ({
      ...m,
      placeId: `music:${m.placeId}`,
      year: 2024,
      genres: ['Music'],
    }));
    const interests: Mood[] = [
      { genres: ['Action', 'Adventure', 'Comedy'], decades: ['1990s'], mediaTypes: ['movie'] },
      { genres: ['Music'], decades: ['2020s'], mediaTypes: ['movie'] },
    ];
    const deck = dealMovieDeck(anything, {
      source: corpusMovieSource([...action, ...music]),
      interests,
      deckSize: 10,
      shuffle: identity,
    });
    expect(deck.filter((m) => m.placeId.startsWith('music:'))).toHaveLength(5);
    expect(deck).toHaveLength(10);
  });

  it('uses fresh overlapping interests before repeating another participant’s previous title', () => {
    const a = { ...stub(1)[0], genres: ['Action'] };
    const b = { ...stub(1)[0], placeId: 'fresh', genres: ['Music'] };
    const interests: Mood[] = [
      { genres: ['Action'], decades: [] },
      { genres: ['Music'], decades: [] },
    ];
    const next = redealMovieDeck(anything, [a], {
      source: corpusMovieSource([a, b]),
      deckSize: 1,
      interests,
      shuffle: identity,
    });
    expect(next).toEqual([b]);
  });
});
