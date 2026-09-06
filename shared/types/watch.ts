// The Watch Branch's setup vocabulary (#369): the Mood a Session's Movie Deck
// is dealt from — the Craving's twin (see CONTEXT.md). The chip vocabularies
// are exactly what the committed corpus contains (backend/movies/movies.json —
// the loader's schema refuses a genre no chip offers, MovieDeckService's tests
// pin that every chip can deal): a chip that could deal nothing is not
// offered. They live here because the setup screen renders them and the
// create endpoint validates against them (ADR 0006) — one list, one spelling,
// both sides.

export const GENRES = [
  'Action',
  'Adventure',
  'Animation',
  'Comedy',
  'Crime',
  'Documentary',
  'Drama',
  'Family',
  'Fantasy',
  'History',
  'Horror',
  'Music',
  'Mystery',
  'Romance',
  'Sci-Fi',
  'Thriller',
  'War',
  'Western',
] as const;
export type Genre = (typeof GENRES)[number];

export const DECADES = [
  '1950s',
  '1960s',
  '1970s',
  '1980s',
  '1990s',
  '2000s',
  '2010s',
  '2020s',
] as const;
export type Decade = (typeof DECADES)[number];

/**
 * What a Movie is: a film, or a television series — shown to people as
 * "Series", one Deck Entry kind either way (ADR 0014).
 */
export const MEDIA_TYPES = ['movie', 'tv'] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

/**
 * What a Watch Session's Deck is dealt from: a Movie matches when it carries
 * any chosen genre, was released in any chosen decade and is any chosen media
 * type. An empty array is no filter on that axis, so `{ genres: [], decades: [] }`
 * deals the whole corpus.
 */
export interface Mood {
  genres: Genre[];
  decades: Decade[];
  /**
   * Films, series, or both. Absent as well as empty is no filter: a Mood a
   * Session persisted before series existed carries no axis at all (ADR 0007).
   */
  mediaTypes?: MediaType[];
}
