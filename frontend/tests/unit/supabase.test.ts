import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseMocks = vi.hoisted(() => {
  const signInWithOAuth = vi.fn();
  const signOut = vi.fn();
  const client = {
    auth: {
      signInWithOAuth,
      signOut,
    },
  };

  return {
    signInWithOAuth,
    signOut,
    createClient: vi.fn(() => client),
    client,
  };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: supabaseMocks.createClient,
}));

import { signInWithGoogle, signOut, supabase } from '../../src/services/supabase';

describe('supabase service', () => {
  beforeEach(() => {
    supabaseMocks.signInWithOAuth.mockReset();
    supabaseMocks.signOut.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(signInWithGoogle()).resolves.toBeUndefined();
    expect(supabaseMocks.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'http://localhost:3000/',
      },
    });

    const error = new Error('denied');
    supabaseMocks.signInWithOAuth.mockResolvedValueOnce({ error });

    await expect(signInWithGoogle()).rejects.toThrow('denied');
    expect(errorSpy).toHaveBeenCalledWith('Google sign-in error:', error);
  });

  it('should sign out and surface errors', async () => {
    supabaseMocks.signOut.mockResolvedValueOnce({ error: null });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(signOut()).resolves.toBeUndefined();

    const error = new Error('logout failed');
    supabaseMocks.signOut.mockResolvedValueOnce({ error });

    await expect(signOut()).rejects.toThrow('logout failed');
    expect(errorSpy).toHaveBeenCalledWith('Sign out error:', error);
  });
});
