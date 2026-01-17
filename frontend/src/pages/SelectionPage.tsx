// Selection page - Tinder-style swipeable restaurant selection
// Swipe right to like, swipe left to pass

import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getDemoRestaurants, submitDemoSelection, isDemoSessionComplete, computeDemoResults, leaveDemoSession, getDemoSession, simulateRemainingSubmissions } from '../services/demoSessionService';
import { getRestaurants } from '../services/apiClient';
import { submitSelection, leaveSession } from '../services/socketService';
import { DEMO_MODE } from '../config/demo';
import { useSessionStore } from '../stores/sessionStore';
import SwipeCard from '../components/SwipeCard';
import NavigationHeader from '../components/NavigationHeader';
import type { Restaurant } from '@dinder/shared/types';

export default function SelectionPage() {
  const navigate = useNavigate();
  const { sessionCode } = useParams<{ sessionCode: string }>();
  const { selections, addSelection, participants, currentUserId, updateParticipants, setResults, setSessionStatus } = useSessionStore();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [submittedCount, setSubmittedCount] = useState(0);
  const [lastAction, setLastAction] = useState<'like' | 'nope' | null>(null);

  // Refresh participants from local storage on mount (demo mode only)
  useEffect(() => {
    if (!sessionCode || !DEMO_MODE) return;
    try {
      const session = getDemoSession(sessionCode);
      updateParticipants(session.participants);
    } catch {
      navigate('/');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionCode]);

  useEffect(() => {
    const loadRestaurants = async () => {
      if (!sessionCode) {
        setError('Session code not found');
        setIsLoading(false);
        return;
      }

      try {
        // Use real backend API or demo data based on mode
        const data = DEMO_MODE
          ? getDemoRestaurants(sessionCode)
          : await getRestaurants(sessionCode);
        setRestaurants(data);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load restaurants');
      } finally {
        setIsLoading(false);
      }
    };

    loadRestaurants();
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
      if (DEMO_MODE) {
        if (!currentUserId) throw new Error('Missing participant');
        submitDemoSelection(sessionCode, currentUserId, selections);

        // Refresh participants and check completion
        const session = getDemoSession(sessionCode);
        updateParticipants(session.participants);
        setHasSubmitted(true);

        if (isDemoSessionComplete(sessionCode)) {
          const result = computeDemoResults(sessionCode);
          setResults(result);
          setSessionStatus('complete');
          navigate(`/session/${sessionCode}/results`);
        }
      } else {
        // Real backend - submit via WebSocket
        await submitSelection(sessionCode, selections);
        setHasSubmitted(true);
        // Results will be received via WebSocket session:results event
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit selections');
      setIsSubmitting(false);
    }
  };

  const handleLeaveSession = async () => {
    if (!sessionCode) return;

    try {
      if (DEMO_MODE) {
        if (currentUserId) {
          leaveDemoSession(sessionCode, currentUserId);
        }
        useSessionStore.getState().resetSession();
      } else {
        await leaveSession(sessionCode);
      }
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
      <div className="flex items-center justify-center min-h-screen bg-midnight">
        <div className="text-center">
          <div className="inline-block w-10 h-10 border-3 border-amber border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-cream-400 font-display text-lg">Finding restaurants...</p>
        </div>
      </div>
    );
  }

  if (hasSubmitted) {
    const handleSimulateOthers = () => {
      if (!sessionCode) return;
      simulateRemainingSubmissions(sessionCode);
      const session = getDemoSession(sessionCode);
      updateParticipants(session.participants);

      const result = computeDemoResults(sessionCode);
      setResults(result);
      setSessionStatus('complete');
      navigate(`/session/${sessionCode}/results`);
    };

    return (
      <div className="min-h-screen bg-warm-gradient">
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
            <div className="bg-midnight-100 rounded-3xl shadow-card border border-midnight-50/30 p-8">
              <div className="w-20 h-20 mx-auto mb-6 bg-success/20 rounded-full flex items-center justify-center">
                <svg className="w-10 h-10 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-3xl font-display font-semibold text-cream mb-3 text-glow">
                All Done!
              </h2>
              <p className="text-cream-400 mb-8 text-lg">
                Waiting for other diners...
              </p>

              <div className="mb-6">
                <div className="flex justify-center gap-2 mb-3">
                  {participants.map((p, i) => (
                    <div
                      key={i}
                      className={`w-3 h-3 rounded-full transition-all duration-500 ${
                        p.hasSubmitted ? 'bg-amber scale-110' : 'bg-midnight-50'
                      }`}
                    />
                  ))}
                </div>
                <p className="text-sm text-cream-500">
                  <span className="text-amber font-semibold">{submittedCount}</span> of{' '}
                  <span className="text-amber font-semibold">{participants.length}</span> have swiped
                </p>
              </div>

              {DEMO_MODE && (
                <>
                  <button className="btn btn-primary w-full" onClick={handleSimulateOthers}>
                    Simulate others finishing
                  </button>

                  <p className="text-xs text-cream-500/60 italic mt-4">
                    Demo shortcut to reach Results on one device
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isDone) {
    return (
      <div className="min-h-screen bg-warm-gradient">
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
            <div className="bg-midnight-100 rounded-3xl shadow-card border border-midnight-50/30 p-8">
              <div className="w-20 h-20 mx-auto mb-6 bg-amber/20 rounded-full flex items-center justify-center">
                <svg className="w-10 h-10 text-amber" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </div>

              <h2 className="text-3xl font-display font-semibold text-cream mb-3 text-glow">
                You've seen them all!
              </h2>
              <p className="text-cream-400 mb-6">
                You liked <span className="text-amber font-semibold">{selections.length}</span> restaurant{selections.length !== 1 ? 's' : ''}
              </p>

              {error && (
                <div className="mb-4 p-3 bg-error/10 border border-error/30 rounded-xl">
                  <p className="text-sm text-error-light">{error}</p>
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="w-full min-h-[56px] px-8 py-4 text-xl font-semibold text-midnight bg-gradient-to-r from-amber to-amber-300 rounded-2xl hover:from-amber-300 hover:to-amber-200 disabled:from-midnight-50 disabled:to-midnight-50 disabled:text-cream-500 disabled:cursor-not-allowed active:scale-[0.98] transition-all duration-300 shadow-glow hover:shadow-glow-lg disabled:shadow-none"
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-midnight border-t-transparent rounded-full animate-spin"></div>
                    Submitting...
                  </span>
                ) : (
                  'Submit Selections'
                )}
              </button>

              {selections.length === 0 && (
                <p className="mt-4 text-sm text-cream-500/70">
                  You didn't like any restaurants, but you can still submit!
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
    <main className="min-h-screen bg-warm-gradient flex flex-col">
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
          <div className="flex items-center gap-1.5 text-amber">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" />
            </svg>
            <span className="font-semibold">{selections.length}</span>
          </div>
        }
      />

      {/* Card Stack */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-4">
        <div className="relative w-full max-w-sm aspect-[3/4]">
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
                  lastAction === 'like' ? 'bg-success/30' : 'bg-error/30'
                }`}
              >
                {lastAction === 'like' ? (
                  <svg className="w-12 h-12 text-success animate-heart-pop" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" />
                  </svg>
                ) : (
                  <svg className="w-12 h-12 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="safe-bottom px-4 pb-6 pt-2">
        <div className="max-w-sm mx-auto flex items-center justify-center gap-8">
          {/* Nope Button */}
          <button
            onClick={handleSwipeLeft}
            className="w-16 h-16 rounded-full bg-midnight-100 border-2 border-error/40 flex items-center justify-center shadow-card hover:border-error hover:bg-error/10 active:scale-95 transition-all duration-200"
            aria-label="Pass"
          >
            <svg className="w-8 h-8 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Undo Button (optional future feature) */}
          <button
            onClick={() => {
              if (currentIndex > 0) {
                setCurrentIndex((prev) => prev - 1);
              }
            }}
            disabled={currentIndex === 0}
            className="w-12 h-12 rounded-full bg-midnight-100 border border-amber/30 flex items-center justify-center shadow-card hover:border-amber disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 transition-all duration-200"
            aria-label="Undo"
          >
            <svg className="w-5 h-5 text-amber" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          </button>

          {/* Like Button */}
          <button
            onClick={handleSwipeRight}
            className="w-16 h-16 rounded-full bg-midnight-100 border-2 border-success/40 flex items-center justify-center shadow-card hover:border-success hover:bg-success/10 active:scale-95 transition-all duration-200"
            aria-label="Like"
          >
            <svg className="w-8 h-8 text-success" fill="currentColor" viewBox="0 0 20 20">
              <path d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" />
            </svg>
          </button>
        </div>

        {/* Hint text */}
        <p className="text-center text-xs text-cream-500/60 mt-4">
          Swipe or use buttons to choose
        </p>
      </div>
    </main>
  );
}
