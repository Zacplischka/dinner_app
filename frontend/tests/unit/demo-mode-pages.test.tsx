import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/demo', () => ({ DEMO_MODE: true }));

import App from '../../src/App';
import CreateSessionPage from '../../src/pages/CreateSessionPage';
import JoinSessionPage from '../../src/pages/JoinSessionPage';
import ResultsPage from '../../src/pages/ResultsPage';
import SelectionPage from '../../src/pages/SelectionPage';
import SessionLobbyPage from '../../src/pages/SessionLobbyPage';
import {
  addDemoFriends,
  computeDemoResults,
  createDemoSession,
  getDemoRestaurants,
  getDemoSession,
  submitDemoSelection,
} from '../../src/services/demoSessionService';
import { useAuthStore } from '../../src/stores/authStore';
import { useSessionStore } from '../../src/stores/sessionStore';

function renderRoute(element: React.ReactElement, path: string, route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path={path} element={element} />
        <Route path="/" element={<div>Home route</div>} />
        <Route path="*" element={<div>Routed away</div>} />
      </Routes>
    </MemoryRouter>
  );
}

function resetStores() {
  useSessionStore.getState().resetSession();
  useAuthStore.setState({
    user: null,
    session: null,
    isAuthenticated: false,
    isLoading: false,
  });
}

describe('demo-mode pages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStores();
  });

  it('initializes the app session store without auth in demo mode', async () => {
    render(<App />);

    await waitFor(() => {
      expect(useSessionStore.getState().isConnected).toBe(true);
      expect(useSessionStore.getState().currentUserId).toMatch(/^demo-client-/);
    });
  });

  it('creates demo sessions, validates hidden form branches, and navigates back', async () => {
    const { unmount: invalidNameUnmount } = renderRoute(<CreateSessionPage />, '/create', '/create');
    fireEvent.click(screen.getByText('Use My Current Location'));
    fireEvent.change(screen.getByLabelText('Your Name'), { target: { value: 'A'.repeat(51) } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Session' }));
    expect(await screen.findByText('Name must be between 1 and 50 characters')).toBeInTheDocument();
    invalidNameUnmount();

    const { unmount: missingLocationUnmount } = renderRoute(<CreateSessionPage />, '/create', '/create');
    const disabledCreate = screen.getByRole('button', { name: 'Create Session' }) as HTMLButtonElement;
    disabledCreate.disabled = false;
    fireEvent.click(disabledCreate);
    expect(await screen.findByText('Please set your location first')).toBeInTheDocument();
    missingLocationUnmount();

    const { unmount: backUnmount } = renderRoute(<CreateSessionPage />, '/create', '/create');
    fireEvent.click(screen.getByLabelText('Back'));
    expect(await screen.findByText('Home route')).toBeInTheDocument();
    backUnmount();

    renderRoute(<CreateSessionPage />, '/create', '/create');
    fireEvent.click(screen.getByText('Use My Current Location'));
    fireEvent.change(screen.getByLabelText(/Search Radius/i), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Session' }));

    await waitFor(() => {
      const state = useSessionStore.getState();
      expect(state.sessionCode).toHaveLength(6);
      expect(state.currentUserId).toBeTruthy();
      expect(state.participants).toHaveLength(1);
      expect(state.searchRadiusMiles).toBe(1);
    });
  });

  it('joins demo sessions and handles join-page validation branches', async () => {
    const created = createDemoSession({ hostName: 'Alice' });

    const { unmount: badCodeUnmount } = renderRoute(<JoinSessionPage />, '/join', '/join');
    fireEvent.change(screen.getByLabelText('Session Code'), { target: { value: 'bad!' } });
    fireEvent.change(screen.getByLabelText('Your Name'), { target: { value: 'Bob' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join Session' }));
    expect(await screen.findByText('Session code must be 6 characters')).toBeInTheDocument();
    badCodeUnmount();

    const { unmount: badNameUnmount } = renderRoute(<JoinSessionPage />, '/join', '/join');
    fireEvent.change(screen.getByLabelText('Session Code'), { target: { value: created.sessionCode } });
    fireEvent.change(screen.getByLabelText('Your Name'), { target: { value: 'B'.repeat(51) } });
    fireEvent.click(screen.getByRole('button', { name: 'Join Session' }));
    expect(await screen.findByText('Name must be between 1 and 50 characters')).toBeInTheDocument();
    badNameUnmount();

    const { unmount: backUnmount } = renderRoute(<JoinSessionPage />, '/join', '/join');
    fireEvent.click(screen.getByLabelText('Back'));
    expect(await screen.findByText('Home route')).toBeInTheDocument();
    backUnmount();

    renderRoute(<JoinSessionPage />, '/join', `/join?code=${created.sessionCode.toLowerCase()}`);
    fireEvent.change(screen.getByLabelText('Your Name'), { target: { value: 'Bob' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join Session' }));

    await waitFor(() => {
      const state = useSessionStore.getState();
      expect(state.sessionCode).toBe(created.sessionCode);
      expect(state.currentUserId).toBeTruthy();
      expect(state.participants).toHaveLength(2);
      expect(state.isConnected).toBe(true);
    });
  });

  it('loads demo lobbies, adds demo friends, and leaves through the confirmed back flow', async () => {
    const created = createDemoSession({ hostName: 'Alice' });
    useSessionStore.setState({
      sessionCode: created.sessionCode,
      currentUserId: created.host.participantId,
      participants: [created.host],
      isConnected: false,
    });

    renderRoute(<SessionLobbyPage />, '/session/:sessionCode', `/session/${created.sessionCode}`);

    expect((await screen.findAllByText(created.sessionCode)).length).toBeGreaterThan(0);
    expect(screen.getByText('Disconnected from server')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Add demo friends'));
    await waitFor(() => expect(useSessionStore.getState().participants.length).toBe(3));

    fireEvent.click(screen.getByText('Add demo friends'));
    await waitFor(() => expect(useSessionStore.getState().participants.length).toBe(4));

    const disabledAdd = screen.getByText('Add demo friends') as HTMLButtonElement;
    disabledAdd.disabled = false;
    fireEvent.click(disabledAdd);
    expect(useSessionStore.getState().participants).toHaveLength(4);

    fireEvent.click(screen.getByLabelText('Back'));
    fireEvent.click(await screen.findByText('Leave Session'));

    await waitFor(() => {
      expect(useSessionStore.getState().sessionCode).toBeNull();
      expect(screen.getByText('Home route')).toBeInTheDocument();
    });
  });

  it('renders a demo lobby without a session code and ignores demo-friend add', async () => {
    renderRoute(<SessionLobbyPage />, '/lobby', '/lobby');

    expect(await screen.findByText('Session Code')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Add demo friends'));
    expect(useSessionStore.getState().participants).toEqual([]);
  });

  it('covers demo selection loading, validation, submitting, simulation, undo, and leave paths', async () => {
    const { unmount: missingSessionUnmount } = renderRoute(<SelectionPage />, '/select', '/select');
    expect(await screen.findByText('Session code not found')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Submit Selections'));
    expect(screen.getByText('Session code not found')).toBeInTheDocument();
    missingSessionUnmount();

    const { unmount: invalidSessionUnmount } = renderRoute(
      <SelectionPage />,
      '/session/:sessionCode/select',
      '/session/MISSING/select'
    );
    expect(await screen.findByText('Home route')).toBeInTheDocument();
    invalidSessionUnmount();

    const missingParticipant = createDemoSession({ hostName: 'No User' });
    const { unmount: missingParticipantUnmount } = renderRoute(
      <SelectionPage />,
      '/session/:sessionCode/select',
      `/session/${missingParticipant.sessionCode}/select`
    );
    await screen.findByLabelText('Pass');
    for (let i = 0; i < getDemoRestaurants(missingParticipant.sessionCode).length; i += 1) {
      fireEvent.click(screen.getByLabelText('Pass'));
    }
    expect(await screen.findByText("You've seen them all!")).toBeInTheDocument();
    fireEvent.click(screen.getByText('Submit Selections'));
    expect(await screen.findByText('Missing participant')).toBeInTheDocument();
    missingParticipantUnmount();

    const created = createDemoSession({ hostName: 'Alice' });
    const [friend] = addDemoFriends(created.sessionCode, 1);
    const session = getDemoSession(created.sessionCode);
    useSessionStore.setState({
      sessionCode: created.sessionCode,
      currentUserId: created.host.participantId,
      participants: session.participants,
      isConnected: true,
      selections: [],
    });

    renderRoute(<SelectionPage />, '/session/:sessionCode/select', `/session/${created.sessionCode}/select`);
    await screen.findByLabelText('Like');

    fireEvent.click(screen.getByLabelText('Like'));
    fireEvent.click(screen.getByLabelText('Undo'));
    fireEvent.click(screen.getByLabelText('Pass'));

    const restaurants = getDemoRestaurants(created.sessionCode);
    for (let i = 1; i < restaurants.length; i += 1) {
      fireEvent.click(screen.getByLabelText(i % 2 === 0 ? 'Like' : 'Pass'));
    }

    expect(await screen.findByText("You've seen them all!")).toBeInTheDocument();
    fireEvent.click(screen.getByText('Submit Selections'));
    expect(await screen.findByText('Simulate others finishing')).toBeInTheDocument();
    expect(getDemoSession(created.sessionCode).participants.find((p) => p.participantId === friend.participantId)?.hasSubmitted).toBe(false);

    fireEvent.click(screen.getByText('Simulate others finishing'));

    await waitFor(() => {
      expect(useSessionStore.getState().sessionStatus).toBe('complete');
      expect(screen.getByText('Routed away')).toBeInTheDocument();
    });
  });

  it('completes a single-participant demo selection immediately', async () => {
    const created = createDemoSession({ hostName: 'Solo' });
    useSessionStore.setState({
      sessionCode: created.sessionCode,
      currentUserId: created.host.participantId,
      participants: [created.host],
      isConnected: true,
      selections: [],
    });

    renderRoute(<SelectionPage />, '/session/:sessionCode/select', `/session/${created.sessionCode}/select`);
    await screen.findByLabelText('Like');

    fireEvent.click(screen.getByLabelText('Like'));
    for (let i = 1; i < getDemoRestaurants(created.sessionCode).length; i += 1) {
      fireEvent.click(screen.getByLabelText('Pass'));
    }

    fireEvent.click(await screen.findByText('Submit Selections'));

    await waitFor(() => {
      expect(useSessionStore.getState().sessionStatus).toBe('complete');
      expect(screen.getByText('Routed away')).toBeInTheDocument();
    });
  });

  it('leaves demo selection sessions through the confirmed back flow', async () => {
    const created = createDemoSession({ hostName: 'Alice' });
    useSessionStore.setState({
      sessionCode: created.sessionCode,
      currentUserId: created.host.participantId,
      participants: [created.host],
      isConnected: true,
    });

    renderRoute(<SelectionPage />, '/session/:sessionCode/select', `/session/${created.sessionCode}/select`);
    await screen.findByLabelText('Pass');
    fireEvent.click(screen.getByLabelText('Back'));
    fireEvent.click(await screen.findByText('Leave Session'));

    await waitFor(() => {
      expect(useSessionStore.getState().sessionCode).toBeNull();
      expect(screen.getByText('Home route')).toBeInTheDocument();
    });
  });

  it('renders demo results edge branches and handles restart, share, fresh start, and leave failures', async () => {
    const created = createDemoSession({ hostName: 'Alice' });
    const [bob] = addDemoFriends(created.sessionCode, 1);
    const [firstRestaurant] = getDemoRestaurants(created.sessionCode);
    submitDemoSelection(created.sessionCode, created.host.participantId, [firstRestaurant.placeId]);
    submitDemoSelection(created.sessionCode, bob.participantId, [firstRestaurant.placeId]);
    const result = computeDemoResults(created.sessionCode);

    useSessionStore.setState({
      sessionCode: created.sessionCode,
      currentUserId: created.host.participantId,
      participants: getDemoSession(created.sessionCode).participants,
      restaurants: [{ ...firstRestaurant, priceLevel: 0, address: undefined }],
      allSelections: {
        Alice: [firstRestaurant.placeId],
        [bob.displayName]: ['other-place'],
      },
      restaurantNames: { 'other-place': 'Other Place' },
      overlappingOptions: [{ ...firstRestaurant, priceLevel: 0, address: undefined }],
      sessionStatus: 'complete',
      isConnected: true,
    });

    const { unmount } = renderRoute(<ResultsPage />, '/session/:sessionCode/results', `/session/${created.sessionCode}/results`);
    expect(await screen.findByText('Matching Restaurants')).toBeInTheDocument();
    expect(screen.getByText('Free')).toBeInTheDocument();
    expect(screen.getByText('Other Place')).toBeInTheDocument();

    fireEvent.click(screen.getAllByText('Share Results')[0]);
    expect(navigator.clipboard.writeText).toHaveBeenCalled();

    fireEvent.click(screen.getByText('Select Again'));
    await waitFor(() => expect(screen.getByText('Routed away')).toBeInTheDocument());
    unmount();

    useSessionStore.setState({
      sessionCode: created.sessionCode,
      currentUserId: created.host.participantId,
      participants: getDemoSession(created.sessionCode).participants,
      allSelections: result.allSelections,
      restaurantNames: result.restaurantNames,
      overlappingOptions: result.overlappingOptions,
      sessionStatus: 'complete',
      isConnected: true,
    });

    const setItemSpy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementationOnce(() => {
        throw new Error('storage full');
      })
      .mockImplementation(() => undefined);

    renderRoute(<ResultsPage />, '/session/:sessionCode/results', `/session/${created.sessionCode}/results`);
    fireEvent.click(screen.getByLabelText('Back'));
    fireEvent.click(await screen.findByText('Go Home'));

    await waitFor(() => expect(screen.getByText('Home route')).toBeInTheDocument());
    setItemSpy.mockRestore();

    const { unmount: noCodeUnmount } = renderRoute(<ResultsPage />, '/results', '/results');
    fireEvent.click(await screen.findByText('Try Again'));
    fireEvent.click(screen.getByLabelText('Back'));
    fireEvent.click(await screen.findByText('Go Home'));
    expect(screen.getByText('Try Again')).toBeInTheDocument();
    noCodeUnmount();

    const restartFailure = createDemoSession({ hostName: 'Rex' });
    useSessionStore.setState({
      sessionCode: restartFailure.sessionCode,
      currentUserId: restartFailure.host.participantId,
      participants: [restartFailure.host],
      allSelections: { Rex: [] },
      restaurantNames: {},
      overlappingOptions: [],
      sessionStatus: 'complete',
    });
    const restartSetItemSpy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementationOnce(() => {
        throw 'restart blocked';
      })
      .mockImplementation(() => undefined);

    const restartFailureView = renderRoute(
      <ResultsPage />,
      '/session/:sessionCode/results',
      `/session/${restartFailure.sessionCode}/results`
    );
    fireEvent.click(await screen.findByText('Try Again'));
    expect(await screen.findByText('Failed to restart session')).toBeInTheDocument();
    restartSetItemSpy.mockRestore();
    restartFailureView.unmount();

    const restartErrorFailure = createDemoSession({ hostName: 'Erin' });
    useSessionStore.setState({
      sessionCode: restartErrorFailure.sessionCode,
      currentUserId: restartErrorFailure.host.participantId,
      participants: [restartErrorFailure.host],
      allSelections: { Erin: [] },
      restaurantNames: {},
      overlappingOptions: [],
      sessionStatus: 'complete',
    });
    const restartErrorSetItemSpy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementationOnce(() => {
        throw new Error('restart failed');
      })
      .mockImplementation(() => undefined);

    const restartErrorFailureView = renderRoute(
      <ResultsPage />,
      '/session/:sessionCode/results',
      `/session/${restartErrorFailure.sessionCode}/results`
    );
    fireEvent.click(await screen.findByText('Try Again'));
    expect(await screen.findByText('restart failed')).toBeInTheDocument();
    restartErrorSetItemSpy.mockRestore();
    restartErrorFailureView.unmount();

    const noOverlap = createDemoSession({ hostName: 'Cara' });
    useSessionStore.setState({
      sessionCode: noOverlap.sessionCode,
      currentUserId: noOverlap.host.participantId,
      participants: [noOverlap.host],
      allSelections: { Cara: [] },
      restaurantNames: {},
      overlappingOptions: [],
      sessionStatus: 'complete',
    });
    renderRoute(<ResultsPage />, '/session/:sessionCode/results', `/session/${noOverlap.sessionCode}/results`);
    fireEvent.click(await screen.findByText('Start Fresh'));
    expect((await screen.findAllByText('Home route')).length).toBeGreaterThan(0);
  });
});
