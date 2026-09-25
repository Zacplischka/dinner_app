// #533: a request the server never answers ends in the page's error state, not
// an endless spinner. The real apiClient runs here, over a fetch that hangs.
import { act, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import SelectionPage from '../../src/pages/SelectionPage';
import SessionLobbyPage from '../../src/pages/SessionLobbyPage';
import { LoadingAnnouncer } from '../../src/components/Spinner';
import { useToastStore } from '../../src/hooks/useToast';
import { useSessionStore } from '../../src/stores/sessionStore';

vi.mock('../../src/services/socketBindings', () => ({
  leaveSession: vi.fn(),
  restartSession: vi.fn(),
  startSession: vi.fn(),
  setSessionReady: vi.fn(),
  updateSessionChoices: vi.fn(),
  removeSessionParticipant: vi.fn(),
  submitSelection: vi.fn(),
  sendLiveSelection: vi.fn(),
}));

function renderAt(path: string, route: string, page: ReactElement) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path={path} element={page} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  useSessionStore.getState().resetSession();
  useSessionStore.setState({
    sessionCode: 'AB123',
    currentUserId: 'p1',
    participants: [
      {
        participantId: 'p1',
        displayName: 'Alice',
        sessionCode: 'AB123',
        hasSubmitted: false,
        isHost: true,
      },
    ],
    isConnected: true,
  });
  useToastStore.setState({ toasts: [] });
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError'))
          );
        })
    )
  );
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('turns "Finding restaurants…" into the Deck error card when the Deck read times out', async () => {
  renderAt('/session/:sessionCode/select', '/session/AB123/select', <SelectionPage />);
  expect(screen.getByText('Finding restaurants…')).toBeInTheDocument();

  await act(() => vi.advanceTimersByTimeAsync(15_000));

  expect(screen.queryByText('Finding restaurants…')).not.toBeInTheDocument();
  expect(screen.getByText("Couldn't load the Deck")).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('The request timed out. Try again.');
});

it('turns "Loading session…" into an error toast when the Session read times out', async () => {
  // The Lobby's wait has no caption: its words live in the app's announcer.
  renderAt(
    '/session/:sessionCode',
    '/session/AB123',
    <>
      <LoadingAnnouncer />
      <SessionLobbyPage />
    </>
  );
  expect(screen.getByText('Loading session…')).toBeInTheDocument();

  await act(() => vi.advanceTimersByTimeAsync(15_000));

  expect(screen.queryByText('Loading session…')).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Session code' })).toBeInTheDocument();
  expect(useToastStore.getState().toasts).toContainEqual(
    expect.objectContaining({ message: 'The request timed out. Try again.', type: 'error' })
  );
});
