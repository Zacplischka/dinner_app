// The Watch Branch's Deck supply (#369): a Mood filtered over the committed
// movie corpus, shuffled, cut to a Deck. Pure — no store, no network, nothing
// to await — because the corpus is reference data that ships with the deploy
// (ADR 0011) and is read in memory.
//
// ponytail: no Redis pool. The Cook Branch pools because its supply is a paid,
// rate-limited vendor call worth sharing between Sessions; a static corpus
// costs nothing to filter again, so the Session stores its Mood and a Restart
// simply re-deals from it. Pool it the day the source is TMDB.
// ponytail: a static ~300-Movie corpus behind the MovieSource seam; TMDB
// replaces `corpusMovieSource` when it runs thin, and nothing above changes.
import type { DeckEntry, Mood, Movie } from '@dinder/shared/types';
import { MOVIES } from '../data/movies.generated.js';

/** ponytail: one fixed Deck size, the same as a Cook Deck's. */
export const DECK_SIZE = 15;

/** What a Mood deals from. One implementation today; the seam TMDB would take. */
export type MovieSource = (mood: Mood) => Movie[];

/** "1979" → "1970s", the Decade chips' spelling. */
export const decadeOf = (year: number): string => `${Math.floor(year / 10) * 10}s`;

/** Every corpus Movie carrying any chosen genre and released in any chosen decade. */
export const corpusMovieSource: MovieSource = (mood) => {
  const genres = new Set<string>(mood.genres);
  const decades = new Set<string>(mood.decades);
  return MOVIES.filter(
    (movie) =>
      (genres.size === 0 || (movie.genres ?? []).some((genre) => genres.has(genre))) &&
      (decades.size === 0 || (movie.year !== undefined && decades.has(decadeOf(movie.year))))
  );
};

function shuffled<T>(entries: readonly T[]): T[] {
  const copy = [...entries];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export interface DealOptions {
  source?: MovieSource;
  /** Injectable so tests can assert the cut rather than luck. */
  shuffle?: <T>(entries: readonly T[]) => T[];
  deckSize?: number;
}

/**
 * A Restart's Deck: the Mood's Movies with the just-wiped ones dealt last, so
 * the group sees new Movies first and repeats only once the Mood runs out. A
 * Mood that has stopped matching anything (a redeploy shrank the corpus)
 * reshuffles `current` — a Restart never leaves a Session without a Deck.
 */
export function redealMovieDeck(
  mood: Mood,
  current: readonly DeckEntry[],
  { source = corpusMovieSource, shuffle = shuffled, deckSize = DECK_SIZE }: DealOptions = {}
): DeckEntry[] {
  const wiped = new Set(current.map((entry) => entry.placeId));
  const pool = source(mood);
  const fresh = pool.filter((movie) => !wiped.has(movie.placeId));
  const repeats = pool.filter((movie) => wiped.has(movie.placeId));
  const dealt = [...shuffle(fresh), ...shuffle(repeats)].slice(0, deckSize);
  return dealt.length > 0 ? dealt : shuffle(current);
}

/** A Session's first Deck: up to `deckSize` Movies matching the Mood, or none. */
export function dealMovieDeck(mood: Mood, options?: DealOptions): DeckEntry[] {
  return redealMovieDeck(mood, [], options);
}
