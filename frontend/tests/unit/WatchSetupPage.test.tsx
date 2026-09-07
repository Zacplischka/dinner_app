import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import type { SessionLobbyState } from '@dinder/shared/types';
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  updateSessionChoices: vi.fn(),
  setSessionReady: vi.fn(),
  startSession: vi.fn(),
  restartSession: vi.fn(),
  removeSessionParticipant: vi.fn(),
}));
vi.mock('../../src/services/apiClient', async (original) => ({
  ...(await original<typeof import('../../src/services/apiClient')>()),
  getSession: mocks.getSession,
}));
vi.mock('../../src/services/socketBindings', () => mocks);
import SessionLobbyPage from '../../src/pages/SessionLobbyPage';
import { useSessionStore } from '../../src/stores/sessionStore';
import { useAuthStore } from '../../src/stores/authStore';
const snapshot = (): SessionLobbyState => ({
  sessionCode: 'AB123',
  state: 'waiting',
  branch: 'watch',
  revision: 1,
  mealType: 'main course',
  headcount: 2,
  deckSize: 15,
  searchRadiusMiles: 5,
  participants: [
    {
      participantId: 'host',
      displayName: 'Alice',
      isHost: true,
      isOnline: true,
      hasSubmitted: false,
      ready: false,
      waitingForNextRound: false,
    },
    {
      participantId: 'guest',
      displayName: 'Bob',
      isHost: false,
      isOnline: true,
      hasSubmitted: false,
      ready: false,
      waitingForNextRound: false,
    },
  ],
});
function renderLobby(lobby = snapshot(), me = 'host') {
  useSessionStore.setState({ sessionCode: 'AB123', currentUserId: me, isConnected: true });
  useSessionStore.getState().setLobby(lobby);
  mocks.getSession.mockResolvedValue({
    shareableLink: 'http://localhost/join?code=AB123',
    expiresAt: new Date(Date.now() + 600000).toISOString(),
    lobby,
  });
  return render(
    <MemoryRouter initialEntries={['/session/AB123']}>
      <Routes>
        <Route path="/session/:sessionCode" element={<SessionLobbyPage />} />
        <Route path="/session/:sessionCode/select" element={<div>Deck route</div>} />
      </Routes>
    </MemoryRouter>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  useSessionStore.getState().resetSession();
  useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false });
});
it('gathers people before choices and starts only after everyone confirms Ready', async () => {
  const lobby = snapshot();
  renderLobby(lobby);
  expect(await screen.findByTestId('participants-list')).toHaveTextContent('Alice');
  expect(screen.getByRole('group', { name: 'Getting together' })).toBeInTheDocument();
  expect(screen.queryByText('Waiting for participant…')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Copy shareable link' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Start swiping' })).toBeDisabled();
  mocks.setSessionReady.mockResolvedValue({
    success: true,
    data: {
      ...lobby,
      revision: 2,
      participants: lobby.participants.map((p) => ({ ...p, ready: true })),
    },
  });
  fireEvent.click(screen.getByRole('button', { name: 'I’m ready' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Start swiping' })).toBeEnabled());
  expect(mocks.setSessionReady).toHaveBeenCalledWith({
    sessionCode: 'AB123',
    revision: 1,
    ready: true,
  });
  mocks.startSession.mockResolvedValue({
    success: true,
    data: { ...lobby, revision: 3, state: 'selecting' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Start swiping' }));
  expect(await screen.findByText('Deck route')).toBeTruthy();
  expect(screen.queryByRole('group', { name: 'Getting together' })).not.toBeInTheDocument();
  expect(mocks.startSession).toHaveBeenCalledWith({ sessionCode: 'AB123', revision: 2 });
});
it('edits only the current person’s positive interests and adopts cleared Ready from the server', async () => {
  const lobby = snapshot();
  lobby.participants.forEach((p) => (p.ready = true));
  renderLobby(lobby, 'guest');
  await screen.findByRole('button', { name: 'Comedy' });
  expect(screen.queryByRole('button', { name: 'Start swiping' })).toBeNull();
  mocks.updateSessionChoices.mockResolvedValue({
    success: true,
    data: {
      ...lobby,
      revision: 2,
      participants: lobby.participants.map((p) =>
        p.participantId === 'guest'
          ? { ...p, ready: false, mood: { genres: ['Comedy'], decades: [], mediaTypes: [] } }
          : p
      ),
    },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Comedy' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Comedy' })).toHaveAttribute('aria-pressed', 'true')
  );
  expect(mocks.updateSessionChoices).toHaveBeenCalledWith({
    sessionCode: 'AB123',
    revision: 1,
    mood: { genres: ['Comedy'], decades: [], mediaTypes: [] },
  });
  expect(screen.getByRole('button', { name: 'I’m ready' })).toBeEnabled();
  expect(useSessionStore.getState().participants.find((p) => p.isHost)?.ready).toBe(true);
});
it('keeps the group together after a failed deal with choices intact and retry available', async () => {
  const lobby = snapshot();
  lobby.participants.forEach((p) => (p.ready = true));
  renderLobby(lobby);
  mocks.startSession.mockResolvedValue({
    success: false,
    error: { code: 'NO_MOVIES_FOUND', message: 'No movies fit. Adjust your choices.' },
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Start swiping' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('No movies fit');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Start swiping' })).toBeEnabled());
  expect(screen.getByRole('button', { name: 'Comedy' })).toBeVisible();
  expect(screen.getByRole('group', { name: 'Getting together' })).toBeInTheDocument();
});

it.each([1, 4])(
  'gathers %i actual Participants without requiring empty seats to fill',
  async (count) => {
    const lobby = snapshot();
    lobby.participants = Array.from({ length: count }, (_, index) => ({
      ...lobby.participants[0],
      participantId: index === 0 ? 'host' : `guest${index}`,
      displayName: `Person ${index + 1}`,
      isHost: index === 0,
      ready: true,
    }));
    renderLobby(lobby);
    expect(await screen.findByRole('button', { name: 'Start swiping' })).toBeEnabled();
    expect(screen.getAllByTestId('participant')).toHaveLength(count);
    expect(screen.getByRole('group', { name: 'Getting together' })).toBeInTheDocument();
    expect(screen.getByText('Choose with whoever’s here.')).toBeInTheDocument();
    expect(screen.queryByText('Waiting for participant…')).not.toBeInTheDocument();
    act(() => useSessionStore.getState().setSessionStatus('expired'));
    expect(screen.queryByRole('group', { name: 'Getting together' })).not.toBeInTheDocument();
  }
);

it('keeps gathering art out of the late dietary check and restores it for a fresh round', async () => {
  const lobby = snapshot();
  lobby.branch = 'cook';
  lobby.state = 'selecting';
  lobby.participants[1].waitingForNextRound = true;
  renderLobby(lobby);
  expect(await screen.findByText('Include everyone in a fresh round')).toBeInTheDocument();
  expect(screen.queryByRole('group', { name: 'Getting together' })).not.toBeInTheDocument();
  act(() =>
    useSessionStore.getState().setLobby({
      ...lobby,
      revision: 2,
      state: 'waiting',
      participants: lobby.participants.map((participant) => ({
        ...participant,
        ready: false,
        waitingForNextRound: false,
      })),
    })
  );
  expect(screen.getByRole('group', { name: 'Getting together' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Start swiping' })).toBeDisabled();
});
it('shows offline unready people and removes only after a Host confirmation', async () => {
  const lobby = snapshot();
  lobby.participants[1].isOnline = false;
  renderLobby(lobby);
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
  mocks.removeSessionParticipant.mockResolvedValue({
    success: true,
    data: { ...lobby, revision: 2, participants: [lobby.participants[0]] },
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Remove Bob' }));
  await waitFor(() =>
    expect(mocks.removeSessionParticipant).toHaveBeenCalledWith({
      sessionCode: 'AB123',
      revision: 1,
      participantId: 'guest',
    })
  );
  expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Bob'));
  confirm.mockRestore();
});
it('credits TMDB in the Watch lobby', async () => {
  renderLobby();
  expect(await screen.findByRole('img', { name: 'TMDB' })).toHaveAttribute(
    'src',
    '/images/tmdb.svg'
  );
});

const staleChoices = {
  success: false,
  error: { code: 'VALIDATION_ERROR', message: 'The choices changed. Review and try again.' },
};

it('retries a personal interest against the latest revision when only another person changed', async () => {
  const lobby = snapshot();
  renderLobby(lobby, 'guest');
  await screen.findByRole('button', { name: 'Comedy' });
  const latest: SessionLobbyState = {
    ...lobby,
    revision: 2,
    participants: lobby.participants.map((p) =>
      p.isHost ? { ...p, mood: { genres: ['Action'], decades: [], mediaTypes: [] } } : p
    ),
  };
  mocks.getSession.mockResolvedValue({ lobby: latest });
  mocks.updateSessionChoices.mockResolvedValueOnce(staleChoices).mockResolvedValueOnce({
    success: true,
    data: {
      ...latest,
      revision: 3,
      participants: latest.participants.map((p) =>
        p.isHost ? p : { ...p, mood: { genres: ['Comedy'], decades: [], mediaTypes: [] } }
      ),
    },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Comedy' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Comedy' })).toHaveAttribute('aria-pressed', 'true')
  );
  expect(mocks.updateSessionChoices).toHaveBeenNthCalledWith(2, {
    sessionCode: 'AB123',
    revision: 2,
    mood: { genres: ['Comedy'], decades: [], mediaTypes: [] },
  });
  expect(useSessionStore.getState().lobby?.participants[0].mood?.genres).toEqual(['Action']);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it.each(['own choice', 'shared choice', 'round', 'starting'])(
  'does not retry across a changed %s',
  async (change) => {
    const lobby = snapshot();
    renderLobby(lobby, 'guest');
    await screen.findByRole('button', { name: 'Comedy' });
    const latest = { ...lobby, revision: 2 };
    if (change === 'shared choice') latest.deckSize = 5;
    if (change === 'round') latest.round = 2;
    if (change === 'starting') latest.starting = true;
    if (change === 'own choice')
      latest.participants = lobby.participants.map((p) =>
        p.isHost ? p : { ...p, mood: { genres: ['Drama'], decades: [], mediaTypes: [] } }
      );
    mocks.getSession.mockResolvedValue({ lobby: latest });
    mocks.updateSessionChoices.mockResolvedValue(staleChoices);
    fireEvent.click(screen.getByRole('button', { name: 'Comedy' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The choices changed');
    expect(mocks.updateSessionChoices).toHaveBeenCalledTimes(1);
  }
);

it.each(['eatout', 'takeaway'] as const)('describes actual %s choices', async (branch) => {
  renderLobby({ ...snapshot(), branch });
  expect(await screen.findByText(/Choose the shared search area/)).toBeVisible();
  expect(screen.queryByText(/Everyone’s interests contribute/)).not.toBeInTheDocument();
  expect(screen.queryByText('Happy with anything')).not.toBeInTheDocument();
});

it('bounds personal retries while the lobby continues changing', async () => {
  const lobby = snapshot();
  renderLobby(lobby, 'guest');
  await screen.findByRole('button', { name: 'Comedy' });
  let revision = 2;
  mocks.getSession.mockImplementation(async () => ({ lobby: { ...lobby, revision: revision++ } }));
  mocks.updateSessionChoices.mockResolvedValue(staleChoices);
  fireEvent.click(screen.getByRole('button', { name: 'Comedy' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('The choices changed');
  expect(mocks.updateSessionChoices).toHaveBeenCalledTimes(4);
});
