// Create Session page - Host creates a new dinner decision session
// Based on: specs/001-dinner-decider-enables/tasks.md T052

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionStore } from '../stores/sessionStore';
import NavigationHeader from '../components/NavigationHeader';
import { createDemoSession } from '../services/demoSessionService';
import { createSession } from '../services/apiClient';
import { DEMO_MODE } from '../config/demo';
import { waitForConnection, joinSession } from '../services/socketService';

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
  const { setSessionCode, setLocation: setStoreLocation, setSearchRadiusMiles: setStoreRadius, updateParticipants, setCurrentUserId, setConnectionStatus, setSessionStatus, resetSelections } = useSessionStore();

  // Demo: default a friendly host name
  useEffect(() => {
    if (!hostName) setHostName('Zach');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      if (DEMO_MODE) {
        // Demo mode - use local storage
        const created = createDemoSession({
          hostName: hostName.trim(),
          location,
          searchRadiusMiles,
        });

        const hostParticipant = created.host;
        setSessionCode(created.sessionCode);
        setStoreLocation(location);
        setStoreRadius(searchRadiusMiles);
        setConnectionStatus(true);
        setCurrentUserId(hostParticipant.participantId);
        setSessionStatus('waiting');
        resetSelections();
        updateParticipants([hostParticipant]);
        navigate(`/session/${created.sessionCode}`);
      } else {
        // Real backend - call API and connect WebSocket
        const response = await createSession(hostName.trim(), location, searchRadiusMiles);

        setSessionCode(response.sessionCode);
        setStoreLocation(location);
        setStoreRadius(searchRadiusMiles);
        setSessionStatus('waiting');
        resetSelections();

        // Connect WebSocket and wait for connection, then join as host
        await waitForConnection();
        const joinResponse = await joinSession(response.sessionCode, hostName.trim());

        if (joinResponse.success && joinResponse.participantId) {
          setCurrentUserId(joinResponse.participantId);
          setConnectionStatus(true);
          navigate(`/session/${response.sessionCode}`);
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-warm-gradient">
      <NavigationHeader
        title="Create Session"
        subtitle="Start a new dinner decision session"
        showBackButton
        onBack={() => navigate('/')}
      />

      <div className="w-full max-w-md mx-auto px-4 py-6 animate-fade-in">

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-midnight-100 rounded-2xl shadow-card border border-midnight-50/30 p-6 space-y-6">
          {/* Name Input */}
          <div>
            <label htmlFor="hostName" className="block text-sm font-medium text-cream-300 mb-2">
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
              className="w-full min-h-[44px] px-4 py-3 text-base text-cream bg-midnight-200 border border-midnight-50/50 rounded-xl placeholder:text-cream-500 focus:border-amber/60 focus:ring-1 focus:ring-amber/30 outline-none transition-all duration-300"
              autoFocus
              disabled={isLoading || isGettingLocation}
            />
            <p className="mt-1.5 text-xs text-cream-500">
              {hostName.length}/50 characters
            </p>
          </div>

          {/* Location Section */}
          <div>
            <label className="block text-sm font-medium text-cream-300 mb-2">
              Location
            </label>
            {!location ? (
              <button
                type="button"
                onClick={handleGetLocation}
                disabled={isLoading || isGettingLocation}
                className="w-full min-h-[44px] px-4 py-3 text-base font-medium text-amber bg-amber/10 border border-amber/30 rounded-xl hover:bg-amber/20 disabled:bg-midnight-200 disabled:text-cream-500 disabled:border-midnight-50 disabled:cursor-not-allowed active:scale-[0.98] transition-all duration-300 flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {isGettingLocation ? 'Getting location...' : 'Use My Current Location'}
              </button>
            ) : (
              <div className="p-4 bg-success/10 border border-success/30 rounded-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="w-5 h-5 rounded-full bg-success flex items-center justify-center">
                      <svg className="w-3 h-3 text-midnight" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                    <span className="text-sm font-medium text-success-light">Location set</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleGetLocation}
                    disabled={isLoading || isGettingLocation}
                    className="text-xs text-amber hover:text-amber-200 transition-colors"
                  >
                    Update
                  </button>
                </div>
                <p className="text-xs text-cream-500 mt-2 font-mono">
                  {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
                </p>
              </div>
            )}
          </div>

          {/* Radius Slider (only show when location is set) */}
          {location && (
            <div>
              <label htmlFor="radius" className="block text-sm font-medium text-cream-300 mb-3">
                Search Radius: <span className="text-amber">{searchRadiusMiles} mile{searchRadiusMiles !== 1 ? 's' : ''}</span>
              </label>
              <input
                id="radius"
                type="range"
                min="1"
                max="15"
                value={searchRadiusMiles}
                onChange={(e) => setSearchRadiusMiles(Number(e.target.value))}
                disabled={isLoading}
                className="w-full h-2 bg-midnight-200 rounded-lg appearance-none cursor-pointer accent-amber"
                style={{
                  background: `linear-gradient(to right, #d4a574 0%, #d4a574 ${((searchRadiusMiles - 1) / 14) * 100}%, #252529 ${((searchRadiusMiles - 1) / 14) * 100}%, #252529 100%)`
                }}
              />
              <div className="flex justify-between text-xs text-cream-500 mt-2">
                <span>1 mi</span>
                <span>15 mi</span>
              </div>
            </div>
          )}


          {/* Error message */}
          {error && (
            <div className="p-3 bg-error/10 border border-error/30 rounded-xl">
              <p className="text-sm text-error-light">{error}</p>
            </div>
          )}

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading || isGettingLocation || !hostName.trim() || !location}
              className="w-full min-h-[48px] px-6 py-3 text-lg font-semibold text-midnight bg-gradient-to-r from-amber to-amber-300 rounded-xl hover:from-amber-300 hover:to-amber-200 disabled:from-midnight-50 disabled:to-midnight-50 disabled:text-cream-500 disabled:cursor-not-allowed active:scale-[0.98] transition-all duration-300 shadow-glow hover:shadow-glow-lg disabled:shadow-none"
            >
              {isLoading ? 'Creating...' : 'Create Session'}
            </button>
          </div>
        </form>

        {/* Info */}
        <div className="mt-6 text-center text-sm text-cream-500">
          <p>You&apos;ll be able to share a session code with friends</p>
        </div>
      </div>
    </main>
  );
}