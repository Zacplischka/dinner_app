// The details of one Deck Entry, over the Deck (#424). The card's text region
// is clipped so the swipe-stack geometry (#75) holds, so a Movie's overview
// stops at three lines and a Restaurant's address at one; there is no room to
// grow in place, and this sheet is where the whole of both lives.
//
// Mounted always, opened by a non-null `entry` — the same shape as
// ConfirmLeaveModal, because useFocusTrap restores focus on the close
// transition and never sees one if the dialog unmounts instead.

import { useRef } from 'react';
import type { DeckEntry } from '@dinder/shared/types';
import { isMovie, isRestaurant } from '../types';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import RetryingPhoto from './RetryingPhoto';
import MovieLinks from './MovieLinks';
import TmdbCredit from './TmdbCredit';

/**
 * Whether a Deck Entry has anything worth opening. A Recipe carries only a
 * name, photo and likes on the wire, so its card offers no Details control and
 * a tap on it does nothing — add it when a Recipe carries more (#425 territory).
 */
export const hasDetails = (entry: DeckEntry): boolean => isRestaurant(entry) || isMovie(entry);

interface DeckEntryDetailsProps {
  /** The Deck Entry to show, or null when the sheet is closed. */
  entry: DeckEntry | null;
  onClose: () => void;
}

export default function DeckEntryDetails({ entry, onClose }: DeckEntryDetailsProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  useFocusTrap(dialogRef, entry !== null);

  if (!entry) return null;

  const restaurant = isRestaurant(entry) ? entry : undefined;
  const movie = isMovie(entry) ? entry : undefined;
  const meta = [
    movie?.year,
    movie?.mediaType === 'tv'
      ? movie.seasons && `${movie.seasons} season${movie.seasons === 1 ? '' : 's'}`
      : movie?.runtimeMinutes && `${movie.runtimeMinutes} min`,
    movie?.rating !== undefined && `${movie.rating}% on TMDB`,
  ]
    .filter(Boolean)
    .join(' · ');
  // `query` is required beside the id, and it is what a viewer sees if the id
  // no longer resolves. Nothing new on the wire: both fields are already there.
  const mapsHref =
    restaurant &&
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      restaurant.name
    )}&query_place_id=${encodeURIComponent(restaurant.placeId)}`;

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="deck-entry-details-title"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div
        data-testid="details-backdrop"
        className="fixed inset-0 bg-ink/80 backdrop-blur-[10px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="flex min-h-full items-end justify-center p-4 sm:items-center">
        <div
          data-testid="details-panel"
          className={`card relative max-h-[85vh] w-full max-w-sm overflow-y-auto ${
            prefersReducedMotion ? '' : 'animate-slide-up'
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <h2
              id="deck-entry-details-title"
              className="font-display text-2xl font-black text-text"
            >
              {entry.name}
            </h2>
            <button
              type="button"
              onClick={onClose}
              autoFocus
              className="h-11 w-11 flex-shrink-0 rounded-full border border-line bg-surface text-xl text-muted hover:text-text"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          {/* A poster is portrait, so it gets a 2:3 frame; a Restaurant's photo
              is landscape and takes the full width, as the Match card's hero. */}
          {entry.photoUrl && (
            <RetryingPhoto
              url={entry.photoUrl}
              alt={entry.name}
              className={
                movie
                  ? 'mx-auto mt-3 h-48 w-32 rounded-market-md object-cover'
                  : 'mt-3 h-40 w-full rounded-market-md object-cover'
              }
            />
          )}

          {restaurant?.cuisineType && (
            <p className="mt-3 text-sm font-bold text-coral-soft">{restaurant.cuisineType}</p>
          )}

          {movie?.genres && movie.genres.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Genres">
              {movie.genres.map((genre) => (
                <li
                  key={genre}
                  className="rounded-full border border-amber/40 px-2 py-0.5 text-xs font-bold text-amber"
                >
                  {genre}
                </li>
              ))}
            </ul>
          )}

          {meta && <p className="mt-2 text-sm text-muted">{meta}</p>}

          {restaurant && (
            <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-text/80">
              {restaurant.rating !== undefined && (
                <span aria-label={`Rating ${restaurant.rating.toFixed(1)}`} className="text-amber">
                  ★ {restaurant.rating.toFixed(1)}
                </span>
              )}
              {restaurant.priceLevel !== undefined && (
                <span aria-label={`Price level ${restaurant.priceLevel} of 4`}>
                  {'$'.repeat(restaurant.priceLevel)}
                </span>
              )}
              {restaurant.openNow !== undefined && (
                <span
                  className={restaurant.openNow ? 'font-bold text-lime' : 'font-medium text-muted'}
                >
                  {restaurant.openNow ? 'Open now' : 'Closed now'}
                </span>
              )}
            </div>
          )}

          {movie?.overview && (
            <>
              <p className="mt-3 text-sm text-muted">{movie.overview}</p>
              <TmdbCredit placeId={movie.placeId} />
            </>
          )}

          {restaurant?.address && <p className="mt-3 text-sm text-muted">{restaurant.address}</p>}

          {movie && <MovieLinks movie={movie} />}

          {mapsHref && (
            <a
              href={mapsHref}
              target="_blank"
              rel="noopener noreferrer"
              // An anchor is inline; .btn assumes a button's box, so give it one.
              className="btn btn-primary mt-3 flex min-h-[48px] w-full items-center justify-center"
            >
              Open in Google Maps
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
