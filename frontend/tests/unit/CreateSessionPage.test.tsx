import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const serviceMocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  geocodeArea: vi.fn(),
  reverseGeocode: vi.fn(),
  waitForConnection: vi.fn(async () => undefined),
  joinSession: vi.fn(async () => ({ success: true, data: { participantId: 'participant-1' } })),
}));

vi.mock('../../src/services/apiClient', () => ({
  createSession: serviceMocks.createSession,
  geocodeArea: serviceMocks.geocodeArea,
  reverseGeocode: serviceMocks.reverseGeocode,
}));

vi.mock('../../src/services/socketBindings', () => ({
  waitForConnection: serviceMocks.waitForConnection,
  joinSession: serviceMocks.joinSession,
}));

vi.mock('../../src/services/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      onAuthStateChange: vi.fn(),
    },
  },
  signInWithGoogle: vi.fn(async () => undefined),
  signOut: vi.fn(async () => undefined),
}));

import CreateSessionPage from '../../src/pages/CreateSessionPage';

const richmond = {
  latitude: -37.8238936,
  longitude: 144.9982667,
  area: 'Richmond VIC 3121, Australia',
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/create']}>
      <Routes>
        <Route path="/create" element={<CreateSessionPage />} />
        <Route path="/session/:sessionCode" element={<div>Lobby route</div>} />
      </Routes>
    </MemoryRouter>
  );
}

function stubGeolocation(impl?: Geolocation['getCurrentPosition']) {
  Object.defineProperty(globalThis.navigator, 'geolocation', {
    value: impl ? { getCurrentPosition: impl } : undefined,
    configurable: true,
  });
}

describe('CreateSessionPage location flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceMocks.createSession.mockResolvedValue({
      sessionCode: 'AB123',
      hostName: 'Alice',
      participantCount: 1,
      state: 'waiting',
      expiresAt: new Date().toISOString(),
      shareableLink: 'http://localhost:3000/join?code=AB123',
    });
    stubGeolocation();
  });

  it('explains why location is requested', () => {
    renderPage();
    expect(screen.getByText(/only used to find restaurants near your group/i)).toBeTruthy();
  });

  it('creates a Session from a manually entered suburb without geolocation', async () => {
    serviceMocks.geocodeArea.mockResolvedValue(richmond);
    renderPage();

    fireEvent.change(screen.getByLabelText('Your Name'), { target: { value: 'Alice' } });
    fireEvent.click(screen.getByRole('button', { name: 'Suburb or postcode' }));
    fireEvent.change(screen.getByLabelText('Suburb or postcode'), {
      target: { value: 'Richmond' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Find area' }));

    await waitFor(() => {
      expect(screen.getByText('Location set')).toBeTruthy();
    });
    expect(serviceMocks.geocodeArea).toHaveBeenCalledWith('Richmond');
    // Human-readable area with a nearby Update action
    expect(screen.getByText('Richmond VIC 3121, Australia')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Update' })).toBeTruthy();
    // Radius surfaced in kilometres before submission
    expect(screen.getByText('8 km')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Create Session' }));

    await waitFor(() => {
      expect(screen.getByText('Lobby route')).toBeTruthy();
    });
    expect(serviceMocks.createSession).toHaveBeenCalledWith(
      'Alice',
      {
        latitude: richmond.latitude,
        longitude: richmond.longitude,
        address: richmond.area,
      },
      5 // 8 km converted to miles for the backend contract
    );
  });

  it('recovers from a denied permission by switching to manual entry with inputs intact', async () => {
    stubGeolocation((_success, errorCallback) => {
      errorCallback?.({ code: 1, message: 'denied' } as GeolocationPositionError);
    });
    renderPage();

    fireEvent.change(screen.getByLabelText('Your Name'), { target: { value: 'Alice' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use My Current Location' }));

    expect(await screen.findByText(/Location access is blocked/i)).toBeTruthy();
    // Manual entry offered as the recovery action; name input intact
    expect(screen.getByLabelText('Suburb or postcode')).toBeTruthy();
    expect((screen.getByLabelText('Your Name') as HTMLInputElement).value).toBe('Alice');
  });

  it('shows a retry-flavoured error when location is unavailable', async () => {
    stubGeolocation((_success, errorCallback) => {
      errorCallback?.({ code: 2, message: 'unavailable' } as GeolocationPositionError);
    });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Use My Current Location' }));

    expect(await screen.findByText(/couldn’t determine your location/i)).toBeTruthy();
    // Retry action still available
    expect(screen.getByRole('button', { name: 'Use My Current Location' })).toBeTruthy();
  });

  it('keeps the manual query after an unresolvable area and shows the specific message', async () => {
    serviceMocks.geocodeArea.mockRejectedValue(
      new Error(
        "We couldn't find that area. Check the spelling or try a nearby suburb or postcode."
      )
    );
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Suburb or postcode' }));
    fireEvent.change(screen.getByLabelText('Suburb or postcode'), {
      target: { value: 'Nowhereville' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Find area' }));

    expect(await screen.findByText(/couldn't find that area/i)).toBeTruthy();
    expect((screen.getByLabelText('Suburb or postcode') as HTMLInputElement).value).toBe(
      'Nowhereville'
    );
    expect(screen.queryByText('Location set')).toBeNull();
  });

  it('resolves current location and shows a human-readable area when available', async () => {
    stubGeolocation((success) => {
      success({
        coords: { latitude: -37.81, longitude: 144.96 },
      } as GeolocationPosition);
    });
    serviceMocks.reverseGeocode.mockResolvedValue({
      latitude: -37.81,
      longitude: 144.96,
      area: 'Melbourne',
    });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Use My Current Location' }));

    await waitFor(() => {
      expect(screen.getByText('Location set')).toBeTruthy();
    });
    expect(serviceMocks.reverseGeocode).toHaveBeenCalledWith(-37.81, 144.96);
    expect(screen.getByText('Melbourne')).toBeTruthy();
  });

  it('falls back to coordinates when no area name is available', async () => {
    stubGeolocation((success) => {
      success({
        coords: { latitude: -37.81, longitude: 144.96 },
      } as GeolocationPosition);
    });
    serviceMocks.reverseGeocode.mockRejectedValue(new TypeError('Failed to fetch'));
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Use My Current Location' }));

    await waitFor(() => {
      expect(screen.getByText('Location set')).toBeTruthy();
    });
    expect(screen.getByText('-37.8100, 144.9600')).toBeTruthy();
  });

  it('offers manual entry when the browser has no geolocation support', () => {
    stubGeolocation(undefined);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Use My Current Location' }));

    expect(screen.getByText(/browser doesn’t support location/i)).toBeTruthy();
    expect(screen.getByLabelText('Suburb or postcode')).toBeTruthy();
  });
});
