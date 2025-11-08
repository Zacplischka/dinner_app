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
  const { overlappingOptions, allSelections, participants } = useSessionStore();
  const [isRestarting, setIsRestarting] = useState(false);
  const [error, setError] = useState('');

  const hasOverlap = overlappingOptions.length > 0;

  // Type guard to check if options are Restaurant objects
  const isRestaurant = (option: any): option is Restaurant => {
    return 'placeId' in option && 'name' in option;
  };

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
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {hasOverlap ? '🎉 Perfect Match!' : '😕 No Match Found'}
          </h1>
          <p className="text-gray-600">
            {hasOverlap
              ? 'Everyone agrees on these options'
              : 'No restaurants matched everyone&apos;s preferences'}
          </p>
        </div>

        {/* Overlapping Options */}
        {hasOverlap ? (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
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
                    className="p-4 bg-green-50 border-2 border-green-500 rounded-lg"
                  >
                    <p className="text-lg font-semibold text-gray-900">
                      {displayName}
                    </p>

                    {restaurant && (
                      <div className="mt-2 space-y-1">
                        <div className="flex items-center space-x-3 text-sm">
                          {restaurant.rating !== undefined && (
                            <span className="flex items-center text-yellow-600">
                              ⭐ {restaurant.rating.toFixed(1)}
                            </span>
                          )}
                          {restaurant.priceLevel > 0 && (
                            <span className="text-gray-600 font-medium">
                              {formatPriceLevel(restaurant.priceLevel)}
                            </span>
                          )}
                          {restaurant.cuisineType && (
                            <span className="text-gray-600">
                              {restaurant.cuisineType}
                            </span>
                          )}
                        </div>
                        {restaurant.address && (
                          <p className="text-sm text-gray-600">
                            📍 {restaurant.address}
                          </p>
                        )}
                      </div>
                    )}

                    {!restaurant && (option as any).description && (
                      <p className="text-sm text-gray-600 mt-1">
                        {(option as any).description}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6 text-center">
            <div className="text-6xl mb-4">🤷</div>
            <p className="text-gray-600 mb-4">
              No restaurants were selected by all participants
            </p>
            <button
              onClick={handleRestart}
              disabled={isRestarting}
              className="px-6 py-3 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 active:scale-[0.98] transition-all"
            >
              {isRestarting ? 'Restarting...' : 'Try Again'}
            </button>
          </div>
        )}

        {/* All Selections */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Everyone&apos;s Selections
          </h2>
          <div className="space-y-4">
            {participants.map((participant) => {
              const participantSelections = allSelections[participant.displayName] || [];
              return (
                <div key={participant.participantId} className="border-b pb-4 last:border-b-0">
                  <div className="flex items-center space-x-2 mb-2">
                    <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-semibold">
                      {participant.displayName.charAt(0).toUpperCase()}
                    </div>
                    <p className="font-semibold text-gray-900">
                      {participant.displayName}
                    </p>
                  </div>
                  <div className="ml-10">
                    {participantSelections.length > 0 ? (
                      <ul className="text-sm text-gray-600 space-y-1">
                        {participantSelections.map((selectionId, idx) => {
                          // Try to find in overlappingOptions using either placeId or optionId
                          const option = overlappingOptions.find((o) => {
                            if (isRestaurant(o)) {
                              return o.placeId === selectionId;
                            }
                            return (o as any).optionId === selectionId;
                          });

                          const isMatch = overlappingOptions.some((o) => {
                            if (isRestaurant(o)) {
                              return o.placeId === selectionId;
                            }
                            return (o as any).optionId === selectionId;
                          });

                          // Get display name
                          let displayName = selectionId;
                          if (option) {
                            if (isRestaurant(option)) {
                              displayName = option.name;
                            } else {
                              displayName = (option as any).displayName;
                            }
                          }

                          return (
                            <li key={idx} className="flex items-center space-x-2">
                              {isMatch && <span className="text-green-500">✓</span>}
                              <span className={isMatch ? 'font-medium text-green-700' : ''}>
                                {displayName}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="text-sm text-gray-400 italic">No selections</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-3">
          {hasOverlap && (
            <button
              onClick={handleRestart}
              disabled={isRestarting}
              className="w-full min-h-[44px] px-6 py-3 text-base font-medium text-blue-600 bg-white rounded-lg hover:bg-blue-50 active:scale-[0.98] transition-all border-2 border-blue-600"
            >
              {isRestarting ? 'Restarting...' : 'Select Again'}
            </button>
          )}

          <button
            onClick={handleNewSession}
            className="w-full min-h-[44px] px-6 py-3 text-base font-medium text-gray-700 bg-white rounded-lg hover:bg-gray-50 active:scale-[0.98] transition-all border-2 border-gray-300"
          >
            Start New Session
          </button>
        </div>

        {/* Session Info */}
        <div className="mt-6 text-center text-sm text-gray-500">
          <p>Session Code: <span className="font-mono font-semibold">{sessionCode}</span></p>
        </div>
      </div>
    </main>
  );
}