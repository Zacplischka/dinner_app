import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { credentialStorage } from '../../src/services/nativeStorage';
vi.mock('@capacitor/browser', () => ({
  Browser: {
    open: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  },
}));

const supabaseMocks = vi.hoisted(() => {
  const signInWithOAuth = vi.fn();
  const signOut = vi.fn();
  const client = {
    auth: {
      signInWithOAuth,
      signOut,
      exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
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

import {
  signInWithGoogle,
  signOut,
  supabase,
  finishNativeSignIn,
} from '../../src/services/supabase';

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

  it('keeps guest startup usable when Supabase credentials are missing', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    supabaseMocks.createClient.mockClear();
    const disabled = await import('../../src/services/supabase');

    expect(warn).toHaveBeenCalledWith(
      'Supabase credentials not configured. Auth features will be disabled.'
    );
    expect(disabled.supabase).toBeNull();
    expect(supabaseMocks.createClient).not.toHaveBeenCalled();
    await expect(disabled.signInWithGoogle()).rejects.toThrow('You can still join as a guest');

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
    expect(errorSpy).not.toHaveBeenCalled();
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
  it('opens native Google in the system browser and exchanges only a pending, validated callback once', async () => {
    vi.mocked(Browser.close).mockResolvedValue(undefined);
    supabaseMocks.client.auth.exchangeCodeForSession.mockResolvedValue({ error: null });
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    vi.stubEnv('VITE_PUBLIC_ORIGIN', 'https://www.dinder.it.com');
    vi.spyOn(credentialStorage, 'setItem').mockResolvedValue(undefined);
    vi.spyOn(credentialStorage, 'getItem').mockResolvedValue(String(Date.now()));
    const clear = vi.spyOn(credentialStorage, 'removeItem').mockResolvedValue(undefined);
    supabaseMocks.signInWithOAuth.mockResolvedValue({
      data: { url: 'https://auth.example.test/authorize' },
      error: null,
    });
    await signInWithGoogle();
    expect(supabaseMocks.signInWithOAuth).toHaveBeenLastCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'https://www.dinder.it.com/auth/callback',
        skipBrowserRedirect: true,
      },
    });
    expect(Browser.open).toHaveBeenCalledWith({ url: 'https://auth.example.test/authorize' });
    await expect(finishNativeSignIn('https://evil.test/auth/callback?code=wrong')).rejects.toThrow(
      'Invalid'
    );
    expect(supabaseMocks.client.auth.exchangeCodeForSession).not.toHaveBeenCalled();
    const first = finishNativeSignIn('https://www.dinder.it.com/auth/callback?code=valid');
    expect(finishNativeSignIn('https://www.dinder.it.com/auth/callback?code=valid')).toBe(first);
    await first;
    vi.mocked(credentialStorage.getItem).mockResolvedValue(null);
    await expect(
      finishNativeSignIn('https://www.dinder.it.com/auth/callback?code=valid')
    ).resolves.toBeUndefined();
    expect(supabaseMocks.client.auth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(supabaseMocks.client.auth.exchangeCodeForSession).toHaveBeenCalledWith('valid');
    expect(clear).toHaveBeenCalledWith('heykeen.oauth.pending');
    expect(Browser.close).toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});
