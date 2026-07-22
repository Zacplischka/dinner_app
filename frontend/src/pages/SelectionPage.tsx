// Selection page - Tinder-style swipeable restaurant selection
// Swipe right to like, swipe left to pass

import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getRestaurants } from '../services/apiClient';
import { submitSelection, leaveSession, sendLiveSelection } from '../services/socketBindings';
import { useSessionStore } from '../stores/sessionStore';
import SwipeCard from '../components/SwipeCard';
import NavigationHeader from '../components/NavigationHeader';
import type { Restaurant } from '@dinder/shared/types';
import { participantRingClass } from '../utils/participantStyles';

interface LiveRevealInput {
  placeId: string;
  selectorNames: string[];
  likedByMe: boolean;
  participantNames: string[];
}

// Anti-over-count: only names still in the Session count, then clamp. The filter
// is exact (it is what makes `participant:left` read `2 of 2`); the Math.min is
// belt-and-braces. The strip may never render {n} of {m} with n > m.
export function liveReveal({ selectorNames, likedByMe, participantNames }: LiveRevealInput): {
  count: number;
  fullHouse: boolean;
} {
  const count = Math.min(
    selectorNames.filter((n) => participantNames.includes(n)).length + (likedByMe ? 1 : 0),
    participantNames.length
  );
  return {
    count,
    fullHouse: count === participantNames.length && participantNames.length >= 2,
  };
}

export default function SelectionPage() {
  const navigate = useNavigate();
  const { sessionCode } = useParams<{ sessionCode: string }>();
  const { selections, addSelection, removeSelection, participants, liveSelections } =
    useSessionStore();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [submittedCount, setSubmittedCount] = useState(0);
  const [lastAction, setLastAction] = useState<'like' | 'nope' | null>(null);
  const [reveal, setReveal] = useState<{ count: number; total: number; name: string } | null>(null);
  const [fullHousePlaceId, setFullHousePlaceId] = useState<string | null>(null);
  const announcedRef = useRef<Set<string>>(new Set());
  const fullHouseShownRef = useRef(false); // once per visit to the deck
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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

  // A Live Selection is revealed only for Restaurants strictly BEHIND the cursor —
  // never the one being decided (anti-conformity, spec kill-risk (b)), and never a
  // card ahead (which is also how a buffered event survives until you reach it).
  useEffect(() => {
    const unlocked = restaurants
      .slice(0, currentIndex)
      .filter((r) => liveSelections[r.placeId]?.length && !announcedRef.current.has(r.placeId));
    if (unlocked.length === 0) return;

    const participantNames = participants.map((p) => p.displayName);
    const withResult = unlocked.map((r) => ({
      restaurant: r,
      result: liveReveal({
        placeId: r.placeId,
        selectorNames: liveSelections[r.placeId] ?? [],
        likedByMe: selections.includes(r.placeId),
        participantNames,
      }),
    }));

    // One reveal slot, N unlocks: a Full House wins over a plain reveal; otherwise
    // last-one-wins (the earlier unlocks are stale by the time they would show). The
    // rest are marked announced and never surface.
    // ponytail: no queue — upgrade to a 4s queue if testers report missed reveals.
    const fullHouses = withResult.filter((x) => x.result.fullHouse);
    const pool = fullHouses.length ? fullHouses : withResult;
    const latest = pool[pool.length - 1];
    unlocked.forEach((r) => announcedRef.current.add(r.placeId));

    clearTimeout(revealTimerRef.current);
    setReveal({
      count: latest.result.count,
      total: participantNames.length,
      name: latest.restaurant.name,
    });
    revealTimerRef.current = setTimeout(() => setReveal(null), 4000);

    if (latest.result.fullHouse && !fullHouseShownRef.current) {
      fullHouseShownRef.current = true;
      setFullHousePlaceId(latest.restaurant.placeId);
    }

    return () => clearTimeout(revealTimerRef.current);
  }, [liveSelections, currentIndex, restaurants, participants, selections]);

  // Full House takeover: push a history entry so the hardware back button dismisses
  // the overlay instead of leaving the deck. Escape and Keep swiping both go through
  // history.back() → popstate → clear.
  useEffect(() => {
    if (!fullHousePlaceId) return;
    window.history.pushState({ dinderFullHouse: true }, '');
    const onPop = () => setFullHousePlaceId(null);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [fullHousePlaceId]);

  // Keep swiping, Escape and the hardware back button are all this.
  const keepSwiping = () => window.history.back();
  // ponytail: a successful Finish here unmounts the overlay with the pushed entry
  // still on the stack, so one hardware back from "All Done!" is swallowed (same
  // URL, nothing re-renders). Ceiling: one dead back-tap. Upgrade: history.back()
  // in the effect cleanup when the entry was not consumed by popstate.

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
      // ponytail: fire-and-forget — nothing branches on the ack, and a failed
      // Live Selection costs only a missing reveal on someone else's phone.
      // The Match still comes from selection:submit. Ceiling: silent chrome
      // loss on a flaky socket; upgrade is a retry queue, not worth it.
      if (sessionCode) void sendLiveSelection(sessionCode, restaurant.placeId);
    }
    setLastAction('like');
    setTimeout(() => setLastAction(null), 600);
    setCurrentIndex((prev) => prev + 1);
  }, [currentIndex, restaurants, addSelection, sessionCode]);

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

  const fullHouseName = restaurants.find((r) => r.placeId === fullHousePlaceId)?.name;
  const deckInert = fullHousePlaceId !== null;

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
      <div
        className={`flex-1 min-h-0 flex flex-col items-center justify-center px-4 py-3${deckInert ? ' pointer-events-none' : ''}`}
        aria-hidden={deckInert}
      >
        <div className="mb-3 flex w-full max-w-sm flex-shrink-0 items-center justify-between rounded-full border border-line bg-raised/90 px-3 py-2">
          <div className="flex shrink-0 -space-x-2" aria-label="Participants choosing">
            {participants.map((participant, index) => {
              const isOffline = participant.isOnline === false;
              return (
                <div
                  key={participant.participantId}
                  aria-label={`${participant.displayName} is ${isOffline ? 'offline' : 'choosing'}`}
                  className={`flex h-8 w-8 items-center justify-center rounded-full border-2 bg-surface text-xs font-black text-text ${participantRingClass(index)}${isOffline ? ' opacity-40' : ''}`}
                >
                  {participant.displayName.charAt(0).toUpperCase()}
                </div>
              );
            })}
          </div>
          <p
            data-testid="strip-status"
            role="status"
            aria-live="polite"
            className="ml-2 min-w-0 truncate text-xs font-bold uppercase tracking-[0.12em] text-cyan"
          >
            {reveal
              ? `${reveal.count} of ${reveal.total} liked ${reveal.name}`
              : `${participants.length} together`}
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
      <div
        className={`safe-bottom flex-shrink-0 px-4 pb-4 pt-2${deckInert ? ' pointer-events-none' : ''}`}
        aria-hidden={deckInert}
      >
        <div className="max-w-sm mx-auto flex items-center justify-center gap-8">
          {/* Nope Button */}
          <button
            onClick={handleSwipeLeft}
            disabled={deckInert}
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
                setReveal(null); // Undo puts a revealed Restaurant back at/ahead of the cursor — a
                // visible count while you re-decide is the exact herding setup the
                // gate exists to prevent. The announced ref is never un-marked, so
                // re-deciding it produces no second reveal.
              }
            }}
            disabled={currentIndex === 0 || deckInert}
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
            disabled={deckInert}
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

      {/* Full House takeover */}
      {fullHousePlaceId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/90 backdrop-blur-[10px] p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="full-house-title"
          onKeyDown={(e) => {
            if (e.key === 'Escape') keepSwiping();
          }}
        >
          <div className="card w-full max-w-sm text-center animate-fade-in">
            <div className="mb-3 flex justify-center gap-1" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <svg key={i} className="w-8 h-8 text-lime" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" />
                </svg>
              ))}
            </div>
            <h2 id="full-house-title" className="text-2xl font-display font-black text-lime mb-3">
              EVERYONE LIKED THIS
            </h2>
            <p className="text-3xl font-display font-black text-text mb-3 truncate">
              {fullHouseName}
            </p>
            <p className="text-muted mb-6">Lock it in now, or keep going for more.</p>

            {error && (
              <div className="mb-4 p-3 bg-coral/10 border border-coral/30 rounded-xl">
                <p className="text-sm text-coral-soft">Could not submit — try again</p>
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              autoFocus
              className="btn btn-primary w-full min-h-[56px] px-8 py-4 text-xl"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Submitting...
                </span>
              ) : (
                'Finish here'
              )}
            </button>

            <button onClick={keepSwiping} className="btn btn-ghost w-full min-h-[48px] mt-3">
              Keep swiping
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
