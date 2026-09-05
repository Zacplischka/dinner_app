// The Watch Branch's setup vocabulary (#369): the Mood a Session's Movie Deck
// is dealt from — the Craving's twin (see CONTEXT.md). The two chip
// vocabularies are exactly what the committed corpus contains
// (backend/src/data/movies.generated.ts, pinned by MovieDeckService's tests):
// a chip that could deal nothing is not offered. They live here because the
// setup screen renders them and the create endpoint validates against them
// (ADR 0006) — one list, one spelling, both sides.

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
  'Horror',
  'Musical',
  'Mystery',
  'Romance',
  'Sci-Fi',
  'Thriller',
  'War',
] as const;
export type Genre = (typeof GENRES)[number];

export const DECADES = ['1970s', '1980s', '1990s', '2000s', '2010s', '2020s'] as const;
export type Decade = (typeof DECADES)[number];

/**
 * What a Watch Session's Deck is dealt from: a Movie matches when it carries
 * any chosen genre and was released in any chosen decade. An empty array is
 * no filter on that axis, so `{ genres: [], decades: [] }` deals the whole
 * corpus.
 */
export interface Mood {
  genres: Genre[];
  decades: Decade[];
}
