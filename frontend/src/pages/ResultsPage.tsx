// Results page - Show overlapping selections and all participants' choices
// Based on: specs/001-dinner-decider-enables/tasks.md T056

import { useNavigate, useParams } from 'react-router-dom';
import type { Restaurant } from '@dinder/shared/types';
import type { Participant } from '../types';
import { restartSession, leaveSession } from '../services/socketBindings';
import { API_BASE_URL } from '../services/apiClient';
import { useSessionStore } from '../stores/sessionStore';
import { useOrderStore } from '../stores/orderStore';
import { useEffect, useState } from 'react';
import NavigationHeader from '../components/NavigationHeader';
import { useToast } from '../hooks/useToast';
import { participantRingClass } from '../utils/participantStyles';
import {
  DeliveryActions,
  generateUberEatsUrl,
  generateDoorDashUrl,
} from '../components/DeliveryActions';

// Near Miss buttons go through the backend counting redirect (#72) so card
// actions are server-countable; Match card buttons keep their direct links.
const nearMissRedirectUrl = (platform: 'ubereats' | 'doordash', placeId: string): string =>
  `${API_BASE_URL}/redirect?platform=${platform}&placeId=${encodeURIComponent(placeId)}&source=near_miss`;

// Match card hero (#75): real photo or no hero — a failed load removes the
// image and restores the text-only layout. Own component so the failure state
// stays per-card (Rules of Hooks inside the .map()).
function MatchHero({ photoUrl }: { photoUrl: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      src={photoUrl}
      alt=""
      className="w-full h-32 sm:h-40 object-cover rounded-market-md mb-3"
      onError={() => setFailed(true)}
    />
  );
}

// priceLevel is omitted from the data when unknown; 0 means genuinely free.
const formatPriceLevel = (level: number): string => {
  if (level === 0) return 'Free';
  return '$'.repeat(level);
};

// The Match card, extracted (#166) so the crowned Restaurant and the
// collapsed "other matches" render from the same markup — same
// `data-match-card` attribute, same classes (neon-components.test.tsx#187-202).
function MatchCard({
  restaurant,
  comparePath,
  ubereatsHref,
  doordashHref,
  eyebrow,
  reason,
  isCrown = false,
}: {
  restaurant: Restaurant;
  comparePath: string;
  ubereatsHref: string;
  doordashHref: string;
  eyebrow?: string;
  reason?: string;
  isCrown?: boolean;
}) {
  const navigate = useNavigate();
  const { sessionCode } = useParams<{ sessionCode: string }>();
  const noMenuPlaceIds = useOrderStore((state) => state.noMenuPlaceIds);
  const canOrderTogether = isCrown && !noMenuPlaceIds.includes(restaurant.placeId);

  return (
    <div
      data-match-card
      className="p-4 bg-lime/10 border border-lime rounded-market-md shadow-glow-lime"
    >
      {restaurant.photoUrl && <MatchHero photoUrl={restaurant.photoUrl} />}
      {eyebrow && (
        <p className="text-xs font-semibold tracking-[0.14em] text-lime mb-1">{eyebrow}</p>
      )}
      <p className="text-lg font-semibold text-text">{restaurant.name}</p>
      {reason && <p className="text-sm text-muted mt-1">{reason}</p>}

      <div className="mt-2 space-y-2">
        <div className="flex items-center space-x-3 text-sm">
          {restaurant.rating !== undefined && (
            <span className="flex items-center text-amber gap-1">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              {restaurant.rating.toFixed(1)}
            </span>
          )}
          {restaurant.priceLevel !== undefined && (
            <span className="text-muted font-medium">
              {formatPriceLevel(restaurant.priceLevel)}
            </span>
          )}
          {restaurant.cuisineType && <span className="text-muted">{restaurant.cuisineType}</span>}
        </div>
        {restaurant.address && (
          <p className="text-sm text-muted flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            {restaurant.address}
          </p>
        )}

        {canOrderTogether && (
          <div>
            <button
              className="btn btn-primary w-full min-h-[48px]"
              onClick={() => {
                useSessionStore.getState().setOrderPlaceId(restaurant.placeId);
                navigate(`/session/${sessionCode}/order`);
              }}
            >
              Order together
            </button>
            <p className="mt-1 text-xs text-muted">Build one basket from everyone&apos;s phones</p>
          </div>
        )}

        {/* Delivery Order Buttons - Elegant cards with brand logos */}
        <DeliveryActions
          ubereatsHref={ubereatsHref}
          doordashHref={doordashHref}
          comparePath={comparePath}
        />
      </div>
    </div>
  );
}

// The per-Participant Selection lists, shared by the always-visible
// "Everyone's Selections" section and the unanimous-vote disclosure (#85).
function SelectionsList({
  participants,
  allSelections,
  overlappingOptions,
  restaurantNameMap,
}: {
  participants: Participant[];
  allSelections: Record<string, string[]>;
  overlappingOptions: Restaurant[];
  restaurantNameMap: Map<string, string>;
}) {
  return (
    <div className="space-y-4">
      {participants.map((participant, participantIndex) => {
        const participantSelections = allSelections[participant.displayName] || [];
        return (
          <div
            key={participant.participantId}
            className="border-b border-line/30 pb-4 last:border-b-0 last:pb-0"
          >
            <div className="flex items-center space-x-2 mb-2">
              <div
                className={`w-8 h-8 bg-surface border-2 rounded-full flex items-center justify-center text-text text-sm font-semibold ${participantRingClass(participantIndex)}`}
              >
                {participant.displayName.charAt(0).toUpperCase()}
              </div>
              <p className="font-semibold text-text">{participant.displayName}</p>
            </div>
            <div className="ml-10">
              {participantSelections.length > 0 ? (
                <ul className="text-sm text-muted space-y-1">
                  {participantSelections.map((selectionId) => {
                    // Check if this selection is a match (in overlappingOptions)
                    const isMatch = overlappingOptions.some((o) => o.placeId === selectionId);

                    // Get display name from our lookup map, or fall back to selectionId
                    const displayName = restaurantNameMap.get(selectionId) || selectionId;

                    return (
                      <li key={selectionId} className="flex items-center space-x-2">
                        {isMatch && (
                          <svg
                            className="w-4 h-4 text-lime"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                        <span className={isMatch ? 'font-medium text-lime' : ''}>
                          {displayName}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-muted/60 italic">No selections</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function ResultsPage() {
  const navigate = useNavigate();
  const { sessionCode } = useParams<{ sessionCode: string }>();
  const {
    overlappingOptions,
    allSelections,
    restaurantNames,
    participants,
    restaurants,
    sessionStatus,
    topPick,
  } = useSessionStore();
  const [isRestarting, setIsRestarting] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();

  const hasOverlap = overlappingOptions.length > 0;

  // An older backend sends no topPick; crown the best-rated Match rather than branching the UI.
  const fallbackCrown = [...overlappingOptions].sort(
    (a, b) => (b.rating ?? -1) - (a.rating ?? -1)
  )[0];
  const pick =
    topPick ??
    (fallbackCrown
      ? { restaurant: fallbackCrown, likedBy: participants.length, of: participants.length }
      : undefined);

  // #14: a Restart from any Participant flips the Session back to selecting —
  // every tab still on results follows, not just the one that tapped the button.
  useEffect(() => {
    if (sessionStatus === 'selecting' && sessionCode) {
      navigate(`/session/${sessionCode}/select`);
    }
  }, [sessionStatus, sessionCode, navigate]);

  // Create a lookup map for restaurant names by placeId
  const restaurantNameMap = new Map<string, string>();
  // First, populate from restaurantNames received from backend (most complete source)
  if (restaurantNames) {
    Object.entries(restaurantNames).forEach(([placeId, name]) => {
      restaurantNameMap.set(placeId, name);
    });
  }
  // Also add from local restaurants array (what current user searched)
  restaurants.forEach((r) => {
    restaurantNameMap.set(r.placeId, r.name);
  });
  // Also add from overlappingOptions (in case restaurants array isn't populated)
  overlappingOptions.forEach((o) => {
    restaurantNameMap.set(o.placeId, o.name);
  });

  // Near Misses (#72): the all-but-one tier, reduced client-side from the
  // Selections already in the results payload. Empty Match, 3+ Participants only.
  const nearMisses: Pick<Restaurant, 'placeId' | 'name' | 'rating'>[] = [];
  if (!hasOverlap && participants.length >= 3) {
    const selectionCounts = new Map<string, number>();
    participants.forEach((participant) => {
      (allSelections[participant.displayName] || []).forEach((placeId) => {
        selectionCounts.set(placeId, (selectionCounts.get(placeId) || 0) + 1);
      });
    });
    const restaurantsById = new Map(restaurants.map((r) => [r.placeId, r]));
    selectionCounts.forEach((count, placeId) => {
      if (count !== participants.length - 1) return;
      if (pick && placeId === pick.restaurant.placeId) return;
      nearMisses.push(
        restaurantsById.get(placeId) ?? { placeId, name: restaurantNameMap.get(placeId) || placeId }
      );
    });
    nearMisses.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
  }

  // Unanimous Selections (#85): when every Participant selected the same
  // non-empty set, the per-Participant copies are redundant — collapse them
  // behind a disclosure. Identical empty lists don't count: an empty Match
  // keeps its transparency lists visible.
  const sameSelections = (a: string[], b: string[]) =>
    a.length === b.length && a.every((placeId) => b.includes(placeId));
  const firstSelections =
    participants.length > 0 ? allSelections[participants[0].displayName] || [] : [];
  const isUnanimous =
    firstSelections.length > 0 &&
    participants.every((participant) =>
      sameSelections(allSelections[participant.displayName] || [], firstSelections)
    );

  const handleRestart = async () => {
    if (!sessionCode) return;

    setIsRestarting(true);
    setError('');

    try {
      const ack = await restartSession(sessionCode);
      if (ack.success) {
        // Reset local store selections/results
        useSessionStore.getState().resetSelections();
        // Navigate back to selection page
        navigate(`/session/${sessionCode}/select`);
      } else {
        setError(ack.error.message);
        setIsRestarting(false);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to restart session');
      setIsRestarting(false);
    }
  };

  const handleNewSession = () => {
    navigate('/');
  };

  const handleLeaveSession = async () => {
    if (!sessionCode) return;

    try {
      await leaveSession(sessionCode);
      useSessionStore.getState().resetSession();
      navigate('/');
    } catch (err) {
      console.error('Failed to leave session:', err);
      useSessionStore.getState().resetSession();
      navigate('/');
    }
  };

  const handleShareResults = () => {
    const url = window.location.href;
    navigator.clipboard
      .writeText(url)
      .then(() => toast.success('Results link copied!'))
      .catch(() => toast.error('Could not copy link'));
  };

  // The crown's one-line reason (top-pick.md's copy table).
  const pickReason = (crowned: NonNullable<typeof pick>): string => {
    if (crowned.likedBy === crowned.of && overlappingOptions.length === 1) {
      return 'Everyone swiped yes on this one.';
    }
    if (crowned.likedBy === crowned.of && overlappingOptions.length > 1) {
      return `Everyone swiped yes — best rated of your ${overlappingOptions.length} matches.`;
    }
    if (crowned.likedBy > 0 && crowned.likedBy < crowned.of) {
      return `${crowned.likedBy} of ${crowned.of} swiped yes — the closest you got.`;
    }
    return "Nobody swiped yes, so here's the highest rated nearby.";
  };

  return (
    <main className="min-h-screen bg-ink">
      {/* Navigation Header */}
      <NavigationHeader
        title={pick ? (hasOverlap ? 'Perfect Match!' : "Tonight's Pick") : 'No Match Found'}
        subtitle={
          pick
            ? hasOverlap
              ? "Tonight's pick is locked in"
              : "No unanimous Match — here's the closest one"
            : "No restaurants matched everyone's preferences"
        }
        sessionCode={sessionCode}
        showBackButton
        onBack={handleLeaveSession}
        confirmOnBack
        confirmContext="results"
        rightAction={
          <button
            onClick={handleShareResults}
            className="min-h-[44px] min-w-[44px] p-2 text-muted hover:text-cyan transition-colors"
            title="Share results"
            aria-label="Share results"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
              />
            </svg>
          </button>
        }
      />

      <div className="max-w-2xl mx-auto px-4 py-6 animate-fade-in">
        {/* Celebration leads; rays sit behind the heading, fade inside the
            header block, and freeze under reduced motion (see index.css). */}
        {hasOverlap && (
          <div className="match-celebration mb-6 text-center">
            <div className="match-rays" data-match-rays aria-hidden="true" />
            <h2 className="relative inline-block animate-match-pop rounded-market-md px-5 py-2 text-4xl font-black tracking-[0.14em] text-lime shadow-match">
              MATCH!
            </h2>
            <p className="relative mt-4 text-muted">Everyone found the same spark.</p>
          </div>
        )}

        {pick ? (
          <div className={hasOverlap ? 'match-warm-glow mb-6' : 'mb-6'}>
            {/* The crowned Restaurant is the dominant surface — no wrapper card
                competing with it. Warm glow is reflected light from the celebration. */}
            <MatchCard
              restaurant={pick.restaurant}
              eyebrow="TONIGHT'S PICK"
              reason={pickReason(pick)}
              isCrown
              ubereatsHref={
                hasOverlap
                  ? generateUberEatsUrl(pick.restaurant.name, pick.restaurant.address)
                  : nearMissRedirectUrl('ubereats', pick.restaurant.placeId)
              }
              doordashHref={
                hasOverlap
                  ? generateDoorDashUrl(pick.restaurant.name, pick.restaurant.address)
                  : nearMissRedirectUrl('doordash', pick.restaurant.placeId)
              }
              // ponytail: reusing near_miss for the no-Match crown keeps the #68 kill-gate
              // vocabulary closed; if the gate needs crowned taps separated, add 'top_pick'
              // to COMPARISON_TAP_SOURCES (additive).
              comparePath={`/compare/${encodeURIComponent(pick.restaurant.placeId)}?source=${hasOverlap ? 'match_card' : 'near_miss'}`}
            />

            {hasOverlap && overlappingOptions.length > 1 && (
              <details className="card group mb-6 mt-4">
                <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-muted transition-colors hover:text-text [&::-webkit-details-marker]:hidden">
                  Other matches ({overlappingOptions.length - 1})
                  <svg
                    className="h-4 w-4 transition-transform duration-200 group-open:rotate-180"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                    />
                  </svg>
                </summary>
                <div className="mt-4 space-y-4">
                  {overlappingOptions
                    .filter((restaurant) => restaurant.placeId !== pick.restaurant.placeId)
                    .map((restaurant) => (
                      <MatchCard
                        key={restaurant.placeId}
                        restaurant={restaurant}
                        ubereatsHref={generateUberEatsUrl(restaurant.name, restaurant.address)}
                        doordashHref={generateDoorDashUrl(restaurant.name, restaurant.address)}
                        comparePath={`/compare/${encodeURIComponent(restaurant.placeId)}?source=match_card`}
                      />
                    ))}
                </div>
              </details>
            )}
          </div>
        ) : (
          <div className="card p-8 mb-6 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-muted/10 rounded-full flex items-center justify-center">
              <svg
                className="w-8 h-8 text-muted"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <p className="text-muted mb-6">No restaurants were selected by all participants</p>
            <button
              onClick={handleRestart}
              disabled={isRestarting}
              className="btn btn-primary px-6 py-3"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Near Misses: the all-but-one tier, counts only, never names.
            The crowned placeId is already excluded (see nearMisses above). */}
        {!hasOverlap && nearMisses.length > 0 && (
          <div className="card mb-6">
            <h2 className="text-xl font-display font-semibold text-text mb-1">So Close</h2>
            <p className="text-sm text-muted mb-4">
              All but one of you liked these — worth a second look?
            </p>
            <div className="space-y-3">
              {nearMisses.map((restaurant) => (
                <div
                  key={restaurant.placeId}
                  data-near-miss-card
                  className="p-4 bg-amber/10 border border-amber/60 rounded-market-md"
                >
                  <p className="text-lg font-semibold text-text">{restaurant.name}</p>
                  <p className="text-sm font-medium text-amber">
                    {(pick ? pick.of : participants.length) - 1} of{' '}
                    {pick ? pick.of : participants.length} liked this
                  </p>

                  <div className="mt-2 space-y-2">
                    {restaurant.rating !== undefined && (
                      <div className="flex items-center space-x-3 text-sm">
                        <span className="flex items-center text-amber gap-1">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                          {restaurant.rating.toFixed(1)}
                        </span>
                      </div>
                    )}
                    <DeliveryActions
                      ubereatsHref={nearMissRedirectUrl('ubereats', restaurant.placeId)}
                      doordashHref={nearMissRedirectUrl('doordash', restaurant.placeId)}
                      comparePath={`/compare/${encodeURIComponent(restaurant.placeId)}?source=near_miss`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* All Selections — identical per-Participant copies collapse behind
            a disclosure (#85); divergent Selections stay visible */}
        {isUnanimous ? (
          <details data-unanimous-selections className="card group mb-6">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-muted transition-colors hover:text-text [&::-webkit-details-marker]:hidden">
              See everyone&apos;s Selections
              <svg
                className="h-4 w-4 transition-transform duration-200 group-open:rotate-180"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                />
              </svg>
            </summary>
            <div className="mt-4">
              <SelectionsList
                participants={participants}
                allSelections={allSelections}
                overlappingOptions={overlappingOptions}
                restaurantNameMap={restaurantNameMap}
              />
            </div>
          </details>
        ) : (
          <div className="card mb-6">
            <h2 className="text-xl font-display font-semibold text-text mb-4">
              Everyone&apos;s Selections
            </h2>
            <SelectionsList
              participants={participants}
              allSelections={allSelections}
              overlappingOptions={overlappingOptions}
              restaurantNameMap={restaurantNameMap}
            />
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mb-4 p-3 bg-coral/10 border border-coral/30 rounded-xl">
            <p className="text-sm text-coral-soft">{error}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-3">
          {pick && (
            <button
              onClick={handleRestart}
              disabled={isRestarting}
              className="btn btn-primary w-full min-h-[48px]"
            >
              Select Again
            </button>
          )}

          <button onClick={handleShareResults} className="btn btn-secondary w-full">
            Share Results
          </button>

          <button onClick={handleNewSession} className="btn btn-ghost w-full">
            Start Fresh
          </button>
        </div>

        {/* Session Info */}
        <div className="mt-6 text-center text-sm text-muted">
          <p>Thanks for using Dinder!</p>
        </div>
      </div>
    </main>
  );
}
