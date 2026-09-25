import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Capacitor } from '@capacitor/core';

const authMocks = vi.hoisted(() => ({
  // How many times services/supabase (and so supabase-js) has been loaded.
  // The registry caches it, so this can only go 0 → 1 in this file.
  loads: 0,
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithGoogle: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('../../src/services/supabase', () => {
  authMocks.loads++;
  return {
    supabase: {
      auth: {
        getSession: authMocks.getSession,
        onAuthStateChange: authMocks.onAuthStateChange,
      },
    },
    signInWithGoogle: authMocks.signInWithGoogle,
    signOut: authMocks.signOut,
  };
});

import { useAuthStore } from '../../src/stores/authStore';
import { useFriendsStore } from '../../src/stores/friendsStore';
import { getFriends } from '../../src/services/apiClient';

const user = {
  id: 'user-1',
  email: 'alice@example.com',
  user_metadata: {},
};

const session = {
  access_token: 'token',
  user,
};

// supabase-js's default web storage key for https://placeholder.supabase.co
const storeSession = () => localStorage.setItem('sb-placeholder-auth-token', '{}');

const signedOut = () =>
  useAuthStore.setState({
    user: null,
    session: null,
    isLoading: true,
    isAuthenticated: false,
  });

// #521: supabase-js is 61 KB gzipped, and most visitors are guests. Order
// matters here: the first test runs before anything has loaded the module.
describe('authStore loads supabase-js only when there is a session to restore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signedOut();
  });

  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('settles a signed-out guest on the web without loading supabase-js', async () => {
    // A Session join code is not an OAuth callback.
    window.history.replaceState(null, '', '/join?code=AB123');

    await expect(useAuthStore.getState().initialize()).resolves.toBeUndefined();

    expect(useAuthStore.getState()).toMatchObject({ isLoading: false, isAuthenticated: false });
    expect(authMocks.getSession).not.toHaveBeenCalled();
    expect(authMocks.loads).toBe(0);
  });

  it('loads supabase-js on demand to sign in', async () => {
    authMocks.signInWithGoogle.mockResolvedValueOnce(undefined);

    await useAuthStore.getState().signInWithGoogle();

    expect(authMocks.loads).toBe(1);
    expect(authMocks.signInWithGoogle).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a stored web session', storeSession],
    [
      'the OAuth redirect back to the web app',
      () =>
        window.history.replaceState(
          null,
          '',
          '/#access_token=t&refresh_token=r&expires_in=3600&token_type=bearer'
        ),
    ],
    ['the native app', () => vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true)],
  ])('restores the session from %s', async (_, arrange) => {
    arrange();
    authMocks.getSession.mockResolvedValueOnce({ data: { session }, error: null });
    authMocks.onAuthStateChange.mockReturnValueOnce({
      data: { subscription: { unsubscribe: vi.fn() } },
    });

    await useAuthStore.getState().initialize();

    expect(useAuthStore.getState()).toMatchObject({
      session,
      isAuthenticated: true,
      isLoading: false,
    });
  });

  it('sends the restored session as the Bearer token on Friends requests', async () => {
    storeSession();
    authMocks.getSession.mockResolvedValueOnce({ data: { session }, error: null });
    authMocks.onAuthStateChange.mockReturnValueOnce({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ friends: [] })));

    await useAuthStore.getState().initialize();
    await getFriends();

    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/friends$/),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token' }),
      })
    );
  });
});

describe('authStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signedOut();
    storeSession();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize from the current Supabase session and auth change events', async () => {
    let authStateCallback:
      ((_event: string, nextSession: typeof session | null) => void) | undefined;
    const unsubscribe = vi.fn();
    authMocks.getSession.mockResolvedValueOnce({ data: { session }, error: null });
    authMocks.onAuthStateChange.mockImplementationOnce((callback) => {
      authStateCallback = callback;
      callback('SIGNED_IN', session);
      return { data: { subscription: { unsubscribe } } };
    });

    // #351: the subscription comes back so App can unsubscribe on unmount.
    const subscription = await useAuthStore.getState().initialize();
    subscription?.unsubscribe();
    expect(unsubscribe).toHaveBeenCalledTimes(1);

    expect(useAuthStore.getState()).toMatchObject({
      user,
      session,
      isAuthenticated: true,
      isLoading: false,
    });

    authStateCallback?.('SIGNED_OUT', null);
    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      session: null,
      isAuthenticated: false,
    });
  });

  it('should handle initialization errors', async () => {
    const error = new Error('down');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    authMocks.getSession.mockRejectedValueOnce(error);

    await expect(useAuthStore.getState().initialize()).resolves.toBeUndefined();

    expect(useAuthStore.getState().isLoading).toBe(false);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith('Auth initialization error:', error);
  });

  it('should call Google sign-in and surface sign-in errors', async () => {
    authMocks.signInWithGoogle.mockResolvedValueOnce(undefined);

    await expect(useAuthStore.getState().signInWithGoogle()).resolves.toBeUndefined();
    expect(useAuthStore.getState().isLoading).toBe(false);

    const error = new Error('denied');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    authMocks.signInWithGoogle.mockRejectedValueOnce(error);

    await expect(useAuthStore.getState().signInWithGoogle()).rejects.toThrow('denied');
    expect(useAuthStore.getState().isLoading).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith('Sign in error:', error);
  });

  it('should sign out and surface sign-out errors', async () => {
    useAuthStore.setState({ session: session as any, user: user as any, isAuthenticated: true });
    authMocks.signOut.mockResolvedValueOnce(undefined);

    await useAuthStore.getState().signOut();

    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      session: null,
      isAuthenticated: false,
      isLoading: false,
    });

    const error = new Error('logout failed');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    authMocks.signOut.mockRejectedValueOnce(error);

    await expect(useAuthStore.getState().signOut()).rejects.toThrow('logout failed');
    expect(useAuthStore.getState().isLoading).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith('Sign out error:', error);
  });

  it("forgets the previous Profile's Friends on sign-out", async () => {
    const seeded = {
      friends: [{ id: 'user-2' }],
      friendRequests: [{ id: 'request-1' }],
      sessionInvites: [{ id: 'invite-1' }],
    } as any;
    const empty = { friends: [], friendRequests: [], sessionInvites: [] };
    let authStateCallback:
      ((_event: string, nextSession: typeof session | null) => void) | undefined;
    authMocks.getSession.mockResolvedValueOnce({ data: { session }, error: null });
    authMocks.onAuthStateChange.mockImplementationOnce((callback) => {
      authStateCallback = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    await useAuthStore.getState().initialize();

    // Explicit sign-out
    useFriendsStore.setState(seeded);
    authMocks.signOut.mockResolvedValueOnce(undefined);
    await useAuthStore.getState().signOut();
    expect(useFriendsStore.getState()).toMatchObject(empty);

    // SIGNED_OUT arriving from Supabase (another tab, an expired token)
    useAuthStore.setState({ session: session as any, user: user as any, isAuthenticated: true });
    useFriendsStore.setState(seeded);
    authStateCallback?.('SIGNED_OUT', null);
    expect(useFriendsStore.getState()).toMatchObject(empty);
  });
});
