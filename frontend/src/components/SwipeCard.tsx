// Tinder-style swipeable restaurant card component
// Supports touch swipe gestures and button interactions

import { useState, useRef, useCallback, useEffect } from 'react';
import type { Restaurant } from '@dinner-app/shared/types';

interface SwipeCardProps {
  restaurant: Restaurant;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  isTop: boolean;
  stackPosition: number;
}

const SWIPE_THRESHOLD = 100; // pixels needed to trigger a swipe
const ROTATION_FACTOR = 0.1; // degrees per pixel of drag

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
  const rotation = deltaX * ROTATION_FACTOR;

  // Determine swipe indicator based on drag position
  const showLikeIndicator = deltaX > 50;
  const showNopeIndicator = deltaX < -50;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!isTop) return;
    const touch = e.touches[0];
    setDragState({
      isDragging: true,
      startX: touch.clientX,
      currentX: touch.clientX,
    });
  }, [isTop]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragState.isDragging) return;
    const touch = e.touches[0];
    setDragState((prev) => ({
      ...prev,
      currentX: touch.clientX,
    }));
  }, [dragState.isDragging]);

  const handleTouchEnd = useCallback(() => {
    if (!dragState.isDragging) return;

    if (deltaX > SWIPE_THRESHOLD) {
      setSwipeDirection('right');
      setTimeout(onSwipeRight, 300);
    } else if (deltaX < -SWIPE_THRESHOLD) {
      setSwipeDirection('left');
      setTimeout(onSwipeLeft, 300);
    }

    setDragState({
      isDragging: false,
      startX: 0,
      currentX: 0,
    });
  }, [dragState.isDragging, deltaX, onSwipeLeft, onSwipeRight]);

  // Mouse event handlers for desktop
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!isTop) return;
    setDragState({
      isDragging: true,
      startX: e.clientX,
      currentX: e.clientX,
    });
  }, [isTop]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragState.isDragging) return;
    setDragState((prev) => ({
      ...prev,
      currentX: e.clientX,
    }));
  }, [dragState.isDragging]);

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
    if (swipeDirection === 'left') {
      return {
        animation: 'swipeLeft 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards',
      };
    }
    if (swipeDirection === 'right') {
      return {
        animation: 'swipeRight 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards',
      };
    }

    if (dragState.isDragging && isTop) {
      return {
        transform: `translateX(${deltaX}px) rotate(${rotation}deg)`,
        transition: 'none',
        cursor: 'grabbing',
      };
    }

    // Stack effect for non-top cards
    const scale = 1 - stackPosition * 0.05;
    const translateY = stackPosition * 8;
    const opacity = 1 - stackPosition * 0.2;

    return {
      transform: `scale(${scale}) translateY(${translateY}px)`,
      opacity,
      transition: 'transform 0.3s ease, opacity 0.3s ease',
      zIndex: 10 - stackPosition,
    };
  };

  // Fallback placeholder image when no photo is available
  const placeholderImage = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 500'%3E%3Crect fill='%231f1f24' width='400' height='500'/%3E%3Ctext x='200' y='250' text-anchor='middle' fill='%23d4a574' font-family='Georgia' font-size='48'%3E${encodeURIComponent(restaurant.name.charAt(0))}%3C/text%3E%3C/svg%3E`;

  const priceDisplay = '$'.repeat(restaurant.priceLevel || 0);

  return (
    <div
      ref={cardRef}
      className={`absolute inset-0 rounded-3xl overflow-hidden shadow-card select-none ${
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
      <div className="absolute inset-0">
        <img
          src={restaurant.photoUrl || placeholderImage}
          alt={restaurant.name}
          className="w-full h-full object-cover"
          draggable={false}
        />
        {/* Gradient overlay for text legibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-midnight via-midnight/40 to-transparent" />
      </div>

      {/* Swipe Indicators */}
      {isTop && (
        <>
          {/* LIKE indicator */}
          <div
            className={`absolute top-8 left-6 px-4 py-2 border-4 border-success rounded-lg transform -rotate-12 transition-opacity duration-200 ${
              showLikeIndicator ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <span className="text-success font-display font-bold text-3xl tracking-wider">LIKE</span>
          </div>

          {/* NOPE indicator */}
          <div
            className={`absolute top-8 right-6 px-4 py-2 border-4 border-error rounded-lg transform rotate-12 transition-opacity duration-200 ${
              showNopeIndicator ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <span className="text-error font-display font-bold text-3xl tracking-wider">NOPE</span>
          </div>
        </>
      )}

      {/* Restaurant Info */}
      <div className="absolute bottom-0 left-0 right-0 p-6 text-cream">
        <h2 className="font-display text-3xl font-semibold mb-2 text-glow drop-shadow-lg">
          {restaurant.name}
        </h2>

        <div className="flex items-center gap-3 mb-2">
          {restaurant.rating && (
            <div className="flex items-center gap-1.5 bg-midnight/60 backdrop-blur-sm px-3 py-1 rounded-full">
              <svg className="w-4 h-4 text-amber" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              <span className="text-sm font-medium">{restaurant.rating.toFixed(1)}</span>
            </div>
          )}

          {priceDisplay && (
            <span className="bg-midnight/60 backdrop-blur-sm px-3 py-1 rounded-full text-sm text-cream-300">
              {priceDisplay}
            </span>
          )}

          {restaurant.cuisineType && (
            <span className="bg-midnight/60 backdrop-blur-sm px-3 py-1 rounded-full text-sm text-cream-300">
              {restaurant.cuisineType}
            </span>
          )}
        </div>

        {restaurant.address && (
          <p className="text-sm text-cream-400 truncate flex items-center gap-1.5">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
            </svg>
            {restaurant.address}
          </p>
        )}
      </div>
    </div>
  );
}
