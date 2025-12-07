// Results page - Show overlapping selections and all participants' choices
// Based on: specs/001-dinner-decider-enables/tasks.md T056

import { useNavigate, useParams } from 'react-router-dom';
import { restartSession } from '../services/socketService';
import { useSessionStore } from '../stores/sessionStore';
import { useState } from 'react';
import type { Restaurant } from '@dinner-app/shared/types';

export default function ResultsPage() {
  const navigate = useNavigate();
  const { sessionCode } = useParams<{ sessionCode: string }>();
  const { overlappingOptions, allSelections, participants, restaurants } = useSessionStore();
  const [isRestarting, setIsRestarting] = useState(false);
  const [error, setError] = useState('');

  const hasOverlap = overlappingOptions.length > 0;

  // Type guard to check if options are Restaurant objects
  const isRestaurant = (option: unknown): option is Restaurant => {
    return typeof option === 'object' && option !== null && 'placeId' in option && 'name' in option;
  };

  // Create a lookup map for restaurant names by placeId
  const restaurantNameMap = new Map<string, string>();
  restaurants.forEach((r) => {
    restaurantNameMap.set(r.placeId, r.name);
  });
  // Also add from overlappingOptions (in case restaurants array isn't populated)
  overlappingOptions.forEach((o) => {
    if (isRestaurant(o)) {
      restaurantNameMap.set(o.placeId, o.name);
    }
  });

  // Helper to format price level
  const formatPriceLevel = (level: number): string => {
    if (level === 0) return 'Free';
    return '$'.repeat(level);
  };

  const handleRestart = async () => {
    if (!sessionCode) return;

    setIsRestarting(true);
    setError('');

    try {
      await restartSession(sessionCode);
      // Navigate back to selection page
      navigate(`/session/${sessionCode}/select`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to restart session');
      setIsRestarting(false);
    }
  };

  const handleNewSession = () => {
    navigate('/');
  };

  return (
    <main className="min-h-screen bg-warm-gradient px-4 py-8">
      <div className="max-w-2xl mx-auto animate-fade-in">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-display font-semibold text-cream mb-2 text-glow">
            {hasOverlap ? 'Perfect Match!' : 'No Match Found'}
          </h1>
          <p className="text-cream-400">
            {hasOverlap
              ? 'Everyone agrees on these options'
              : 'No restaurants matched everyone\'s preferences'}
          </p>
        </div>

        {/* Overlapping Options */}
        {hasOverlap ? (
          <div className="bg-midnight-100 rounded-2xl shadow-card border border-midnight-50/30 p-6 mb-6">
            <h2 className="text-xl font-display font-semibold text-cream mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-success" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              Matching Restaurants
            </h2>
            <div className="space-y-3">
              {overlappingOptions.map((option) => {
                const restaurant = isRestaurant(option) ? option : null;
                const key = restaurant ? restaurant.placeId : (option as any).optionId;
                const displayName = restaurant ? restaurant.name : (option as any).displayName;

                return (
                  <div
                    key={key}
                    className="p-4 bg-success/10 border border-success/30 rounded-xl"
                  >
                    <p className="text-lg font-semibold text-cream">
                      {displayName}
                    </p>

                    {restaurant && (
                      <div className="mt-2 space-y-1">
                        <div className="flex items-center space-x-3 text-sm">
                          {restaurant.rating !== undefined && (
                            <span className="flex items-center text-amber-300 gap-1">
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                              </svg>
                              {restaurant.rating.toFixed(1)}
                            </span>
                          )}
                          {restaurant.priceLevel > 0 && (
                            <span className="text-cream-400 font-medium">
                              {formatPriceLevel(restaurant.priceLevel)}
                            </span>
                          )}
                          {restaurant.cuisineType && (
                            <span className="text-cream-500">
                              {restaurant.cuisineType}
                            </span>
                          )}
                        </div>
                        {restaurant.address && (
                          <p className="text-sm text-cream-500 flex items-center gap-1.5">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            {restaurant.address}
                          </p>
                        )}
                      </div>
                    )}

                    {!restaurant && (option as any).description && (
                      <p className="text-sm text-cream-500 mt-1">
                        {(option as any).description}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="bg-midnight-100 rounded-2xl shadow-card border border-midnight-50/30 p-8 mb-6 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-cream-500/10 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-cream-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-cream-400 mb-6">
              No restaurants were selected by all participants
            </p>
            <button
              onClick={handleRestart}
              disabled={isRestarting}
              className="px-6 py-3 text-midnight font-semibold bg-gradient-to-r from-amber to-amber-300 rounded-xl hover:from-amber-300 hover:to-amber-200 disabled:from-midnight-50 disabled:to-midnight-50 disabled:text-cream-500 active:scale-[0.98] transition-all duration-300 shadow-glow hover:shadow-glow-lg"
            >
              {isRestarting ? 'Restarting...' : 'Try Again'}
            </button>
          </div>
        )}

        {/* All Selections */}
        <div className="bg-midnight-100 rounded-2xl shadow-card border border-midnight-50/30 p-6 mb-6">
          <h2 className="text-xl font-display font-semibold text-cream mb-4">
            Everyone&apos;s Selections
          </h2>
          <div className="space-y-4">
            {participants.map((participant) => {
              const participantSelections = allSelections[participant.displayName] || [];
              return (
                <div key={participant.participantId} className="border-b border-midnight-50/30 pb-4 last:border-b-0 last:pb-0">
                  <div className="flex items-center space-x-2 mb-2">
                    <div className="w-8 h-8 bg-gradient-to-br from-amber to-amber-500 rounded-full flex items-center justify-center text-midnight text-sm font-semibold shadow-glow">
                      {participant.displayName.charAt(0).toUpperCase()}
                    </div>
                    <p className="font-semibold text-cream">
                      {participant.displayName}
                    </p>
                  </div>
                  <div className="ml-10">
                    {participantSelections.length > 0 ? (
                      <ul className="text-sm text-cream-400 space-y-1">
                        {participantSelections.map((selectionId, idx) => {
                          // Check if this selection is a match (in overlappingOptions)
                          const isMatch = overlappingOptions.some((o) => {
                            if (isRestaurant(o)) {
                              return o.placeId === selectionId;
                            }
                            return (o as unknown as { optionId?: string }).optionId === selectionId;
                          });

                          // Get display name from our lookup map, or fall back to selectionId
                          const displayName = restaurantNameMap.get(selectionId) || selectionId;

                          return (
                            <li key={idx} className="flex items-center space-x-2">
                              {isMatch && (
                                <svg className="w-4 h-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                              <span className={isMatch ? 'font-medium text-success-light' : ''}>
                                {displayName}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="text-sm text-cream-500/60 italic">No selections</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 p-3 bg-error/10 border border-error/30 rounded-xl">
            <p className="text-sm text-error-light">{error}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-3">
          {hasOverlap && (
            <button
              onClick={handleRestart}
              disabled={isRestarting}
              className="w-full min-h-[44px] px-6 py-3 text-base font-medium text-amber bg-transparent rounded-xl hover:bg-amber/10 active:scale-[0.98] transition-all duration-300 border border-amber/40 hover:border-amber"
            >
              {isRestarting ? 'Restarting...' : 'Select Again'}
            </button>
          )}

          <button
            onClick={handleNewSession}
            className="w-full min-h-[44px] px-6 py-3 text-base font-medium text-cream-400 bg-transparent rounded-xl hover:bg-midnight-100 hover:text-cream active:scale-[0.98] transition-all duration-300 border border-midnight-50/50"
          >
            Start New Session
          </button>
        </div>

        {/* Session Info */}
        <div className="mt-6 text-center text-sm text-cream-500">
          <p>Session Code: <span className="font-mono font-semibold text-amber">{sessionCode}</span></p>
        </div>
      </div>
    </main>
  );
}