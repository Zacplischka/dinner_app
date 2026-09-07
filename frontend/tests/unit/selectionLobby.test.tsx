import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Branch, SessionLobbyState } from '@dinder/shared/types';
import SelectionPage from '../../src/pages/SelectionPage';
import { getRestaurants } from '../../src/services/apiClient';
import { useSessionStore } from '../../src/stores/sessionStore';

vi.mock('../../src/services/apiClient', () => ({
  getRestaurants: vi.fn(async () => [
    { kind: 'recipe', placeId: 'owned:pasta', name: 'Pasta' },
    { kind: 'recipe', placeId: 'owned:stew', name: 'Stew' },
  ]),
  getSession: vi.fn(async () => ({
    shareableLink: 'http://localhost:3000/join?code=AB123',
    expiresAt: '2099-01-01T00:00:00.000Z',
  })),
}));

vi.mock('../../src/services/socketBindings', () => ({
  submitSelection: vi.fn(async () => ({ success: true, data: null })),
  leaveSession: vi.fn(async () => ({ success: true, data: null })),
  sendLiveSelection: vi.fn(async () => ({ success: true, data: null })),
}));

function seed(branch: Branch = 'cook') {
  const participants = ['Alice', 'Bob', 'Carol'].map((displayName, index) => ({
    participantId: `p${index + 1}`,
    displayName,
    isHost: index === 0,
    isOnline: true,
    ready: index < 2,
    hasSubmitted: false,
    waitingForNextRound: index === 2,
  }));
  const lobby: SessionLobbyState = {
    sessionCode: 'AB123',
    state: 'selecting',
    branch,
    revision: 8,
    round: 7,
    mealType: 'main course',
    headcount: 2,
    deckSize: 2,
    searchRadiusMiles: 5,
    participants,
  };
  useSessionStore.setState({ sessionCode: 'AB123', currentUserId: 'p1', isConnected: true });
  useSessionStore.getState().setLobby(lobby);
}

function renderSelection() {
  return render(
    <MemoryRouter initialEntries={['/session/AB123/select']}>
      <Routes>
        <Route path="/session/:sessionCode/select" element={<SelectionPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  useSessionStore.getState().resetSession();
  vi.mocked(getRestaurants).mockClear();
});

it('keeps a waiting Cook newcomer outside the active roster, Full House and submission progress', async () => {
  seed();
  renderSelection();
  await screen.findByText('Pasta');
  expect(screen.getByTestId('strip-status')).toHaveTextContent('2 together');
  expect(screen.queryByLabelText('Carol is choosing')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Like' }));
  act(() => useSessionStore.getState().recordLiveSelection('owned:pasta', 'Bob'));
  expect(await screen.findByRole('dialog')).toHaveTextContent('EVERYONE LIKED THIS');
  expect(screen.getByTestId('strip-status')).toHaveTextContent('2 of 2 liked Pasta');

  fireEvent.click(screen.getByRole('button', { name: 'Finish here' }));
  await screen.findByText('All done!');
  act(() => {
    useSessionStore
      .getState()
      .updateParticipants(
        useSessionStore.getState().participants.map((p) => ({ ...p, hasSubmitted: p.isHost }))
      );
  });
  await waitFor(() =>
    expect(screen.getByText(/have swiped/)).toHaveTextContent('1 of 2 have swiped')
  );
  expect(screen.getByText('Waiting for Bob')).toBeInTheDocument();
  expect(screen.queryByLabelText('Carol: still swiping')).not.toBeInTheDocument();
  expect(screen.getByRole('group', { name: 'Saved you a seat' })).toBeInTheDocument();

  act(() => useSessionStore.getState().removeParticipant('p2'));
  expect(screen.queryByRole('group', { name: 'Saved you a seat' })).not.toBeInTheDocument();
  expect(screen.queryByText('Waiting for Bob')).not.toBeInTheDocument();
  expect(screen.getByText('Your selections are submitted.')).toBeInTheDocument();
});

it('keeps the saved seat for disconnected Participants and removes it when the Session expires', async () => {
  seed('watch');
  act(() =>
    useSessionStore.setState((state) => ({
      participants: state.participants.map((participant) => ({
        ...participant,
        hasSubmitted: participant.isHost,
        isOnline: participant.isHost,
      })),
    }))
  );
  renderSelection();
  expect(await screen.findByRole('group', { name: 'Saved you a seat' })).toBeInTheDocument();
  expect(screen.getByText('Waiting for Bob')).toBeInTheDocument();
  act(() => useSessionStore.getState().setSessionStatus('expired'));
  expect(screen.queryByRole('group', { name: 'Saved you a seat' })).not.toBeInTheDocument();
});

it.each<Branch>(['watch', 'cook'])(
  'explains the fixed deck to an admitted %s late joiner',
  async (branch) => {
    seed(branch);
    const lobby = useSessionStore.getState().lobby!;
    useSessionStore.setState({ currentUserId: 'p3' });
    useSessionStore.getState().setLobby({
      ...lobby,
      revision: lobby.revision + 1,
      participants: lobby.participants.map((p) => ({ ...p, waitingForNextRound: false })),
    });
    renderSelection();

    expect(
      await screen.findByText('This round’s deck is fixed. New interests apply next round.')
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Like' })).toBeEnabled();
    expect(screen.getByTestId('strip-status')).toHaveTextContent('3 together');
  }
);

it('preserves the same round on rejoin and reloads the Deck and Full House state for a recovered new round', async () => {
  seed();
  renderSelection();
  await screen.findByText('Pasta');
  fireEvent.click(screen.getByRole('button', { name: 'Like' }));
  act(() => useSessionStore.getState().recordLiveSelection('owned:pasta', 'Bob'));
  expect(await screen.findByRole('dialog')).toHaveTextContent('EVERYONE LIKED THIS');

  const lobby = useSessionStore.getState().lobby!;
  act(() => useSessionStore.getState().setLobby({ ...lobby, revision: lobby.revision + 1 }));
  expect(getRestaurants).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('dialog')).toHaveTextContent('EVERYONE LIKED THIS');
  expect(useSessionStore.getState().deckCursor).toBe(1);

  vi.mocked(getRestaurants).mockResolvedValueOnce([
    { kind: 'recipe', placeId: 'owned:pasta', name: 'Pasta again' },
    { kind: 'recipe', placeId: 'owned:soup', name: 'Soup' },
  ]);
  act(() =>
    useSessionStore.getState().setLobby({ ...lobby, revision: lobby.revision + 5, round: 12 })
  );
  await screen.findByText('Pasta again');
  expect(getRestaurants).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.queryByText('Stew')).not.toBeInTheDocument();
  expect(useSessionStore.getState().deckCursor).toBe(0);

  fireEvent.click(screen.getByRole('button', { name: 'Like' }));
  act(() => useSessionStore.getState().recordLiveSelection('owned:pasta', 'Bob'));
  expect(await screen.findByRole('dialog')).toHaveTextContent('Pasta again');
});
