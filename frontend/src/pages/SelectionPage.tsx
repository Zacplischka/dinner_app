// Selection page - Participants select their preferred dinner options
// Based on: specs/001-dinner-decider-enables/tasks.md T055

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getRestaurants } from '../services/apiClient';
import { submitSelection } from '../services/socketService';
import { useSessionStore } from '../stores/sessionStore';
import type { Restaurant } from '@dinner-app/shared/types';

export default function SelectionPage() {
  const navigate = useNavigate();
  const { sessionCode } = useParams<{ sessionCode: string }>();
  const { selections, toggleSelection, participants } = useSessionStore();
  const [options, setOptions] = useState<Restaurant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [submittedCount, setSubmittedCount] = useState(0);

  useEffect(() => {
    // Load restaurants for session
    const loadOptions = async () => {
      if (!sessionCode) {
        setError('Session code not found');
        setIsLoading(false);
        return;
      }

      try {
        const data = await getRestaurants(sessionCode);
        setOptions(data);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load restaurants');
      } finally {
        setIsLoading(false);
      }
    };

    loadOptions();
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

  const handleSubmit = async () => {
    if (selections.length === 0) {
      setError('Please select at least one option');
      return;
    }

    if (!sessionCode) {
      setError('Session code not found');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      await submitSelection(sessionCode, selections);
      setHasSubmitted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit selections');
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-gray-600">Loading options...</p>
        </div>
      </div>
    );
  }

  if (hasSubmitted) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
        <div className="max-w-md w-full text-center">
          <div className="bg-white rounded-lg shadow-lg p-8">
            <div className="text-6xl mb-4">✓</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Selections Submitted!
            </h2>
            <p className="text-gray-600 mb-6">
              Waiting for other participants...
            </p>

            <div className="mb-4">
              <p className="text-sm text-gray-500">
                {submittedCount} of {participants.length} participants have submitted
              </p>
              <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                  style={{
                    width: `${(submittedCount / participants.length) * 100}%`,
                  }}
                ></div>
              </div>
            </div>

            <p className="text-xs text-gray-400">
              Results will appear automatically when everyone submits
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 px-4 py-8">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Select Your Preferences
          </h1>
          <p className="text-gray-600">
            Choose all options you&apos;d be happy with
          </p>
          <p className="text-sm text-blue-600 mt-2">
            {selections.length} selected
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Options List */}
        <div className="bg-white rounded-lg shadow-lg p-4 mb-6 max-h-[60vh] overflow-y-auto">
          <div className="space-y-2">
            {options.map((option) => {
              const isSelected = selections.includes(option.placeId);
              const priceDisplay = '$'.repeat(option.priceLevel || 0);

              return (
                <button
                  key={option.placeId}
                  onClick={() => toggleSelection(option.placeId)}
                  className={`w-full min-h-[44px] p-4 text-left rounded-lg border-2 transition-all active:scale-[0.98] ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div
                      className={`w-6 h-6 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                        isSelected
                          ? 'border-blue-500 bg-blue-500'
                          : 'border-gray-300'
                      }`}
                    >
                      {isSelected && (
                        <svg
                          className="w-4 h-4 text-white"
                          fill="none"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path d="M5 13l4 4L19 7"></path>
                        </svg>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-gray-900">
                          {option.name}
                        </p>
                        {priceDisplay && (
                          <span className="text-sm text-gray-600 ml-2">
                            {priceDisplay}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-2 mt-1">
                        {option.rating && (
                          <span className="text-sm text-gray-600">
                            ⭐ {option.rating.toFixed(1)}
                          </span>
                        )}
                        {option.cuisineType && (
                          <span className="text-sm text-gray-500">
                            • {option.cuisineType}
                          </span>
                        )}
                      </div>
                      {option.address && (
                        <p className="text-xs text-gray-400 mt-1">
                          {option.address}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          disabled={isSubmitting || selections.length === 0}
          className="w-full min-h-[44px] px-6 py-3 text-lg font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed active:scale-[0.98] transition-all shadow-lg"
        >
          {isSubmitting ? 'Submitting...' : `Submit ${selections.length} Selection${selections.length !== 1 ? 's' : ''}`}
        </button>

        {/* Info */}
        <div className="mt-4 text-center text-sm text-gray-500">
          <p>🔒 Your selections are private until everyone submits</p>
        </div>
      </div>
    </main>
  );
}