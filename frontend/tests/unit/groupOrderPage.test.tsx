// Issue #176 — opening a Group Order and the eight §2 failure branches.

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const openOrderMock = vi.fn();
const addOrderItemMock = vi.fn(async () => ({ success: true, data: null }));
const claimBuyerMock = vi.fn(async () => ({ success: true, data: null }));
vi.mock('../../src/services/socketBindings', () => ({
  openOrder: (...args: unknown[]) => openOrderMock(...args),
  addOrderItem: (...args: unknown[]) => addOrderItemMock(...args),
  claimBuyer: (...args: unknown[]) => claimBuyerMock(...args),
}));

const subscribeToComparisonMock = vi.fn();
vi.mock('../../src/services/comparisonStream', () => ({
  subscribeToComparison: (...args: unknown[]) => subscribeToComparisonMock(...args),
}));

import GroupOrderPage, { progressLine } from '../../src/pages/GroupOrderPage';
import { useSessionStore } from '../../src/stores/sessionStore';
import { useOrderStore } from '../../src/stores/orderStore';
import { useToastStore } from '../../src/hooks/useToast';

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
    // ponytail: the global afterEach's vi.restoreAllMocks() drops the
    // .mockResolvedValue set on navigator.clipboard.writeText in setup.ts
    // after the previous test runs — re-arm it here (see page-branches.test.tsx).
    vi.mocked(navigator.clipboard.writeText).mockResolvedValue(undefined);
    useToastStore.setState({ toasts: [] });
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

  const twoParticipants = [
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
  ];

  const basketOrder = {
    ...warmOrder,
    lines: [
      { index: 0, name: 'Margherita', priceCents: 2300, qty: 2, by: 'Alice' },
      { index: 1, name: 'Hawaiian', priceCents: 2500, qty: 1, by: 'Bob' },
    ],
    itemsCents: 2300 * 2 + 2500,
    shares: [
      { displayName: 'Alice', itemsCents: 4600, feeCents: 0, totalCents: 4600 },
      { displayName: 'Bob', itemsCents: 2500, feeCents: 0, totalCents: 2500 },
    ],
  };

  it('renders basket rows in each adder ring colour, × only on the signed-in rows', async () => {
    seedStore({
      participants: twoParticipants,
      currentUserId: 'p1',
      overlappingOptions: [restaurant],
    });
    openOrderMock.mockResolvedValue({ success: true, data: basketOrder });
    renderPage();

    await waitFor(() => expect(screen.getByText('In the basket')).toBeInTheDocument());

    // Alice is me (index 0 → coral), Bob is index 1 → violet.
    const aliceRow = screen.getByLabelText('Remove one Margherita').closest('li')!;
    expect(aliceRow.className).toContain('border-coral');
    const bobRow = screen.getByText(/· Bob/).closest('li')!;
    expect(bobRow.className).toContain('border-violet');

    // × renders only on my own rows.
    expect(screen.getByLabelText('Remove one Margherita')).toBeInTheDocument();
    expect(screen.queryByLabelText('Remove one Hawaiian')).toBeNull();

    // Menu rows are real Add buttons with the price in the label.
    expect(screen.getByRole('button', { name: 'Add Coke (Can), $7.00' })).toBeInTheDocument();
  });

  it("shows the always-primary I'll order button while building, and reports a failed claim", async () => {
    openOrderMock.mockResolvedValue({ success: true, data: warmOrder });
    claimBuyerMock.mockResolvedValueOnce({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Bob is already ordering' },
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('In the basket')).toBeInTheDocument());
    const button = screen.getByRole('button', { name: "I'll order" });
    fireEvent.click(button);

    expect(claimBuyerMock).toHaveBeenCalledWith('AB123');
    await waitFor(() =>
      expect(useToastStore.getState().toasts).toContainEqual(
        expect.objectContaining({ type: 'error', message: 'Bob is already ordering' })
      )
    );
  });

  const lockedBuyerOrder = {
    ...basketOrder,
    state: 'locked' as const,
    buyer: 'Alice',
    storeUrl: 'https://www.ubereats.com/store/11-inch-pizza/abc123',
  };

  it('renders the Buyer branch: checklist, items subtotal, split and Open Uber Eats', async () => {
    seedStore({
      participants: twoParticipants,
      currentUserId: 'p1',
      overlappingOptions: [restaurant],
    });
    openOrderMock.mockResolvedValue({ success: true, data: lockedBuyerOrder });
    renderPage();

    await waitFor(() => expect(screen.getByText('LOCKED IN')).toBeInTheDocument());
    expect(screen.getByText("You're ordering from 11 Inch Pizza on Uber Eats")).toBeInTheDocument();
    expect(screen.getByText('2 × Margherita')).toBeInTheDocument();
    expect(screen.getByText('1 × Hawaiian')).toBeInTheDocument();
    expect(screen.getByText('$71.00')).toBeInTheDocument();
    expect(screen.getByText('What everyone owes you')).toBeInTheDocument();
    expect(screen.getByText('Bob $25.00')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Copy the split' }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      '11 Inch Pizza — Bob $25.00. Alice paid $71.00.'
    );

    const openLink = screen.getByRole('link', { name: 'Open Uber Eats' });
    expect(openLink).toHaveAttribute('href', lockedBuyerOrder.storeUrl);
    expect(openLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it("shows the Buyer's fee input and debounces one order:buy per 400ms idle", async () => {
    seedStore({
      participants: twoParticipants,
      currentUserId: 'p1',
      overlappingOptions: [restaurant],
    });
    openOrderMock.mockResolvedValue({ success: true, data: lockedBuyerOrder });
    vi.useFakeTimers();
    renderPage();

    await vi.waitFor(() => expect(screen.getByText('LOCKED IN')).toBeInTheDocument());
    const input = screen.getByLabelText('Delivery + fees from the checkout screen');
    expect(input).toHaveAttribute('inputMode', 'decimal');

    fireEvent.change(input, { target: { value: '8.99' } });
    act(() => vi.advanceTimersByTime(399));
    expect(claimBuyerMock).not.toHaveBeenCalledWith('AB123', 899);
    act(() => vi.advanceTimersByTime(1));
    expect(claimBuyerMock).toHaveBeenCalledWith('AB123', 899);
    expect(claimBuyerMock).toHaveBeenCalledTimes(1);

    // A rejected value never emits.
    claimBuyerMock.mockClear();
    fireEvent.change(input, { target: { value: 'abc' } });
    act(() => vi.advanceTimersByTime(400));
    expect(claimBuyerMock).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('rejects a client-parseable fee that exceeds the server-enforced cap (100000 cents)', async () => {
    seedStore({
      participants: twoParticipants,
      currentUserId: 'p1',
      overlappingOptions: [restaurant],
    });
    openOrderMock.mockResolvedValue({ success: true, data: lockedBuyerOrder });
    vi.useFakeTimers();
    renderPage();

    await vi.waitFor(() => expect(screen.getByText('LOCKED IN')).toBeInTheDocument());
    const input = screen.getByLabelText('Delivery + fees from the checkout screen');

    // parseDollarsToCents happily parses 1,234.56 (its own named table pins
    // that), but $1,234.56 is over order:buy's 100000-cent zod max - must not emit.
    fireEvent.change(input, { target: { value: '1,234.56' } });
    act(() => vi.advanceTimersByTime(400));
    expect(claimBuyerMock).not.toHaveBeenCalled();

    // A fee right at the server cap still emits.
    fireEvent.change(input, { target: { value: '1000' } });
    act(() => vi.advanceTimersByTime(400));
    expect(claimBuyerMock).toHaveBeenCalledWith('AB123', 100000);

    vi.useRealTimers();
  });

  it('toasts the ack error when the debounced fee update is rejected', async () => {
    seedStore({
      participants: twoParticipants,
      currentUserId: 'p1',
      overlappingOptions: [restaurant],
    });
    openOrderMock.mockResolvedValue({ success: true, data: lockedBuyerOrder });
    claimBuyerMock.mockResolvedValueOnce({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Only the Buyer can set the delivery fee' },
    });
    vi.useFakeTimers();
    renderPage();

    await vi.waitFor(() => expect(screen.getByText('LOCKED IN')).toBeInTheDocument());
    const input = screen.getByLabelText('Delivery + fees from the checkout screen');
    fireEvent.change(input, { target: { value: '8.99' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(useToastStore.getState().toasts).toContainEqual(
      expect.objectContaining({
        type: 'error',
        message: 'Only the Buyer can set the delivery fee',
      })
    );

    vi.useRealTimers();
  });

  it('adds the delivery clause to Copy the split once feeCents is non-zero', async () => {
    seedStore({
      participants: twoParticipants,
      currentUserId: 'p1',
      overlappingOptions: [restaurant],
    });
    openOrderMock.mockResolvedValue({
      success: true,
      data: { ...lockedBuyerOrder, feeCents: 899, totalCents: lockedBuyerOrder.itemsCents + 899 },
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('LOCKED IN')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Copy the split' }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      '11 Inch Pizza — Bob $25.00. Alice paid $71.00 + $8.99 delivery.'
    );
  });

  it('falls back to DeliveryActions when the Buyer order has no storeUrl', async () => {
    seedStore({
      participants: twoParticipants,
      currentUserId: 'p1',
      overlappingOptions: [restaurant],
    });
    openOrderMock.mockResolvedValue({
      success: true,
      data: { ...lockedBuyerOrder, storeUrl: undefined },
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('LOCKED IN')).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: 'Open Uber Eats' })).toBeNull();
    expect(screen.getByRole('link', { name: /uber eats/i })).toBeInTheDocument();
  });

  it('renders the everyone-else branch: buyer line, my share, and Copy my share', async () => {
    seedStore({
      participants: twoParticipants,
      currentUserId: 'p2',
      overlappingOptions: [restaurant],
    });
    openOrderMock.mockResolvedValue({ success: true, data: lockedBuyerOrder });
    renderPage();

    await waitFor(() => expect(screen.getByText('LOCKED IN')).toBeInTheDocument());
    expect(screen.getByText('Alice is ordering from 11 Inch Pizza.')).toBeInTheDocument();
    expect(screen.getByText('You owe $25.00 — 1 × Hawaiian.')).toBeInTheDocument();
    expect(screen.queryByText('What everyone owes you')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Copy my share' }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('You owe $25.00 — 1 × Hawaiian.');
  });

  it("adds the delivery clause to Copy my share once my slice's feeCents is non-zero", async () => {
    seedStore({
      participants: twoParticipants,
      currentUserId: 'p2',
      overlappingOptions: [restaurant],
    });
    openOrderMock.mockResolvedValue({
      success: true,
      data: {
        ...lockedBuyerOrder,
        feeCents: 225,
        shares: [
          lockedBuyerOrder.shares[0],
          { displayName: 'Bob', itemsCents: 2500, feeCents: 225, totalCents: 2725 },
        ],
      },
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('LOCKED IN')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Copy my share' }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'You owe $27.25 — 1 × Hawaiian, + $2.25 delivery.'
    );
  });

  it('no adds are reachable once the order is locked - the basket/menu is not rendered', async () => {
    openOrderMock.mockResolvedValue({ success: true, data: lockedBuyerOrder });
    renderPage();

    await waitFor(() => expect(screen.getByText('LOCKED IN')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /^Add /i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Remove one/i })).toBeNull();
    expect(screen.queryByRole('button', { name: "I'll order" })).toBeNull();
  });

  it('progressLine names who is missing and pluralises the overflow', () => {
    expect(progressLine(['Alice'], ['Alice'])).toBe("Everyone's added something");
    expect(progressLine(['Alice', 'Bob'], ['Alice'])).toBe("Bob hasn't added anything yet");
    expect(progressLine(['Alice', 'Bob', 'Cara'], ['Alice'])).toBe(
      "Bob and Cara haven't added anything yet"
    );
    expect(progressLine(['Alice', 'Bob', 'Cara', 'Dan'], ['Alice'])).toBe(
      "Bob, Cara and 1 other haven't added anything yet"
    );
  });
});
