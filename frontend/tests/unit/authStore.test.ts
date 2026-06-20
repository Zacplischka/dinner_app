import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithGoogle: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('../../src/services/supabase', () => ({
  supabase: {
    auth: {
      getSession: authMocks.getSession,
      onAuthStateChange: authMocks.onAuthStateChange,
    },
  },
  signInWithGoogle: authMocks.signInWithGoogle,
  signOut: authMocks.signOut,
}));

import { useAuthStore } from '../../src/stores/authStore';

const user = {
  id: 'user-1',
  email: 'alice@example.com',
  user_metadata: {},
};

const session = {
  access_token: 'token',
  user,
};

describe('authStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: null,
      session: null,
      isLoading: true,
      isAuthenticated: false,
    });
  });

  it('should initialize from the current Supabase session and auth change events', async () => {
    let authStateCallback: ((_event: string, session: typeof session | null) => void) | undefined;
    authMocks.getSession.mockResolvedValueOnce({ data: { session }, error: null });
    authMocks.onAuthStateChange.mockImplementationOnce((callback) => {
      authStateCallback = callback;
      callback('SIGNED_IN', session);
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });

    await useAuthStore.getState().initialize();

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
    authMocks.getSession.mockRejectedValueOnce(new Error('down'));

    await useAuthStore.getState().initialize();

    expect(useAuthStore.getState().isLoading).toBe(false);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('should call Google sign-in and surface sign-in errors', async () => {
    authMocks.signInWithGoogle.mockResolvedValueOnce(undefined);

    await expect(useAuthStore.getState().signInWithGoogle()).resolves.toBeUndefined();
    expect(useAuthStore.getState().isLoading).toBe(true);

    authMocks.signInWithGoogle.mockRejectedValueOnce(new Error('denied'));

    await expect(useAuthStore.getState().signInWithGoogle()).rejects.toThrow('denied');
    expect(useAuthStore.getState().isLoading).toBe(false);
  });

  it('should sign out and surface sign-out errors', async () => {
    useAuthStore.getState().setSession(session as any);
    authMocks.signOut.mockResolvedValueOnce(undefined);

    await useAuthStore.getState().signOut();

    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      session: null,
      isAuthenticated: false,
      isLoading: false,
    });

    authMocks.signOut.mockRejectedValueOnce(new Error('logout failed'));

    await expect(useAuthStore.getState().signOut()).rejects.toThrow('logout failed');
    expect(useAuthStore.getState().isLoading).toBe(false);
  });

  it('should set and clear sessions directly', () => {
    useAuthStore.getState().setSession(session as any);

    expect(useAuthStore.getState()).toMatchObject({
      user,
      isAuthenticated: true,
    });

    useAuthStore.getState().setSession(null);

    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      session: null,
      isAuthenticated: false,
    });
  });
});
