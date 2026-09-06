// A Movie's genres as chips, drawn the same on the Deck card and in its
// details sheet (#424). Only the margin differs between the two, so that is
// the one thing the caller passes.

import type { Movie } from '@dinder/shared/types';

export default function GenrePills({
  genres,
  className = '',
}: {
  genres: Movie['genres'];
  className?: string;
}) {
  if (!genres?.length) return null;
  return (
    <ul className={`flex flex-wrap gap-1.5 ${className}`} aria-label="Genres">
      {genres.map((genre) => (
        <li
          key={genre}
          className="rounded-full border border-amber/40 px-2 py-0.5 text-xs font-bold text-amber"
        >
          {genre}
        </li>
      ))}
    </ul>
  );
}
