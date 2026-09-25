import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import RequireSession from '../../src/components/RequireSession';
import { useSessionStore } from '../../src/stores/sessionStore';

const { reconcileSession } = vi.hoisted(() => ({ reconcileSession: vi.fn() }));
vi.mock('../../src/services/socketBindings', () => ({ reconcileSession }));

function JoinRoute() {
  return <div>Join route{useLocation().search}</div>;
}

function renderAt(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/" element={<div>Home route</div>} />
        <Route path="/join" element={<JoinRoute />} />
        <Route path="/session/:sessionCode" element={<RequireSession />}>
          <Route index element={<div>Lobby route</div>} />
          <Route path="select" element={<div>Select route</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('RequireSession', () => {
  beforeEach(() => {
    act(() => useSessionStore.getState().resetSession());
    act(() => useSessionStore.setState({ isConnected: true }));
  });

  it('keeps actions unavailable until the saved Participant is reconciled', () => {
    useSessionStore.setState({ sessionCode: 'AB123', isConnected: false });
    renderAt('/session/AB123/select');
    expect(screen.queryByText('Select route')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
    act(() => useSessionStore.setState({ isConnected: true }));
    expect(screen.getByText('Select route')).toBeInTheDocument();
    act(() => useSessionStore.setState({ sessionCode: null, rejectedSessionCode: 'AB123' }));
    expect(screen.getByText('Join route?code=AB123&resume=failed')).toBeInTheDocument();
  });

  // #511: the gate also shows to an online phone whose rejoin failed, so its
  // copy must not blame the connection, and it needs a way out besides retry.
  it('offers Try again and Home without telling an online phone to connect', async () => {
    useSessionStore.setState({ sessionCode: 'AB123', isConnected: false });
    renderAt('/session/AB123/select');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Couldn’t reach your session yet. Your place is saved.'
    );
    expect(screen.queryByText(/internet/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await vi.waitFor(() => expect(reconcileSession).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('link', { name: 'Home' }));
    expect(screen.getByText('Home route')).toBeInTheDocument();
    // Home is not Leave: the Session stays for Home's "Return to session".
    expect(useSessionStore.getState().sessionCode).toBe('AB123');
  });

  it('renders the Session route when the stored Session matches the URL', () => {
    act(() => useSessionStore.setState({ sessionCode: 'AB123' }));

    renderAt('/session/AB123');

    expect(screen.getByText('Lobby route')).toBeInTheDocument();
  });

  // #403: a forwarded Session URL, cleared storage or a new browser has no
  // Session in the store — Join already handles the prefilled code, the name
  // entry and a dead link.
  it.each(['/session/AB123', '/session/AB123/select'])(
    'sends a cold link at %s to Join with the code prefilled',
    (route) => {
      renderAt(route);

      expect(screen.getByText('Join route?code=AB123')).toBeInTheDocument();
    }
  );

  it('sends a URL for a different Session than the stored one to Join', () => {
    act(() => useSessionStore.setState({ sessionCode: 'ZZ999' }));

    renderAt('/session/AB123');

    expect(screen.getByText('Join route?code=AB123')).toBeInTheDocument();
  });

  it('redirects stale selecting and results routes back to shared choices after Restart', () => {
    useSessionStore.setState({
      sessionCode: 'AB123',
      sessionStatus: 'waiting',
      lobby: {
        sessionCode: 'AB123',
        branch: 'watch',
        state: 'waiting',
        revision: 4,
        round: 2,
        participants: [],
        mealType: 'main course',
        headcount: 2,
        deckSize: 15,
        searchRadiusMiles: 5,
      },
    });
    renderAt('/session/AB123/select');
    expect(screen.getByText('Lobby route')).toBeInTheDocument();
  });

  it('keeps a waiting dietary newcomer out of the active Deck route', () => {
    useSessionStore.setState({
      sessionCode: 'AB123',
      sessionStatus: 'selecting',
      currentUserId: 'newcomer',
      participants: [
        {
          participantId: 'newcomer',
          displayName: 'Newcomer',
          sessionCode: 'AB123',
          hasSubmitted: false,
          isHost: false,
          waitingForNextRound: true,
        },
      ],
    });
    renderAt('/session/AB123/select');
    expect(screen.getByText('Lobby route')).toBeInTheDocument();
  });

  // A rejected rejoin resets the store (socketBindings) and toasts the server's
  // reason; the guard is what turns that reset into a redirect, from whichever
  // Session route was open.
  it('redirects when the store is reset mid-session, as a rejected rejoin does', () => {
    act(() => useSessionStore.setState({ sessionCode: 'AB123' }));

    renderAt('/session/AB123/select');
    expect(screen.getByText('Select route')).toBeInTheDocument();

    act(() => useSessionStore.getState().resetSession());

    expect(screen.getByText('Join route?code=AB123')).toBeInTheDocument();
  });
});
