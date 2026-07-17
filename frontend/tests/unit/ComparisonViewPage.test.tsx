import { act, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ComparisonViewPage from '../../src/pages/ComparisonViewPage';
import type { ComparisonStreamHandlers } from '../../src/services/comparisonStream';

const streamMock = vi.hoisted(() => ({ subscribe: vi.fn() }));

vi.mock('../../src/services/comparisonStream', () => ({
  subscribeToComparison: streamMock.subscribe,
}));

function renderPage(entry = '/compare/place-1') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/compare/:placeId" element={<ComparisonViewPage />} />
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

  it('rotates each pending Platform status and stops a column when its Storefront arrives', () => {
    vi.useFakeTimers();
    const view = renderPage();

    expect(screen.getAllByText('Locating the storefront…')).toHaveLength(2);
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.getAllByText('Reading the menu…')).toHaveLength(2);

    act(() =>
      handlers.onStorefront?.({
        type: 'storefront',
        platform: 'ubereats',
        storefront: { status: 'resolved', deals: [], menu: [] },
      })
    );
    expect(screen.getByTestId('ubereats-column')).toHaveTextContent('0 menu items');

    act(() => vi.advanceTimersByTime(3000));
    expect(screen.getByTestId('doordash-column')).toHaveTextContent('Cooking up prices…');
    expect(screen.getByTestId('ubereats-column')).not.toHaveTextContent('Cooking up prices…');

    view.unmount();
    vi.useRealTimers();
  });

  it('streams the venue and Uber Eats column independently while DoorDash stays pending', () => {
    const view = renderPage();

    expect(streamMock.subscribe).toHaveBeenCalledWith('place-1', expect.any(Object), undefined);
    expect(screen.getAllByText('Locating the storefront…')).toHaveLength(2);

    act(() =>
      handlers.onVenue?.({
        type: 'venue',
        placeId: 'place-1',
        venueName: '11 Inch Pizza',
      })
    );
    expect(screen.getByRole('heading', { name: '11 Inch Pizza' })).toBeInTheDocument();

    const uberEats = {
      status: 'resolved' as const,
      storeUrl: 'https://www.ubereats.com/au/store/11-inch-pizza/example',
      deals: ['20% off'],
      menu: [
        { name: 'Margherita', price_cents: 2300, section: 'Pizza', tags: ['20% off'] },
        { name: 'Coke', price_cents: 700, section: 'Drinks', tags: [] },
      ],
    };
    act(() =>
      handlers.onStorefront?.({
        type: 'storefront',
        platform: 'ubereats',
        storefront: uberEats,
      })
    );

    expect(screen.getByText('2 menu items')).toBeInTheDocument();
    expect(screen.getByText('20% off')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open in Uber Eats' })).toHaveAttribute(
      'href',
      'https://www.ubereats.com/au/store/11-inch-pizza/example'
    );
    expect(screen.getByTestId('doordash-column')).toHaveTextContent('Locating the storefront…');

    act(() =>
      handlers.onComparison?.({
        type: 'comparison',
        comparison: {
          placeId: 'place-1',
          venueName: '11 Inch Pizza',
          fetchedAt: new Date().toISOString(),
          storefronts: {
            ubereats: uberEats,
            doordash: { status: 'failed', deals: [], menu: [] },
          },
          matchedItems: [],
          unmatched: { ubereats: [], doordash: [] },
        },
      })
    );
    expect(screen.getByText('Fetched just now')).toBeInTheDocument();
    expect(screen.queryByText('Locating the storefront…')).not.toBeInTheDocument();

    view.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('renders platform failure and terminal stream errors without leaving a skeleton', () => {
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
    expect(screen.queryByText('Locating the storefront…')).not.toBeInTheDocument();
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
    expect(screen.getByTestId('ubereats-column')).toHaveTextContent('Deals—');
    expect(screen.queryByTestId('doordash-column')).not.toBeInTheDocument();
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

  it('renders matched prices, median summary, unmatched menus, and footer links', () => {
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

    const summary = screen.getByText('Uber Eats menu ~10% cheaper');
    expect(
      summary.compareDocumentPosition(screen.getByTestId('ubereats-column')) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    const fetchedAt = screen.getByText('Fetched just now');
    expect(
      fetchedAt.compareDocumentPosition(screen.getByTestId('ubereats-column')) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    const matchedSection = screen
      .getByRole('heading', { name: 'Matched items' })
      .closest('section');
    expect(within(matchedSection!).getByText('Uber Eats')).toBeInTheDocument();
    expect(within(matchedSection!).getByText('DoorDash')).toBeInTheDocument();
    expect(screen.getByText('Prices shown are non-member menu prices.')).toBeInTheDocument();
    const matchedRow = screen.getByTestId('matched-item-0');
    expect(matchedRow).toHaveTextContent('Margherita');
    expect(matchedRow).toHaveTextContent('$20.00');
    expect(matchedRow).toHaveTextContent('$22.00');
    expect(screen.getByText('$20.00')).toHaveClass('text-lime');
    expect(screen.getByText('$22.00')).not.toHaveClass('text-lime');
    expect(screen.getByText('Only on Uber Eats (1)')).toBeInTheDocument();
    expect(screen.getByText('Uber special')).toBeInTheDocument();
    expect(screen.getByText('Only on DoorDash (1)')).toBeInTheDocument();
    expect(screen.getByText('DoorDash special')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Open in Uber Eats' })).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: 'Open in DoorDash' })).toHaveLength(2);
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
});
