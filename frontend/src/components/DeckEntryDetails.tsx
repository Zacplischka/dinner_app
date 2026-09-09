// The details of one Deck Entry, over the Deck (#424). The card's text region
// is clipped so the swipe-stack geometry (#75) holds, so a Movie's overview
// stops at three lines and a Restaurant's address at one; there is no room to
// grow in place, and this sheet is where the whole of both lives.
//
// SelectionPage owns one focus trap across this sheet and Full House so an
// interruption retains the original Details control as the focus destination.

import type { RefObject } from 'react';
import type { DeckEntry } from '@dinder/shared/types';
import { isMovie, isRecipe, isRestaurant } from '../types';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { formatPriceLevel, priceLevelLabel } from '../utils/money';
import { movieMeta, tmdbPath } from '../utils/tmdb';
import RetryingPhoto from './RetryingPhoto';
import GenrePills from './GenrePills';
import MovieLinks from './MovieLinks';
import TmdbCredit from './TmdbCredit';
import RecipeSourceCredit from './RecipeSourceCredit';

interface DeckEntryDetailsProps {
  /** The Deck Entry to show, or null when the sheet is closed. */
  entry: DeckEntry | null;
  onClose: () => void;
  dialogRef: RefObject<HTMLDivElement>;
}

export default function DeckEntryDetails({ entry, onClose, dialogRef }: DeckEntryDetailsProps) {
  const prefersReducedMotion = usePrefersReducedMotion();

  if (!entry) return null;

  const restaurant = isRestaurant(entry) ? entry : undefined;
  const movie = isMovie(entry) ? entry : undefined;
  const recipe = isRecipe(entry) ? entry : undefined;
  const today = new Date().toLocaleDateString('en-AU', { weekday: 'long' });
  const ratingCount =
    restaurant?.userRatingCount === undefined
      ? ''
      : `${restaurant.userRatingCount.toLocaleString('en-AU')} rating${restaurant.userRatingCount === 1 ? '' : 's'}`;
  let websiteHref: string | undefined;
  if (restaurant?.websiteUrl) {
    try {
      const url = new URL(restaurant.websiteUrl);
      if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) {
        websiteHref = url.href;
      }
    } catch {
      // Older Session snapshots may contain an invalid vendor URL; omit the link.
    }
  }
  const steps = recipe?.details?.steps ?? [];
  const meta = movie && movieMeta(movie);
  const tmdb = movie && tmdbPath(movie.placeId);
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

      <div className="pointer-events-none flex min-h-full items-end justify-center p-4 sm:items-center">
        <div
          data-testid="details-panel"
          className={`card pointer-events-auto relative max-h-[85vh] w-full max-w-sm overflow-y-auto ${
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

          {movie && <GenrePills genres={movie.genres} className="mt-3" />}

          {meta && <p className="mt-2 text-sm text-muted">{meta}</p>}

          {restaurant && (
            <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-text/80">
              {restaurant.rating !== undefined && (
                <span
                  aria-label={`Rating ${restaurant.rating.toFixed(1)}${ratingCount ? ` · ${ratingCount}` : ''}`}
                  className="text-amber"
                >
                  ★ {restaurant.rating.toFixed(1)}
                  {ratingCount && ` · ${ratingCount}`}
                </span>
              )}
              {restaurant.priceLevel !== undefined && (
                <span aria-label={priceLevelLabel(restaurant.priceLevel)}>
                  {formatPriceLevel(restaurant.priceLevel)}
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

          {recipe && (
            <section className="mt-3 space-y-3 text-sm text-muted" aria-label="Recipe details">
              {recipe.details?.cuisines?.length ? (
                <p className="font-bold capitalize text-coral-soft">
                  {recipe.details.cuisines.join(' · ')}
                </p>
              ) : null}
              {recipe.details?.readyInMinutes && (
                <p>Ready in {recipe.details.readyInMinutes} minutes</p>
              )}
              {recipe.details?.description ? (
                <p>{recipe.details.description}</p>
              ) : steps.length === 0 ? (
                <p>A description is not available for this recipe.</p>
              ) : null}
              {recipe.details?.ingredients.length ? (
                <p>
                  {recipe.details.ingredients.length} ingredient
                  {recipe.details.ingredients.length === 1 ? '' : 's'}
                  {steps.length > 0 && ` · ${steps.length} step${steps.length === 1 ? '' : 's'}`}
                </p>
              ) : null}
              {!recipe.details?.readyInMinutes && (
                <p>
                  Cooking time is not available.
                  {steps.length > 0 ? ' Check the method before choosing.' : ''}
                </p>
              )}
              {steps.length > 0 && (
                <details>
                  <summary className="min-h-[44px] cursor-pointer py-2 font-bold text-cyan">
                    Preview the method
                  </summary>
                  <ol className="mt-2 list-decimal space-y-3 pl-5 text-text">
                    {steps.map((step, index) => (
                      <li key={index}>{step}</li>
                    ))}
                  </ol>
                </details>
              )}
              <h3 className="font-bold text-text">
                Ingredients{recipe.details?.servings ? ` · serves ${recipe.details.servings}` : ''}
              </h3>
              {recipe.details?.ingredients?.length ? (
                <ul className="list-disc space-y-2 pl-5">
                  {recipe.details.ingredients.map((ingredient, index) => (
                    <li key={index}>{ingredient}</li>
                  ))}
                </ul>
              ) : (
                <p>Ingredient details are not available.</p>
              )}
              <RecipeSourceCredit
                sourceName={recipe.details?.sourceName}
                sourceUrl={recipe.details?.sourceUrl}
                provenance={
                  recipe.placeId.startsWith('owned:') ? 'owned' : recipe.details?.provenance
                }
              />
            </section>
          )}

          {movie?.overview && <p className="mt-3 text-sm text-muted">{movie.overview}</p>}
          {tmdb && (
            <a
              href={`https://www.themoviedb.org/${tmdb}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex min-h-[44px] items-center text-sm text-cyan underline"
            >
              Read full synopsis on TMDB
            </a>
          )}

          {/* Not under the overview, which is optional: ADR 0014 asks for the
              credit wherever TMDB's data or images appear, and a Movie with no
              overview still shows its poster, year, genres and score. */}
          {movie && <TmdbCredit placeId={movie.placeId} />}

          {restaurant?.address && <p className="mt-3 text-sm text-muted">{restaurant.address}</p>}

          {!!restaurant?.openingHours?.length && (
            <section className="mt-3 text-sm text-muted" aria-label="Opening hours">
              <h3 className="font-bold text-text">Opening hours</h3>
              <ul className="mt-2 space-y-1">
                {restaurant.openingHours.map((hours, index) => (
                  <li key={index}>
                    {hours.startsWith(`${today}:`) ? (
                      <strong className="text-text">{hours}</strong>
                    ) : (
                      hours
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {restaurant?.phone && (
            <a
              href={`tel:${restaurant.phone}`}
              className="mt-2 flex min-h-[44px] items-center text-sm text-cyan underline"
            >
              Call {restaurant.phone}
            </a>
          )}
          {websiteHref && (
            <a
              href={websiteHref}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 flex min-h-[44px] items-center text-sm text-cyan underline"
            >
              Visit website
            </a>
          )}

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
