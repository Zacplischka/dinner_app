// Create Session page - Host creates a new dinner decision session
// Based on: specs/001-dinner-decider-enables/tasks.md T052

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionStore } from '../stores/sessionStore';
import { useFriendsStore } from '../stores/friendsStore';
import NavigationHeader from '../components/NavigationHeader';
import InviteFriendsSection from '../components/friends/InviteFriendsSection';
import { createSession } from '../services/apiClient';
import { waitForConnection, joinSession } from '../services/socketBindings';

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
  const [selectedFriendIds, setSelectedFriendIds] = useState<Set<string>>(new Set());
  const { setSessionCode, setLocation: setStoreLocation, setSearchRadiusMiles: setStoreRadius, setCurrentUserId, setConnectionStatus, setSessionStatus, resetSelections } = useSessionStore();
  const { inviteFriendsToSession } = useFriendsStore();

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

      setSessionCode(response.sessionCode);
      setStoreLocation(location);
      setStoreRadius(searchRadiusMiles);
      resetSelections();
      setSessionStatus('waiting');

      // Connect WebSocket and wait for connection, then join as host
      await waitForConnection();
      const joinResponse = await joinSession(response.sessionCode, hostName.trim());

      if (joinResponse.success && joinResponse.participantId) {
        setCurrentUserId(joinResponse.participantId);
        setConnectionStatus(true);

        // Invite selected friends if any
        if (selectedFriendIds.size > 0) {
          await inviteFriendsToSession(response.sessionCode, Array.from(selectedFriendIds));
        }

        navigate(`/session/${response.sessionCode}`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-ink">
      <NavigationHeader
        title="Create Session"
        subtitle="Start a new dinner decision session"
        showBackButton
        onBack={() => navigate('/')}
      />

      <div className="w-full max-w-md mx-auto px-4 py-6 animate-fade-in">

        {/* Form */}
        <form onSubmit={handleSubmit} className="card space-y-6">
          {/* Name Input */}
          <div>
            <label htmlFor="hostName" className="label">
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
              className="input"
              autoFocus
              disabled={isLoading || isGettingLocation}
            />
            <p className="mt-1.5 text-xs text-muted">
              {hostName.length}/50 characters
            </p>
          </div>

          {/* Location Section */}
          <div>
            <label className="label">
              Location
            </label>
            {!location ? (
              <button
                type="button"
                onClick={handleGetLocation}
                disabled={isLoading || isGettingLocation}
                className="btn btn-secondary w-full flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {isGettingLocation ? 'Getting location...' : 'Use My Current Location'}
              </button>
            ) : (
              <div className="p-4 bg-lime/10 border border-lime/30 rounded-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="w-5 h-5 rounded-full bg-lime flex items-center justify-center">
                      <svg className="w-3 h-3 text-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                    <span className="text-sm font-medium text-lime">Location set</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleGetLocation}
                    disabled={isLoading || isGettingLocation}
                    className="text-xs text-cyan hover:text-text transition-colors"
                  >
                    Update
                  </button>
                </div>
                <p className="text-xs text-muted mt-2 font-mono">
                  {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
                </p>
              </div>
            )}
          </div>

          {/* Radius Slider (only show when location is set) */}
          {location && (
            <div>
              <label htmlFor="radius" className="label mb-3">
                Search Radius: <span className="text-cyan">{searchRadiusMiles} mile{searchRadiusMiles !== 1 ? 's' : ''}</span>
              </label>
              <input
                id="radius"
                type="range"
                min="1"
                max="15"
                value={searchRadiusMiles}
                onChange={(e) => setSearchRadiusMiles(Number(e.target.value))}
                disabled={isLoading}
                className="w-full h-2 bg-surface rounded-lg appearance-none cursor-pointer accent-coral"
                style={{
                  background: `linear-gradient(to right, #ff3858 0%, #ff3858 ${((searchRadiusMiles - 1) / 14) * 100}%, #07111f ${((searchRadiusMiles - 1) / 14) * 100}%, #07111f 100%)`
                }}
              />
              <div className="flex justify-between text-xs text-muted mt-2">
                <span>1 mi</span>
                <span>15 mi</span>
              </div>
            </div>
          )}

          <InviteFriendsSection
            selectedFriendIds={selectedFriendIds}
            onSelectionChange={setSelectedFriendIds}
            disabled={isLoading || isGettingLocation}
          />

          {/* Error message */}
          {error && (
            <div className="p-3 bg-coral/10 border border-coral/30 rounded-xl">
              <p className="text-sm text-coral-soft">{error}</p>
            </div>
          )}

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading || isGettingLocation || !hostName.trim() || !location}
              className="btn btn-primary w-full min-h-[48px] text-lg"
            >
              {isLoading ? 'Creating...' : 'Create Session'}
            </button>
          </div>
        </form>

        {/* Info */}
        <div className="mt-6 text-center text-sm text-muted">
          <p>You&apos;ll be able to share a session code with friends</p>
        </div>
      </div>
    </main>
  );
}
