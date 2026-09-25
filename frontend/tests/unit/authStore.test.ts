import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Capacitor } from '@capacitor/core';
import type * as AuthStore from '../../src/stores/authStore';
import type * as FriendsStore from '../../src/stores/friendsStore';
import type * as ApiClient from '../../src/services/apiClient';

const SUPABASE = '../../src/services/supabase';

const authMocks = vi.hoisted(() => ({
  // How many times this test loaded services/supabase, and so supabase-js.
  loads: 0,
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithGoogle: vi.fn(),
  signOut: vi.fn(),
}));

const supabaseModule = () => ({
  supabase: {
    auth: {
      getSession: authMocks.getSession,
      onAuthStateChange: authMocks.onAuthStateChange,
    },
  },
  signInWithGoogle: authMocks.signInWithGoogle,
  signOut: authMocks.signOut,
});

// Every test gets its own module registry, so a load count never depends on
// which test ran first.
let useAuthStore: typeof AuthStore.useAuthStore;
let useFriendsStore: typeof FriendsStore.useFriendsStore;
let getFriends: typeof ApiClient.getFriends;

beforeEach(async () => {
  vi.resetModules();
  authMocks.loads = 0;
  vi.doMock(SUPABASE, () => {
    authMocks.loads++;
    return supabaseModule();
  });
  ({ useAuthStore } = await import('../../src/stores/authStore'));
  ({ useFriendsStore } = await import('../../src/stores/friendsStore'));
  ({ getFriends } = await import('../../src/services/apiClient'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks(); // before the shared teardown touches localStorage
  window.history.replaceState(null, '', '/');
});

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
const SESSION_KEY = 'sb-placeholder-auth-token';
const storeSession = () => localStorage.setItem(SESSION_KEY, '{}');

const signedOut = () =>
  useAuthStore.setState({
    user: null,
    session: null,
    isLoading: true,
    isAuthenticated: false,
  });

const restores = () => {
  authMocks.getSession.mockResolvedValue({ data: { session }, error: null });
  authMocks.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  });
};

// #521: supabase-js is 61 KB gzipped, and most visitors are guests.
describe('authStore loads supabase-js only when there is a session to restore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signedOut();
  });

  it('settles a signed-out guest on the web without loading supabase-js', async () => {
    // A Session join code is not an OAuth callback.
    window.history.replaceState(null, '', '/join?code=AB123');

    await expect(useAuthStore.getState().initialize()).resolves.toBeUndefined();

    expect(useAuthStore.getState()).toMatchObject({ isLoading: false, isAuthenticated: false });
    expect(authMocks.getSession).not.toHaveBeenCalled();
    expect(authMocks.loads).toBe(0);
  });

  it('does not count a leftover PKCE code verifier as a session', async () => {
    localStorage.setItem(`${SESSION_KEY}-code-verifier`, 'verifier');

    await useAuthStore.getState().initialize();

    expect(useAuthStore.getState().isLoading).toBe(false);
    expect(authMocks.loads).toBe(0);
  });

  it('loads supabase-js on demand to sign in', async () => {
    authMocks.signInWithGoogle.mockResolvedValueOnce(undefined);

    await useAuthStore.getState().signInWithGoogle();

    expect(authMocks.loads).toBe(1);
    expect(authMocks.signInWithGoogle).toHaveBeenCalledTimes(1);
  });

  it('loads supabase-js on demand to sign out', async () => {
    authMocks.signOut.mockResolvedValueOnce(undefined);

    await useAuthStore.getState().signOut();

    expect(authMocks.loads).toBe(1);
    expect(authMocks.signOut).toHaveBeenCalledTimes(1);
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
    restores();

    await useAuthStore.getState().initialize();

    expect(authMocks.loads).toBe(1);
    expect(useAuthStore.getState()).toMatchObject({
      session,
      isAuthenticated: true,
      isLoading: false,
    });
  });

  it.each([
    [
      'a rejected sign-in redirect',
      () =>
        window.history.replaceState(
          null,
          '',
          '/#error=access_denied&error_code=provider_error&error_description=Denied'
        ),
    ],
    [
      'blocked storage',
      () =>
        vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(() => {
          throw new DOMException('The operation is insecure.', 'SecurityError');
        }),
    ],
  ])('hands %s to supabase-js', async (_, arrange) => {
    arrange();
    authMocks.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    authMocks.onAuthStateChange.mockReturnValueOnce({
      data: { subscription: { unsubscribe: vi.fn() } },
    });

    await useAuthStore.getState().initialize();

    expect(authMocks.loads).toBe(1);
    expect(authMocks.getSession).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState()).toMatchObject({ isLoading: false, isAuthenticated: false });
  });

  it('restores a sign-in made in another tab', async () => {
    await useAuthStore.getState().initialize();
    restores();

    // Not a session: supabase-js's transient PKCE key.
    window.dispatchEvent(
      new StorageEvent('storage', { key: `${SESSION_KEY}-code-verifier`, newValue: 'v' })
    );
    await Promise.resolve();
    expect(authMocks.loads).toBe(0);

    storeSession();
    window.dispatchEvent(new StorageEvent('storage', { key: SESSION_KEY, newValue: '{}' }));

    await vi.waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(true));
    expect(authMocks.loads).toBe(1);
  });

  it('releases Session entry after 3 s even when supabase-js is slow to arrive', async () => {
    storeSession();
    restores();
    let arrive: (() => void) | undefined;
    vi.doMock(SUPABASE, async () => {
      await new Promise<void>((resolve) => (arrive = resolve));
      return supabaseModule();
    });
    vi.useFakeTimers();

    const initializing = useAuthStore.getState().initialize();
    await vi.advanceTimersByTimeAsync(2999);
    expect(useAuthStore.getState().isLoading).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(useAuthStore.getState().isLoading).toBe(false);

    // A late arrival still signs the user in. The import reaches the factory
    // on its own schedule, not the fake clock's, so wait for it first.
    (await vi.waitUntil(() => arrive))();
    await initializing;
    expect(useAuthStore.getState()).toMatchObject({ session, isAuthenticated: true });
  });

  it('settles when supabase-js fails to load', async () => {
    storeSession();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.doMock(SUPABASE, () => {
      throw new Error('Failed to fetch dynamically imported module');
    });

    await expect(useAuthStore.getState().initialize()).resolves.toBeUndefined();

    expect(useAuthStore.getState()).toMatchObject({ isLoading: false, isAuthenticated: false });
    expect(errorSpy).toHaveBeenCalledWith('Auth initialization error:', expect.any(Error));
  });

  it('sends the restored session as the Bearer token on Friends requests', async () => {
    storeSession();
    restores();
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

  // App.tsx may call initialize() after the socket code has already joined on
  // a cold /join?code=… load, and a join waits while auth is loading.
  it('starts settled for a guest before initialize runs, and loading for a stored session', async () => {
    window.history.replaceState(null, '', '/join?code=AB123');
    vi.resetModules();
    const guest = await import('../../src/stores/authStore');
    expect(guest.useAuthStore.getState().isLoading).toBe(false);

    storeSession();
    vi.resetModules();
    const restoring = await import('../../src/stores/authStore');
    expect(restoring.useAuthStore.getState().isLoading).toBe(true);
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
