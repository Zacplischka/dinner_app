// Tinder-style swipeable restaurant card component
// Supports touch swipe gestures and button interactions

import { useState, useRef, useCallback, useEffect } from 'react';
import type { Restaurant } from '@dinder/shared/types';

interface SwipeCardProps {
  restaurant: Restaurant;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  isTop: boolean;
  stackPosition: number;
}

const SWIPE_THRESHOLD = 100; // pixels needed to trigger a swipe
const ROTATION_FACTOR = 0.1; // degrees per pixel of drag

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

export default function SwipeCard({
  restaurant,
  onSwipeLeft,
  onSwipeRight,
  isTop,
  stackPosition,
}: SwipeCardProps) {
  const [dragState, setDragState] = useState({
    isDragging: false,
    startX: 0,
    currentX: 0,
  });
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const deltaX = dragState.currentX - dragState.startX;
  const prefersReducedMotion =
    window.matchMedia('(prefers-reduced-motion: reduce)')?.matches ?? false;
  const { rotation, likeIntensity, nopeIntensity } = swipeVisuals(deltaX, prefersReducedMotion);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!isTop) return;
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

  const handleTouchEnd = useCallback(() => {
    if (!dragState.isDragging) return;

    if (deltaX > SWIPE_THRESHOLD) {
      setSwipeDirection('right');
      setTimeout(onSwipeRight, 300);
      // Keep the release offset so the fly-off animation starts from the lift point.
      setDragState((prev) => ({ ...prev, isDragging: false }));
      return;
    }
    if (deltaX < -SWIPE_THRESHOLD) {
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
  }, [dragState.isDragging, deltaX, onSwipeLeft, onSwipeRight]);

  // Mouse event handlers for desktop
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!isTop) return;
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

  // Fallback placeholder image when no photo is available
  const placeholderImage = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 500'%3E%3Crect fill='%2307111f' width='400' height='500'/%3E%3Ctext x='200' y='250' text-anchor='middle' fill='%23ff6b7e' font-family='system-ui,sans-serif' font-size='48'%3E${encodeURIComponent(restaurant.name.charAt(0))}%3C/text%3E%3C/svg%3E`;

  const priceDisplay = '$'.repeat(restaurant.priceLevel || 0);

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
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Restaurant Photo */}
      <div className="relative h-[62%] flex-shrink-0">
        <img
          src={restaurant.photoUrl || placeholderImage}
          alt={restaurant.name}
          className="w-full h-full object-cover"
          draggable={false}
          onError={(event) => {
            event.currentTarget.src = placeholderImage;
          }}
        />
        {/* Gradient overlay for text legibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-transparent to-transparent" />
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

          {/* NOPE indicator */}
          <div
            className={`absolute z-10 top-8 right-6 px-4 py-2 border-4 border-coral-soft rounded-lg ${
              prefersReducedMotion ? '' : 'transform rotate-12'
            }`}
            style={{ opacity: nopeIntensity }}
          >
            <span className="text-coral-soft font-display font-bold text-3xl tracking-wider">
              NOPE
            </span>
          </div>
        </>
      )}

      {/* Restaurant Info */}
      <div className="relative flex-1 min-h-0 overflow-hidden p-5 text-text">
        <h2 className="font-display text-2xl font-black mb-1 line-clamp-2">{restaurant.name}</h2>

        {restaurant.cuisineType && (
          <p className="mb-3 text-sm font-bold text-coral-soft">{restaurant.cuisineType}</p>
        )}

        <div className="flex flex-wrap items-center gap-4 text-sm text-text/80">
          {restaurant.rating && (
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

          {priceDisplay && (
            <span aria-label={`Price level ${restaurant.priceLevel} of 4`}>{priceDisplay}</span>
          )}

          {restaurant.openNow !== undefined && (
            <span className={restaurant.openNow ? 'font-bold text-lime' : 'font-medium text-muted'}>
              {restaurant.openNow ? 'Open now' : 'Closed now'}
            </span>
          )}
        </div>

        {restaurant.address && (
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
