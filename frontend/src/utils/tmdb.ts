// A Movie's placeId is `tmdb:<movie|tv>:<id>` (ADR 0014); TMDB's own pages
// for a title are `/movie/<id>` and `/tv/<id>`, and everything the crown links
// — the title page, where to watch — hangs off that one path. A Session dealt
// before the corpus moved to TMDB holds Wikidata ids until it expires; those
// have no TMDB page, so null, and the caller shows no link rather than a dead one.
import type { Movie } from '@dinder/shared/types';

export const tmdbPath = (placeId: string): string | null => {
  const match = /^tmdb:(movie|tv):(\d+)$/.exec(placeId);
  return match ? `${match[1]}/${match[2]}` : null;
};

// One Movie's meta line, drawn by the Deck card, its details sheet (#424) and
// the crowned Top Pick. A series shows its seasons where a film shows its
// runtime; the card asks for the line without the score because it draws the
// score as its own chip.
export const movieMeta = (movie: Movie, withScore = true): string =>
  [
    movie.year,
    movie.mediaType === 'tv'
      ? movie.seasons && `${movie.seasons} season${movie.seasons === 1 ? '' : 's'}`
      : movie.runtimeMinutes && `${movie.runtimeMinutes} min`,
    withScore && movie.rating !== undefined && `${movie.rating}% on TMDB`,
  ]
    .filter(Boolean)
    .join(' · ');
