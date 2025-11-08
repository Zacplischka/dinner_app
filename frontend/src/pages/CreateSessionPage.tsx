// Create Session page - Host creates a new dinner decision session
// Based on: specs/001-dinner-decider-enables/tasks.md T052

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createSession } from '../services/apiClient';
import { joinSession } from '../services/socketService';
import { useSessionStore } from '../stores/sessionStore';

interface Location {
  latitude: number;
  longitude: number;
  address?: string;
}

export default function CreateSessionPage() {
  const navigate = useNavigate();
  const [hostName, setHostName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [error, setError] = useState('');
  const [location, setLocation] = useState<Location | null>(null);
  const [searchRadiusMiles, setSearchRadiusMiles] = useState<number>(5);
  const { setSessionCode, setLocation: setStoreLocation, setSearchRadiusMiles: setStoreRadius } = useSessionStore();

  const handleGetLocation = () => {
    setError('');
    setIsGettingLocation(true);

    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      setIsGettingLocation(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const newLocation: Location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setLocation(newLocation);
        setIsGettingLocation(false);
      },
      (error) => {
        let errorMessage = 'Failed to get location';
        if (error.code === 1) {
          errorMessage = 'Location permission denied. Please enable location access to find nearby restaurants.';
        } else if (error.code === 2) {
          errorMessage = 'Location unavailable. Please try again.';
        } else if (error.code === 3) {
          errorMessage = 'Location request timed out. Please try again.';
        }
        setError(errorMessage);
        setIsGettingLocation(false);
      }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate host name
    if (hostName.trim().length < 1 || hostName.trim().length > 50) {
      setError('Name must be between 1 and 50 characters');
      return;
    }

    // Validate location is set
    if (!location) {
      setError('Please set your location first');
      return;
    }

    setIsLoading(true);

    try {
      const response = await createSession(hostName.trim(), location, searchRadiusMiles);

      // Store session data in Zustand
      setSessionCode(response.sessionCode);
      setStoreLocation(location);
      setStoreRadius(searchRadiusMiles);

      // Join the session via WebSocket
      await joinSession(response.sessionCode, hostName.trim());

      // Navigate to session lobby
      navigate(`/session/${response.sessionCode}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
      setIsLoading(false);
    }
  };

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Create Session
          </h1>
          <p className="text-gray-600">
            Start a new dinner decision session
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-lg p-6 space-y-6">
          {/* Name Input */}
          <div>
            <label htmlFor="hostName" className="block text-sm font-medium text-gray-700 mb-2">
              Your Name
            </label>
            <input
              id="hostName"
              name="hostName"
              type="text"
              value={hostName}
              onChange={(e) => setHostName(e.target.value)}
              placeholder="Enter your name"
              maxLength={50}
              className="w-full min-h-[44px] px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
              autoFocus
              disabled={isLoading || isGettingLocation}
            />
            <p className="mt-1 text-xs text-gray-500">
              {hostName.length}/50 characters
            </p>
          </div>

          {/* Location Section */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Location
            </label>
            {!location ? (
              <button
                type="button"
                onClick={handleGetLocation}
                disabled={isLoading || isGettingLocation}
                className="w-full min-h-[44px] px-4 py-3 text-base font-medium text-blue-600 bg-blue-50 border-2 border-blue-300 rounded-lg hover:bg-blue-100 disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-300 disabled:cursor-not-allowed active:scale-[0.98] transition-all"
              >
                {isGettingLocation ? '📍 Getting location...' : '📍 Use My Current Location'}
              </button>
            ) : (
              <div className="p-3 bg-green-50 border-2 border-green-500 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-green-600 text-lg">✓</span>
                    <span className="text-sm font-medium text-green-700">Location set</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleGetLocation}
                    disabled={isLoading || isGettingLocation}
                    className="text-xs text-blue-600 hover:text-blue-800 underline"
                  >
                    Update
                  </button>
                </div>
                <p className="text-xs text-gray-600 mt-1">
                  {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
                </p>
              </div>
            )}
          </div>

          {/* Radius Slider (only show when location is set) */}
          {location && (
            <div>
              <label htmlFor="radius" className="block text-sm font-medium text-gray-700 mb-2">
                Search Radius: {searchRadiusMiles} mile{searchRadiusMiles !== 1 ? 's' : ''}
              </label>
              <input
                id="radius"
                type="range"
                min="1"
                max="15"
                value={searchRadiusMiles}
                onChange={(e) => setSearchRadiusMiles(Number(e.target.value))}
                disabled={isLoading}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>1 mi</span>
                <span>15 mi</span>
              </div>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Buttons */}
          <div className="space-y-3">
            <button
              type="submit"
              disabled={isLoading || isGettingLocation || !hostName.trim() || !location}
              className="w-full min-h-[44px] px-6 py-3 text-lg font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed active:scale-[0.98] transition-all shadow-lg"
            >
              {isLoading ? 'Creating...' : 'Create Session'}
            </button>

            <button
              type="button"
              onClick={() => navigate('/')}
              disabled={isLoading}
              className="w-full min-h-[44px] px-6 py-3 text-base font-medium text-gray-700 bg-white rounded-lg hover:bg-gray-50 active:scale-[0.98] transition-all border-2 border-gray-300"
            >
              Cancel
            </button>
          </div>
        </form>

        {/* Info */}
        <div className="mt-6 text-center text-sm text-gray-500">
          <p>You&apos;ll be able to share a session code with friends</p>
        </div>
      </div>
    </main>
  );
}