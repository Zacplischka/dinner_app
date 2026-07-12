import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const serviceMocks = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({
    sessionCode: 'ABC123',
    hostName: 'Alice',
    participantCount: 1,
    state: 'waiting',
    expiresAt: new Date().toISOString(),
    shareableLink: 'http://localhost:3000/join?code=ABC123',
  })),
  leaveSession: vi.fn(async () => ({ success: true })),
  joinSession: vi.fn(async () => ({ success: true, participantId: 'participant-1' })),
}));

const guideMocks = vi.hoisted(() => {
  const restaurant = {
    placeId: 'mock-place',
    name: 'Fallback Bistro',
    suburb: 'Nowhere',
    photoUrl: 'https://example.com/fallback.jpg',
    take: 'A deliberately sparse listing.',
    priceLevel: undefined,
    rating: undefined,
    cuisineType: undefined,
    badges: [],
    bestFor: [],
    whatToOrder: ['Soup'],
    goodToKnow: ['Book ahead'],
  };
  const list = {
    id: 'mock-list',
    title: 'Fallback List',
    subtitle: undefined,
    description: 'Sparse list description',
    badge: undefined,
    restaurantIds: ['mock-place'],
  };

  return {
    restaurant,
    list,
    GUIDE_LISTS: [
      list,
      { ...list, id: 'tonight', title: 'Tonight', subtitle: 'Tonight picks', restaurantIds: [] },
      { ...list, id: 'after-work', title: 'After Work', subtitle: 'Fast picks', restaurantIds: [] },
      { ...list, id: 'special', title: 'Special', subtitle: 'Celebration picks', restaurantIds: [] },
      { ...list, id: 'east-to-warrandyte', title: 'East', subtitle: 'Drive-worthy', restaurantIds: [] },
    ],
    GUIDE_RESTAURANTS: [restaurant],
    getGuideList: vi.fn((id: string) => (id === 'mock-list' ? list : undefined)),
    getRestaurantsForList: vi.fn((id: string) => (id === 'mock-list' ? [restaurant] : [])),
    getGuideRestaurant: vi.fn((id: string) => (id === 'mock-place' ? restaurant : undefined)),
  };
});

vi.mock('../../src/demo/guideData', () => guideMocks);

vi.mock('../../src/services/apiClient', () => ({
  getSession: serviceMocks.getSession,
}));

vi.mock('../../src/services/socketService', () => ({
  leaveSession: serviceMocks.leaveSession,
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
import GuideHomePage from '../../src/pages/GuideHomePage';
import GuideListPage from '../../src/pages/GuideListPage';
import RestaurantDetailPage from '../../src/pages/RestaurantDetailPage';
import SessionLobbyPage from '../../src/pages/SessionLobbyPage';
import { useAuthStore } from '../../src/stores/authStore';
import { useFriendsStore } from '../../src/stores/friendsStore';
import { useSessionStore } from '../../src/stores/sessionStore';

const participant = {
  participantId: 'participant-1',
  displayName: 'Alice',
  sessionCode: 'ABC123',
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
  sessionCode: 'ABC123',
  inviter: profile,
  status: 'pending' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
};

function renderApp(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/" element={<GuideHomePage />} />
        <Route path="/friends" element={<FriendsPage />} />
        <Route path="/lists" element={<GuideListPage />} />
        <Route path="/lists/:listId" element={<GuideListPage />} />
        <Route path="/r/:placeId" element={<RestaurantDetailPage />} />
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
      sessionCode: 'ABC123',
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
      acceptSessionInvite: vi.fn(async () => ({ success: true, sessionCode: 'ABC123' })) as any,
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

  it('covers guide and restaurant fallbacks from sparse guide data', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      isLoading: false,
      user: {
        id: 'user-1',
        email: 'guide@example.com',
        user_metadata: { full_name: 'Guide User' },
      } as any,
    });

    const home = renderApp('/');
    expect(screen.getByText('Guide User')).toBeInTheDocument();
    home.unmount();

    useAuthStore.setState({
      isAuthenticated: false,
      isLoading: true,
      user: null,
    });
    const loadingAuthHome = renderApp('/');
    expect(screen.getByText('Dinder')).toBeInTheDocument();
    loadingAuthHome.unmount();

    const list = renderApp('/lists/mock-list');
    expect(screen.getByText('4.4')).toBeInTheDocument();
    expect(screen.getByText(/Nowhere .*$/)).toBeInTheDocument();
    list.unmount();

    const emptyList = renderApp('/lists/missing');
    expect(screen.getByText('No restaurants found for this list.')).toBeInTheDocument();
    emptyList.unmount();

    renderApp('/r/mock-place');
    expect(screen.getByText(/Nowhere .* Restaurant/)).toBeInTheDocument();
    expect(screen.getByText('4.4')).toBeInTheDocument();
  });

  it('covers lobby route without a session code and non-demo leave success', async () => {
    const noCode = renderApp('/lobby');
    await waitFor(() => expect(screen.queryByText('Loading session...')).not.toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('Back'));
    fireEvent.click(await screen.findByText('Leave Session'));
    expect(await screen.findByText('Dinder')).toBeInTheDocument();
    noCode.unmount();

    renderApp('/session/ABC123');
    expect(await screen.findByText('Copy shareable link')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Back'));
    fireEvent.click(await screen.findByText('Leave Session'));
    await waitFor(() => expect(serviceMocks.leaveSession).toHaveBeenCalledWith('ABC123'));
    expect(await screen.findByText('Dinder')).toBeInTheDocument();
  });
});
