// Results page - Show overlapping selections and all participants' choices
// Based on: specs/001-dinner-decider-enables/tasks.md T056

import { useNavigate, useParams } from 'react-router-dom';
import { restartDemoSession, leaveDemoSession } from '../services/demoSessionService';
import { useSessionStore } from '../stores/sessionStore';
import { useState } from 'react';
import NavigationHeader from '../components/NavigationHeader';
import { useToast } from '../hooks/useToast';
import type { Restaurant } from '@dinder/shared/types';

// Helper functions to generate delivery app deep links
const generateUberEatsUrl = (restaurantName: string, address?: string): string => {
  // Uber Eats search URL - combine restaurant name with address for better accuracy
  const searchQuery = address
    ? `${restaurantName} ${address}`
    : restaurantName;
  return `https://www.ubereats.com/search?q=${encodeURIComponent(searchQuery)}`;
};

const generateDoorDashUrl = (restaurantName: string, address?: string): string => {
  // DoorDash search URL - combine restaurant name with address for better accuracy
  const searchQuery = address
    ? `${restaurantName} ${address}`
    : restaurantName;
  return `https://www.doordash.com/search/store/${encodeURIComponent(searchQuery)}/`;
};

export default function ResultsPage() {
  const navigate = useNavigate();
  const { sessionCode } = useParams<{ sessionCode: string }>();
  const { overlappingOptions, allSelections, restaurantNames, participants, restaurants, currentUserId } = useSessionStore();
  const [isRestarting, setIsRestarting] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();

  const hasOverlap = overlappingOptions.length > 0;

  // Type guard to check if options are Restaurant objects
  const isRestaurant = (option: unknown): option is Restaurant => {
    return typeof option === 'object' && option !== null && 'placeId' in option && 'name' in option;
  };

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
      restartDemoSession(sessionCode);
      // Reset local store selections/results
      useSessionStore.getState().resetSelections();
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

  const handleLeaveSession = async () => {
    if (!sessionCode) return;

    try {
      if (currentUserId) {
        leaveDemoSession(sessionCode, currentUserId);
      }
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
    navigator.clipboard.writeText(url);
    toast.success('Results link copied!');
  };

  return (
    <main className="min-h-screen bg-warm-gradient">
      {/* Navigation Header */}
      <NavigationHeader
        title={hasOverlap ? 'Perfect Match!' : 'No Match Found'}
        subtitle={hasOverlap ? 'Everyone agrees on these options' : "No restaurants matched everyone's preferences"}
        sessionCode={sessionCode}
        showBackButton
        onBack={handleLeaveSession}
        confirmOnBack
        confirmContext="results"
        rightAction={
          <button
            onClick={handleShareResults}
            className="p-2 text-cream-400 hover:text-amber transition-colors"
            title="Share results"
            aria-label="Share results"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
          </button>
        }
      />

      <div className="max-w-2xl mx-auto px-4 py-6 animate-fade-in">

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
                      <div className="mt-2 space-y-2">
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

                        {/* Delivery Order Buttons - Elegant cards with brand logos */}
                        <div className="flex flex-wrap gap-3 pt-3 mt-1 border-t border-midnight-50/20">
                          <a
                            href={generateUberEatsUrl(restaurant.name, restaurant.address)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group relative flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-midnight-200/80 border border-midnight-50/40 hover:border-[#06C167]/50 hover:shadow-[0_0_20px_rgba(6,193,103,0.15)] transition-all duration-300 active:scale-[0.98]"
                          >
                            {/* Uber Eats Logo */}
                            <svg className="w-5 h-5 text-[#06C167] opacity-80 group-hover:opacity-100 transition-opacity duration-300" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 2.824a9.176 9.176 0 110 18.352 9.176 9.176 0 010-18.352zm0 3.294a5.882 5.882 0 100 11.764 5.882 5.882 0 000-11.764zm0 2.823a3.059 3.059 0 110 6.118 3.059 3.059 0 010-6.118z"/>
                            </svg>

                            {/* Text */}
                            <span className="text-sm font-medium text-cream-300 group-hover:text-cream transition-colors duration-300">
                              Uber Eats
                            </span>

                            {/* External link indicator */}
                            <svg className="w-3 h-3 text-cream-500/50 group-hover:text-[#06C167]/70 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
                            </svg>
                          </a>

                          <a
                            href={generateDoorDashUrl(restaurant.name, restaurant.address)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group relative flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-midnight-200/80 border border-midnight-50/40 hover:border-[#FF3008]/50 hover:shadow-[0_0_20px_rgba(255,48,8,0.15)] transition-all duration-300 active:scale-[0.98]"
                          >
                            {/* DoorDash Logo */}
                            <svg className="w-5 h-5 text-[#FF3008] opacity-80 group-hover:opacity-100 transition-opacity duration-300" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M23.071 8.409a6.09 6.09 0 00-5.396-3.228H.584A.589.589 0 00.17 6.184L3.894 9.93a1.752 1.752 0 001.242.516h12.049a1.554 1.554 0 011.553 1.553 1.554 1.554 0 01-1.553 1.553H5.136a1.752 1.752 0 00-1.242.515L.17 17.816a.589.589 0 00.414 1.003h17.091a6.09 6.09 0 005.396-3.228 6.048 6.048 0 000-7.182z"/>
                            </svg>

                            {/* Text */}
                            <span className="text-sm font-medium text-cream-300 group-hover:text-cream transition-colors duration-300">
                              DoorDash
                            </span>

                            {/* External link indicator */}
                            <svg className="w-3 h-3 text-cream-500/50 group-hover:text-[#FF3008]/70 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
                            </svg>
                          </a>
                        </div>
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
              className="w-full min-h-[48px] px-6 py-3 text-base font-semibold text-midnight bg-gradient-to-r from-amber to-amber-300 rounded-xl hover:from-amber-300 hover:to-amber-200 disabled:from-midnight-50 disabled:to-midnight-50 disabled:text-cream-500 disabled:cursor-not-allowed active:scale-[0.98] transition-all duration-300 shadow-glow hover:shadow-glow-lg disabled:shadow-none"
            >
              {isRestarting ? 'Restarting...' : 'Select Again'}
            </button>
          )}

          <button
            onClick={handleShareResults}
            className="w-full min-h-[44px] px-6 py-3 text-base font-medium text-amber bg-transparent rounded-xl hover:bg-amber/10 active:scale-[0.98] transition-all duration-300 border border-amber/40 hover:border-amber"
          >
            Share Results
          </button>

          <button
            onClick={handleNewSession}
            className="w-full min-h-[44px] px-6 py-3 text-base font-medium text-cream-400 bg-transparent rounded-xl hover:bg-midnight-100 hover:text-cream active:scale-[0.98] transition-all duration-300 border border-midnight-50/50"
          >
            Start Fresh
          </button>
        </div>

        {/* Session Info */}
        <div className="mt-6 text-center text-sm text-cream-500">
          <p>Thanks for using Dinder!</p>
        </div>
      </div>
    </main>
  );
}