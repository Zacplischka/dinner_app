// MovieDeckService unit tests — pure functions over the committed corpus, with
// the shuffle stubbed to identity so every assertion is about the cut (#369).
import { describe, expect, it } from 'vitest';
import { DECADES, GENRES, type Mood, type Movie } from '@dinder/shared/types';
import { MOVIES } from '../../src/data/movies.generated.js';
import {
  DECK_SIZE,
  corpusMovieSource,
  dealMovieDeck,
  decadeOf,
  redealMovieDeck,
} from '../../src/services/MovieDeckService.js';

const identity = <T>(entries: readonly T[]) => [...entries];
const anything: Mood = { genres: [], decades: [] };

describe('the committed corpus', () => {
  // The chips are exactly the corpus's vocabulary: a chip that could deal
  // nothing is not offered, and a genre the builder starts emitting must be
  // offered. Rebuild the corpus or edit shared/types/watch.ts — never one alone.
  it('speaks exactly the GENRES and DECADES the setup screen offers', () => {
    const genres = new Set(MOVIES.flatMap((movie) => movie.genres ?? []));
    expect([...genres].sort()).toEqual([...GENRES].sort());
    const decades = new Set(MOVIES.map((movie) => decadeOf(movie.year ?? 0)));
    expect([...decades].sort()).toEqual([...DECADES].sort());
  });

  it('carries what a card renders, keyed by a distinct QID', () => {
    for (const movie of MOVIES) {
      expect(movie).toMatchObject({
        kind: 'movie',
        placeId: expect.stringMatching(/^Q\d+$/),
        name: expect.any(String),
        photoUrl: expect.stringMatching(/^https:\/\/upload\.wikimedia\.org\//),
        year: expect.any(Number),
        overview: expect.any(String),
      });
    }
    expect(new Set(MOVIES.map((movie) => movie.placeId)).size).toBe(MOVIES.length);
  });
});

describe('dealMovieDeck', () => {
  it('deals at most a Deck, every Movie matching both axes of the Mood', () => {
    const mood: Mood = { genres: ['Comedy', 'Horror'], decades: ['1990s'] };

    const deck = dealMovieDeck(mood, { shuffle: identity }) as Movie[];

    expect(deck.length).toBeGreaterThan(0);
    expect(deck.length).toBeLessThanOrEqual(DECK_SIZE);
    for (const movie of deck) {
      expect(movie.kind).toBe('movie');
      expect(movie.genres?.some((genre) => genre === 'Comedy' || genre === 'Horror')).toBe(true);
      expect(decadeOf(movie.year ?? 0)).toBe('1990s');
    }
  });

  it('deals from the whole corpus when the Mood filters nothing', () => {
    expect(corpusMovieSource(anything)).toHaveLength(MOVIES.length);
    expect(dealMovieDeck(anything, { shuffle: identity })).toEqual(MOVIES.slice(0, DECK_SIZE));
    // The real shuffle deals a whole Deck too — the cut is after the shuffle.
    expect(dealMovieDeck(anything)).toHaveLength(DECK_SIZE);
  });

  it('deals none for a Mood the corpus cannot answer', () => {
    // In vocabulary on both axes, empty by fact: the corpus holds no 1970s documentary.
    expect(dealMovieDeck({ genres: ['Documentary'], decades: ['1970s'] })).toEqual([]);
  });
});

describe('redealMovieDeck', () => {
  it('leads with the Movies the wiped Deck did not show', () => {
    const first = dealMovieDeck(anything, { shuffle: identity });

    const next = redealMovieDeck(anything, first, { shuffle: identity });

    expect(next).toEqual(MOVIES.slice(DECK_SIZE, 2 * DECK_SIZE));
  });

  it('repeats only once the Mood has run out of unshown Movies', () => {
    const source = () => MOVIES.slice(0, DECK_SIZE + 5);
    const first = dealMovieDeck(anything, { source, shuffle: identity });

    const next = redealMovieDeck(anything, first, { source, shuffle: identity });

    expect(next).toHaveLength(DECK_SIZE);
    expect(next.slice(0, 5)).toEqual(MOVIES.slice(DECK_SIZE, DECK_SIZE + 5));
    expect(next.slice(5)).toEqual(MOVIES.slice(0, DECK_SIZE - 5));
  });

  it('reshuffles the wiped Deck rather than dealing nothing when the Mood stops matching', () => {
    // Only a redeploy shrinking the corpus under a live Session gets here; a
    // Restart never leaves a Session without a Deck.
    const current = MOVIES.slice(0, 3);
    expect(redealMovieDeck(anything, current, { source: () => [], shuffle: identity })).toEqual(
      current
    );
  });
});
