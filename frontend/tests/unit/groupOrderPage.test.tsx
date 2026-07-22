// Issue #176 — opening a Group Order and the eight §2 failure branches.

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const openOrderMock = vi.fn();
vi.mock('../../src/services/socketBindings', () => ({
  openOrder: (...args: unknown[]) => openOrderMock(...args),
}));

const subscribeToComparisonMock = vi.fn();
vi.mock('../../src/services/comparisonStream', () => ({
  subscribeToComparison: (...args: unknown[]) => subscribeToComparisonMock(...args),
}));

import GroupOrderPage from '../../src/pages/GroupOrderPage';
import { useSessionStore } from '../../src/stores/sessionStore';
import { useOrderStore } from '../../src/stores/orderStore';

const restaurant = { placeId: 'place-1', name: '11 Inch Pizza', address: '5 Cecil St, Fitzroy' };

const warmOrder = {
  sessionCode: 'AB123',
  placeId: restaurant.placeId,
  venueName: '11 Inch Pizza',
  platform: 'ubereats' as const,
  pricesAt: '2026-07-22T07:42:00.000Z',
  cheaperPercent: 12,
  lines: [],
  feeCents: 0,
  itemsCents: 0,
  totalCents: 0,
  shares: [],
  state: 'building' as const,
  menu: [
    { name: 'Margherita', price_cents: 2300, section: 'Pizza', tags: [] },
    { name: 'Hawaiian', price_cents: 2500, section: 'Pizza', tags: [] },
    { name: 'Coke (Can)', price_cents: 700, section: 'Drinks', tags: [] },
  ],
};

function seedStore(overrides: Partial<ReturnType<typeof useSessionStore.getState>> = {}) {
  useSessionStore.getState().resetSession();
  useOrderStore.getState().clear();
  useSessionStore.setState({
    sessionCode: 'AB123',
    orderPlaceId: restaurant.placeId,
    participants: [
      {
        participantId: 'p1',
        displayName: 'Alice',
        sessionCode: 'AB123',
        joinedAt: 1,
        hasSubmitted: true,
        isHost: true,
      },
    ],
    overlappingOptions: [restaurant],
    ...overrides,
  });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/session/AB123/order']}>
      <Routes>
        <Route path="/session/:sessionCode/order" element={<GroupOrderPage />} />
        <Route path="/session/:sessionCode/select" element={<div>SELECT SCREEN</div>} />
        <Route path="/session/:sessionCode/results" element={<div>RESULTS SCREEN</div>} />
        <Route path="/" element={<div>HOME SCREEN</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('GroupOrderPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedStore();
  });

  it('renders the venue line, cheaper badge and sectioned menu on a warm ack', async () => {
    openOrderMock.mockResolvedValue({ success: true, data: warmOrder });
    renderPage();

    await waitFor(() => expect(screen.getByText('In the basket')).toBeInTheDocument());
    const venueLine = screen.getByText(/11 Inch Pizza/).closest('p')!;
    expect(venueLine.textContent).toContain('Uber Eats');
    expect(venueLine.textContent).toMatch(/prices as at \d{1,2}:\d{2} (am|pm)/);
    expect(screen.getByText('~12% cheaper')).toBeInTheDocument();
    expect(screen.getByText('Pizza (2)')).toBeInTheDocument();
    expect(screen.getByText('Drinks (1)')).toBeInTheDocument();
    expect(screen.getByText('Margherita')).toBeInTheDocument();
    expect(
      screen.getByText('Nothing in the basket yet — tap a menu item to add it.')
    ).toBeInTheDocument();
  });

  it('renders no cheaper badge when cheaperPercent is absent', async () => {
    openOrderMock.mockResolvedValue({
      success: true,
      data: { ...warmOrder, cheaperPercent: undefined },
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('In the basket')).toBeInTheDocument());
    expect(screen.queryByText(/cheaper/)).toBeNull();
  });

  it('renders one tile per Participant with — as the subtotal', async () => {
    seedStore({
      participants: [
        {
          participantId: 'p1',
          displayName: 'Alice',
          sessionCode: 'AB123',
          joinedAt: 1,
          hasSubmitted: true,
          isHost: true,
        },
        {
          participantId: 'p2',
          displayName: 'Bob',
          sessionCode: 'AB123',
          joinedAt: 2,
          hasSubmitted: true,
          isHost: false,
        },
      ],
      overlappingOptions: [restaurant],
    });
    openOrderMock.mockResolvedValue({ success: true, data: warmOrder });
    renderPage();

    await waitFor(() => expect(screen.getByText('In the basket')).toBeInTheDocument());
    expect(screen.getAllByText('—')).toHaveLength(2);
  });

  it('shows the no_menu dead end with two delivery pills and marks the placeId', async () => {
    openOrderMock.mockResolvedValue({
      success: false,
      error: { code: 'NOT_FOUND', message: 'no menu', reason: 'no_menu' },
    });
    renderPage();

    await waitFor(() =>
      expect(
        screen.getByText('No menu for this venue on Uber Eats or DoorDash.')
      ).toBeInTheDocument()
    );
    expect(screen.getByText('You can still order the old way:')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /uber eats/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /doordash/i })).toBeInTheDocument();
    expect(useOrderStore.getState().noMenuPlaceIds).toContain(restaurant.placeId);
  });

  it('spins once on a stale Snapshot, then re-fires order:open on the terminal comparison event', async () => {
    let handlers: { onComparison?: () => void; onError?: (e: unknown) => void } = {};
    subscribeToComparisonMock.mockImplementation((_placeId, h) => {
      handlers = h;
      return vi.fn();
    });
    openOrderMock
      .mockResolvedValueOnce({
        success: false,
        error: { code: 'NOT_FOUND', message: 'stale', reason: 'stale' },
      })
      .mockResolvedValueOnce({ success: true, data: warmOrder });

    renderPage();

    await waitFor(() => expect(screen.getByText("Getting tonight's menu…")).toBeInTheDocument());
    expect(subscribeToComparisonMock).toHaveBeenCalledTimes(1);
    expect(subscribeToComparisonMock).toHaveBeenCalledWith(
      restaurant.placeId,
      expect.objectContaining({ onComparison: expect.any(Function), onError: expect.any(Function) })
    );
    // No `source` arg (the #68 kill-gate vocabulary stays closed).
    expect(subscribeToComparisonMock.mock.calls[0]).toHaveLength(2);

    act(() => handlers.onComparison?.());

    await waitFor(() => expect(screen.getByText('In the basket')).toBeInTheDocument());
    expect(openOrderMock).toHaveBeenCalledTimes(2);
  });

  it('shows the unavailable screen when the SSE reports an error (429 / STREAM_CLOSED)', async () => {
    let handlers: { onError?: (e: unknown) => void } = {};
    subscribeToComparisonMock.mockImplementation((_placeId, h) => {
      handlers = h;
      return vi.fn();
    });
    openOrderMock.mockResolvedValueOnce({
      success: false,
      error: { code: 'NOT_FOUND', message: 'stale', reason: 'stale' },
    });

    renderPage();
    await waitFor(() => expect(subscribeToComparisonMock).toHaveBeenCalled());

    act(() => handlers.onError?.({ code: 'STREAM_CLOSED', message: 'closed' }));

    await waitFor(() =>
      expect(screen.getByText("Couldn't get tonight's menu.")).toBeInTheDocument()
    );
    expect(
      screen.getByText(
        "We may have hit tonight's limit on price lookups. Try again in an hour, or just order the usual way."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /uber eats/i })).toBeInTheDocument();
  });

  it('shows the unavailable screen when a second order:open also acks stale', async () => {
    let handlers: { onComparison?: () => void } = {};
    subscribeToComparisonMock.mockImplementation((_placeId, h) => {
      handlers = h;
      return vi.fn();
    });
    openOrderMock
      .mockResolvedValueOnce({
        success: false,
        error: { code: 'NOT_FOUND', message: 'stale', reason: 'stale' },
      })
      .mockResolvedValueOnce({
        success: false,
        error: { code: 'NOT_FOUND', message: 'stale', reason: 'stale' },
      });

    renderPage();
    await waitFor(() => expect(subscribeToComparisonMock).toHaveBeenCalled());

    act(() => handlers.onComparison?.());

    await waitFor(() =>
      expect(screen.getByText("Couldn't get tonight's menu.")).toBeInTheDocument()
    );
    expect(openOrderMock).toHaveBeenCalledTimes(2);
  });

  it('shows the not-in-session screen with Back to results and Start over', async () => {
    openOrderMock.mockResolvedValue({
      success: false,
      error: { code: 'NOT_IN_SESSION', message: 'gone' },
    });
    renderPage();

    await waitFor(() =>
      expect(screen.getByText("You're not in this session any more.")).toBeInTheDocument()
    );
    expect(
      screen.getByText('Someone may have restarted it, or you were away too long.')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back to results' }));
    expect(screen.getByText('RESULTS SCREEN')).toBeInTheDocument();
  });

  it('shows the internal error screen with the two delivery pills', async () => {
    openOrderMock.mockResolvedValue({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'broken' },
    });
    renderPage();

    await waitFor(() =>
      expect(screen.getByText('Something went wrong getting the menu.')).toBeInTheDocument()
    );
    expect(screen.getByRole('link', { name: /doordash/i })).toBeInTheDocument();
  });

  it('navigates straight to Select with no screen on VALIDATION_ERROR', async () => {
    openOrderMock.mockResolvedValue({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'voided' },
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('SELECT SCREEN')).toBeInTheDocument());
  });

  it('navigates to Select when a Restart flips the Session while the page is open', async () => {
    openOrderMock.mockResolvedValue({ success: true, data: warmOrder });
    renderPage();
    await waitFor(() => expect(screen.getByText('In the basket')).toBeInTheDocument());

    act(() => useSessionStore.getState().setSessionStatus('selecting'));

    expect(screen.getByText('SELECT SCREEN')).toBeInTheDocument();
  });

  it('renders the expired screen with Start over instead of navigating', async () => {
    seedStore({ sessionStatus: 'expired' });
    openOrderMock.mockResolvedValue({ success: true, data: warmOrder });
    renderPage();

    expect(screen.getByText('This session has expired.')).toBeInTheDocument();
    expect(
      screen.getByText('Sessions last 30 minutes. Start a new one to swipe again.')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    expect(screen.getByText('HOME SCREEN')).toBeInTheDocument();
  });
});
