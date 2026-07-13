import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ComparePage from '../../src/pages/ComparePage';
import { getVenues } from '../../src/services/apiClient';
import { useComparisonStore } from '../../src/stores/comparisonStore';

vi.mock('../../src/services/apiClient', () => ({ getVenues: vi.fn() }));

function renderPage() {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={['/compare']}>
        <Routes>
          <Route path="/compare" element={<ComparePage />} />
          <Route path="/compare/:placeId" element={<div>Comparison view</div>} />
        </Routes>
      </MemoryRouter>
    </StrictMode>
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('ComparePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useComparisonStore.getState().reset();
  });

  it('uses the guest location to render nearby Venues and navigate to Compare', async () => {
    vi.mocked(getVenues).mockResolvedValue({
      suburb: 'Melbourne',
      venues: [{
        placeId: 'place-1',
        name: '11 Inch Pizza',
        rating: 4.6,
        cuisineType: 'Pizza restaurant',
        distanceMiles: 0.2,
      }],
    });

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Use my location' }));

    expect(await screen.findByText('11 Inch Pizza')).toBeInTheDocument();
    const venueCard = screen.getByRole('button', { name: /Compare 11 Inch Pizza/ });
    expect(venueCard).toHaveAttribute('data-place-id', 'place-1');
    expect(venueCard).toHaveTextContent('4.6');
    expect(venueCard).toHaveTextContent('0.2 mi');
    expect(getVenues).toHaveBeenCalledWith({ latitude: 37.7749, longitude: -122.4194 }, 5);
    expect(getVenues).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'near Melbourne · change' })).toBeInTheDocument();

    fireEvent.click(venueCard);
    await waitFor(() => expect(screen.getByText('Comparison view')).toBeInTheDocument());
  });

  it('explains denied geolocation and leaves a retry action', async () => {
    vi.mocked(navigator.geolocation.getCurrentPosition).mockImplementation((_success, failure) => {
      failure?.({ code: 1 } as GeolocationPositionError);
    });

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Use my location' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Location permission was denied');
    expect(screen.getByRole('button', { name: 'Use my location' })).toBeInTheDocument();
    expect(getVenues).not.toHaveBeenCalled();
  });

  it('restores cached Venues and scroll position without a Google refetch', async () => {
    useComparisonStore.setState({
      location: { latitude: -37.81, longitude: 144.96 },
      suburb: 'Melbourne',
      venues: [{ placeId: 'place-1', name: '11 Inch Pizza', distanceMiles: 0.2 }],
      scrollY: 240,
    });
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 321 });

    renderPage();

    expect(screen.getByText('11 Inch Pizza')).toBeInTheDocument();
    expect(window.scrollTo).toHaveBeenCalledWith(0, 240);
    expect(getVenues).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Compare 11 Inch Pizza/ }));
    await waitFor(() => expect(screen.getByText('Comparison view')).toBeInTheDocument());
    expect(useComparisonStore.getState().scrollY).toBe(321);
  });

  it('loads a persisted location only once under Strict Mode', async () => {
    useComparisonStore.setState({
      location: { latitude: -37.81, longitude: 144.96 },
      venues: [],
    });
    vi.mocked(getVenues).mockResolvedValue({
      suburb: 'Melbourne',
      venues: [{ placeId: 'place-1', name: '11 Inch Pizza', distanceMiles: 0.2 }],
    });

    renderPage();

    expect(await screen.findByText('11 Inch Pizza')).toBeInTheDocument();
    expect(getVenues).toHaveBeenCalledTimes(1);
  });

  it('ignores stale results when the location changes during a request', async () => {
    const oldRequest = deferred<Awaited<ReturnType<typeof getVenues>>>();
    const newRequest = deferred<Awaited<ReturnType<typeof getVenues>>>();
    useComparisonStore.setState({
      location: { latitude: -37.81, longitude: 144.96 },
      venues: [],
    });
    vi.mocked(getVenues)
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(newRequest.promise);

    renderPage();
    await waitFor(() => expect(getVenues).toHaveBeenCalledTimes(1));

    act(() => {
      useComparisonStore.getState().setLocation({ latitude: -37.9, longitude: 145.1 });
    });
    await waitFor(() => expect(getVenues).toHaveBeenCalledTimes(2));

    await act(async () => {
      newRequest.resolve({
        suburb: 'Richmond',
        venues: [{ placeId: 'new', name: 'New Venue', distanceMiles: 0.1 }],
      });
    });
    await act(async () => {
      oldRequest.resolve({
        suburb: 'Melbourne',
        venues: [{ placeId: 'old', name: 'Old Venue', distanceMiles: 0.1 }],
      });
    });

    expect(screen.getByText('New Venue')).toBeInTheDocument();
    expect(screen.queryByText('Old Venue')).not.toBeInTheDocument();
  });
});
