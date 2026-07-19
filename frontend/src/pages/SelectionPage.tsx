// Selection page - Tinder-style swipeable restaurant selection
// Swipe right to like, swipe left to pass

import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getRestaurants } from '../services/apiClient';
import { submitSelection, leaveSession } from '../services/socketBindings';
import { useSessionStore } from '../stores/sessionStore';
import SwipeCard from '../components/SwipeCard';
import NavigationHeader from '../components/NavigationHeader';
import type { Restaurant } from '@dinder/shared/types';
import { participantRingClass } from '../utils/participantStyles';

export default function SelectionPage() {
  const navigate = useNavigate();
  const { sessionCode } = useParams<{ sessionCode: string }>();
  const { selections, addSelection, removeSelection, participants } = useSessionStore();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [submittedCount, setSubmittedCount] = useState(0);
  const [lastAction, setLastAction] = useState<'like' | 'nope' | null>(null);

  useEffect(() => {
    const loadRestaurants = async () => {
      if (!sessionCode) {
        setError('Session code not found');
        setIsLoading(false);
        return;
      }

      try {
        const data = await getRestaurants(sessionCode);
        setRestaurants(data);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load restaurants');
      } finally {
        setIsLoading(false);
      }
    };

    void loadRestaurants();
  }, [sessionCode]);

  // Listen for participant submissions
  useEffect(() => {
    const count = participants.filter((p) => p.hasSubmitted).length;
    setSubmittedCount(count);
  }, [participants]);

  // Navigate to results when session is complete
  const sessionStatus = useSessionStore((state) => state.sessionStatus);
  useEffect(() => {
    if (sessionStatus === 'complete') {
      navigate(`/session/${sessionCode}/results`);
    }
  }, [sessionStatus, sessionCode, navigate]);

  const handleSwipeLeft = useCallback(() => {
    setLastAction('nope');
    setTimeout(() => setLastAction(null), 600);
    setCurrentIndex((prev) => prev + 1);
  }, []);

  const handleSwipeRight = useCallback(() => {
    const restaurant = restaurants[currentIndex];
    if (restaurant) {
      addSelection(restaurant.placeId);
    }
    setLastAction('like');
    setTimeout(() => setLastAction(null), 600);
    setCurrentIndex((prev) => prev + 1);
  }, [currentIndex, restaurants, addSelection]);

  const handleSubmit = async () => {
    if (!sessionCode) {
      setError('Session code not found');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const ack = await submitSelection(sessionCode, selections);
      if (ack.success) {
        setHasSubmitted(true);
        // Results will be received via WebSocket session:results event
      } else {
        setError(ack.error.message);
        setIsSubmitting(false);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit selections');
      setIsSubmitting(false);
    }
  };

  const handleLeaveSession = async () => {
    if (!sessionCode) return;

    try {
      await leaveSession(sessionCode);
      navigate('/');
    } catch (err) {
      console.error('Failed to leave session:', err);
      // Still navigate home even if backend call fails
      useSessionStore.getState().resetSession();
      navigate('/');
    }
  };

  // Check if we've gone through all restaurants
  const isDone = currentIndex >= restaurants.length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-ink">
        <div className="text-center">
          <div className="inline-block w-10 h-10 border-3 border-cyan border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-muted font-display text-lg">Finding restaurants...</p>
        </div>
      </div>
    );
  }

  if (hasSubmitted) {
    return (
      <div className="min-h-screen bg-ink">
        <NavigationHeader
          title="Waiting for Others"
          sessionCode={sessionCode}
          showBackButton
          onBack={handleLeaveSession}
          confirmOnBack
          confirmContext="selecting"
          selectionsCount={selections.length}
          showConnectionStatus
          compact
        />

        <div className="flex items-center justify-center px-4 py-8">
          <div className="max-w-md w-full text-center animate-fade-in">
            <div className="card p-8">
              <div className="w-20 h-20 mx-auto mb-6 bg-lime/10 border border-lime/30 rounded-full flex items-center justify-center">
                <svg
                  className="w-10 h-10 text-lime"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-3xl font-display font-black text-text mb-3">All Done!</h2>
              <p className="text-muted mb-8 text-lg">Waiting for other diners...</p>

              <div className="mb-6">
                <div className="flex justify-center gap-2 mb-3">
                  {participants.map((p, i) => (
                    <div
                      key={i}
                      className={`w-3 h-3 rounded-full transition-all duration-500 ${
                        p.hasSubmitted ? 'bg-lime shadow-glow-lime scale-110' : 'bg-line'
                      }`}
                    />
                  ))}
                </div>
                <p className="text-sm text-muted">
                  <span className="text-lime font-semibold">{submittedCount}</span> of{' '}
                  <span className="text-cyan font-semibold">{participants.length}</span> have swiped
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isDone) {
    return (
      <div className="min-h-screen bg-ink">
        <NavigationHeader
          title="Submit Your Picks"
          sessionCode={sessionCode}
          showBackButton
          onBack={handleLeaveSession}
          confirmOnBack
          confirmContext="selecting"
          selectionsCount={selections.length}
          showConnectionStatus
          compact
        />

        <div className="flex flex-col items-center justify-center px-4 py-8">
          <div className="max-w-md w-full text-center animate-fade-in">
            <div className="card p-8">
              <div className="w-20 h-20 mx-auto mb-6 bg-lime/10 rounded-full flex items-center justify-center">
                <svg
                  className="w-10 h-10 text-lime"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                  />
                </svg>
              </div>

              <h2 className="text-3xl font-display font-black text-text mb-3">
                You&apos;ve seen them all!
              </h2>
              <p className="text-muted mb-6">
                You liked <span className="text-lime font-semibold">{selections.length}</span>{' '}
                restaurant{selections.length !== 1 ? 's' : ''}
              </p>

              {error && (
                <div className="mb-4 p-3 bg-coral/10 border border-coral/30 rounded-xl">
                  <p className="text-sm text-coral-soft">{error}</p>
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="btn btn-primary w-full min-h-[56px] px-8 py-4 text-xl"
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Submitting...
                  </span>
                ) : (
                  'Submit Selections'
                )}
              </button>

              {selections.length === 0 && (
                <p className="mt-4 text-sm text-muted/70">
                  You didn&apos;t like any restaurants, but you can still submit!
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Get the visible cards (current + next 2 for stack effect)
  const visibleRestaurants = restaurants.slice(currentIndex, currentIndex + 3);

  return (
    <main className="h-screen-dvh overflow-hidden bg-ink flex flex-col">
      {/* Navigation Header */}
      <NavigationHeader
        title="Choose Restaurants"
        sessionCode={sessionCode}
        showBackButton
        onBack={handleLeaveSession}
        confirmOnBack
        confirmContext="selecting"
        selectionsCount={selections.length}
        showConnectionStatus
        compact
        progress={{
          current: currentIndex + 1,
          total: restaurants.length,
        }}
        rightAction={
          <div
            className="flex items-center gap-1.5 text-lime"
            role="status"
            aria-label={`${selections.length} liked`}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" />
            </svg>
            <span className="font-semibold">{selections.length}</span>
          </div>
        }
      />

      {/* Card Stack */}
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-4 py-3">
        <div className="mb-3 flex w-full max-w-sm flex-shrink-0 items-center justify-between rounded-full border border-line bg-raised/90 px-3 py-2">
          <div className="flex -space-x-2" aria-label="Participants choosing">
            {participants.map((participant, index) => (
              <div
                key={participant.participantId}
                aria-label={`${participant.displayName} is choosing`}
                className={`flex h-8 w-8 items-center justify-center rounded-full border-2 bg-surface text-xs font-black text-text ${participantRingClass(index)}`}
              >
                {participant.displayName.charAt(0).toUpperCase()}
              </div>
            ))}
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-cyan">
            {participants.length} together
          </p>
        </div>
        <div
          data-testid="card-stack"
          className="relative w-full max-w-sm flex-1 min-h-0 max-h-[30rem]"
        >
          {visibleRestaurants.map((restaurant, index) => (
            <SwipeCard
              key={restaurant.placeId}
              restaurant={restaurant}
              onSwipeLeft={handleSwipeLeft}
              onSwipeRight={handleSwipeRight}
              isTop={index === 0}
              stackPosition={index}
            />
          ))}

          {/* Action feedback overlay */}
          {lastAction && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-50">
              <div
                className={`w-24 h-24 rounded-full flex items-center justify-center animate-pulse-glow ${
                  lastAction === 'like' ? 'bg-lime/30' : 'bg-coral/30'
                }`}
              >
                {lastAction === 'like' ? (
                  <svg
                    className="w-12 h-12 text-lime animate-heart-pop"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" />
                  </svg>
                ) : (
                  <svg
                    className="w-12 h-12 text-coral"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="safe-bottom flex-shrink-0 px-4 pb-4 pt-2">
        <div className="max-w-sm mx-auto flex items-center justify-center gap-8">
          {/* Nope Button */}
          <button
            onClick={handleSwipeLeft}
            className="min-h-[48px] min-w-[48px] w-[76px] h-[76px] rounded-full bg-surface border-2 border-coral-soft text-coral-soft flex items-center justify-center shadow-glow-coral hover:bg-coral/10 active:scale-95 transition-all duration-150"
            aria-label="Pass"
          >
            <svg
              className="w-9 h-9"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Undo Button (optional future feature) */}
          <button
            onClick={() => {
              if (currentIndex > 0) {
                const previous = restaurants[currentIndex - 1];
                if (previous) {
                  removeSelection(previous.placeId);
                }
                setCurrentIndex((prev) => prev - 1);
              }
            }}
            disabled={currentIndex === 0}
            className="w-12 h-12 rounded-full bg-raised border border-line text-muted flex items-center justify-center shadow-card hover:border-cyan hover:text-cyan disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 transition-all duration-150"
            aria-label="Undo"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
              />
            </svg>
          </button>

          {/* Like Button */}
          <button
            onClick={handleSwipeRight}
            className="min-h-[48px] min-w-[48px] w-[76px] h-[76px] rounded-full bg-surface border-2 border-lime text-lime flex items-center justify-center shadow-glow-lime hover:bg-lime/10 active:scale-95 transition-all duration-150"
            aria-label="Like"
          >
            <svg className="w-9 h-9" fill="currentColor" viewBox="0 0 20 20">
              <path d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" />
            </svg>
          </button>
        </div>

        {/* Hint text */}
        <p className="text-center text-xs text-muted mt-2">Swipe or use buttons to choose</p>
      </div>
    </main>
  );
}
