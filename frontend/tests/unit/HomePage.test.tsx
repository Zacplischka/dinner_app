// The entry fork (#255): `/` asks the only question that matters — "Tonight
// you're…" — with four Branch cards, and demotes Join/Compare to a text row.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { useSessionStore } from '../../src/stores/sessionStore';
import HomePage from '../../src/pages/HomePage';
import { useAuthStore } from '../../src/stores/authStore';
import { useFriendsStore } from '../../src/stores/friendsStore';

function SessionStub() {
  const status = useSessionStore((state) => state.sessionStatus);
  return <p>Returned to {status}</p>;
}

function CreateStub() {
  const [params] = useSearchParams();
  return <div>Create branch: {params.get('branch') ?? 'none'}</div>;
}

function renderFork(initialEntry = '/') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/create" element={<CreateStub />} />
        <Route path="/join" element={<div>Join route</div>} />
        <Route path="/compare" element={<div>Compare route</div>} />
        <Route path="/cook" element={<div>Cook setup route</div>} />
        <Route path="/watch" element={<div>Watch setup route</div>} />
        <Route path="/session/:sessionCode" element={<SessionStub />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('HomePage entry fork', () => {
  beforeEach(() => {
    useSessionStore.getState().resetSession();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    useAuthStore.setState({ isAuthenticated: false, isLoading: false, user: null, session: null });
    useFriendsStore.getState().reset();
  });

  it('explains the shared decision and shows the four Branch cards', () => {
    renderFork();
    expect(screen.getByRole('heading', { name: /what are we doing tonight/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /eat out/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /order in/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cook together/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /watch something/i })).toBeInTheDocument();
  });

  it('routes the Eat Out card into the existing create flow with its branch', () => {
    renderFork();
    fireEvent.click(screen.getByRole('button', { name: /eat out/i }));
    expect(screen.getByText('Create branch: eatout')).toBeInTheDocument();
  });

  it('routes the Takeaway card into the existing create flow with its branch', () => {
    renderFork();
    fireEvent.click(screen.getByRole('button', { name: /order in/i }));
    expect(screen.getByText('Create branch: takeaway')).toBeInTheDocument();
  });

  it('routes the Cook card into Cook setup (#259)', () => {
    renderFork();
    fireEvent.click(screen.getByRole('button', { name: /cook together/i }));
    expect(screen.getByText('Cook setup route')).toBeInTheDocument();
  });

  it('routes the Watch card into Watch setup (#369)', () => {
    renderFork();
    fireEvent.click(screen.getByRole('button', { name: /watch something/i }));
    expect(screen.getByText('Watch setup route')).toBeInTheDocument();
  });

  it.each(['dinder.it.com', 'www.dinder.it.com'])(
    'moves new rounds from %s without clearing the existing participant',
    (hostname) => {
      const assign = vi.fn();
      vi.stubGlobal('location', { hostname, assign });
      useSessionStore.setState({ currentUserId: 'existing-participant' });
      renderFork();
      fireEvent.click(screen.getByRole('button', { name: /eat out/i }));
      expect(assign).toHaveBeenLastCalledWith('https://yupcrew.com/create?branch=eatout');
      fireEvent.click(screen.getByRole('button', { name: /watch something/i }));
      expect(assign).toHaveBeenLastCalledWith('https://yupcrew.com/watch');
      expect(useSessionStore.getState().currentUserId).toBe('existing-participant');
      fireEvent.click(screen.getByRole('button', { name: /join with a code/i }));
      expect(screen.getByText('Join route')).toBeInTheDocument();
      expect(assign).toHaveBeenCalledTimes(2);
    }
  );

  it('keeps Join with a code reachable prominently', () => {
    renderFork();
    fireEvent.click(screen.getByRole('button', { name: /join with a code/i }));
    expect(screen.getByText('Join route')).toBeInTheDocument();
  });

  it('keeps Compare delivery prices reachable prominently', () => {
    renderFork();
    fireEvent.click(screen.getByRole('button', { name: 'Compare delivery prices' }));
    expect(screen.getByText('Compare route')).toBeInTheDocument();
  });

  it('returns to the current server stage without clearing selections', async () => {
    const session = { sessionCode: 'AB123', state: 'selecting', expiresAt: '2099-01-01T00:00:00Z' };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(session)))
    );
    useSessionStore.setState({
      sessionCode: 'AB123',
      sessionStatus: 'selecting',
      selections: ['movie-a'],
      currentUserId: 'alice',
    });
    renderFork();
    await waitFor(() => expect(useSessionStore.getState().expiresAt).toBe(session.expiresAt));
    session.state = 'complete';
    fireEvent.click(screen.getByRole('button', { name: /return to session/i }));
    expect(await screen.findByText('Returned to complete')).toBeInTheDocument();
    expect(useSessionStore.getState().selections).toEqual(['movie-a']);
    expect(useSessionStore.getState().currentUserId).toBe('alice');
  });

  it('drops an expired Session instead of offering an endless return loop', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ code: 'SESSION_NOT_FOUND', message: 'Expired' }), {
            status: 404,
          })
      )
    );
    useSessionStore.setState({ sessionCode: 'AB123', sessionStatus: 'selecting' });
    renderFork();
    expect(await screen.findByText(/previous session has expired/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /return to session/i })).toBeNull();
    expect(useSessionStore.getState().sessionCode).toBeNull();
  });

  it('preserves the Session on a temporary lookup failure and allows another return attempt', async () => {
    const fetchMock = vi.fn(async () => new Response('Unavailable', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    useSessionStore.setState({
      sessionCode: 'AB123',
      sessionStatus: 'selecting',
      selections: ['recipe-a'],
    });
    renderFork();
    expect(await screen.findByText(/could not check your session/i)).toBeInTheDocument();
    expect(useSessionStore.getState().selections).toEqual(['recipe-a']);
    fetchMock.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            sessionCode: 'AB123',
            state: 'waiting',
            expiresAt: '2099-01-01T00:00:00Z',
          })
        )
    );
    fireEvent.click(screen.getByRole('button', { name: /return to session/i }));
    expect(await screen.findByText('Returned to waiting')).toBeInTheDocument();
  });

  it('keeps Leave as an explicit choice while home preserves participation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              sessionCode: 'AB123',
              state: 'selecting',
              expiresAt: '2099-01-01T00:00:00Z',
            })
          )
      )
    );
    useSessionStore.setState({
      sessionCode: 'AB123',
      sessionStatus: 'selecting',
      currentUserId: 'alice',
    });
    renderFork();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Leave session' }));
    });
    expect(screen.getByRole('dialog', { name: 'Leave session?' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Stay in session' }));
    expect(useSessionStore.getState().currentUserId).toBe('alice');
  });

  it('the fork never asks solo-or-group', () => {
    renderFork();
    expect(screen.queryByText(/solo/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/group\?/i)).not.toBeInTheDocument();
  });
});
