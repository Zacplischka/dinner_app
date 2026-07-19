import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ComparisonViewPage from '../../src/pages/ComparisonViewPage';
import type { ComparisonStreamHandlers } from '../../src/services/comparisonStream';

const streamMock = vi.hoisted(() => ({ subscribe: vi.fn() }));

vi.mock('../../src/services/comparisonStream', () => ({
  subscribeToComparison: streamMock.subscribe,
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-search">{location.search}</div>;
}

function renderPage(entry = '/compare/place-1') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/compare" element={<div>Venue list</div>} />
        <Route
          path="/compare/:placeId"
          element={
            <>
              <ComparisonViewPage />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('ComparisonViewPage', () => {
  let handlers: ComparisonStreamHandlers;
  let unsubscribe: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    unsubscribe = vi.fn();
    streamMock.subscribe.mockImplementation((_placeId, nextHandlers) => {
      handlers = nextHandlers;
      return unsubscribe;
    });
  });

  it('forwards a valid tap source from the URL to the Comparison subscribe', () => {
    renderPage('/compare/place-1?source=match_card').unmount();
    renderPage('/compare/place-1?source=bogus').unmount();
    renderPage('/compare/place-1').unmount();

    expect(streamMock.subscribe).toHaveBeenNthCalledWith(
      1,
      'place-1',
      expect.any(Object),
      'match_card'
    );
    expect(streamMock.subscribe).toHaveBeenNthCalledWith(
      2,
      'place-1',
      expect.any(Object),
      undefined
    );
    expect(streamMock.subscribe).toHaveBeenNthCalledWith(
      3,
      'place-1',
      expect.any(Object),
      undefined
    );
  });

  it('strips the consumed source from the URL so a refresh does not re-count the tap', () => {
    renderPage('/compare/place-1?source=match_card');

    // The tap was counted once...
    expect(streamMock.subscribe).toHaveBeenCalledTimes(1);
    expect(streamMock.subscribe).toHaveBeenCalledWith('place-1', expect.any(Object), 'match_card');
    // ...and the URL no longer carries the source.
    expect(screen.getByTestId('location-search').textContent).toBe('');
  });

  it('reports each Platform status explicitly and keeps a resolved column while the other checks', () => {
    renderPage();

    expect(screen.getAllByText('Still checking…')).toHaveLength(2);

    act(() =>
      handlers.onStorefront?.({
        type: 'storefront',
        platform: 'ubereats',
        storefront: { status: 'resolved', deals: [], menu: [] },
      })
    );

    const uberEats = screen.getByTestId('ubereats-column');
    const doorDash = screen.getByTestId('doordash-column');
    expect(within(uberEats).getByText('Ready')).toBeInTheDocument();
    expect(uberEats).toHaveTextContent('0 menu items');
    expect(within(doorDash).getByText('Still checking…')).toBeInTheDocument();

    act(() =>
      handlers.onStorefront?.({
        type: 'storefront',
        platform: 'doordash',
        storefront: { status: 'failed', deals: [], menu: [] },
      })
    );
    expect(within(doorDash).getByText('Failed')).toBeInTheDocument();
    expect(doorDash).toHaveTextContent('Couldn’t reach DoorDash');
    // The resolved column is untouched by the other Platform's failure.
    expect(within(uberEats).getByText('Ready')).toBeInTheDocument();
  });

  it('says No deals reported instead of a bare dash', () => {
    renderPage();

    act(() =>
      handlers.onStorefront?.({
        type: 'storefront',
        platform: 'ubereats',
        storefront: { status: 'resolved', deals: [], menu: [] },
      })
    );

    expect(screen.getByText('No deals reported')).toBeInTheDocument();
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });

  it('does not re-count the tap source when Retry starts a fresh attempt', () => {
    vi.useFakeTimers();
    const view = renderPage('/compare/place-1?source=match_card');

    act(() => vi.advanceTimersByTime(30_000));
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(streamMock.subscribe).toHaveBeenNthCalledWith(
      1,
      'place-1',
      expect.any(Object),
      'match_card'
    );
    expect(streamMock.subscribe).toHaveBeenNthCalledWith(
      2,
      'place-1',
      expect.any(Object),
      undefined
    );

    view.unmount();
    vi.useRealTimers();
  });

  it('offers bounded recovery after a long wait without losing partial progress', () => {
    vi.useFakeTimers();
    const view = renderPage();

    act(() =>
      handlers.onStorefront?.({
        type: 'storefront',
        platform: 'ubereats',
        storefront: {
          status: 'resolved',
          deals: [],
          menu: [{ name: 'Margherita', price_cents: 2000, tags: [] }],
        },
      })
    );
    expect(screen.queryByText(/taking longer than usual/i)).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(30_000));

    expect(screen.getByText(/taking longer than usual/i)).toBeInTheDocument();
    // Completed partial information stays on screen.
    expect(screen.getByTestId('ubereats-column')).toHaveTextContent('1 menu item');
    expect(
      within(screen.getByTestId('doordash-column')).getByText('Still checking…')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to venues' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    // A fresh visible attempt: resubscribed, no stale progress or banner left.
    expect(streamMock.subscribe).toHaveBeenCalledTimes(2);
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(screen.queryByText(/taking longer than usual/i)).not.toBeInTheDocument();
    expect(screen.getAllByText('Still checking…')).toHaveLength(2);
    expect(screen.queryByText('1 menu item')).not.toBeInTheDocument();

    view.unmount();
    vi.useRealTimers();
  });

  it('navigates back to the Venue list from the recovery banner', () => {
    vi.useFakeTimers();
    renderPage();

    act(() => vi.advanceTimersByTime(30_000));
    fireEvent.click(screen.getByRole('button', { name: 'Back to venues' }));

    expect(screen.getByText('Venue list')).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('marks unreported Platforms as Unavailable on a terminal stream error, with recovery', () => {
    renderPage();

    act(() =>
      handlers.onStorefront?.({
        type: 'storefront',
        platform: 'doordash',
        storefront: { status: 'failed', deals: [], menu: [] },
      })
    );
    expect(
      screen.getByText('Couldn’t reach DoorDash — try again in a couple of minutes.')
    ).toBeInTheDocument();

    act(() =>
      handlers.onError?.({
        type: 'error',
        code: 'RATE_LIMITED',
        message: 'Too many comparisons. Please try again shortly.',
      })
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Too many comparisons. Please try again shortly.'
    );
    expect(screen.queryByText('Still checking…')).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId('ubereats-column')).getByText('Unavailable')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to venues' })).toBeInTheDocument();
  });

  it('shows a one-platform result as a single column with an honest badge', () => {
    renderPage();
    const uberEats = {
      status: 'resolved' as const,
      storeUrl: 'https://www.ubereats.com/au/store/11-inch-pizza/example',
      deals: [],
      menu: [{ name: 'Margherita', price_cents: 2300, tags: [] }],
    };
    const doorDash = { status: 'not_found' as const, deals: [], menu: [] };

    act(() =>
      handlers.onStorefront?.({
        type: 'storefront',
        platform: 'ubereats',
        storefront: uberEats,
      })
    );
    act(() =>
      handlers.onStorefront?.({
        type: 'storefront',
        platform: 'doordash',
        storefront: doorDash,
      })
    );
    act(() =>
      handlers.onComparison?.({
        type: 'comparison',
        comparison: {
          placeId: 'place-1',
          venueName: '11 Inch Pizza',
          fetchedAt: new Date().toISOString(),
          storefronts: { ubereats: uberEats, doordash: doorDash },
          matchedItems: [],
          unmatched: { ubereats: uberEats.menu, doordash: [] },
        },
      })
    );

    expect(screen.getByText('Only on Uber Eats')).toBeInTheDocument();
    expect(screen.queryByTestId('doordash-column')).not.toBeInTheDocument();
    // One final set of Platform actions.
    expect(screen.getAllByRole('link', { name: 'Open in Uber Eats' })).toHaveLength(1);
  });

  it('shows a definitive state when neither platform has the Venue', () => {
    renderPage();
    const notFound = { status: 'not_found' as const, deals: [], menu: [] };

    act(() =>
      handlers.onComparison?.({
        type: 'comparison',
        comparison: {
          placeId: 'place-1',
          venueName: 'Missing Venue',
          fetchedAt: new Date().toISOString(),
          storefronts: { ubereats: notFound, doordash: notFound },
          matchedItems: [],
          unmatched: { ubereats: [], doordash: [] },
        },
      })
    );

    expect(
      screen.getByText('Couldn’t find this venue on either delivery app.')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('ubereats-column')).not.toBeInTheDocument();
    expect(screen.queryByTestId('doordash-column')).not.toBeInTheDocument();
  });

  it('offers recovery when both Platforms failed', () => {
    renderPage();
    const failed = { status: 'failed' as const, deals: [], menu: [] };

    act(() =>
      handlers.onComparison?.({
        type: 'comparison',
        comparison: {
          placeId: 'place-1',
          venueName: 'Flaky Venue',
          fetchedAt: new Date().toISOString(),
          storefronts: { ubereats: failed, doordash: failed },
          matchedItems: [],
          unmatched: { ubereats: [], doordash: [] },
        },
      })
    );

    expect(screen.getByText('Couldn’t reach either delivery app right now.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to venues' })).toBeInTheDocument();
    expect(screen.queryByTestId('ubereats-column')).not.toBeInTheDocument();
  });

  it('leads a completed Comparison with the conclusion, matched count, and freshness', () => {
    renderPage();
    const uberEats = {
      status: 'resolved' as const,
      storeUrl: 'https://www.ubereats.com/au/store/pizza/example',
      deals: ['20% off'],
      menu: [
        { name: 'Margherita', price_cents: 2000, tags: [] },
        { name: 'Uber special', price_cents: 1800, tags: [] },
      ],
    };
    const doorDash = {
      status: 'resolved' as const,
      storeUrl: 'https://www.doordash.com/store/pizza-123/',
      deals: [],
      menu: [
        { name: 'Margherita', price_cents: 2200, tags: [] },
        { name: 'DoorDash special', price_cents: 1900, tags: [] },
      ],
    };

    act(() =>
      handlers.onComparison?.({
        type: 'comparison',
        comparison: {
          placeId: 'place-1',
          venueName: 'Pizza Place',
          fetchedAt: new Date().toISOString(),
          storefronts: { ubereats: uberEats, doordash: doorDash },
          matchedItems: [
            {
              name: 'Margherita',
              ubereats: uberEats.menu[0],
              doordash: doorDash.menu[0],
            },
          ],
          unmatched: {
            ubereats: [uberEats.menu[1]],
            doordash: [doorDash.menu[1]],
          },
          cheaperMenu: { platform: 'ubereats', percent: 10 },
        },
      })
    );

    // Answer first: conclusion, evidence scope, freshness — before the evidence.
    const conclusion = screen.getByText('Uber Eats is cheaper here');
    expect(screen.getByText('Menu prices ~10% lower across 1 matched item')).toBeInTheDocument();
    expect(screen.getByText('Fetched just now')).toBeInTheDocument();
    expect(
      conclusion.compareDocumentPosition(screen.getByTestId('matched-item-0')) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    // Cheaper price marked by text weight and a savings label, not colour alone.
    const matchedRow = screen.getByTestId('matched-item-0');
    expect(matchedRow).toHaveTextContent('Margherita');
    expect(matchedRow).toHaveTextContent('$20.00');
    expect(matchedRow).toHaveTextContent('$22.00');
    expect(within(matchedRow).getByText('Save $2.00')).toBeInTheDocument();
    expect(screen.getByText('$20.00')).toHaveClass('font-semibold');

    expect(screen.getByText('Prices shown are non-member menu prices.')).toBeInTheDocument();
    expect(screen.getByText('Only on Uber Eats (1)')).toBeInTheDocument();
    expect(screen.getByText('Uber special')).toBeInTheDocument();
    expect(screen.getByText('Only on DoorDash (1)')).toBeInTheDocument();
    expect(screen.getByText('DoorDash special')).toBeInTheDocument();

    // Platform actions appear exactly once, after the evidence.
    expect(screen.getAllByRole('link', { name: 'Open in Uber Eats' })).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: 'Open in DoorDash' })).toHaveLength(1);
  });

  it('concludes prices are about the same when no menu is cheaper', () => {
    renderPage();
    const uberEats = {
      status: 'resolved' as const,
      deals: [],
      menu: [{ name: 'Margherita', price_cents: 2000, tags: [] }],
    };
    const doorDash = {
      status: 'resolved' as const,
      deals: [],
      menu: [{ name: 'Margherita', price_cents: 2000, tags: [] }],
    };

    act(() =>
      handlers.onComparison?.({
        type: 'comparison',
        comparison: {
          placeId: 'place-1',
          venueName: 'Even Venue',
          fetchedAt: new Date().toISOString(),
          storefronts: { ubereats: uberEats, doordash: doorDash },
          matchedItems: [
            { name: 'Margherita', ubereats: uberEats.menu[0], doordash: doorDash.menu[0] },
          ],
          unmatched: { ubereats: [], doordash: [] },
        },
      })
    );

    expect(screen.getByText('Prices are about the same on both apps')).toBeInTheDocument();
    expect(screen.getByText('Across 1 matched item')).toBeInTheDocument();
    // An evenly priced row carries no savings label.
    expect(screen.queryByText(/^Save /)).not.toBeInTheDocument();
  });

  it('flags a Snapshot older than the freshness window', () => {
    renderPage();
    const resolved = {
      status: 'resolved' as const,
      deals: [],
      menu: [{ name: 'Margherita', price_cents: 2000, tags: [] }],
    };

    act(() =>
      handlers.onComparison?.({
        type: 'comparison',
        comparison: {
          placeId: 'place-1',
          venueName: 'Old Snapshot Venue',
          fetchedAt: new Date(Date.now() - 25 * 60_000).toISOString(),
          storefronts: { ubereats: resolved, doordash: resolved },
          matchedItems: [
            { name: 'Margherita', ubereats: resolved.menu[0], doordash: resolved.menu[0] },
          ],
          unmatched: { ubereats: [], doordash: [] },
        },
      })
    );

    expect(screen.getByText('Fetched 25 mins ago — may be out of date')).toBeInTheDocument();
  });

  it('shows the Storefront hero image, preferring Uber Eats, and recovers from a broken one', () => {
    renderPage();

    expect(screen.queryByTestId('venue-hero-image')).not.toBeInTheDocument();
    act(() =>
      handlers.onStorefront?.({
        type: 'storefront',
        platform: 'doordash',
        storefront: {
          status: 'resolved',
          imageUrl: 'https://img.cdn4dd.com/cover.jpg',
          deals: [],
          menu: [],
        },
      })
    );

    const hero = screen.getByTestId('venue-hero-image');
    expect(hero).toHaveAttribute('src', 'https://img.cdn4dd.com/cover.jpg');
    // The DoorDash image 404s and hides itself...
    fireEvent.error(hero);
    expect(hero.hidden).toBe(true);

    act(() =>
      handlers.onStorefront?.({
        type: 'storefront',
        platform: 'ubereats',
        storefront: {
          status: 'resolved',
          imageUrl: 'https://tb-static.uber.com/hero.jpeg',
          deals: [],
          menu: [],
        },
      })
    );

    // ...and the preferred Uber Eats image replaces it on a fresh, visible node.
    const replaced = screen.getByTestId('venue-hero-image');
    expect(replaced).toHaveAttribute('src', 'https://tb-static.uber.com/hero.jpeg');
    expect(replaced.hidden).toBe(false);
  });

  it('explains a zero-match result without treating it as an error', () => {
    renderPage();
    const uberEats = {
      status: 'resolved' as const,
      deals: [],
      menu: [{ name: 'One', price_cents: 1000, tags: [] }],
    };
    const doorDash = {
      status: 'resolved' as const,
      deals: [],
      menu: [{ name: 'Different', price_cents: 1200, tags: [] }],
    };

    act(() =>
      handlers.onComparison?.({
        type: 'comparison',
        comparison: {
          placeId: 'place-1',
          venueName: 'Different Menus',
          fetchedAt: new Date().toISOString(),
          storefronts: { ubereats: uberEats, doordash: doorDash },
          matchedItems: [],
          unmatched: { ubereats: uberEats.menu, doordash: doorDash.menu },
        },
      })
    );

    expect(
      screen.getByText('These menus are too different to compare item by item.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('unsubscribes the stream on unmount', () => {
    renderPage().unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
