// #402 — a Session that expires mid-swipe is visible on the Deck screen:
// the socket event reaches the store, the shared header swaps the countdown
// for the expired banner, and exactly one error toast fires.

import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/apiClient', () => ({
  getRestaurants: vi.fn(async () => [
    {
      placeId: 'place-1',
      name: 'Ramen Ichiban',
      address: '1 Market Lane',
      cuisineType: 'Japanese ramen',
      rating: 4.6,
      priceLevel: 2,
      photoUrl: 'https://example.com/ramen.jpg',
      openNow: true,
    },
  ]),
  getSession: vi.fn(async () => ({
    shareableLink: 'http://localhost:3000/join?code=AB123',
    expiresAt: '2099-01-01T00:00:00Z',
  })),
}));

const socketMocks = vi.hoisted(() => ({ io: vi.fn() }));
vi.mock('socket.io-client', () => ({ io: socketMocks.io }));

import SelectionPage from '../../src/pages/SelectionPage';
import * as socketBindings from '../../src/services/socketBindings';
import { useSessionStore } from '../../src/stores/sessionStore';
import { useToastStore } from '../../src/hooks/useToast';

type Handler = (...args: unknown[]) => void;

// The socket seam, faked: enough of socket.io's client for the bindings to
// register their handlers and for a test to deliver one server event.
class FakeSocket {
  connected = true;
  id = 'socket-1';
  handlers = new Map<string, Handler[]>();
  disconnect = vi.fn();

  on(event: string, handler: Handler) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
    return this;
  }

  once(event: string, handler: Handler) {
    return this.on(event, handler);
  }

  emit() {
    return this;
  }

  trigger(event: string, ...args: unknown[]) {
    for (const handler of this.handlers.get(event) ?? []) handler(...args);
  }
}

describe('Session expiry on the Deck screen', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    socketBindings.disconnectSocket();
    useSessionStore.getState().resetSession();
    useSessionStore.setState({
      sessionCode: 'AB123',
      sessionStatus: 'selecting',
      expiresAt: '2099-01-01T00:00:00Z',
      participants: [
        {
          participantId: 'p1',
          displayName: 'Alice',
          sessionCode: 'AB123',
          joinedAt: 1,
          hasSubmitted: false,
          isHost: true,
        },
      ],
    });
    useToastStore.setState({ toasts: [] });
  });

  it('swaps the countdown for the expired banner and fires one error toast', async () => {
    const socket = new FakeSocket();
    socketMocks.io.mockReturnValue(socket);
    socketBindings.initializeSocket();

    render(
      <MemoryRouter initialEntries={['/session/AB123/select']}>
        <Routes>
          <Route path="/session/:sessionCode/select" element={<SelectionPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText(/Expires in/)).toBeInTheDocument();

    socket.trigger('session:expired', { sessionCode: 'AB123' });

    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent('This session has expired');
    await waitFor(() => expect(screen.queryByText(/Expires in/)).toBeNull());

    const expiryToasts = useToastStore
      .getState()
      .toasts.filter((t) => t.type === 'error' && /expired/i.test(t.message));
    expect(expiryToasts).toHaveLength(1);
  });
});
