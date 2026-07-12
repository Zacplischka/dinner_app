import React from 'react';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import ConfirmLeaveModal from '../../src/components/ConfirmLeaveModal';
import GoogleSignInButton from '../../src/components/GoogleSignInButton';
import NavigationHeader from '../../src/components/NavigationHeader';
import PageTransition, {
  AnimatedRoute,
  StaggeredContainer,
  useViewTransition,
} from '../../src/components/PageTransition';
import SwipeCard from '../../src/components/SwipeCard';
import UserMenu from '../../src/components/UserMenu';
import Toast from '../../src/components/Toast/Toast';
import ToastProvider from '../../src/components/Toast/ToastProvider';
import AddFriendModal from '../../src/components/friends/AddFriendModal';
import FriendRequestCard from '../../src/components/friends/FriendRequestCard';
import FriendsList from '../../src/components/friends/FriendsList';
import InviteFriendsSection from '../../src/components/friends/InviteFriendsSection';
import SessionInviteCard from '../../src/components/friends/SessionInviteCard';

import App from '../../src/App';
import CreateSessionPage from '../../src/pages/CreateSessionPage';
import FriendsPage from '../../src/pages/FriendsPage';
import GuideHomePage from '../../src/pages/GuideHomePage';
import GuideListPage from '../../src/pages/GuideListPage';
import HomePage from '../../src/pages/HomePage';
import JoinSessionPage from '../../src/pages/JoinSessionPage';
import RestaurantDetailPage from '../../src/pages/RestaurantDetailPage';
import ResultsPage from '../../src/pages/ResultsPage';
import SelectionPage from '../../src/pages/SelectionPage';
import SessionLobbyPage from '../../src/pages/SessionLobbyPage';

import { useAuthStore } from '../../src/stores/authStore';
import { useFriendsStore } from '../../src/stores/friendsStore';
import { useSessionStore } from '../../src/stores/sessionStore';
import { Toast as ToastType, useToastStore } from '../../src/hooks/useToast';
import { toast as singletonToast, useToast } from '../../src/hooks/useToast';
import { demoPhotoUrl } from '../../src/demo/demoImages';
import {
  useAuthLoading,
  useIsAuthenticated,
  useSession,
  useUser,
} from '../../src/stores/authStore';
import {
  useFriendRequests,
  useFriendRequestsCount,
  useFriends,
  useFriendsLoading,
  useSessionInvites,
  useSessionInvitesCount,
} from '../../src/stores/friendsStore';
import {
  useConnectionStatus,
  useCurrentUserId,
  useOverlappingOptions,
  useParticipants,
  useSelections,
  useSessionCode,
  useSessionStatus,
} from '../../src/stores/sessionStore';
import * as apiClient from '../../src/services/apiClient';
import * as socketService from '../../src/services/socketBindings';

vi.mock('../../src/services/apiClient', () => ({
  createSession: vi.fn(async () => ({
    sessionCode: 'ABC123',
    hostName: 'Alice',
    participantCount: 1,
    state: 'waiting',
    expiresAt: new Date().toISOString(),
    shareableLink: 'http://localhost:3000/join?code=ABC123',
  })),
  getSession: vi.fn(async () => ({
    sessionCode: 'ABC123',
    hostName: 'Alice',
    participantCount: 2,
    state: 'waiting',
    expiresAt: new Date().toISOString(),
    shareableLink: 'http://localhost:3000/join?code=ABC123',
  })),
  getRestaurants: vi.fn(async () => [{
    placeId: 'place-1',
    name: 'Pasta House',
    rating: 4.7,
    priceLevel: 2,
    cuisineType: 'Italian',
    address: '1 Main St',
    photoUrl: 'https://example.com/pasta.jpg',
  }]),
  handleApiError: vi.fn((error: unknown) => (error instanceof Error ? error.message : 'error')),
}));

vi.mock('../../src/services/socketBindings', () => ({
  waitForConnection: vi.fn(async () => undefined),
  joinSession: vi.fn(async () => ({
    success: true,
    participantId: 'participant-1',
    participantName: 'Alice',
    participantCount: 1,
  })),
  submitSelection: vi.fn(async () => ({
    success: true,
    results: {
      hasOverlap: true,
      overlappingOptions: [{
        placeId: 'place-1',
        name: 'Pasta House',
        rating: 4.7,
        priceLevel: 2,
        cuisineType: 'Italian',
        address: '1 Main St',
        photoUrl: 'https://example.com/pasta.jpg',
      }],
      allSelections: { Alice: ['place-1'] },
      restaurantNames: { 'place-1': 'Pasta House' },
    },
    participants: [{
      participantId: 'participant-1',
      displayName: 'Alice',
      sessionCode: 'ABC123',
      joinedAt: 1,
      hasSubmitted: false,
      isHost: true,
    }],
  })),
  restartSession: vi.fn(async () => undefined),
  leaveSession: vi.fn(async () => ({ success: true })),
  initializeSocket: vi.fn(),
  disconnectSocket: vi.fn(),
  getSocketId: vi.fn(() => 'socket-1'),
  isSocketConnected: vi.fn(() => true),
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

const sampleRestaurant = {
  placeId: 'place-1',
  name: 'Pasta House',
  rating: 4.7,
  priceLevel: 2,
  cuisineType: 'Italian',
  address: '1 Main St',
  photoUrl: 'https://example.com/pasta.jpg',
};

const sampleParticipant = {
  participantId: 'participant-1',
  displayName: 'Alice',
  sessionCode: 'ABC123',
  joinedAt: 1,
  hasSubmitted: false,
  isHost: true,
};

const sampleFriend = {
  id: 'user-2',
  friendshipId: 'friendship-1',
  displayName: 'Bob',
  avatarUrl: null,
  email: 'bob@example.com',
  status: 'accepted' as const,
};

const sampleProfile = {
  id: 'user-3',
  displayName: 'Cara',
  avatarUrl: null,
  email: 'cara@example.com',
};

const sampleRequest = {
  id: 'request-1',
  fromUser: sampleProfile,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const sampleInvite = {
  id: 'invite-1',
  sessionCode: 'ABC123',
  inviter: sampleProfile,
  status: 'pending' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
};

function renderWithRouter(ui: React.ReactElement, initialEntries = ['/']) {
  return render(<MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>);
}

function renderRoute(path: string, route: string, element: React.ReactElement) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path={path} element={element} />
      </Routes>
    </MemoryRouter>
  );
}

function seedStores() {
  useSessionStore.getState().resetSession();
  useSessionStore.setState({
    sessionCode: 'ABC123',
    participants: [sampleParticipant],
    currentUserId: 'participant-1',
    restaurants: [sampleRestaurant],
    selections: ['place-1'],
    allSelections: { Alice: ['place-1'], Bob: ['place-1'] },
    restaurantNames: { 'place-1': 'Pasta House' },
    overlappingOptions: [sampleRestaurant],
    sessionStatus: 'waiting',
    isConnected: true,
  });
  useAuthStore.setState({
    user: {
      id: 'user-1',
      email: 'alice@example.com',
      user_metadata: {
        full_name: 'Alice Example',
        avatar_url: 'https://example.com/alice.png',
      },
    } as any,
    session: { access_token: 'token' } as any,
    isAuthenticated: true,
    isLoading: false,
  });
  useFriendsStore.setState({
    friends: [sampleFriend],
    friendRequests: [sampleRequest],
    sessionInvites: [sampleInvite],
    currentUserProfile: sampleProfile,
    searchResults: [sampleProfile],
    isLoadingFriends: false,
    isLoadingRequests: false,
    isLoadingInvites: false,
    isSearching: false,
    error: null,
    fetchFriends: vi.fn(async () => undefined),
    fetchFriendRequests: vi.fn(async () => undefined),
    fetchSessionInvites: vi.fn(async () => undefined),
    fetchCurrentProfile: vi.fn(async () => undefined),
    searchUsers: vi.fn(async () => [sampleProfile]),
    sendFriendRequest: vi.fn(async () => true),
    removeFriend: vi.fn(async () => true),
    acceptFriendRequest: vi.fn(async () => true),
    declineFriendRequest: vi.fn(async () => true),
    inviteFriendsToSession: vi.fn(async () => true),
    acceptSessionInvite: vi.fn(async () => ({ success: true, sessionCode: 'ABC123' })),
    declineSessionInvite: vi.fn(async () => true),
  });
  useToastStore.getState().clearAll();
}

describe('render smoke coverage', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    seedStores();
  });

  it('renders shared components and common interactions', async () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();

    renderWithRouter(
      <>
        <ConfirmLeaveModal
          isOpen
          context="lobby"
          onClose={onClose}
          onConfirm={onConfirm}
        />
        <NavigationHeader title="Title" subtitle="Subtitle" showBackButton onBack={onClose} showConnectionStatus />
        <PageTransition><div>Page child</div></PageTransition>
        <AnimatedRoute>Route child</AnimatedRoute>
        <StaggeredContainer><span>Item</span></StaggeredContainer>
      </>
    );

    fireEvent.click(screen.getByText('Leave Session'));

    expect(onConfirm).toHaveBeenCalled();
  });

  it('renders auth components', () => {
    renderWithRouter(
      <>
        <GoogleSignInButton />
        <UserMenu />
      </>
    );

    expect(screen.getByText('Continue with Google')).toBeInTheDocument();
  });

  it('renders swipe card and triggers pointer actions', () => {
    const onSwipeLeft = vi.fn();
    const onSwipeRight = vi.fn();

    renderWithRouter(
      <SwipeCard
        restaurant={sampleRestaurant}
        onSwipeLeft={onSwipeLeft}
        onSwipeRight={onSwipeRight}
        isTop
        stackPosition={0}
      />
    );

    const card = screen.getByText('Pasta House').closest('div')!;
    fireEvent.mouseDown(card, { clientX: 200 });
    fireEvent.mouseMove(card, { clientX: 340 });
    fireEvent.mouseUp(card);

    expect(screen.getByText('Pasta House')).toBeInTheDocument();
  });

  it('renders toast and friend components', async () => {
    const toast: ToastType = {
      id: 'toast-1',
      type: 'success',
      message: 'Saved',
      duration: 1000,
    };

    renderWithRouter(
      <>
        <Toast toast={toast} onDismiss={vi.fn()} />
        <ToastProvider><div>Toast child</div></ToastProvider>
        <AddFriendModal isOpen onClose={vi.fn()} />
        <FriendRequestCard request={sampleRequest} />
        <FriendsList friends={[sampleFriend]} />
        <FriendsList friends={[]} />
        <InviteFriendsSection selectedFriendIds={new Set()} onSelectionChange={vi.fn()} />
        <SessionInviteCard invite={sampleInvite} />
      </>
    );

    fireEvent.click(screen.getByText('Accept'));
    fireEvent.click(screen.getAllByText('Decline')[0]);
    fireEvent.change(screen.getByPlaceholderText('friend@example.com'), {
      target: { value: 'cara@example.com' },
    });
    fireEvent.click(screen.getByText('Search'));

    await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument());
  });

  it('renders top-level pages', async () => {
    renderWithRouter(<HomePage />);
    expect(screen.getByText(/Dinder/i)).toBeInTheDocument();

    renderWithRouter(<GuideHomePage />);
    renderRoute('/guides/:guideId', '/guides/best-italian', <GuideListPage />);
    renderRoute('/restaurants/:restaurantId', '/restaurants/1', <RestaurantDetailPage />);
    renderRoute('/friends', '/friends', <FriendsPage />);
    renderRoute('/create', '/create', <CreateSessionPage />);
    renderRoute('/join', '/join?code=abc123', <JoinSessionPage />);
    renderRoute('/session/:sessionCode', '/session/ABC123', <SessionLobbyPage />);
    renderRoute('/session/:sessionCode/select', '/session/ABC123/select', <SelectionPage />);
    renderRoute('/session/:sessionCode/results', '/session/ABC123/results', <ResultsPage />);

    await waitFor(() => expect(screen.getAllByText(/Pasta House|ABC123|Friends|Explore/i).length).toBeGreaterThan(0));
  });

  it('covers exported hooks, selectors, and singleton utilities', async () => {
    expect(renderHook(() => useUser()).result.current?.id).toBe('user-1');
    expect(renderHook(() => useSession()).result.current).toEqual({ access_token: 'token' });
    expect(renderHook(() => useIsAuthenticated()).result.current).toBe(true);
    expect(renderHook(() => useAuthLoading()).result.current).toBe(false);
    expect(renderHook(() => useFriends()).result.current).toEqual([sampleFriend]);
    expect(renderHook(() => useFriendRequests()).result.current).toEqual([sampleRequest]);
    expect(renderHook(() => useSessionInvites()).result.current).toEqual([sampleInvite]);
    expect(renderHook(() => useFriendsLoading()).result.current).toBe(false);
    expect(renderHook(() => useFriendRequestsCount()).result.current).toBe(1);
    expect(renderHook(() => useSessionInvitesCount()).result.current).toBe(1);
    expect(renderHook(() => useSessionCode()).result.current).toBe('ABC123');
    expect(renderHook(() => useParticipants()).result.current).toEqual([sampleParticipant]);
    expect(renderHook(() => useCurrentUserId()).result.current).toBe('participant-1');
    expect(renderHook(() => useSelections()).result.current).toEqual(['place-1']);
    expect(renderHook(() => useOverlappingOptions()).result.current).toEqual([sampleRestaurant]);
    expect(renderHook(() => useSessionStatus()).result.current).toBe('waiting');
    expect(renderHook(() => useConnectionStatus()).result.current).toBe(true);

    const toasts = renderHook(() => useToast());
    let firstId = '';
    act(() => {
      firstId = toasts.result.current.success('Saved');
      toasts.result.current.error('Broken', { duration: 10 });
      toasts.result.current.warning('Careful');
      toasts.result.current.info('FYI', { action: { label: 'Undo', onClick: vi.fn() } });
      toasts.result.current.dismiss(firstId);
      singletonToast.success('Singleton success');
      singletonToast.error('Singleton error');
      singletonToast.warning('Singleton warning');
      singletonToast.info('Singleton info');
      singletonToast.dismiss(firstId);
      singletonToast.clearAll();
      toasts.result.current.clearAll();
    });
    expect(useToastStore.getState().toasts).toEqual([]);

    expect(demoPhotoUrl('abc', '')).toContain('data:image/svg+xml');
    expect(demoPhotoUrl('abc', 'Pasta')).toContain('data:image/svg+xml');

    const transition = renderHook(() => useViewTransition());
    const transitioned = vi.fn();
    const startViewTransition = vi.fn((callback: () => void) => callback());
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: startViewTransition,
    });
    act(() => transition.result.current.startTransition(transitioned));
    expect(startViewTransition).toHaveBeenCalled();
    expect(transitioned).toHaveBeenCalled();

    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: undefined,
    });
    act(() => transition.result.current.startTransition(transitioned));
    expect(transitioned).toHaveBeenCalledTimes(2);
  });

  it('covers interactive component branches', async () => {
    vi.useFakeTimers();
    try {
      const onClose = vi.fn();
      const onConfirm = vi.fn();

      renderWithRouter(
        <>
          <ConfirmLeaveModal isOpen context="selecting" selectionsCount={0} onClose={onClose} onConfirm={onConfirm} />
          <ConfirmLeaveModal isOpen context="selecting" selectionsCount={1} onClose={onClose} onConfirm={onConfirm} />
          <ConfirmLeaveModal isOpen context="selecting" selectionsCount={2} onClose={onClose} onConfirm={onConfirm} />
          <ConfirmLeaveModal isOpen context="results" onClose={onClose} onConfirm={onConfirm} isLoading />
          <GoogleSignInButton variant="compact" />
          <PageTransition variant="slide-up"><div>Slide up child</div></PageTransition>
          <PageTransition variant="slide-left"><div>Slide left child</div></PageTransition>
          <PageTransition variant="scale"><div>Scale child</div></PageTransition>
          <StaggeredContainer>
            {[<span key="a">A</span>, <span key="b">B</span>]}
          </StaggeredContainer>
        </>
      );

      fireEvent.keyDown(screen.getAllByRole('dialog')[0], { key: 'Escape' });
      fireEvent.click(screen.getAllByText('Keep Swiping')[0]);
      fireEvent.click(screen.getAllByText('Leave Session')[0]);
      expect(onConfirm).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('covers toast interactions', async () => {
    const onDismiss = vi.fn();
    const actionClick = vi.fn();

    renderWithRouter(
      <Toast
        toast={{
          id: 'toast-action',
          type: 'warning',
          message: 'Act now',
          duration: 500,
          action: { label: 'Undo', onClick: actionClick },
        }}
        onDismiss={onDismiss}
      />
    );

    const toastAlert = screen.getByRole('alert');
    fireEvent.mouseEnter(toastAlert);
    fireEvent.mouseLeave(toastAlert);
    fireEvent.focus(toastAlert);
    fireEvent.blur(toastAlert);
    fireEvent.click(screen.getByText('Undo'));
    await waitFor(() => expect(actionClick).toHaveBeenCalled());

    act(() => useToastStore.getState().addToast({
      type: 'info',
      message: 'From provider',
      duration: 1000,
    }));
    render(<ToastProvider><div>Provider child</div></ToastProvider>);
    expect(screen.getByText('From provider')).toBeInTheDocument();
  });

  it('covers swipe, user menu, and friend component actions', async () => {
    const onSwipeLeft = vi.fn();
    const onSwipeRight = vi.fn();
    const onInvite = vi.fn();
    const onToggle = vi.fn();
    const onSelectionChange = vi.fn();
    const onClose = vi.fn();

    vi.useFakeTimers();
    try {
      const { container: rightSwipe } = renderWithRouter(
        <SwipeCard
          restaurant={{ ...sampleRestaurant, photoUrl: undefined }}
          onSwipeLeft={onSwipeLeft}
          onSwipeRight={onSwipeRight}
          isTop
          stackPosition={0}
        />
      );
      const rightCard = rightSwipe.firstElementChild as HTMLElement;
      fireEvent.mouseDown(rightCard, { clientX: 10 });
      fireEvent.mouseMove(rightCard, { clientX: 180 });
      fireEvent.mouseUp(rightCard);
      await act(async () => vi.advanceTimersByTime(300));
      expect(onSwipeRight).toHaveBeenCalled();

      const { container: leftSwipe } = renderWithRouter(
        <SwipeCard
          restaurant={{ ...sampleRestaurant, rating: 0, priceLevel: 0, cuisineType: '', address: '' }}
          onSwipeLeft={onSwipeLeft}
          onSwipeRight={onSwipeRight}
          isTop
          stackPosition={0}
        />
      );
      const leftCard = leftSwipe.firstElementChild as HTMLElement;
      fireEvent.touchStart(leftCard, { touches: [{ clientX: 200 }] });
      fireEvent.touchMove(leftCard, { touches: [{ clientX: 20 }] });
      fireEvent.touchEnd(leftCard);
      await act(async () => vi.advanceTimersByTime(300));
      expect(onSwipeLeft).toHaveBeenCalled();

      renderWithRouter(
        <SwipeCard
          restaurant={sampleRestaurant}
          onSwipeLeft={onSwipeLeft}
          onSwipeRight={onSwipeRight}
          isTop={false}
          stackPosition={2}
        />
      );
    } finally {
      vi.useRealTimers();
    }

    useAuthStore.setState({
      isAuthenticated: true,
      isLoading: false,
      user: {
        id: 'user-no-avatar',
        email: 'no-avatar@example.com',
        user_metadata: {},
      } as any,
      signOut: vi.fn(async () => undefined) as any,
      signInWithGoogle: vi.fn(async () => undefined) as any,
    });
    useFriendsStore.setState({
      friendRequests: Array.from({ length: 8 }, (_, index) => ({ ...sampleRequest, id: `request-${index}` })),
      sessionInvites: Array.from({ length: 4 }, (_, index) => ({ ...sampleInvite, id: `invite-${index}` })),
    });

    renderWithRouter(<UserMenu />);
    fireEvent.click(screen.getByText('Sign out'));

    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      signInWithGoogle: vi.fn(async () => {
        throw new Error('no auth');
      }) as any,
    });
    renderWithRouter(
      <>
        <UserMenu />
        <GoogleSignInButton />
      </>
    );
    fireEvent.click(screen.getByText('Signing in...'));

    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    useFriendsStore.setState({
      removeFriend: vi.fn(async () => true) as any,
    });
    renderWithRouter(
      <>
        <FriendsList friends={[sampleFriend]} onInvite={onInvite} />
        <FriendsList
          friends={[sampleFriend]}
          selectable
          selectedIds={new Set([sampleFriend.id])}
          onToggleSelect={onToggle}
        />
      </>
    );
    fireEvent.click(screen.getByText('Invite'));
    fireEvent.click(screen.getByText('Remove'));
    fireEvent.click(screen.getByText('Remove'));
    fireEvent.click(screen.getAllByText('Bob')[1]);
    expect(onInvite).toHaveBeenCalledWith(sampleFriend.id);
    expect(onToggle).toHaveBeenCalledWith(sampleFriend.id);

    useAuthStore.setState({ isAuthenticated: false });
    const { container: unauthenticatedInvite } = render(<InviteFriendsSection selectedFriendIds={new Set()} onSelectionChange={onSelectionChange} />);
    expect(unauthenticatedInvite.textContent).toBe('');

    useAuthStore.setState({ isAuthenticated: true });
    useFriendsStore.setState({ friends: [], isLoadingFriends: true, fetchFriends: vi.fn(async () => undefined) as any });
    const { rerender } = render(<InviteFriendsSection selectedFriendIds={new Set()} onSelectionChange={onSelectionChange} />);
    fireEvent.click(screen.getAllByText('Invite Friends').at(-1)!);
    expect(screen.getByText('Loading friends...')).toBeInTheDocument();

    useFriendsStore.setState({ friends: [], isLoadingFriends: false });
    rerender(<InviteFriendsSection selectedFriendIds={new Set()} onSelectionChange={onSelectionChange} />);
    expect(screen.getByText('No friends yet')).toBeInTheDocument();

    useFriendsStore.setState({ friends: [sampleFriend], isLoadingFriends: false });
    rerender(<InviteFriendsSection selectedFriendIds={new Set([sampleFriend.id])} onSelectionChange={onSelectionChange} disabled={false} />);
    fireEvent.click(screen.getAllByText('Bob').at(-1)!);
    expect(onSelectionChange).toHaveBeenCalled();

    useFriendsStore.setState({
      searchResults: [],
      isSearching: false,
      error: null,
      clearError: vi.fn() as any,
      searchUsers: vi.fn(async () => []) as any,
      sendFriendRequest: vi.fn(async () => true) as any,
    });
    const { rerender: rerenderModal } = render(<AddFriendModal isOpen onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText('friend@example.com'), {
      target: { value: 'nobody@example.com' },
    });
    fireEvent.click(screen.getByText('Search'));
    await waitFor(() => expect(screen.getByText('No users found with that email')).toBeInTheDocument());

    useFriendsStore.setState({ error: 'Search failed', searchResults: [] });
    rerenderModal(<AddFriendModal isOpen onClose={onClose} />);
    expect(screen.getByText('Search failed')).toBeInTheDocument();

    useFriendsStore.setState({ error: null, searchResults: [{ ...sampleProfile, avatarUrl: 'https://example.com/cara.png' }] });
    rerenderModal(<AddFriendModal isOpen onClose={onClose} />);
    fireEvent.click(screen.getAllByText('Add Friend').at(-1)!);
    await waitFor(() => expect(screen.getByText('Friend request sent!')).toBeInTheDocument());
    fireEvent.click(document.querySelector('.fixed.inset-0.bg-black\\/70')!);
    expect(onClose).toHaveBeenCalled();

    useFriendsStore.setState({
      acceptFriendRequest: vi.fn(async () => true) as any,
      declineFriendRequest: vi.fn(async () => true) as any,
    });
    render(<FriendRequestCard request={{ ...sampleRequest, fromUser: { ...sampleProfile, avatarUrl: 'https://example.com/cara.png' } }} />);
    fireEvent.click(screen.getByText('Accept'));
    await waitFor(() => expect(useFriendsStore.getState().acceptFriendRequest).toHaveBeenCalled());
    fireEvent.click(screen.getByText('Decline'));
    await waitFor(() => expect(useFriendsStore.getState().declineFriendRequest).toHaveBeenCalled());

    useFriendsStore.setState({
      currentUserProfile: null,
      acceptSessionInvite: vi.fn(async () => ({ success: true, sessionCode: 'ABC123' })) as any,
      declineSessionInvite: vi.fn(async () => true) as any,
    });
    renderWithRouter(<SessionInviteCard invite={sampleInvite} />);
    fireEvent.click(screen.getByText('Join'));
    await waitFor(() => expect(useFriendsStore.getState().acceptSessionInvite).toHaveBeenCalled());
    fireEvent.click(screen.getAllByText('Decline').at(-1)!);
    await waitFor(() => expect(useFriendsStore.getState().declineSessionInvite).toHaveBeenCalled());

    useFriendsStore.setState({
      acceptSessionInvite: vi.fn(async () => {
        throw new Error('join failed');
      }) as any,
    });
    renderWithRouter(<SessionInviteCard invite={{ ...sampleInvite, id: 'invite-fail' }} />);
    fireEvent.click(screen.getAllByText('Join').at(-1)!);
    await waitFor(() => expect(screen.getByText('join failed')).toBeInTheDocument());
  });

  it('covers create and join page validation, submissions, and service errors', async () => {
    const createResponse = {
      sessionCode: 'NEW123',
      hostName: 'Zach',
      participantCount: 1,
      state: 'waiting',
      expiresAt: new Date().toISOString(),
      shareableLink: 'http://localhost:3000/join?code=NEW123',
    };
    vi.mocked(apiClient.createSession).mockResolvedValueOnce(createResponse);
    vi.mocked(socketService.joinSession)
      .mockResolvedValueOnce({
        success: true,
        participantId: 'host-1',
        participantName: 'Zach',
        participantCount: 1,
      })
      .mockResolvedValueOnce({
        success: true,
        participantId: 'guest-1',
        participantName: 'Bea',
        participantCount: 2,
      });

    renderRoute('/create', '/create', <CreateSessionPage />);

    fireEvent.change(screen.getByLabelText('Your Name'), { target: { value: 'Zach' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Create Session' }).closest('form')!);
    expect(await screen.findByText('Please set your location first')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Use My Current Location'));
    expect(await screen.findByText('Location set')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Search Radius/i), { target: { value: '1' } });
    fireEvent.click(screen.getByText('Invite Friends'));
    fireEvent.click(await screen.findByText('Bob'));
    fireEvent.click(screen.getByRole('button', { name: 'Create Session' }));

    await waitFor(() => {
      expect(apiClient.createSession).toHaveBeenCalledWith(
        'Zach',
        { latitude: 37.7749, longitude: -122.4194 },
        1
      );
      expect(socketService.waitForConnection).toHaveBeenCalled();
      expect(socketService.joinSession).toHaveBeenCalledWith('NEW123', 'Zach');
      expect(useFriendsStore.getState().inviteFriendsToSession).toHaveBeenCalledWith('NEW123', ['user-2']);
    });
    expect(useSessionStore.getState().sessionCode).toBe('NEW123');
    expect(useSessionStore.getState().currentUserId).toBe('host-1');

    const { unmount } = renderRoute('/join', '/join?code=abc123', <JoinSessionPage />);
    expect(screen.getByLabelText('Session Code')).toHaveValue('ABC123');
    fireEvent.change(screen.getByLabelText('Your Name'), { target: { value: 'Bea' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join Session' }));

    await waitFor(() => {
      expect(socketService.joinSession).toHaveBeenCalledWith('ABC123', 'Bea');
    });
    expect(useSessionStore.getState().currentUserId).toBe('guest-1');
    unmount();

    renderRoute('/join', '/join', <JoinSessionPage />);
    fireEvent.change(screen.getByLabelText('Session Code'), { target: { value: 'ab-12!' } });
    expect(screen.getByLabelText('Session Code')).toHaveValue('AB12');
    fireEvent.change(screen.getByLabelText('Your Name'), { target: { value: 'Cara' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Join Session' }).closest('form')!);
    expect(await screen.findByText('Session code must be 6 characters')).toBeInTheDocument();
  });

  it('covers create location and join failure branches', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn(),
      },
    });
    const pendingLocation = renderRoute('/create', '/create', <CreateSessionPage />);
    fireEvent.click(screen.getByText('Use My Current Location'));
    expect(screen.getByText('Getting location...')).toBeInTheDocument();
    pendingLocation.unmount();

    const geolocationMessages = [
      { code: 1, message: 'Location permission denied. Please enable location access to find nearby restaurants.' },
      { code: 2, message: 'Location unavailable. Please try again.' },
      { code: 3, message: 'Location request timed out. Please try again.' },
      { code: 99, message: 'Failed to get location' },
    ];

    for (const { code, message } of geolocationMessages) {
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          getCurrentPosition: vi.fn((_success: PositionCallback, error: PositionErrorCallback) =>
            error({ code } as GeolocationPositionError)
          ),
        },
      });
      const { unmount } = renderRoute('/create', '/create', <CreateSessionPage />);
      fireEvent.click(screen.getByText('Use My Current Location'));
      expect(await screen.findByText(message)).toBeInTheDocument();
      unmount();
    }

    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: undefined,
    });
    const unsupported = renderRoute('/create', '/create', <CreateSessionPage />);
    fireEvent.click(screen.getByText('Use My Current Location'));
    expect(await screen.findByText('Geolocation is not supported by your browser')).toBeInTheDocument();
    unsupported.unmount();

    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn((success: PositionCallback) =>
          success({
            coords: {
              latitude: 37.7749,
              longitude: -122.4194,
              accuracy: 10,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
            },
            timestamp: Date.now(),
          } as GeolocationPosition)
        ),
      },
    });
    vi.mocked(apiClient.createSession).mockRejectedValueOnce(new Error('create failed'));
    const failedCreate = renderRoute('/create', '/create', <CreateSessionPage />);
    fireEvent.change(screen.getByLabelText('Your Name'), { target: { value: 'Zach' } });
    fireEvent.click(screen.getByText('Use My Current Location'));
    await screen.findByText('Location set');
    fireEvent.click(screen.getByRole('button', { name: 'Create Session' }));
    expect(await screen.findByText('create failed')).toBeInTheDocument();
    failedCreate.unmount();

    vi.mocked(apiClient.createSession).mockRejectedValueOnce('bad response');
    const unknownCreateFailure = renderRoute('/create', '/create', <CreateSessionPage />);
    fireEvent.change(screen.getByLabelText('Your Name'), { target: { value: 'Zach' } });
    fireEvent.click(screen.getByText('Use My Current Location'));
    await screen.findByText('Location set');
    fireEvent.click(screen.getByRole('button', { name: 'Create Session' }));
    expect(await screen.findByText('Failed to create session')).toBeInTheDocument();
    unknownCreateFailure.unmount();

    const joinErrors = [
      { error: new Error('session full'), message: 'This session is full (maximum 4 participants)' },
      { error: new Error('session not found'), message: 'Session not found or has expired' },
      { error: 'bad response', message: 'Failed to join session' },
    ];

    for (const { error, message } of joinErrors) {
      vi.mocked(socketService.joinSession).mockRejectedValueOnce(error);
      const { unmount } = renderRoute('/join', '/join', <JoinSessionPage />);
      fireEvent.change(screen.getByLabelText('Session Code'), { target: { value: 'ABC123' } });
      fireEvent.change(screen.getByLabelText('Your Name'), { target: { value: 'Dana' } });
      fireEvent.click(screen.getByRole('button', { name: 'Join Session' }));
      expect(await screen.findByText(message)).toBeInTheDocument();
      unmount();
    }
  });

  it('covers lobby loading, copy, start, and leave flows', async () => {
    vi.mocked(apiClient.getSession).mockResolvedValueOnce({
      sessionCode: 'ABC123',
      hostName: 'Alice',
      participantCount: 1,
      state: 'waiting',
      expiresAt: new Date().toISOString(),
      shareableLink: 'http://localhost:3000/join?code=ABC123',
    });

    const firstLobby = renderRoute('/session/:sessionCode', '/session/ABC123', <SessionLobbyPage />);
    expect(screen.getByText('Loading session...')).toBeInTheDocument();
    expect(await screen.findByText('Copy shareable link')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Copy session code'));
    fireEvent.click(screen.getByText('Copy shareable link'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('ABC123');
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('http://localhost:3000/join?code=ABC123');
    fireEvent.click(screen.getByText('Start Selecting'));
    firstLobby.unmount();

    vi.mocked(apiClient.getSession).mockRejectedValueOnce(new Error('load failed'));
    vi.mocked(socketService.leaveSession).mockRejectedValueOnce(new Error('leave failed'));
    const leaveLobby = renderRoute('/session/:sessionCode', '/session/ABC123', <SessionLobbyPage />);
    await waitFor(() => expect(screen.queryByText('Loading session...')).not.toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('Back'));
    fireEvent.click(screen.getByText('Leave Session'));
    await waitFor(() => expect(socketService.leaveSession).toHaveBeenCalledWith('ABC123'));
    leaveLobby.unmount();

    useSessionStore.setState({ participants: [], isConnected: false });
    vi.mocked(apiClient.getSession).mockResolvedValueOnce({
      sessionCode: 'ABC123',
      hostName: 'Alice',
      participantCount: 0,
      state: 'waiting',
      expiresAt: new Date().toISOString(),
      shareableLink: '',
    });
    renderRoute('/session/:sessionCode', '/session/ABC123', <SessionLobbyPage />);
    expect(await screen.findByText('Disconnected from server')).toBeInTheDocument();
    expect(screen.getByText('Start Selecting')).toBeDisabled();
  });

  it('covers selection loading, swipe, submit, waiting, error, and leave paths', async () => {
    vi.mocked(apiClient.getRestaurants).mockResolvedValueOnce([sampleRestaurant]);
    const selecting = renderRoute('/session/:sessionCode/select', '/session/ABC123/select', <SelectionPage />);
    expect(screen.getByText('Finding restaurants...')).toBeInTheDocument();
    expect(await screen.findByText('Pasta House')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Like'));
    expect(await screen.findByText("You've seen them all!")).toBeInTheDocument();
    fireEvent.click(screen.getByText('Submit Selections'));
    await waitFor(() => {
      expect(socketService.submitSelection).toHaveBeenCalledWith('ABC123', ['place-1']);
      expect(screen.getByText('Waiting for Others')).toBeInTheDocument();
    });
    selecting.unmount();

    useSessionStore.getState().resetSelections();
    useSessionStore.setState({
      participants: [sampleParticipant],
      currentUserId: 'participant-1',
      isConnected: true,
    });
    vi.mocked(apiClient.getRestaurants).mockResolvedValueOnce([sampleRestaurant]);
    vi.mocked(socketService.submitSelection).mockRejectedValueOnce(new Error('submit failed'));
    const submitFailure = renderRoute('/session/:sessionCode/select', '/session/ABC123/select', <SelectionPage />);
    await screen.findByText('Pasta House');
    fireEvent.click(screen.getByLabelText('Pass'));
    expect(await screen.findByText("You didn't like any restaurants, but you can still submit!")).toBeInTheDocument();
    fireEvent.click(screen.getByText('Submit Selections'));
    expect(await screen.findByText('submit failed')).toBeInTheDocument();
    submitFailure.unmount();

    vi.mocked(apiClient.getRestaurants).mockRejectedValueOnce(new Error('restaurants failed'));
    const loadFailure = renderRoute('/session/:sessionCode/select', '/session/ABC123/select', <SelectionPage />);
    expect(await screen.findByText('restaurants failed')).toBeInTheDocument();
    loadFailure.unmount();

    const noCode = renderRoute('/select', '/select', <SelectionPage />);
    expect(await screen.findByText('Session code not found')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Back'));
    fireEvent.click(await screen.findByText('Leave Session'));
    expect(screen.getByText('Session code not found')).toBeInTheDocument();
    noCode.unmount();

    vi.mocked(apiClient.getRestaurants).mockRejectedValueOnce('bad restaurants');
    const unknownLoadFailure = renderRoute('/session/:sessionCode/select', '/session/ABC123/select', <SelectionPage />);
    expect(await screen.findByText('Failed to load restaurants')).toBeInTheDocument();
    unknownLoadFailure.unmount();

    vi.mocked(apiClient.getRestaurants).mockResolvedValueOnce([sampleRestaurant]);
    vi.mocked(socketService.submitSelection).mockRejectedValueOnce('bad submit');
    const unknownSubmitFailure = renderRoute('/session/:sessionCode/select', '/session/ABC123/select', <SelectionPage />);
    await screen.findByText('Pasta House');
    fireEvent.click(screen.getByLabelText('Pass'));
    fireEvent.click(await screen.findByText('Submit Selections'));
    expect(await screen.findByText('Failed to submit selections')).toBeInTheDocument();
    unknownSubmitFailure.unmount();

    vi.mocked(apiClient.getRestaurants).mockResolvedValueOnce([sampleRestaurant]);
    vi.mocked(socketService.leaveSession).mockRejectedValueOnce(new Error('leave failed'));
    const leaveFlow = renderRoute('/session/:sessionCode/select', '/session/ABC123/select', <SelectionPage />);
    await screen.findByText('Pasta House');
    fireEvent.click(screen.getByLabelText('Back'));
    fireEvent.click(screen.getByText('Leave Session'));
    await waitFor(() => expect(socketService.leaveSession).toHaveBeenCalledWith('ABC123'));
    leaveFlow.unmount();

    vi.mocked(apiClient.getRestaurants).mockResolvedValueOnce([sampleRestaurant]);
    vi.mocked(socketService.leaveSession).mockResolvedValueOnce({ success: true });
    const leaveSuccessFlow = renderRoute('/session/:sessionCode/select', '/session/ABC123/select', <SelectionPage />);
    await screen.findByText('Pasta House');
    fireEvent.click(screen.getByLabelText('Back'));
    fireEvent.click(screen.getByText('Leave Session'));
    await waitFor(() => expect(socketService.leaveSession).toHaveBeenCalledWith('ABC123'));
    leaveSuccessFlow.unmount();

    useSessionStore.setState({ sessionStatus: 'complete' });
    vi.mocked(apiClient.getRestaurants).mockResolvedValueOnce([sampleRestaurant]);
    renderRoute('/session/:sessionCode/select', '/session/ABC123/select', <SelectionPage />);
    await waitFor(() => expect(document.body.textContent).not.toBe('Finding restaurants...'));
  });

  it('covers results page matches, fallbacks, restart, share, and leave flows', async () => {
    useSessionStore.setState({
      sessionCode: 'ABC123',
      currentUserId: 'participant-1',
      participants: [sampleParticipant, { ...sampleParticipant, participantId: 'p2', displayName: 'Bob', isHost: false }],
      restaurants: [{ ...sampleRestaurant, address: undefined, priceLevel: 0, cuisineType: '' }],
      allSelections: { Alice: ['place-1'], Bob: [] },
      restaurantNames: {},
      overlappingOptions: [{ ...sampleRestaurant, address: undefined, priceLevel: 0, cuisineType: '' }],
    });

    const matching = renderRoute('/session/:sessionCode/results', '/session/ABC123/results', <ResultsPage />);
    expect(screen.getByText('Perfect Match!')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Uber Eats/i })).toHaveAttribute('href', 'https://www.ubereats.com/search?q=Pasta%20House');
    expect(screen.getByRole('link', { name: /DoorDash/i })).toHaveAttribute('href', 'https://www.doordash.com/search/store/Pasta%20House/');
    fireEvent.click(screen.getByLabelText('Share results'));
    fireEvent.click(screen.getByText('Share Results'));
    expect(navigator.clipboard.writeText).toHaveBeenCalled();
    fireEvent.click(screen.getByText('Select Again'));
    await waitFor(() => expect(useSessionStore.getState().selections).toEqual([]));
    matching.unmount();

    useSessionStore.setState({
      sessionCode: 'ABC123',
      currentUserId: 'participant-1',
      participants: [sampleParticipant],
      restaurants: [],
      allSelections: { Alice: ['legacy-option'] },
      restaurantNames: {},
      overlappingOptions: [{ optionId: 'legacy-option', displayName: 'Legacy Option', description: 'Old format' } as any],
    });
    const legacy = renderRoute('/session/:sessionCode/results', '/session/ABC123/results', <ResultsPage />);
    expect(screen.getByText('Legacy Option')).toBeInTheDocument();
    expect(screen.getByText('Old format')).toBeInTheDocument();
    legacy.unmount();

    useSessionStore.setState({
      sessionCode: 'MISSING',
      currentUserId: 'missing-user',
      participants: [sampleParticipant],
      allSelections: { Alice: [] },
      overlappingOptions: [],
    });
    const noMatch = renderRoute('/session/:sessionCode/results', '/session/MISSING/results', <ResultsPage />);
    expect(screen.getByText('No Match Found')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Start Fresh'));
    noMatch.unmount();

    useSessionStore.setState({
      sessionCode: 'MISSING',
      currentUserId: 'missing-user',
      participants: [sampleParticipant],
      allSelections: { Alice: [] },
      overlappingOptions: [],
    });
    const noMatchRestart = renderRoute('/session/:sessionCode/results', '/session/MISSING/results', <ResultsPage />);
    fireEvent.click(screen.getByText('Try Again'));
    await waitFor(() => expect(screen.queryByText('Restarting...')).not.toBeInTheDocument());
    noMatchRestart.unmount();

    const leave = renderRoute('/session/:sessionCode/results', '/session/MISSING/results', <ResultsPage />);
    fireEvent.click(screen.getByLabelText('Back'));
    fireEvent.click(screen.getByText('Go Home'));
    await waitFor(() => expect(useSessionStore.getState().sessionCode).toBeNull());
    leave.unmount();
  });

  it('covers browse, list, guide, detail, friends, and home page interactions', async () => {
    const home = renderWithRouter(<HomePage />);
    fireEvent.click(screen.getByText('Create Session'));
    fireEvent.click(screen.getByText('Join Session'));
    home.unmount();

    useAuthStore.setState({ isAuthenticated: true, isLoading: false });
    useFriendsStore.setState({
      friendRequests: Array.from({ length: 10 }, (_, index) => ({ ...sampleRequest, id: `home-request-${index}` })),
      sessionInvites: [],
      fetchFriendRequests: vi.fn(async () => undefined) as any,
      fetchSessionInvites: vi.fn(async () => undefined) as any,
    });
    const authenticatedHome = renderWithRouter(<HomePage />);
    expect(screen.getByText('9+')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Friends'));
    authenticatedHome.unmount();

    useAuthStore.setState({ isAuthenticated: false, isLoading: false });
    const unauthGuide = renderWithRouter(<GuideHomePage />);
    expect(screen.getByText('Sign In')).toBeInTheDocument();
    unauthGuide.unmount();

    useAuthStore.setState({ isAuthenticated: true, isLoading: false });
    const guideHome = renderWithRouter(<GuideHomePage />);
    fireEvent.click(screen.getByText('Make the Call'));
    fireEvent.click(screen.getByText('Browse shortlists'));
    fireEvent.click(screen.getByText('After-work winners').closest('button')!);
    fireEvent.click(screen.getByText('Special occasion').closest('button')!);
    fireEvent.click(screen.getByText('View all'));
    fireEvent.click(screen.getByText('Tonight’s Shortlist').closest('button')!);
    guideHome.unmount();

    const guideListBack = renderRoute('/lists/:listId', '/lists/tonight', <GuideListPage />);
    fireEvent.click(screen.getByLabelText('Back'));
    guideListBack.unmount();

    const guideList = renderRoute('/lists/:listId', '/lists/tonight', <GuideListPage />);
    fireEvent.click(screen.getByText('Anchovy').closest('button')!);
    guideList.unmount();

    const emptyGuideList = renderRoute('/lists', '/lists', <GuideListPage />);
    expect(screen.getByText('No restaurants found for this list.')).toBeInTheDocument();
    emptyGuideList.unmount();

    const detailBack = renderRoute('/r/:placeId', '/r/demo-anchovy', <RestaurantDetailPage />);
    fireEvent.click(screen.getByLabelText('Back'));
    detailBack.unmount();

    const detailMakeCall = renderRoute('/r/:placeId', '/r/demo-anchovy', <RestaurantDetailPage />);
    fireEvent.click(screen.getByText('Make the Call'));
    detailMakeCall.unmount();

    const detailShortlists = renderRoute('/r/:placeId', '/r/demo-anchovy', <RestaurantDetailPage />);
    fireEvent.click(screen.getByText('Back to Shortlists'));
    detailShortlists.unmount();

    const detailListLink = renderRoute('/r/:placeId', '/r/demo-anchovy', <RestaurantDetailPage />);
    fireEvent.click(screen.getByText('Tonight’s Shortlist').closest('button')!);
    detailListLink.unmount();

    const missingDetail = renderRoute('/r/:placeId', '/r/missing', <RestaurantDetailPage />);
    expect(screen.getByText('Restaurant not found.')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Back'));
    missingDetail.unmount();

    const defaultDetail = renderRoute('/r', '/r', <RestaurantDetailPage />);
    expect(screen.getByText('Restaurant not found.')).toBeInTheDocument();
    defaultDetail.unmount();

    useAuthStore.setState({ isAuthenticated: false, isLoading: true });
    const loadingFriends = renderWithRouter(<FriendsPage />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    loadingFriends.unmount();

    useAuthStore.setState({ isAuthenticated: false, isLoading: false });
    const unauthFriends = renderWithRouter(<FriendsPage />);
    expect(unauthFriends.container.textContent).toBe('');
    unauthFriends.unmount();

    useAuthStore.setState({ isAuthenticated: true, isLoading: false });
    useFriendsStore.setState({
      friends: [],
      friendRequests: [],
      sessionInvites: [],
      isLoadingFriends: true,
      isLoadingRequests: true,
      isLoadingInvites: true,
      fetchCurrentProfile: vi.fn(async () => undefined) as any,
      fetchFriends: vi.fn(async () => undefined) as any,
      fetchFriendRequests: vi.fn(async () => undefined) as any,
      fetchSessionInvites: vi.fn(async () => undefined) as any,
    });
    const friendsLoadingTabs = renderWithRouter(<FriendsPage />);
    expect(screen.getByText('Loading friends...')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Requests'));
    expect(screen.getByText('Loading requests...')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Invites'));
    expect(screen.getByText('Loading invites...')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Add'));
    expect(screen.getAllByText('Add Friend').length).toBeGreaterThan(0);
    fireEvent.click(document.querySelector('.fixed.inset-0.bg-black\\/70')!);
    fireEvent.click(screen.getByText('Back'));
    friendsLoadingTabs.unmount();

    useFriendsStore.setState({
      friends: [],
      friendRequests: [],
      sessionInvites: [],
      isLoadingFriends: false,
      isLoadingRequests: false,
      isLoadingInvites: false,
    });
    const friendsEmptyTabs = renderWithRouter(<FriendsPage />);
    fireEvent.click(screen.getByText('Requests'));
    expect(screen.getByText('No pending requests')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Invites'));
    expect(screen.getByText('No session invites')).toBeInTheDocument();
    friendsEmptyTabs.unmount();
  });

  it('renders the app shell', async () => {
    render(<App />);

    await waitFor(() => expect(document.body.textContent).not.toBe(''));
  });

  it('covers the app beforeunload guard', async () => {
    useSessionStore.setState({ sessionCode: 'ABC123', sessionStatus: 'selecting' });
    const activeApp = render(<App />);
    await waitFor(() => expect(document.body.textContent).not.toBe(''));

    const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    const preventDefault = vi.spyOn(event, 'preventDefault');
    window.dispatchEvent(event);
    expect(preventDefault).toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
    activeApp.unmount();

    useSessionStore.setState({ sessionStatus: 'complete' });
    render(<App />);
    const completeEvent = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    const completePreventDefault = vi.spyOn(completeEvent, 'preventDefault');
    window.dispatchEvent(completeEvent);
    expect(completePreventDefault).not.toHaveBeenCalled();
  });
});
