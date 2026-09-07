// Tinder-style swipeable card rendering one Deck Entry - a Restaurant, a Recipe or a Movie.
// Supports touch swipe gestures and button interactions

import { useState, useRef, useCallback, useEffect } from 'react';
import type { DeckEntry } from '@dinder/shared/types';
import { isMovie, isRestaurant } from '../types';
import RetryingPhoto from './RetryingPhoto';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { formatPriceLevel, priceLevelLabel } from '../utils/money';
import TmdbCredit from './TmdbCredit';
import GenrePills from './GenrePills';
import { movieMeta } from '../utils/tmdb';

interface SwipeCardProps {
  entry: DeckEntry;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  isTop: boolean;
  stackPosition: number;
  /** Open this entry's details (#424). Omitted where there are none to open. */
  onOpenDetails?: () => void;
}

export const SWIPE_THRESHOLD = 100; // pixels needed to trigger a swipe
const ROTATION_FACTOR = 0.1; // degrees per pixel of drag
export const TAP_SLOP = 10; // pixels of wobble a finger is allowed and still be a tap

// Pure drag-visual math: gentle tilt plus progressive decision feedback that
// ramps from 0 to 1 at the swipe threshold. Reduced motion drops the tilt
// but keeps the colour feedback so decisions stay legible.
export function swipeVisuals(deltaX: number, reducedMotion: boolean) {
  const intensity = Math.min(Math.abs(deltaX) / SWIPE_THRESHOLD, 1);
  return {
    rotation: reducedMotion ? 0 : deltaX * ROTATION_FACTOR,
    likeIntensity: deltaX > 0 ? intensity : 0,
    nopeIntensity: deltaX < 0 ? intensity : 0,
  };
}

// Pure release decision: past the threshold either way it is a swipe, inside a
// small slop it is a tap (open the details), and anything between just settles.
// A swipe therefore never opens the sheet and a tap never swipes.
export function releaseAction(deltaX: number): 'like' | 'pass' | 'tap' | 'settle' {
  if (deltaX > SWIPE_THRESHOLD) return 'like';
  if (deltaX < -SWIPE_THRESHOLD) return 'pass';
  return Math.abs(deltaX) <= TAP_SLOP ? 'tap' : 'settle';
}

export default function SwipeCard({
  entry,
  onSwipeLeft,
  onSwipeRight,
  isTop,
  stackPosition,
  onOpenDetails,
}: SwipeCardProps) {
  const [dragState, setDragState] = useState({
    isDragging: false,
    startX: 0,
    currentX: 0,
  });
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const detailsButtonRef = useRef<HTMLButtonElement>(null);
  // Only the top card is interactive; every kind supports details.
  const openDetails = isTop ? onOpenDetails : undefined;

  const deltaX = dragState.currentX - dragState.startX;
  const prefersReducedMotion = usePrefersReducedMotion();
  const { rotation, likeIntensity, nopeIntensity } = swipeVisuals(deltaX, prefersReducedMotion);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!isTop || (e.target as Element).closest('a, button')) return;
      const touch = e.touches[0];
      setDragState({
        isDragging: true,
        startX: touch.clientX,
        currentX: touch.clientX,
      });
    },
    [isTop]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!dragState.isDragging) return;
      const touch = e.touches[0];
      setDragState((prev) => ({
        ...prev,
        currentX: touch.clientX,
      }));
    },
    [dragState.isDragging]
  );

  const handleTouchEnd = useCallback(
    (e?: React.TouchEvent) => {
      if (!dragState.isDragging) return;
      const action = releaseAction(deltaX);

      if (action === 'like') {
        setSwipeDirection('right');
        setTimeout(onSwipeRight, 300);
        // Keep the release offset so the fly-off animation starts from the lift point.
        setDragState((prev) => ({ ...prev, isDragging: false }));
        return;
      }
      if (action === 'pass') {
        setSwipeDirection('left');
        setTimeout(onSwipeLeft, 300);
        setDragState((prev) => ({ ...prev, isDragging: false }));
        return;
      }

      // Below threshold: spring back to centre.
      setDragState({
        isDragging: false,
        startX: 0,
        currentX: 0,
      });
      if (action === 'tap') {
        // A touch tap is followed by the browser's compatibility click, which
        // hit-tests where the finger was — by then the sheet's full-screen
        // backdrop is mounted there, and its click closes what this tap just
        // opened. React's touchend listener is not passive, so this takes.
        e?.preventDefault();
        // A mouse release runs this twice — React's onMouseUp and the window
        // listener share one stale isDragging — so the open must be
        // idempotent. It is: the caller only stores this entry as the open
        // one, and storing the same entry twice is one open.
        detailsButtonRef.current?.focus();
        openDetails?.();
      }
    },
    [dragState.isDragging, deltaX, onSwipeLeft, onSwipeRight, openDetails]
  );

  // A cancelled touch (a system gesture taking over, a call arriving) never
  // delivers touchend, so without this the card stays stuck mid-drag and the
  // next release reads as a tap on a gesture that was abandoned.
  const handleTouchCancel = useCallback(() => {
    setDragState({ isDragging: false, startX: 0, currentX: 0 });
  }, []);

  // Mouse event handlers for desktop
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!isTop || (e.target as Element).closest('a, button')) return;
      setDragState({
        isDragging: true,
        startX: e.clientX,
        currentX: e.clientX,
      });
    },
    [isTop]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragState.isDragging) return;
      setDragState((prev) => ({
        ...prev,
        currentX: e.clientX,
      }));
    },
    [dragState.isDragging]
  );

  const handleMouseUp = useCallback(() => {
    handleTouchEnd();
  }, [handleTouchEnd]);

  // Handle mouse leaving the card while dragging
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (dragState.isDragging) {
        handleTouchEnd();
      }
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [dragState.isDragging, handleTouchEnd]);

  // Calculate card style based on drag state and stack position
  const getCardStyle = () => {
    // Follows the pointer while dragging. On release it also seeds the `to`-only
    // fly-off keyframes' implicit `from`, so the card exits from the drag point
    // instead of snapping back to centre first.
    const releaseTransform = prefersReducedMotion
      ? `translateX(${deltaX}px)`
      : `translateX(${deltaX}px) rotate(${rotation}deg)`;

    if (swipeDirection === 'left') {
      return {
        transform: releaseTransform,
        animation: `${prefersReducedMotion ? 'swipeLeftFlat' : 'swipeLeft'} 0.25s ease-out forwards`,
        opacity: 1,
        zIndex: 10,
      };
    }
    if (swipeDirection === 'right') {
      return {
        transform: releaseTransform,
        animation: `${prefersReducedMotion ? 'swipeRightFlat' : 'swipeRight'} 0.25s ease-out forwards`,
        opacity: 1,
        zIndex: 10,
      };
    }

    if (dragState.isDragging && isTop) {
      return {
        transform: releaseTransform,
        transition: 'none',
        cursor: 'grabbing',
        opacity: 1,
        zIndex: 10,
      };
    }

    // Stack effect for non-top cards
    const scale = 1 - stackPosition * 0.05;
    const translateY = stackPosition * 8;
    const opacity = 1 - stackPosition * 0.2;

    return {
      transform: `scale(${scale}) translateY(${translateY}px)`,
      opacity,
      transition: 'transform 0.25s ease, opacity 0.25s ease',
      zIndex: 10 - stackPosition,
    };
  };

  // Title and image are all a Recipe carries; rating, price, hours and address
  // exist only on a Restaurant. A Movie adds year, runtime (a series: its
  // seasons), genres, a score (0-100, never the Restaurant's stars) and an
  // overview.
  const restaurant = isRestaurant(entry) ? entry : undefined;
  const movie = isMovie(entry) ? entry : undefined;
  const priceLevel = restaurant?.priceLevel;
  // Without the score: the card draws that as its own chip, below.
  const meta = movie && movieMeta(movie, false);

  return (
    <div
      ref={cardRef}
      data-swipe-card
      className={`absolute inset-0 flex flex-col rounded-market-lg overflow-hidden shadow-card border border-line bg-raised select-none ${
        isTop ? 'cursor-grab' : 'pointer-events-none'
      }`}
      style={getCardStyle()}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* DeckEntry Photo: letter tile behind, RetryingPhoto layered on top
          (#290, same arrangement as the Compare page). The container fixes the
          region's height, so the swipe-stack geometry #75 protects holds in
          every state — loading, retrying, or given up — and a transient photo
          error heals when the one retry lands. */}
      <div
        data-photo-region
        // A Movie's text block (two-line title, genres, meta, three-line
        // overview, credit) needs half the card; a Restaurant's fits under 62%.
        className={`relative flex-shrink-0 bg-surface ${movie ? 'h-1/2' : 'h-[62%]'}`}
      >
        {/* Same drawing as the old data-URI placeholder, inline so it can sit
            behind the photo; `slice` matches the old img's object-cover. */}
        <svg
          aria-hidden
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 400 500"
          preserveAspectRatio="xMidYMid slice"
        >
          <text
            x="200"
            y="250"
            textAnchor="middle"
            fill="#ff6b7e"
            fontFamily="system-ui,sans-serif"
            fontSize="48"
          >
            {entry.name.charAt(0)}
          </text>
        </svg>
        {/* A poster is portrait in a landscape frame. Cropping it to fit lost
            the title art, so it is shown whole, and a blurred copy of itself
            fills the frame around it in the poster's own colours. */}
        {entry.photoUrl && movie && (
          <div
            aria-hidden
            className="absolute inset-0 scale-110 bg-cover bg-center opacity-70 blur-xl"
            style={{ backgroundImage: `url(${entry.photoUrl})` }}
          />
        )}
        {entry.photoUrl && (
          <RetryingPhoto
            url={entry.photoUrl}
            alt={entry.name}
            className={`absolute inset-0 w-full h-full ${movie ? 'object-contain' : 'object-cover'}`}
            draggable={false}
            // Only the top card shows; the two beneath it sit inside the
            // viewport too, so `lazy` does not skip their fetch - it defers it
            // past layout and behind the top card's eager request, which is
            // what puts the visible photo first on a phone's radio.
            loading={stackPosition === 0 ? 'eager' : 'lazy'}
            decoding={stackPosition === 0 ? undefined : 'async'}
          />
        )}
        {/* Gradient overlay for text legibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-transparent to-transparent" />

        {/* The keyboard and screen-reader route into the details a tap opens.
            It sits on the photo's bottom corner — clear of the LIKE and PASS
            badges, and leaving the info region's geometry (#75) untouched — and
            it swallows its own pointer events so pressing it never starts a
            drag. */}
        {openDetails && (
          <button
            type="button"
            ref={detailsButtonRef}
            onClick={openDetails}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            className="absolute bottom-3 right-3 z-20 flex min-h-[44px] items-center rounded-full border border-line bg-ink/70 px-4 text-sm font-bold text-text backdrop-blur-sm"
          >
            Details
          </button>
        )}
      </div>

      {/* Swipe feedback: edge lights and badges strengthen with the drag */}
      {isTop && (
        <>
          <div
            data-testid="edge-light-like"
            className="absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-lime/70 to-transparent pointer-events-none"
            style={{ opacity: likeIntensity }}
            aria-hidden="true"
          />
          <div
            data-testid="edge-light-nope"
            className="absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-coral/70 to-transparent pointer-events-none"
            style={{ opacity: nopeIntensity }}
            aria-hidden="true"
          />

          {/* LIKE indicator */}
          <div
            className={`absolute z-10 top-8 left-6 px-4 py-2 border-4 border-lime rounded-lg ${
              prefersReducedMotion ? '' : 'transform -rotate-12'
            }`}
            style={{ opacity: likeIntensity }}
          >
            <span className="text-lime font-display font-bold text-3xl tracking-wider">LIKE</span>
          </div>

          {/* PASS indicator — the badge names the same action as the button
              and the keyboard hint below the Deck (#412). */}
          <div
            className={`absolute z-10 top-8 right-6 px-4 py-2 border-4 border-coral-soft rounded-lg ${
              prefersReducedMotion ? '' : 'transform rotate-12'
            }`}
            style={{ opacity: nopeIntensity }}
          >
            <span className="text-coral-soft font-display font-bold text-3xl tracking-wider">
              PASS
            </span>
          </div>
        </>
      )}

      {/* DeckEntry Info */}
      <div className="relative flex-1 min-h-0 overflow-hidden p-5 text-text">
        <h2 className="font-display text-2xl font-black mb-1 line-clamp-2">{entry.name}</h2>

        {restaurant?.cuisineType && (
          <p className="mb-3 text-sm font-bold text-coral-soft">{restaurant.cuisineType}</p>
        )}

        {movie && <GenrePills genres={movie.genres} className="mb-3" />}

        <div className="flex flex-wrap items-center gap-4 text-sm text-text/80">
          {movie?.rating !== undefined && (
            <span className="rounded-full bg-amber/15 px-2 py-0.5 text-xs font-bold text-amber">
              {movie.rating}% on TMDB
            </span>
          )}

          {meta && <span className="text-muted">{meta}</span>}

          {restaurant?.rating && (
            <div
              aria-label={`Rating ${restaurant.rating.toFixed(1)}`}
              className="flex items-center gap-1.5 text-amber"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              <span className="font-semibold">{restaurant.rating.toFixed(1)}</span>
            </div>
          )}

          {priceLevel !== undefined && (
            <span aria-label={priceLevelLabel(priceLevel)}>{formatPriceLevel(priceLevel)}</span>
          )}

          {restaurant?.openNow !== undefined && (
            <span className={restaurant.openNow ? 'font-bold text-lime' : 'font-medium text-muted'}>
              {restaurant.openNow ? 'Open now' : 'Closed now'}
            </span>
          )}
        </div>

        {movie?.overview && (
          <>
            <p className="mt-3 text-sm text-muted line-clamp-3">{movie.overview}</p>
            <TmdbCredit placeId={movie.placeId} />
          </>
        )}

        {restaurant?.address && (
          <p className="mt-3 text-sm text-muted flex items-center gap-1.5">
            <svg
              className="w-4 h-4 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
              />
            </svg>
            <span className="min-w-0 truncate">{restaurant.address}</span>
          </p>
        )}
      </div>
    </div>
  );
}
