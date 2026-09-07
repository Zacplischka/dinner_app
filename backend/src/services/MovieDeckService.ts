// The Watch Branch's Deck supply (#369): a Mood filtered over the committed
// Movie corpus, cut to the best-known titles, shuffled, cut to a Deck. Pure —
// no store, no network, nothing to await — because the corpus is reference
// data that ships with the deploy (ADR 0011, ADR 0014) and is read in memory.
//
// ponytail: no Redis pool. The Cook Branch pools because its supply is a paid,
// rate-limited vendor call worth sharing between Sessions; a static corpus
// costs nothing to filter again, so the Session stores its Mood and a Restart
// simply re-deals from it.
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import {
  DECADES,
  GENRES,
  MEDIA_TYPES,
  type DeckEntry,
  type Mood,
  type Movie,
} from '@dinder/shared/types';
import { config } from '../config/index.js';

/** ponytail: one fixed Deck size, the same as a Cook Deck's. */
export const DECK_SIZE = 15;

/**
 * How deep into a Mood's matches a deal reaches. The corpus is sorted by how
 * many people have rated each title, so the first hundred-odd matches are the
 * ones a table has heard of; a uniform draw over thousands would deal the
 * obscure. A Restart still has 105 unshown titles before it repeats one.
 * ponytail: one fixed cap; make it pool-relative (max(120, pool / 10), say)
 * if broad Moods start repeating for regulars.
 */
export const POOL_CAP = 120;

/** "1979" → "1970s", the Decade chips' spelling. */
export const decadeOf = (year: number): string => `${Math.floor(year / 10) * 10}s`;

/**
 * One corpus record: the shared `Movie` shape made strict. The builder is the
 * trust boundary for what the card renders verbatim (`<img src>`, `<a href>`),
 * and this is the last gate on it — a batch that will not parse fails the
 * boot, one revert from gone. `genres` against GENRES and `year` against
 * DECADES are what keep the chips and the corpus one vocabulary in this
 * direction; the unit test pins the other, that every chip can deal.
 */
const movieSchema = z
  .object({
    kind: z.literal('movie'),
    placeId: z.string().regex(/^tmdb:(movie|tv):\d+$/),
    mediaType: z.enum(MEDIA_TYPES),
    name: z.string().min(1),
    photoUrl: z.string().url().startsWith('https://image.tmdb.org/'),
    rating: z.number().int().min(1).max(100).optional(),
    year: z
      .number()
      .int()
      .refine((year) => (DECADES as readonly string[]).includes(decadeOf(year))),
    genres: z.array(z.enum(GENRES)).max(4),
    runtimeMinutes: z.number().int().positive().optional(),
    seasons: z.number().int().positive().optional(),
    overview: z.string().min(1).optional(),
    trailerUrl: z.string().url().startsWith('https://www.youtube.com/watch?v=').optional(),
    imdbId: z
      .string()
      .regex(/^tt\d+$/)
      .optional(),
  })
  .strict();

/** Read at boot, once. */
export function loadMovieCorpus(file: URL = config.moviesFile): Movie[] {
  const parsed = z.array(movieSchema).safeParse(JSON.parse(readFileSync(file, 'utf8')));
  if (!parsed.success) {
    const [issue] = parsed.error.issues;
    throw new Error(`${file.pathname}: ${issue?.path.join('.')}: ${issue?.message}`);
  }
  return parsed.data;
}

/** What a Mood deals from. One implementation, the corpus; the seam a live source would take. */
export type MovieSource = (mood: Mood) => Movie[];

/**
 * Every corpus Movie carrying any chosen genre, released in any chosen decade
 * and of any chosen media type — in corpus order, best-known first.
 */
export const corpusMovieSource =
  (movies: readonly Movie[]): MovieSource =>
  (mood) => {
    const genres = new Set<string>(mood.genres);
    const decades = new Set<string>(mood.decades);
    const types = new Set<string>(mood.mediaTypes ?? []);
    return movies.filter(
      (movie) =>
        (genres.size === 0 || (movie.genres ?? []).some((genre) => genres.has(genre))) &&
        (decades.size === 0 || (movie.year !== undefined && decades.has(decadeOf(movie.year)))) &&
        (types.size === 0 || types.has(movie.mediaType ?? 'movie'))
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
  source: MovieSource;
  /** Injectable so tests can assert the cut rather than luck. */
  shuffle?: <T>(entries: readonly T[]) => T[];
  deckSize?: number;
  poolCap?: number;
  /** Equal turns per Participant, irrespective of how many interests they chose. */
  interests?: readonly Mood[];
}

/**
 * A Restart's Deck: the Mood's best-known Movies with the just-wiped ones
 * dealt last, so the group sees new Movies first and repeats only once the
 * Mood runs out. A Mood that has stopped matching anything (a redeploy shrank
 * the corpus) reshuffles `current` — a Restart never leaves a Session without
 * a Deck.
 */
export function redealMovieDeck(
  mood: Mood,
  current: readonly DeckEntry[],
  { source, shuffle = shuffled, deckSize = DECK_SIZE, poolCap = POOL_CAP, interests }: DealOptions
): DeckEntry[] {
  const contributions = interests?.length ? interests : [mood];
  const wiped = new Set(current.map((entry) => entry.placeId));
  // Shortlist each person's interests and media type separately: a popular
  // movie prefix can no longer remove all series before allocation (#437).
  const queues = contributions.map((contribution) => {
    const eligible = source(contribution);
    return MEDIA_TYPES.map((type) => {
      const pool = eligible.filter((m) => (m.mediaType ?? 'movie') === type).slice(0, poolCap);
      return [
        ...shuffle(pool.filter((m) => !wiped.has(m.placeId))),
        ...shuffle(pool.filter((m) => wiped.has(m.placeId))),
      ];
    });
  });
  const taken = new Set<string>();
  const dealt: Movie[] = [];
  const turns = MEDIA_TYPES.map(() => 0);
  const pick = (typeIndex: number): boolean => {
    // Every Participant gets one turn, including someone happy with anything.
    // Exhausted contributions yield their turn; duplicate titles never consume it.
    for (const allowRepeats of [false, true]) {
      for (let n = 0; n < queues.length; n++) {
        const index = (turns[typeIndex] + n) % queues.length;
        const queue = queues[index][typeIndex];
        while (queue.length && taken.has(queue[0].placeId)) queue.shift();
        const entry = queue[0];
        if (entry && (allowRepeats || !wiped.has(entry.placeId))) {
          queue.shift();
          turns[typeIndex] = (index + 1) % queues.length;
          taken.add(entry.placeId);
          dealt.push(entry);
          return true;
        }
      }
    }
    return false;
  };
  // Alternate types, giving odd Decks at most one extra movie. Scarcity yields
  // to the other type; a one-entry Deck makes no mixture promise.
  while (dealt.length < deckSize) {
    let added = false;
    for (let type = 0; type < MEDIA_TYPES.length && dealt.length < deckSize; type++) {
      added = pick(type) || added;
    }
    if (!added) break;
  }
  return dealt.length ? shuffle(dealt) : interests ? [] : shuffle(current);
}

/** A Session's first Deck: up to `deckSize` Movies matching the Mood, or none. */
export function dealMovieDeck(mood: Mood, options: DealOptions): DeckEntry[] {
  return redealMovieDeck(mood, [], options);
}
