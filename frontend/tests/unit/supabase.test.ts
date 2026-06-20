import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseMocks = vi.hoisted(() => {
  const signInWithOAuth = vi.fn();
  const signOut = vi.fn();
  const getSession = vi.fn();
  const getUser = vi.fn();
  const client = {
    auth: {
      signInWithOAuth,
      signOut,
      getSession,
      getUser,
    },
  };

  return {
    signInWithOAuth,
    signOut,
    getSession,
    getUser,
    createClient: vi.fn(() => client),
    client,
  };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: supabaseMocks.createClient,
}));

import {
  getCurrentUser,
  getSession,
  signInWithGoogle,
  signOut,
  supabase,
} from '../../src/services/supabase';

describe('supabase service', () => {
  beforeEach(() => {
    supabaseMocks.signInWithOAuth.mockReset();
    supabaseMocks.signOut.mockReset();
    supabaseMocks.getSession.mockReset();
    supabaseMocks.getUser.mockReset();
  });

  it('should create a Supabase client with auth options', () => {
    expect(supabase).toBeDefined();
    expect(supabaseMocks.createClient).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        auth: expect.objectContaining({
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
        }),
      })
    );
  });

  it('should warn and create an empty client when Supabase credentials are missing', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await import('../../src/services/supabase');

    expect(warn).toHaveBeenCalledWith(
      'Supabase credentials not configured. Auth features will be disabled.'
    );
    expect(supabaseMocks.createClient).toHaveBeenLastCalledWith(
      '',
      '',
      expect.objectContaining({
        auth: expect.objectContaining({
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
        }),
      })
    );

    warn.mockRestore();
    vi.unstubAllEnvs();
  });

  it('should sign in with Google and surface errors', async () => {
    supabaseMocks.signInWithOAuth.mockResolvedValueOnce({ error: null });

    await expect(signInWithGoogle()).resolves.toBeUndefined();
    expect(supabaseMocks.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'http://localhost:3000/',
      },
    });

    supabaseMocks.signInWithOAuth.mockResolvedValueOnce({ error: new Error('denied') });

    await expect(signInWithGoogle()).rejects.toThrow('denied');
  });

  it('should sign out and surface errors', async () => {
    supabaseMocks.signOut.mockResolvedValueOnce({ error: null });

    await expect(signOut()).resolves.toBeUndefined();

    supabaseMocks.signOut.mockResolvedValueOnce({ error: new Error('logout failed') });

    await expect(signOut()).rejects.toThrow('logout failed');
  });

  it('should get sessions and surface errors', async () => {
    const session = { access_token: 'token' };
    supabaseMocks.getSession.mockResolvedValueOnce({ data: { session }, error: null });

    await expect(getSession()).resolves.toBe(session);

    supabaseMocks.getSession.mockResolvedValueOnce({ data: {}, error: new Error('down') });

    await expect(getSession()).rejects.toThrow('down');
  });

  it('should get users and return null on errors', async () => {
    const user = { id: 'user-1' };
    supabaseMocks.getUser.mockResolvedValueOnce({ data: { user }, error: null });

    await expect(getCurrentUser()).resolves.toBe(user);

    supabaseMocks.getUser.mockResolvedValueOnce({ data: {}, error: new Error('missing') });

    await expect(getCurrentUser()).resolves.toBeNull();
  });
});
