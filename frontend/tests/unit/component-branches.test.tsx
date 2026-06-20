import React from 'react';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/socketService', () => ({
  joinSession: vi.fn(async () => ({ success: true, participantId: 'participant-1' })),
}));

import ActionSheet from '../../src/components/ActionSheet';
import {
  AnimatedSection,
  CollectionCard,
  CuisineCard,
  RestaurantCard,
} from '../../src/components/EnhancedCards';
import FloatingNav from '../../src/components/FloatingNav';
import GoogleSignInButton from '../../src/components/GoogleSignInButton';
import NavigationHeader from '../../src/components/NavigationHeader';
import { AnimatedRoute } from '../../src/components/PageTransition';
import PullToRefresh from '../../src/components/PullToRefresh';
import ScrollProgress from '../../src/components/ScrollProgress';
import SwipeCard from '../../src/components/SwipeCard';
import Toast from '../../src/components/Toast/Toast';
import TopNav from '../../src/components/TopNav';
import AddFriendModal from '../../src/components/friends/AddFriendModal';
import FriendsList from '../../src/components/friends/FriendsList';
import SessionInviteCard from '../../src/components/friends/SessionInviteCard';
import { demoPhotoUrl } from '../../src/demo/demoImages';
import { RippleButton, TouchFeedback, useHaptics } from '../../src/hooks/useHaptics';
import { toast as singletonToast, useToastStore } from '../../src/hooks/useToast';
import { useAuthStore } from '../../src/stores/authStore';
import { useFriendsStore } from '../../src/stores/friendsStore';
import { useSessionStore } from '../../src/stores/sessionStore';
import { joinSession } from '../../src/services/socketService';

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

  it('covers action sheet closed, disabled, header, icon, and cancel branches', () => {
    const onClose = vi.fn();
    const onSelect = vi.fn();
    const { rerender } = render(
      <ActionSheet isOpen={false} onClose={onClose} options={[]} />
    );
    expect(document.body.style.overflow).toBe('');

    rerender(
      <ActionSheet
        isOpen
        onClose={onClose}
        title="Actions"
        description="Choose one"
        cancelLabel="Dismiss"
        options={[
          { id: 'danger', label: 'Danger', icon: <span>!</span>, variant: 'danger', onSelect },
          { id: 'disabled', label: 'Disabled', disabled: true, onSelect },
        ]}
      />
    );

    expect(screen.getByText('Choose one')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Disabled'));
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Danger'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByText('Dismiss'));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('covers enhanced card hover, image, fallback, navigation, and observer branches', async () => {
    const onCuisineClick = vi.fn();
    const { unmount: cuisineUnmount } = render(
      <CuisineCard id="unknown" name="Cuisine" emoji="C" count={2} size="large" onClick={onCuisineClick} />
    );
    const cuisineButton = screen.getByRole('button', { name: /Cuisine/i });
    fireEvent.mouseEnter(cuisineButton);
    fireEvent.load(screen.getByAltText('Cuisine'));
    fireEvent.mouseLeave(cuisineButton);
    fireEvent.error(screen.getByAltText('Cuisine'));
    fireEvent.click(cuisineButton);
    expect(onCuisineClick).toHaveBeenCalled();
    cuisineUnmount();

    const onSave = vi.fn();
    renderAt(
      '/test',
      <RestaurantCard
        id="1"
        name="Grid Place"
        cuisine="Unknown"
        emoji="G"
        rating={4.1}
        priceLevel="$"
        distance="0.1 mi"
        isOpen={false}
        onSave={onSave}
      />
    );
    const gridArticle = screen.getByText('Grid Place').closest('article')!;
    fireEvent.mouseEnter(gridArticle);
    fireEvent.load(screen.getByAltText('Grid Place'));
    fireEvent.click(gridArticle.querySelector('button')!);
    fireEvent.error(screen.getByAltText('Grid Place'));
    fireEvent.mouseLeave(gridArticle);
    fireEvent.click(gridArticle);
    expect(onSave).toHaveBeenCalled();
    expect(await screen.findByText('Restaurant Route')).toBeInTheDocument();

    const { unmount: listUnmount } = renderAt(
      '/test',
      <RestaurantCard
        id="2"
        name="List Place"
        cuisine="Italian"
        emoji="L"
        rating={4.9}
        priceLevel="$$"
        distance="0.2 mi"
        neighborhood="Downtown"
        highlight="Fresh pasta"
        tags={['tag-1', 'tag-2', 'tag-3', 'tag-4']}
        rank={1}
        variant="list"
        onSave={onSave}
        onVote={vi.fn()}
      />
    );
    const listArticle = screen.getByText('List Place').closest('article')!;
    fireEvent.mouseEnter(listArticle);
    fireEvent.load(screen.getByAltText('List Place'));
    fireEvent.click(screen.getByText('Vote'));
    expect(await screen.findByText('Create Route')).toBeInTheDocument();
    listUnmount();

    const collectionClick = vi.fn();
    const { unmount: collectionUnmount } = renderAt(
      '/test',
      <CollectionCard
        id="unknown-list"
        title="Collection"
        subtitle="Unused"
        emoji="K"
        gradient="from-midnight-100 to-midnight-200"
        count={3}
        onClick={collectionClick}
      />
    );
    const collection = screen.getByRole('button', { name: /Collection/i });
    fireEvent.mouseEnter(collection);
    fireEvent.load(screen.getByAltText('Collection'));
    fireEvent.error(screen.getByAltText('Collection'));
    fireEvent.click(collection);
    expect(collectionClick).toHaveBeenCalled();
    collectionUnmount();

    const originalIntersectionObserver = window.IntersectionObserver;
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    let observerCallback: IntersectionObserverCallback | null = null;
    class TestIntersectionObserver {
      observe = vi.fn();
      disconnect = vi.fn();
      unobserve = vi.fn();
      takeRecords = vi.fn(() => []);
      root = null;
      rootMargin = '';
      thresholds = [];
      constructor(callback: IntersectionObserverCallback) {
        observerCallback = callback;
      }
    }

    window.IntersectionObserver = TestIntersectionObserver as any;
    HTMLElement.prototype.getBoundingClientRect = vi.fn(() => ({
      top: window.innerHeight + 20,
      bottom: window.innerHeight + 80,
      left: 0,
      right: 100,
      width: 100,
      height: 60,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }));

    render(<AnimatedSection animation="fade-left">Observed</AnimatedSection>);
    act(() => {
      observerCallback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });
    expect(screen.getByText('Observed')).toBeInTheDocument();

    HTMLElement.prototype.getBoundingClientRect = vi.fn(() => ({
      top: 0,
      bottom: 50,
      left: 0,
      right: 100,
      width: 100,
      height: 50,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }));
    render(<AnimatedSection animation="fade-right">In view</AnimatedSection>);
    render(<AnimatedSection animation="scale-up">Scale</AnimatedSection>);

    HTMLElement.prototype.getBoundingClientRect = originalRect;
    window.IntersectionObserver = originalIntersectionObserver;
  });

  it('covers floating nav scroll, active, expand, overlay, and route branches', async () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={['/home-v2']}>
        <FloatingNav />
      </MemoryRouter>
    );
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 150 });
    fireEvent.scroll(window);
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 20 });
    fireEvent.scroll(window);
    fireEvent.click(screen.getByText('Start'));
    fireEvent.click(document.querySelector('.fixed.inset-0.bg-black\\/50')!);
    unmount();

    renderAt('/test', <FloatingNav />);
    fireEvent.click(screen.getByText('Explore'));
    expect(await screen.findByText('Explore Route')).toBeInTheDocument();
  });

  it('covers auth button, top navigation, and user menu error branches', async () => {
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

    useAuthStore.setState({
      isAuthenticated: false,
      isLoading: false,
      signInWithGoogle: signIn as any,
    });
    const { unmount } = renderAt('/test', <TopNav showBackButton showAuth />);
    fireEvent.click(screen.getByText('Sign In'));
    fireEvent.click(screen.getByLabelText('Go back'));
    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(2));
    unmount();

    useAuthStore.setState({
      isAuthenticated: false,
      isLoading: false,
      signInWithGoogle: successfulSignIn as any,
    });
    const { unmount: successfulTopNavUnmount } = renderAt('/test', <TopNav />);
    fireEvent.click(screen.getByText('Sign In'));
    await waitFor(() => expect(successfulSignIn).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByText('Home'));
    expect(await screen.findByText('Home Route')).toBeInTheDocument();
    successfulTopNavUnmount();

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

    renderAt('/test', <TopNav showAuth />);
    fireEvent.click(screen.getAllByText('Sign out').at(-1)!);
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(2));
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

  it('covers animated routes, pull refresh, scroll progress, toast timers, and haptic fallbacks', async () => {
    vi.useFakeTimers();
    render(<AnimatedRoute>Animated</AnimatedRoute>);
    act(() => {
      vi.runOnlyPendingTimers();
    });
    expect(screen.getByText('Animated')).toBeInTheDocument();

    const dismiss = vi.fn();
    render(<Toast toast={{ id: 'toast-1', type: 'info', message: 'Auto', duration: 50 }} onDismiss={dismiss} />);
    act(() => {
      vi.advanceTimersByTime(50);
      vi.advanceTimersByTime(200);
    });
    expect(dismiss).toHaveBeenCalledWith('toast-1');
    vi.useRealTimers();

    const refresh = vi.fn(async () => {
      throw new Error('refresh failed');
    });
    const { container } = render(
      <PullToRefresh onRefresh={refresh}>
        <div>Refresh body</div>
      </PullToRefresh>
    );
    const pullRoot = container.firstElementChild as HTMLElement;
    fireEvent.touchStart(pullRoot, { touches: [{ clientY: 10 }] });
    fireEvent.touchMove(pullRoot, { touches: [{ clientY: 210 }] });
    fireEvent.touchEnd(pullRoot);
    await waitFor(() => expect(refresh).toHaveBeenCalled());

    const disabledRefresh = vi.fn();
    const { container: disabledContainer } = render(
      <PullToRefresh disabled onRefresh={disabledRefresh}>
        <div>Disabled refresh</div>
      </PullToRefresh>
    );
    const disabledRoot = disabledContainer.firstElementChild as HTMLElement;
    fireEvent.touchStart(disabledRoot, { touches: [{ clientY: 10 }] });
    fireEvent.touchMove(disabledRoot, { touches: [{ clientY: 50 }] });
    fireEvent.touchEnd(disabledRoot);
    expect(disabledRefresh).not.toHaveBeenCalled();

    let finishRefresh: (() => void) | undefined;
    const pendingRefresh = vi.fn(
      () => new Promise<void>((resolve) => {
        finishRefresh = resolve;
      })
    );
    const { container: pendingContainer } = render(
      <PullToRefresh onRefresh={pendingRefresh} pullThreshold={80}>
        <div>Pending refresh</div>
      </PullToRefresh>
    );
    const pendingRoot = pendingContainer.firstElementChild as HTMLElement;
    Object.defineProperty(pendingRoot, 'scrollTop', { configurable: true, value: 0 });
    fireEvent.touchStart(pendingRoot, { touches: [{ clientY: 10 }] });
    fireEvent.touchMove(pendingRoot, { touches: [{ clientY: 50 }] });
    fireEvent.touchMove(pendingRoot, { touches: [{ clientY: 190 }] });
    fireEvent.touchEnd(pendingRoot);
    await waitFor(() => expect(pendingRefresh).toHaveBeenCalled());
    finishRefresh?.();

    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 1000 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 500 });
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 250 });
    render(<ScrollProgress color="unknown" showPercentage />);
    fireEvent.scroll(window);
    expect(await screen.findByText('50%')).toBeInTheDocument();

    const originalVibrate = navigator.vibrate;
    delete (navigator as any).vibrate;
    const { result } = renderHook(() => useHaptics());
    expect(result.current.isSupported).toBe(false);
    result.current.triggerError();
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: originalVibrate });

    const onPress = vi.fn();
    const { unmount: disabledTouchUnmount } = render(<TouchFeedback disabled onPress={onPress}>Touch</TouchFeedback>);
    fireEvent.mouseDown(screen.getByText('Touch'));
    fireEvent.mouseUp(screen.getByText('Touch'));
    expect(onPress).not.toHaveBeenCalled();
    disabledTouchUnmount();

    vi.useFakeTimers();
    render(<TouchFeedback onPress={onPress}>Double touch</TouchFeedback>);
    fireEvent.mouseDown(screen.getByText('Double touch'));
    fireEvent.mouseUp(screen.getByText('Double touch'));
    fireEvent.mouseDown(screen.getByText('Double touch'));
    fireEvent.mouseUp(screen.getByText('Double touch'));
    act(() => vi.advanceTimersByTime(50));
    expect(onPress).toHaveBeenCalledTimes(1);
    vi.useRealTimers();

    onPress.mockClear();
    render(<RippleButton disabled onClick={onPress}>Ripple</RippleButton>);
    fireEvent.click(screen.getByText('Ripple'));
    expect(onPress).not.toHaveBeenCalled();
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
