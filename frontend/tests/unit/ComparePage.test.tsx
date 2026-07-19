import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ComparePage from '../../src/pages/ComparePage';
import { geocodeArea, getVenues } from '../../src/services/apiClient';
import { useComparisonStore } from '../../src/stores/comparisonStore';

vi.mock('../../src/services/apiClient', () => ({ getVenues: vi.fn(), geocodeArea: vi.fn() }));

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
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function venueList(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    placeId: `place-${index}`,
    name: `Venue ${index}`,
    distanceMiles: (index + 1) / 10,
  }));
}

describe('ComparePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useComparisonStore.getState().reset();
  });

  it('uses the guest location to render nearby Venues and navigate to Compare', async () => {
    vi.mocked(getVenues).mockResolvedValue({
      suburb: 'Melbourne',
      venues: [
        {
          placeId: 'place-1',
          name: '11 Inch Pizza',
          rating: 4.6,
          cuisineType: 'Pizza restaurant',
          distanceMiles: 0.2,
        },
      ],
    });

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Use my location' }));

    expect(await screen.findByText('11 Inch Pizza')).toBeInTheDocument();
    const venueCard = screen.getByRole('button', { name: /11 Inch Pizza/ });
    expect(venueCard).toHaveAttribute('data-place-id', 'place-1');
    expect(venueCard).toHaveTextContent('★ 4.6');
    expect(venueCard).toHaveTextContent('0.3 km');
    expect(venueCard).not.toHaveTextContent('Compare');
    expect(venueCard).toHaveTextContent('›');
    // Default 8 km radius converts to the backend's 5-mile contract.
    expect(getVenues).toHaveBeenCalledWith({ latitude: 37.7749, longitude: -122.4194 }, 5);
    expect(getVenues).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'near Melbourne · change' })).toBeInTheDocument();

    fireEvent.click(venueCard);
    await waitFor(() => expect(screen.getByText('Comparison view')).toBeInTheDocument());
  });

  it('resolves a manual suburb entry and keeps its area name when reverse geocoding is silent', async () => {
    vi.mocked(geocodeArea).mockResolvedValue({
      latitude: -37.82,
      longitude: 145.0,
      area: 'Richmond',
    });
    vi.mocked(getVenues).mockResolvedValue({
      venues: [{ placeId: 'place-1', name: 'Richmond Ramen', distanceMiles: 0.4 }],
    });

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Suburb or postcode' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Suburb or postcode' }), {
      target: { value: 'Richmond' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Find area' }));

    expect(await screen.findByText('Richmond Ramen')).toBeInTheDocument();
    expect(geocodeArea).toHaveBeenCalledWith('Richmond');
    expect(getVenues).toHaveBeenCalledWith({ latitude: -37.82, longitude: 145.0 }, 5);
    expect(screen.getByRole('button', { name: 'near Richmond · change' })).toBeInTheDocument();
  });

  it('keeps the typed area and explains recovery when the lookup fails', async () => {
    vi.mocked(geocodeArea).mockRejectedValue(new Error('No matching area found'));

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Suburb or postcode' }));
    const input = screen.getByRole('textbox', { name: 'Suburb or postcode' });
    fireEvent.change(input, { target: { value: 'Nowhereville' } });
    fireEvent.click(screen.getByRole('button', { name: 'Find area' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No matching area found');
    expect(input).toHaveValue('Nowhereville');
    expect(getVenues).not.toHaveBeenCalled();
  });

  it('shows the radius in kilometres before searching', () => {
    renderPage();
    expect(screen.getByText('Search radius: 8 km')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Search radius/), { target: { value: '12' } });
    expect(screen.getByText('Search radius: 12 km')).toBeInTheDocument();
  });

  it('lazy-loads the thumbnail, retries a failed load once, then falls back to the initial tile', () => {
    vi.useFakeTimers();
    useComparisonStore.setState({
      location: { latitude: -37.81, longitude: 144.96 },
      venues: [
        {
          placeId: 'place-1',
          name: 'Bella Pizza',
          photoUrl: 'https://example.com/broken.jpg',
          distanceMiles: 0.2,
        },
      ],
    });

    renderPage();
    const venueCard = screen.getByRole('button', { name: /Bella Pizza/ });
    const image = venueCard.querySelector('img') as HTMLImageElement;
    expect(image).toHaveAttribute('loading', 'lazy');

    // A transient failure keeps the photo up while one retry is pending.
    fireEvent.error(image);
    expect(image).toBeVisible();

    act(() => vi.advanceTimersByTime(2000));
    const retry = venueCard.querySelector('img') as HTMLImageElement;
    expect(retry).not.toBe(image);
    expect(retry).toHaveAttribute('src', 'https://example.com/broken.jpg');

    // A second failure gives up and leaves the initial tile.
    fireEvent.error(retry);
    expect(venueCard.querySelector('img')).toBeNull();
    expect(venueCard).toHaveTextContent('B');
    vi.useRealTimers();
  });

  it('derives Cuisine chips from Venues, ranked by frequency with labels and icons', () => {
    useComparisonStore.setState({
      location: { latitude: -37.81, longitude: 144.96 },
      venues: [
        {
          placeId: 'pizza-1',
          name: 'Pizza One',
          cuisineType: 'Pizza Restaurant',
          distanceMiles: 0.1,
        },
        {
          placeId: 'pizza-2',
          name: 'Pizza Two',
          cuisineType: 'Pizza Restaurant',
          distanceMiles: 0.2,
        },
        { placeId: 'asian', name: 'Wok This Way', cuisineType: 'Asian Fusion', distanceMiles: 0.3 },
        {
          placeId: 'sushi',
          name: 'Sushi House',
          cuisineType: 'Japanese Restaurant',
          distanceMiles: 0.4,
        },
        { placeId: 'plain', name: 'Mystery Venue', distanceMiles: 0.5 },
      ],
    });

    renderPage();

    const chips = within(screen.getByRole('group', { name: 'Filter by Cuisine' })).getAllByRole(
      'button'
    );
    expect(chips.map((chip) => chip.textContent)).toEqual([
      '🍽️ All',
      '🍕 Pizza',
      '🥡 Asian Fusion',
      '🍣 Japanese',
    ]);
  });

  it('filters by one Cuisine and clears when the chip or All is tapped', () => {
    useComparisonStore.setState({
      location: { latitude: -37.81, longitude: 144.96 },
      venues: [
        {
          placeId: 'pizza',
          name: 'Pizza Place',
          cuisineType: 'Pizza Restaurant',
          distanceMiles: 0.1,
        },
        { placeId: 'asian', name: 'Wok This Way', cuisineType: 'Asian Fusion', distanceMiles: 0.2 },
        { placeId: 'plain', name: 'Mystery Venue', distanceMiles: 0.3 },
      ],
    });
    renderPage();

    const pizzaChip = screen.getByRole('button', { name: '🍕 Pizza' });
    fireEvent.click(pizzaChip);
    expect(pizzaChip).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Pizza Place')).toBeInTheDocument();
    expect(screen.getByText('1 of 3 Venues · 8 km radius')).toBeInTheDocument();
    expect(screen.queryByText('Wok This Way')).not.toBeInTheDocument();
    expect(screen.queryByText('Mystery Venue')).not.toBeInTheDocument();

    fireEvent.click(pizzaChip);
    expect(screen.getByText('Wok This Way')).toBeInTheDocument();
    expect(screen.getByText('3 Venues · 8 km radius')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '🥡 Asian Fusion' }));
    fireEvent.click(screen.getByRole('button', { name: '🍽️ All' }));
    expect(screen.getByText('Mystery Venue')).toBeInTheDocument();
  });

  it('sorts by distance by default and by rating on request, hiding Top rated without data', () => {
    useComparisonStore.setState({
      location: { latitude: -37.81, longitude: 144.96 },
      venues: [
        { placeId: 'near', name: 'Near Venue', rating: 3.9, distanceMiles: 0.1 },
        { placeId: 'far', name: 'Far Venue', rating: 4.8, distanceMiles: 0.9 },
        { placeId: 'mid', name: 'Mid Venue', distanceMiles: 0.5 },
      ],
    });
    const { container } = renderPage();
    const order = () =>
      [...container.querySelectorAll('[data-place-id]')].map((row) =>
        row.getAttribute('data-place-id')
      );

    expect(screen.getByRole('button', { name: 'Nearest' })).toHaveAttribute('aria-pressed', 'true');
    expect(order()).toEqual(['near', 'mid', 'far']);

    fireEvent.click(screen.getByRole('button', { name: 'Top rated' }));
    expect(order()).toEqual(['far', 'near', 'mid']);

    // Without any rated Venue there is no rating order to offer.
    act(() => {
      useComparisonStore.setState({
        venues: [{ placeId: 'plain', name: 'Mystery Venue', distanceMiles: 0.3 }],
      });
    });
    expect(screen.queryByRole('button', { name: 'Top rated' })).not.toBeInTheDocument();
  });

  it('reveals a large result set progressively while preserving filters', () => {
    useComparisonStore.setState({
      location: { latitude: -37.81, longitude: 144.96 },
      venues: venueList(30),
      searchQuery: 'Venue',
    });
    const { container } = renderPage();

    expect(container.querySelectorAll('[data-place-id]')).toHaveLength(24);
    expect(screen.getByText('30 Venues · 8 km radius')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show 6 more Venues' }));
    expect(container.querySelectorAll('[data-place-id]')).toHaveLength(30);
    expect(screen.queryByRole('button', { name: /more Venues/ })).not.toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search Venues' })).toHaveValue('Venue');
  });

  it('restores a Cuisine filter and offers one-tap clear when it matches no Venues', () => {
    useComparisonStore.setState({
      location: { latitude: -37.81, longitude: 144.96 },
      selectedCuisine: 'Thai Restaurant',
      venues: [
        {
          placeId: 'pizza',
          name: 'Pizza Place',
          cuisineType: 'Pizza Restaurant',
          distanceMiles: 0.1,
        },
      ],
    });
    renderPage();

    expect(screen.getByText('No Venues match')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(screen.getByText('Pizza Place')).toBeInTheDocument();
    expect(useComparisonStore.getState().selectedCuisine).toBeUndefined();
  });

  it('searches cached Venues by name or Cuisine without a network request', () => {
    useComparisonStore.setState({
      location: { latitude: -37.81, longitude: 144.96 },
      venues: [
        { placeId: 'night', name: 'Night Noodle', cuisineType: 'Asian Fusion', distanceMiles: 0.1 },
        { placeId: 'pizza', name: "Tony's", cuisineType: 'Pizza Restaurant', distanceMiles: 0.2 },
        {
          placeId: 'curry',
          name: 'Curry House',
          cuisineType: 'Indian Restaurant',
          distanceMiles: 0.3,
        },
      ],
    });
    renderPage();
    const search = screen.getByRole('searchbox', { name: 'Search Venues' });

    fireEvent.change(search, { target: { value: 'NIGHT' } });
    expect(screen.getByText('Night Noodle')).toBeInTheDocument();
    expect(screen.queryByText("Tony's")).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'pIzZa' } });
    expect(screen.getByText("Tony's")).toBeInTheDocument();
    expect(screen.queryByText('Night Noodle')).not.toBeInTheDocument();
    expect(getVenues).not.toHaveBeenCalled();
  });

  it('combines restored search and Cuisine filters and clears both from zero matches', () => {
    useComparisonStore.setState({
      location: { latitude: -37.81, longitude: 144.96 },
      selectedCuisine: 'Pizza Restaurant',
      searchQuery: 'night',
      venues: [
        {
          placeId: 'day-pizza',
          name: 'Day Pizza',
          cuisineType: 'Pizza Restaurant',
          distanceMiles: 0.1,
        },
        {
          placeId: 'night-pizza',
          name: 'Night Pizza',
          cuisineType: 'Pizza Restaurant',
          distanceMiles: 0.2,
        },
        {
          placeId: 'night-wok',
          name: 'Night Wok',
          cuisineType: 'Asian Fusion',
          distanceMiles: 0.3,
        },
      ],
    });
    renderPage();

    const search = screen.getByRole('searchbox', { name: 'Search Venues' });
    expect(search).toHaveValue('night');
    expect(screen.getByRole('button', { name: '🍕 Pizza' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByText('Night Pizza')).toBeInTheDocument();
    expect(screen.queryByText('Day Pizza')).not.toBeInTheDocument();
    expect(screen.queryByText('Night Wok')).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'sushi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(screen.getByText('Day Pizza')).toBeInTheDocument();
    expect(screen.getByText('Night Wok')).toBeInTheDocument();
    expect(search).toHaveValue('');
    expect(useComparisonStore.getState()).toMatchObject({
      selectedCuisine: undefined,
      searchQuery: '',
    });
  });

  it('explains denied geolocation and opens the manual entry path', async () => {
    vi.mocked(navigator.geolocation.getCurrentPosition).mockImplementation((_success, failure) => {
      failure?.({ code: 1 } as GeolocationPositionError);
    });

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Use my location' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Location access is blocked');
    expect(screen.getByRole('textbox', { name: 'Suburb or postcode' })).toBeInTheDocument();
    expect(getVenues).not.toHaveBeenCalled();
  });

  it('offers a retry and a change of area when the Venue fetch fails', async () => {
    vi.mocked(getVenues)
      .mockRejectedValueOnce(new Error('Too many venue searches. Please try again shortly.'))
      .mockResolvedValueOnce({
        suburb: 'Melbourne',
        venues: [{ placeId: 'place-1', name: '11 Inch Pizza', distanceMiles: 0.2 }],
      });

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Use my location' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many venue searches');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('11 Inch Pizza')).toBeInTheDocument();
    expect(getVenues).toHaveBeenCalledTimes(2);
  });

  it('explains an empty result set and offers to change the area', async () => {
    vi.mocked(getVenues).mockResolvedValue({ suburb: 'Melbourne', venues: [] });

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Use my location' }));

    expect(await screen.findByText('No Venues within 8 km')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Change area' }));
    expect(screen.getByRole('heading', { name: 'Find nearby Venues' })).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('button', { name: /11 Inch Pizza/ }));
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
