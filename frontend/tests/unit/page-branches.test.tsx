import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const serviceMocks = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({
    sessionCode: 'AB123',
    hostName: 'Alice',
    participantCount: 1,
    state: 'waiting',
    expiresAt: new Date().toISOString(),
    shareableLink: 'http://localhost:3000/join?code=AB123',
  })),
  leaveSession: vi.fn(async () => ({ success: true, data: null })),
  restartSession: vi.fn(async () => ({ success: true, data: null })),
  joinSession: vi.fn(async () => ({ success: true, data: { participantId: 'participant-1' } })),
}));

vi.mock('../../src/services/apiClient', () => ({
  getSession: serviceMocks.getSession,
}));

vi.mock('../../src/services/socketBindings', () => ({
  leaveSession: serviceMocks.leaveSession,
  restartSession: serviceMocks.restartSession,
  joinSession: serviceMocks.joinSession,
}));

vi.mock('../../src/services/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      onAuthStateChange: vi.fn(),
    },
  },
  signInWithGoogle: vi.fn(async () => undefined),
  signOut: vi.fn(async () => undefined),
}));

import FriendsPage from '../../src/pages/FriendsPage';
import SessionLobbyPage from '../../src/pages/SessionLobbyPage';
import { useAuthStore } from '../../src/stores/authStore';
import { useFriendsStore } from '../../src/stores/friendsStore';
import { useSessionStore } from '../../src/stores/sessionStore';

const participant = {
  participantId: 'participant-1',
  displayName: 'Alice',
  sessionCode: 'AB123',
  joinedAt: 1,
  hasSubmitted: false,
  isHost: true,
};

const profile = {
  id: 'profile-1',
  displayName: 'Bea',
  avatarUrl: null,
  email: 'bea@example.com',
};

const friend = {
  id: 'friend-1',
  friendshipId: 'friendship-1',
  displayName: 'Friend',
  avatarUrl: null,
  email: 'friend@example.com',
  status: 'accepted' as const,
};

const request = {
  id: 'request-1',
  fromUser: profile,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const invite = {
  id: 'invite-1',
  sessionCode: 'AB123',
  inviter: profile,
  status: 'pending' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
};

function renderApp(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/" element={<div>Dinder</div>} />
        <Route path="/friends" element={<FriendsPage />} />
        <Route path="/session/:sessionCode" element={<SessionLobbyPage />} />
        <Route path="/lobby" element={<SessionLobbyPage />} />
        <Route path="/create" element={<div>Create route</div>} />
        <Route path="/home-v2" element={<div>Home route</div>} />
        <Route path="/session/:sessionCode/select" element={<div>Select route</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('page branch coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.getState().resetSession();
    useSessionStore.setState({
      sessionCode: 'AB123',
      currentUserId: 'participant-1',
      participants: [participant],
      isConnected: true,
    });
    useAuthStore.setState({
      user: null,
      session: null,
      isAuthenticated: false,
      isLoading: false,
    });
    useFriendsStore.getState().reset();
    useFriendsStore.setState({
      fetchCurrentProfile: vi.fn(async () => undefined) as any,
      fetchFriends: vi.fn(async () => undefined) as any,
      fetchFriendRequests: vi.fn(async () => undefined) as any,
      fetchSessionInvites: vi.fn(async () => undefined) as any,
      acceptSessionInvite: vi.fn(async () => ({ success: true, sessionCode: 'AB123' })) as any,
      declineSessionInvite: vi.fn(async () => true) as any,
    });
  });

  it('covers authenticated friends tabs with requests and invites', async () => {
    useAuthStore.setState({
      isAuthenticated: true,
      isLoading: false,
      user: { id: 'user-1', email: 'alice@example.com', user_metadata: {} } as any,
      session: { access_token: 'token' } as any,
    });
    useFriendsStore.setState({
      friends: [friend],
      friendRequests: [request],
      sessionInvites: [invite],
      isLoadingFriends: false,
      isLoadingRequests: false,
      isLoadingInvites: false,
    });

    renderApp('/friends');
    fireEvent.click(screen.getByText('Requests'));
    expect(screen.getByText('Bea')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Friends (1)'));
    expect(screen.getByText('Friend')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Invites'));
    expect(screen.getByText('Session:')).toBeInTheDocument();
  });

  it('covers friends empty and failure states with retry preserving the tab', async () => {
    useAuthStore.setState({
      isAuthenticated: true,
      isLoading: false,
      user: { id: 'user-1', email: 'alice@example.com', user_metadata: {} } as any,
      session: { access_token: 'token' } as any,
    });

    renderApp('/friends');

    // Empty Friends tab explains Friendship and offers the real add flow
    expect(screen.getByText('No friends yet')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Add a friend'));
    expect(screen.getByRole('heading', { name: 'Add Friend' })).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Close'));

    // A failed friends fetch hides the count and offers Retry
    act(() => useFriendsStore.setState({ friendsError: 'down' }));
    expect(screen.getByRole('button', { name: 'Friends' })).toBeInTheDocument();
    fireEvent.click(screen.getByText('Retry'));
    expect(useFriendsStore.getState().fetchFriends).toHaveBeenCalledTimes(2);
    act(() => useFriendsStore.setState({ friendsError: null }));

    // Requests failure keeps the Requests tab selected and retries requests
    fireEvent.click(screen.getByText('Requests'));
    expect(screen.getByText('No pending requests')).toBeInTheDocument();
    act(() => useFriendsStore.setState({ requestsError: 'down' }));
    expect(screen.getByText("Couldn't load requests")).toBeInTheDocument();
    fireEvent.click(screen.getByText('Retry'));
    expect(useFriendsStore.getState().fetchFriendRequests).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Couldn't load requests")).toBeInTheDocument();

    // Invites failure offers its own Retry
    fireEvent.click(screen.getByText('Invites'));
    expect(screen.getByText('No session invites')).toBeInTheDocument();
    act(() => useFriendsStore.setState({ invitesError: 'down' }));
    fireEvent.click(screen.getByText('Retry'));
    expect(useFriendsStore.getState().fetchSessionInvites).toHaveBeenCalledTimes(2);
  });

  it('covers lobby route without a session code and non-demo leave success', async () => {
    const noCode = renderApp('/lobby');
    await waitFor(() => expect(screen.queryByText('Loading session...')).not.toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('Back'));
    fireEvent.click(await screen.findByText('Leave Session'));
    expect(await screen.findByText('Dinder')).toBeInTheDocument();
    noCode.unmount();

    renderApp('/session/AB123');
    expect(await screen.findByText('Copy shareable link')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Back'));
    fireEvent.click(await screen.findByText('Leave Session'));
    await waitFor(() => expect(serviceMocks.leaveSession).toHaveBeenCalledWith('AB123'));
    expect(await screen.findByText('Dinder')).toBeInTheDocument();
  });

  it('starts selection through the shared session event and follows its state', async () => {
    renderApp('/session/AB123');

    fireEvent.click(await screen.findByRole('button', { name: 'Start Selecting' }));
    await waitFor(() => expect(serviceMocks.restartSession).toHaveBeenCalledWith('AB123'));

    act(() => useSessionStore.setState({ sessionStatus: 'selecting' }));
    expect(await screen.findByText('Select route')).toBeInTheDocument();
  });
});
