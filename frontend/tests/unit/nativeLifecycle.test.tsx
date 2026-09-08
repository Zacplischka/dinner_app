import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NativeLifecycle from '../../src/components/NativeLifecycle';
import AddFriendModal from '../../src/components/friends/AddFriendModal';
import ConfirmLeaveModal from '../../src/components/ConfirmLeaveModal';
import { useSessionStore } from '../../src/stores/sessionStore';

const phone = vi.hoisted(() => ({
  platform: 'ios',
  listeners: new Map<
    string,
    (event: { url: string; isActive: boolean; canGoBack: boolean }) => void
  >(),
  remove: vi.fn(),
  reconcile: vi.fn(),
  open: vi.fn().mockResolvedValue(undefined),
  minimize: vi.fn(),
  confirmLeave: vi.fn(),
  launch: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => phone.platform },
}));
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn((name, callback) => {
      phone.listeners.set(name, callback);
      return Promise.resolve({ remove: phone.remove });
    }),
    getLaunchUrl: phone.launch,
    minimizeApp: phone.minimize,
  },
}));
vi.mock('@capacitor/browser', () => ({ Browser: { open: phone.open } }));
vi.mock('../../src/services/socketBindings', () => ({ reconcileSession: phone.reconcile }));
vi.mock('../../src/services/supabase', () => ({ finishNativeSignIn: vi.fn() }));
vi.mock('../../src/services/nativeStorage', () => ({
  nativeStateStorage: sessionStorage,
  clearRejoinToken: vi.fn(),
}));
vi.mock('../../src/stores/friendsStore', () => ({
  useFriendsStore: () => ({
    searchResults: [],
    isSearching: false,
    clearError: vi.fn(),
  }),
}));

function Screen() {
  const location = useLocation();
  return (
    <>
      <NativeLifecycle />
      <h1>{location.pathname + location.search}</h1>
    </>
  );
}

describe('native lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    phone.listeners.clear();
    phone.platform = 'android';
  });
  it.each(['ios', 'android'])(
    '%s preserves permission forms, reconnects, follows links and cleans up',
    async (platform) => {
      phone.platform = platform;
      vi.stubEnv('VITE_PUBLIC_ORIGIN', 'https://www.dinder.it.com');
      let online = false;
      vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
      const view = render(
        <MemoryRouter>
          <Screen />
        </MemoryRouter>
      );
      expect(screen.getByRole('status')).toHaveTextContent('You’re offline');
      await waitFor(() => expect(phone.listeners.has('appUrlOpen')).toBe(true));
      act(() => {
        online = true;
        window.dispatchEvent(new Event('online'));
      });
      expect(screen.queryByRole('status')).toBeNull();
      expect(phone.reconcile).toHaveBeenCalledOnce();
      await waitFor(() => expect(phone.launch).toHaveBeenCalledOnce());
      // iOS permission sheets change active state; Android resumes without a
      // preceding inactive state. Neither should discard the permission form.
      act(() => {
        if (platform === 'ios')
          phone.listeners.get('appStateChange')?.({ url: '', isActive: false, canGoBack: false });
        else phone.listeners.get('resume')?.({ url: '', isActive: true, canGoBack: false });
        phone.listeners.get('appStateChange')?.({ url: '', isActive: true, canGoBack: false });
      });
      expect(phone.reconcile).toHaveBeenCalledOnce();
      act(() => {
        if (platform === 'ios')
          phone.listeners.get('resume')?.({ url: '', isActive: true, canGoBack: false });
        else {
          phone.listeners.get('appStateChange')?.({ url: '', isActive: false, canGoBack: false });
          phone.listeners.get('appStateChange')?.({ url: '', isActive: true, canGoBack: false });
        }
      });
      expect(phone.reconcile).toHaveBeenCalledTimes(2);
      act(() =>
        phone.listeners.get('appUrlOpen')?.({
          url: 'https://www.dinder.it.com/join?code=AB123',
          isActive: true,
          canGoBack: false,
        })
      );
      await screen.findByRole('heading', { name: '/join?code=AB123' });
      expect(phone.launch).toHaveBeenCalledOnce();
      view.unmount();
      await waitFor(() => expect(phone.remove).toHaveBeenCalled());
      vi.unstubAllEnvs();
    }
  );
});

function Modals() {
  const [friends, setFriends] = useState(false);
  const [leaving, setLeaving] = useState(false);
  return (
    <>
      <button onClick={() => setFriends(true)}>Find a friend</button>
      <button onClick={() => setLeaving(true)}>Leave</button>
      <AddFriendModal isOpen={friends} onClose={() => setFriends(false)} />
      <ConfirmLeaveModal
        isOpen={leaving}
        onClose={() => setLeaving(false)}
        onConfirm={phone.confirmLeave}
      />
    </>
  );
}

function back(canGoBack = true) {
  act(() => phone.listeners.get('backButton')?.({ url: '', isActive: true, canGoBack }));
}

describe('Android Back', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    phone.listeners.clear();
    phone.platform = 'android';
  });

  it.each(['/session/AB123', '/session/AB123/select', '/session/AB123/results'])(
    'leaves %s for Home without revisiting stale phases or losing participation',
    async (path) => {
      useSessionStore.setState({
        sessionCode: 'AB123',
        currentUserId: 'alice',
        selections: ['movie-a'],
        participants: [
          {
            participantId: 'alice',
            displayName: 'Alice',
            sessionCode: 'AB123',
            joinedAt: 1,
            hasSubmitted: false,
            isHost: true,
            ready: true,
          },
        ],
      });
      const saved = useSessionStore.getState();
      render(
        <MemoryRouter initialEntries={['/', '/session/AB123/select', path]}>
          <Screen />
        </MemoryRouter>
      );
      await waitFor(() => expect(phone.launch).toHaveBeenCalled());
      back();
      expect(screen.getByRole('heading')).toHaveTextContent(/^\/$/);
      expect(useSessionStore.getState()).toBe(saved);
      back();
      expect(phone.minimize).toHaveBeenCalledOnce();
      expect(screen.getByRole('heading')).toHaveTextContent(/^\/$/);
    }
  );

  it('dismisses native text focus before following ordinary page history', async () => {
    render(
      <MemoryRouter initialEntries={['/compare', '/compare/place-a']}>
        <Screen />
        <input aria-label="Search" />
      </MemoryRouter>
    );
    await waitFor(() => expect(phone.launch).toHaveBeenCalled());
    const input = screen.getByRole('textbox');
    input.focus();
    back();
    expect(input).not.toHaveFocus();
    expect(screen.getByRole('heading')).toHaveTextContent('/compare/place-a');
    back();
    expect(screen.getByRole('heading')).toHaveTextContent(/^\/compare$/);
  });

  it('has a Home fallback when opened on a link without page history', async () => {
    render(
      <MemoryRouter initialEntries={['/list/example']}>
        <Screen />
      </MemoryRouter>
    );
    await waitFor(() => expect(phone.launch).toHaveBeenCalled());
    back(false);
    expect(screen.getByRole('heading')).toHaveTextContent(/^\/$/);
  });

  it('dismisses Friends and Leave dialogs without navigating or confirming Leave', async () => {
    render(
      <MemoryRouter initialEntries={['/', '/friends']}>
        <Screen />
        <Modals />
      </MemoryRouter>
    );
    await waitFor(() => expect(phone.launch).toHaveBeenCalled());
    const opener = screen.getByRole('button', { name: 'Find a friend' });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole('dialog', { name: 'Add friend' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Search by email' })).toHaveFocus();
    back();
    expect(screen.queryByRole('textbox', { name: 'Search by email' })).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
    expect(screen.getByRole('heading')).toHaveTextContent('/friends');
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(screen.getByRole('dialog', { name: 'Leave session?' })).toBeInTheDocument();
    back();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(phone.confirmLeave).not.toHaveBeenCalled();
    expect(screen.getByRole('heading')).toHaveTextContent('/friends');
  });
});
