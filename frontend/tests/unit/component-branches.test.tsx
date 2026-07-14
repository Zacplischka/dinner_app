import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/socketBindings', () => ({
  joinSession: vi.fn(async () => ({ success: true, participantId: 'participant-1' })),
}));

import GoogleSignInButton from '../../src/components/GoogleSignInButton';
import NavigationHeader from '../../src/components/NavigationHeader';
import SwipeCard from '../../src/components/SwipeCard';
import Toast from '../../src/components/Toast/Toast';
import AddFriendModal from '../../src/components/friends/AddFriendModal';
import FriendsList from '../../src/components/friends/FriendsList';
import SessionInviteCard from '../../src/components/friends/SessionInviteCard';
import { demoPhotoUrl } from '../../src/demo/demoImages';
import { toast as singletonToast, useToastStore } from '../../src/hooks/useToast';
import { useAuthStore } from '../../src/stores/authStore';
import { useFriendsStore } from '../../src/stores/friendsStore';
import { useSessionStore } from '../../src/stores/sessionStore';
import { joinSession } from '../../src/services/socketBindings';

const authActions = {
  initialize: useAuthStore.getState().initialize,
  signInWithGoogle: useAuthStore.getState().signInWithGoogle,
  signOut: useAuthStore.getState().signOut,
  setSession: useAuthStore.getState().setSession,
};

function renderAt(route: string, element: React.ReactElement) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/test" element={element} />
        <Route path="/home-v2" element={<div>Home Route</div>} />
        <Route path="/explore" element={<div>Explore Route</div>} />
        <Route path="/create" element={<div>Create Route</div>} />
        <Route path="/join" element={<div>Join Route</div>} />
        <Route path="/restaurant/:id" element={<div>Restaurant Route</div>} />
        <Route path="/guides/:id" element={<div>Guide Route</div>} />
        <Route path="/friends" element={<div>Friends Route</div>} />
      </Routes>
    </MemoryRouter>
  );
}

const restaurant = {
  placeId: 'place-1',
  name: 'Branch Bistro',
  address: '1 Test Way',
  cuisineType: 'Italian',
  rating: 4.7,
  priceLevel: 2,
  photoUrl: '',
};

const friend = {
  id: 'friend-1',
  friendshipId: 'friendship-1',
  displayName: 'Bob',
  avatarUrl: 'https://example.com/avatar.png',
  email: '',
  status: 'accepted' as const,
};

const invite = {
  id: 'invite-1',
  sessionCode: 'ABC123',
  inviter: {
    id: 'user-1',
    displayName: 'Alice',
    avatarUrl: null,
    email: 'alice@example.com',
  },
  status: 'pending' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('component and hook branch coverage', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    useSessionStore.getState().resetSession();
    useFriendsStore.getState().reset();
    useToastStore.getState().clearAll();
    useAuthStore.setState({
      ...authActions,
      user: null,
      session: null,
      isAuthenticated: false,
      isLoading: false,
    });
  });

  it('covers auth button and user menu error branches', async () => {
    const successfulSignIn = vi.fn(async () => undefined);
    useAuthStore.setState({ signInWithGoogle: successfulSignIn as any, isLoading: false });
    const { unmount: successfulButtonUnmount } = render(<GoogleSignInButton className="extra-class" />);
    fireEvent.click(screen.getByText('Continue with Google'));
    await waitFor(() => expect(successfulSignIn).toHaveBeenCalled());
    successfulButtonUnmount();

    useAuthStore.setState({ signInWithGoogle: successfulSignIn as any, isLoading: true });
    const { unmount: loadingButtonUnmount } = render(
      <>
        <GoogleSignInButton />
        <GoogleSignInButton variant="compact" />
      </>
    );
    expect(screen.getByText('Signing in...')).toBeInTheDocument();
    expect(screen.getByText('...')).toBeInTheDocument();
    loadingButtonUnmount();

    const signIn = vi.fn(async () => {
      throw new Error('denied');
    });
    useAuthStore.setState({ signInWithGoogle: signIn as any, isLoading: false });
    render(<GoogleSignInButton />);
    fireEvent.click(screen.getByText('Continue with Google'));
    await waitFor(() => expect(signIn).toHaveBeenCalled());

    const signOut = vi.fn(async () => {
      throw new Error('logout failed');
    });
    useAuthStore.setState({
      isAuthenticated: true,
      isLoading: false,
      signOut: signOut as any,
      user: { id: 'user-1', email: undefined, user_metadata: {} } as any,
    });
    const { default: UserMenu } = await import('../../src/components/UserMenu');
    render(<UserMenu />);
    expect(screen.getByText('User')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Sign out'));
    await waitFor(() => expect(signOut).toHaveBeenCalled());
  });

  it('covers navigation header default back, confirm close, and confirm fallback back branches', async () => {
    const historyBack = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    const { unmount: directUnmount } = render(
      <NavigationHeader title="Direct" showBackButton />
    );
    fireEvent.click(screen.getByLabelText('Back'));
    expect(historyBack).toHaveBeenCalledTimes(1);
    directUnmount();

    render(
      <NavigationHeader title="Confirm" showBackButton confirmOnBack confirmContext="results" />
    );
    fireEvent.click(screen.getByLabelText('Back'));
    fireEvent.click(await screen.findByText('Stay Here'));
    expect(screen.queryByText('Go Home')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Back'));
    fireEvent.click(await screen.findByText('Go Home'));
    expect(historyBack).toHaveBeenCalledTimes(2);
    historyBack.mockRestore();
  });

  it('covers toast timers', () => {
    vi.useFakeTimers();
    const dismiss = vi.fn();
    render(<Toast toast={{ id: 'toast-1', type: 'info', message: 'Auto', duration: 50 }} onDismiss={dismiss} />);
    act(() => {
      vi.advanceTimersByTime(50);
      vi.advanceTimersByTime(200);
    });
    expect(dismiss).toHaveBeenCalledWith('toast-1');
    vi.useRealTimers();
  });

  it('covers swipe card gesture guard and threshold branches', () => {
    vi.useFakeTimers();
    const left = vi.fn();
    const right = vi.fn();
    const { rerender } = render(
      <SwipeCard restaurant={restaurant as any} onSwipeLeft={left} onSwipeRight={right} isTop={false} stackPosition={1} />
    );
    let card = screen.getByText('Branch Bistro').closest('[class*="rounded-3xl"]') as HTMLElement;
    fireEvent.touchStart(card, { touches: [{ clientX: 10 }] });
    fireEvent.mouseDown(card, { clientX: 10 });
    expect(left).not.toHaveBeenCalled();

    rerender(<SwipeCard restaurant={restaurant as any} onSwipeLeft={left} onSwipeRight={right} isTop stackPosition={0} />);
    card = screen.getByText('Branch Bistro').closest('[class*="rounded-3xl"]') as HTMLElement;
    fireEvent.touchMove(card, { touches: [{ clientX: 90 }] });
    fireEvent.touchEnd(card);
    fireEvent.mouseMove(card, { clientX: 60 });
    fireEvent.mouseDown(card, { clientX: 10 });
    fireEvent.mouseMove(card, { clientX: 160 });
    fireEvent.mouseUp(card);
    act(() => vi.advanceTimersByTime(300));
    expect(right).toHaveBeenCalled();

    rerender(<SwipeCard restaurant={restaurant as any} onSwipeLeft={left} onSwipeRight={right} isTop stackPosition={0} />);
    card = screen.getByText('Branch Bistro').closest('[class*="rounded-3xl"]') as HTMLElement;
    fireEvent.touchStart(card, { touches: [{ clientX: 160 }] });
    fireEvent.touchMove(card, { touches: [{ clientX: 10 }] });
    fireEvent.touchEnd(card);
    act(() => vi.advanceTimersByTime(300));
    expect(left).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('covers friend modal, list, invite card, toast singleton, and demo image branches', async () => {
    useFriendsStore.setState({ isSearching: true });
    render(<AddFriendModal isOpen onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Search by email'), { target: { value: 'bob@example.com' } });
    expect(screen.getByText('Searching...')).toBeInTheDocument();

    render(<FriendsList friends={[friend]} />);
    expect(screen.getByAltText('Bob')).toHaveAttribute('src', friend.avatarUrl);

    useFriendsStore.setState({
      currentUserProfile: null,
      acceptSessionInvite: vi.fn(async () => ({ success: true, sessionCode: 'ABC123' })) as any,
      declineSessionInvite: vi.fn(async () => true) as any,
    });
    renderAt('/test', <SessionInviteCard invite={invite} />);
    fireEvent.click(screen.getByText('Join'));
    await waitFor(() => expect(joinSession).toHaveBeenCalledWith('ABC123', 'Guest'));

    useFriendsStore.setState({
      currentUserProfile: {
        id: 'user-1',
        displayName: 'Alice Example',
        avatarUrl: null,
        email: 'alice@example.com',
      },
      acceptSessionInvite: vi.fn(async () => ({ success: true, sessionCode: 'ABC123' })) as any,
    });
    renderAt('/test', <SessionInviteCard invite={{ ...invite, id: 'invite-profile' }} />);
    fireEvent.click(screen.getAllByText('Join').at(-1)!);
    await waitFor(() => expect(joinSession).toHaveBeenCalledWith('ABC123', 'Alice Example'));

    useFriendsStore.setState({
      acceptSessionInvite: vi.fn(async () => {
        throw 'bad';
      }) as any,
    });
    renderAt('/test', <SessionInviteCard invite={{ ...invite, id: 'invite-2' }} />);
    fireEvent.click(screen.getAllByText('Join').at(-1)!);
    expect(await screen.findByText('Failed to join session')).toBeInTheDocument();

    const action = vi.fn();
    singletonToast.success('success', { duration: 1, action: { label: 'Go', onClick: action } });
    singletonToast.error('error', { duration: 2, action: { label: 'Stop', onClick: action } });
    singletonToast.warning('warning', { duration: 3, action: { label: 'Wait', onClick: action } });
    singletonToast.info('info', { duration: 4, action: { label: 'Read', onClick: action } });
    expect(useToastStore.getState().toasts).toHaveLength(4);

    expect(demoPhotoUrl('')).toContain('data:image/svg+xml');
  });
});
