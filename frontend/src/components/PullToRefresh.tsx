// Pull-to-Refresh Component
// Native-like pull-to-refresh for mobile devices

import { ReactNode, useState, useRef, useCallback, useEffect } from 'react';
import { useHaptics } from '../hooks/useHaptics';

interface PullToRefreshProps {
  children: ReactNode;
  onRefresh: () => Promise<void>;
  className?: string;
  pullThreshold?: number;
  maxPull?: number;
  disabled?: boolean;
}

export default function PullToRefresh({
  children,
  onRefresh,
  className = '',
  pullThreshold = 80,
  maxPull = 120,
  disabled = false,
}: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef(0);
  const currentYRef = useRef(0);

  const { triggerMedium, triggerSuccess } = useHaptics();

  const canPull = useCallback(() => {
    if (disabled || isRefreshing) return false;
    const container = containerRef.current;
    if (!container) return false;
    // Only allow pull when scrolled to top
    return container.scrollTop <= 0;
  }, [disabled, isRefreshing]);

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (!canPull()) return;
      startYRef.current = e.touches[0].clientY;
      currentYRef.current = e.touches[0].clientY;
    },
    [canPull]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!canPull() || startYRef.current === 0) return;

      currentYRef.current = e.touches[0].clientY;
      const delta = currentYRef.current - startYRef.current;

      if (delta > 0) {
        e.preventDefault();
        setIsPulling(true);
        // Apply resistance for natural feel
        const resistance = 0.5;
        const distance = Math.min(delta * resistance, maxPull);
        setPullDistance(distance);

        // Haptic feedback when crossing threshold
        if (distance >= pullThreshold && pullDistance < pullThreshold) {
          triggerMedium();
        }
      }
    },
    [canPull, maxPull, pullThreshold, pullDistance, triggerMedium]
  );

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling) return;

    if (pullDistance >= pullThreshold) {
      setIsRefreshing(true);
      try {
        await onRefresh();
        triggerSuccess();
      } catch {
        // Handle error silently
      } finally {
        setIsRefreshing(false);
      }
    }

    setPullDistance(0);
    setIsPulling(false);
    startYRef.current = 0;
    currentYRef.current = 0;
  }, [isPulling, pullDistance, pullThreshold, onRefresh, triggerSuccess]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  const indicatorProgress = Math.min(pullDistance / pullThreshold, 1);
  const showIndicator = pullDistance > 0 || isRefreshing;

  return (
    <div ref={containerRef} className={`relative overflow-auto ${className}`}>
      {/* Pull indicator */}
      <div
        className="absolute left-0 right-0 flex justify-center pointer-events-none z-50"
        style={{
          top: 0,
          height: pullDistance,
          transition: isPulling ? 'none' : 'height 0.3s ease-out',
        }}
      >
        {showIndicator && (
          <div
            className="flex items-center justify-center"
            style={{
              transform: `translateY(${Math.max(pullDistance - 40, 0)}px)`,
              transition: isPulling ? 'none' : 'transform 0.3s ease-out',
            }}
          >
            <div
              className={`w-10 h-10 rounded-full bg-midnight-100 border border-amber/30 flex items-center justify-center shadow-card ${
                isRefreshing ? '' : ''
              }`}
              style={{
                transform: `rotate(${indicatorProgress * 360}deg)`,
                opacity: indicatorProgress,
              }}
            >
              {isRefreshing ? (
                <svg
                  className="w-5 h-5 text-amber animate-spinner"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              ) : (
                <svg
                  className={`w-5 h-5 transition-colors ${
                    indicatorProgress >= 1 ? 'text-amber' : 'text-cream-400'
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  style={{
                    transform: `rotate(${indicatorProgress >= 1 ? 180 : 0}deg)`,
                    transition: 'transform 0.2s ease-out',
                  }}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Content wrapper */}
      <div
        style={{
          transform: `translateY(${pullDistance}px)`,
          transition: isPulling ? 'none' : 'transform 0.3s ease-out',
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// REFRESH INDICATOR INLINE
// A simpler refresh indicator for non-scroll contexts
// ═══════════════════════════════════════════════════════════════════

interface RefreshIndicatorProps {
  isRefreshing: boolean;
  className?: string;
}

export function RefreshIndicator({ isRefreshing, className = '' }: RefreshIndicatorProps) {
  if (!isRefreshing) return null;

  return (
    <div className={`flex items-center justify-center py-4 ${className}`}>
      <div className="w-8 h-8 rounded-full bg-midnight-100 border border-amber/30 flex items-center justify-center">
        <svg
          className="w-4 h-4 text-amber animate-spinner"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
      </div>
    </div>
  );
}
