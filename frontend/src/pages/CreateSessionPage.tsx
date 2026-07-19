// Create Session page - Host creates a new dinner decision session
// Based on: specs/001-dinner-decider-enables/tasks.md T052
// Issue #79: location works without browser geolocation (manual suburb/postcode entry)

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionStore } from '../stores/sessionStore';
import { useFriendsStore } from '../stores/friendsStore';
import NavigationHeader from '../components/NavigationHeader';
import InviteFriendsSection from '../components/friends/InviteFriendsSection';
import { createSession, geocodeArea, reverseGeocode } from '../services/apiClient';
import { waitForConnection, joinSession } from '../services/socketBindings';

interface Location {
  latitude: number;
  longitude: number;
  address?: string;
}

const KM_PER_MILE = 1.609344;
const MIN_RADIUS_KM = 2;
const MAX_RADIUS_KM = 24;

export default function CreateSessionPage() {
  const navigate = useNavigate();
  const [hostName, setHostName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [isResolvingArea, setIsResolvingArea] = useState(false);
  const [error, setError] = useState('');
  const [location, setLocation] = useState<Location | null>(null);
  const [locationMode, setLocationMode] = useState<'current' | 'manual'>('current');
  const [manualQuery, setManualQuery] = useState('');
  const [searchRadiusKm, setSearchRadiusKm] = useState<number>(8);
  const [selectedFriendIds, setSelectedFriendIds] = useState<Set<string>>(new Set());
  const {
    setSessionCode,
    setLocation: setStoreLocation,
    setSearchRadiusMiles: setStoreRadius,
    setCurrentUserId,
    setConnectionStatus,
    setSessionStatus,
    resetSelections,
  } = useSessionStore();
  const { inviteFriendsToSession } = useFriendsStore();

  const busy = isLoading || isGettingLocation || isResolvingArea;

  const handleGetLocation = () => {
    setError('');

    if (!navigator.geolocation) {
      setError(
        'Your browser doesn’t support location. Enter your suburb or postcode below instead.'
      );
      setLocationMode('manual');
      return;
    }

    setIsGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        // Best-effort area name; coordinates alone are enough to proceed.
        void reverseGeocode(latitude, longitude)
          .then((resolved) => resolved.area)
          .catch(() => undefined)
          .then((area) => {
            setLocation({ latitude, longitude, address: area });
            setIsGettingLocation(false);
          });
      },
      (geoError) => {
        if (geoError.code === 1) {
          setError(
            'Location access is blocked for this site. Enter your suburb or postcode below instead, or allow location access in your browser and try again.'
          );
          setLocationMode('manual');
        } else if (geoError.code === 2) {
          setError(
            'We couldn’t determine your location. Try again, or enter your suburb or postcode instead.'
          );
        } else {
          setError(
            'Location request timed out. Try again, or enter your suburb or postcode instead.'
          );
        }
        setIsGettingLocation(false);
      }
    );
  };

  const handleResolveArea = async () => {
    const query = manualQuery.trim();
    if (query.length < 2) {
      setError('Enter a suburb or postcode to search for.');
      return;
    }

    setError('');
    setIsResolvingArea(true);
    try {
      const resolved = await geocodeArea(query);
      setLocation({
        latitude: resolved.latitude,
        longitude: resolved.longitude,
        address: resolved.area,
      });
    } catch (err: unknown) {
      // handleResponse throws Error with the backend message; a network
      // failure surfaces as TypeError from fetch itself.
      const message =
        err instanceof Error && !(err instanceof TypeError)
          ? err.message
          : 'We couldn’t look up that area. Check your connection and try again.';
      setError(message);
    } finally {
      setIsResolvingArea(false);
    }
  };

  const handleChangeLocation = () => {
    setLocation(null);
    setError('');
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

    // Backend contract is miles (1-15); the UI speaks kilometres.
    const searchRadiusMiles = Math.min(
      15,
      Math.max(1, Math.round((searchRadiusKm / KM_PER_MILE) * 10) / 10)
    );

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
              disabled={busy}
            />
            <p className="mt-1.5 text-xs text-muted">{hostName.length}/50 characters</p>
          </div>

          {/* Location Section */}
          <div>
            <label className="label">Location</label>
            <p className="text-xs text-muted mb-3">
              Only used to find restaurants near your group — we don&apos;t track or store your
              location.
            </p>
            {!location ? (
              <>
                {/* Mode toggle */}
                <div
                  className="grid grid-cols-2 gap-2 mb-3"
                  role="group"
                  aria-label="How to set your location"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setLocationMode('current');
                      setError('');
                    }}
                    disabled={busy}
                    aria-pressed={locationMode === 'current'}
                    className={`btn text-sm ${locationMode === 'current' ? 'border border-cyan/60 bg-cyan/10 text-cyan shadow-glow-cyan' : 'btn-secondary'}`}
                  >
                    Current location
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLocationMode('manual');
                      setError('');
                    }}
                    disabled={busy}
                    aria-pressed={locationMode === 'manual'}
                    className={`btn text-sm ${locationMode === 'manual' ? 'border border-cyan/60 bg-cyan/10 text-cyan shadow-glow-cyan' : 'btn-secondary'}`}
                  >
                    Suburb or postcode
                  </button>
                </div>

                {locationMode === 'current' ? (
                  <button
                    type="button"
                    onClick={handleGetLocation}
                    disabled={busy}
                    className="btn btn-secondary w-full flex items-center justify-center gap-2"
                  >
                    <svg
                      className="w-5 h-5 text-cyan"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
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
                    {isGettingLocation ? 'Getting location...' : 'Use My Current Location'}
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <input
                      id="manualArea"
                      name="manualArea"
                      type="text"
                      value={manualQuery}
                      onChange={(e) => setManualQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void handleResolveArea();
                        }
                      }}
                      placeholder="e.g. Richmond or 3121"
                      maxLength={100}
                      className="input flex-1"
                      aria-label="Suburb or postcode"
                      disabled={busy}
                    />
                    <button
                      type="button"
                      onClick={() => void handleResolveArea()}
                      disabled={busy || manualQuery.trim().length < 2}
                      className="btn border border-cyan/60 bg-cyan/10 text-cyan whitespace-nowrap"
                    >
                      {isResolvingArea ? 'Finding...' : 'Find area'}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="p-4 bg-lime/10 border border-lime/30 rounded-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="w-5 h-5 rounded-full bg-lime flex items-center justify-center">
                      <svg
                        className="w-3 h-3 text-ink"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                    <span className="text-sm font-medium text-lime">Location set</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleChangeLocation}
                    disabled={busy}
                    className="text-xs text-cyan hover:text-text transition-colors"
                  >
                    Update
                  </button>
                </div>
                {location.address ? (
                  <p className="text-sm text-text mt-2">{location.address}</p>
                ) : (
                  <p className="text-xs text-muted mt-2 font-mono">
                    {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Radius Slider (only show when location is set) */}
          {location && (
            <div>
              <label htmlFor="radius" className="label mb-3">
                Search Radius: <span className="text-cyan">{searchRadiusKm} km</span>
              </label>
              <input
                id="radius"
                type="range"
                min={MIN_RADIUS_KM}
                max={MAX_RADIUS_KM}
                value={searchRadiusKm}
                onChange={(e) => setSearchRadiusKm(Number(e.target.value))}
                disabled={isLoading}
                className="w-full h-2 bg-surface rounded-lg appearance-none cursor-pointer accent-coral"
                style={{
                  background: `linear-gradient(to right, #ff3858 0%, #ff3858 ${((searchRadiusKm - MIN_RADIUS_KM) / (MAX_RADIUS_KM - MIN_RADIUS_KM)) * 100}%, #07111f ${((searchRadiusKm - MIN_RADIUS_KM) / (MAX_RADIUS_KM - MIN_RADIUS_KM)) * 100}%, #07111f 100%)`,
                }}
              />
              <div className="flex justify-between text-xs text-muted mt-2">
                <span>{MIN_RADIUS_KM} km</span>
                <span>{MAX_RADIUS_KM} km</span>
              </div>
              <p className="mt-2 text-xs text-muted">
                We&apos;ll look for restaurants within {searchRadiusKm} km of{' '}
                {location.address || 'your location'}.
              </p>
            </div>
          )}

          <InviteFriendsSection
            selectedFriendIds={selectedFriendIds}
            onSelectionChange={setSelectedFriendIds}
            disabled={busy}
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
              disabled={busy || !hostName.trim() || !location}
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
