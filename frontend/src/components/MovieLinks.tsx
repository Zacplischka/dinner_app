// The three continuations a Movie carries, in one place: the crowned Top Pick
// on the Match screen and the Deck's details sheet (#424) render the same
// block. A YouTube search stands in when the corpus has no trailer, so every
// Movie has a next step, and where to watch is TMDB's own page for the title in
// Australia (ADR 0014) — JustWatch's data, shown where its licence already
// covers it, at the cost of no API call.

import type { Movie } from '@dinder/shared/types';
import { tmdbPath } from '../utils/tmdb';

export default function MovieLinks({ movie }: { movie: Movie }) {
  const trailerHref =
    movie.trailerUrl ||
    `https://www.youtube.com/results?search_query=${encodeURIComponent(
      [movie.name, movie.year, 'trailer'].filter(Boolean).join(' ')
    )}`;
  const tmdb = tmdbPath(movie.placeId);
  const whereToWatchHref = tmdb && `https://www.themoviedb.org/${tmdb}/watch?locale=AU`;

  return (
    <>
      {whereToWatchHref && (
        <a
          href={whereToWatchHref}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary mt-3 flex min-h-[48px] w-full items-center justify-center"
        >
          Where to watch
        </a>
      )}
      <a
        href={trailerHref}
        target="_blank"
        rel="noopener noreferrer"
        className={`btn ${whereToWatchHref ? 'btn-secondary' : 'btn-primary'} mt-3 flex min-h-[48px] w-full items-center justify-center`}
      >
        Watch trailer
      </a>
      <div className="mt-2 flex justify-center gap-6">
        {movie.imdbId && (
          <a
            href={`https://www.imdb.com/title/${movie.imdbId}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-[44px] items-center py-2 text-center text-sm text-cyan underline"
          >
            IMDb
          </a>
        )}
      </div>
    </>
  );
}
