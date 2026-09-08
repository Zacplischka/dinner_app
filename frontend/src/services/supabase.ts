// Supabase client configuration
// Provides authentication services using Supabase Auth

import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { credentialStorage } from './nativeStorage';
import { Browser } from '@capacitor/browser';
import { publicUrl } from './device';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials not configured. Auth features will be disabled.');
}

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
          ...(Capacitor.isNativePlatform()
            ? {
                storage: credentialStorage,
                flowType: 'pkce' as const,
                detectSessionInUrl: false,
              }
            : {}),
        },
      })
    : null;

/**
 * Sign in with Google OAuth
 * Redirects user to Google sign-in page
 */
export async function signInWithGoogle(): Promise<void> {
  if (!supabase)
    throw new Error('Sign-in is currently unavailable. You can still join as a guest.');
  const native = Capacitor.isNativePlatform();
  if (native) completedCallback = undefined;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: native ? publicUrl('/auth/callback') : `${window.location.origin}/`,
      ...(native ? { skipBrowserRedirect: true } : {}),
    },
  });

  if (error) {
    throw error;
  }
  if (native && data.url) {
    await credentialStorage.setItem('heykeen.oauth.pending', String(Date.now()));
    await Browser.open({ url: data.url });
  }
}

let callbackInFlight: Promise<void> | undefined;
let completedCallback: string | undefined;
export function finishNativeSignIn(raw: string): Promise<void> {
  if (raw === completedCallback) return Promise.resolve();
  if (callbackInFlight) return callbackInFlight;
  callbackInFlight = (async () => {
    const url = new URL(raw);
    const expected = new URL(publicUrl('/auth/callback'));
    if (
      !Capacitor.isNativePlatform() ||
      !supabase ||
      url.origin !== expected.origin ||
      url.pathname !== expected.pathname ||
      url.hash ||
      url.username ||
      url.password
    ) {
      throw new Error('Invalid sign-in callback');
    }
    const started = Number(await credentialStorage.getItem('heykeen.oauth.pending'));
    if (!started || Date.now() - started > 10 * 60 * 1000) throw new Error('Sign-in has expired');
    try {
      const code = url.searchParams.get('code');
      if (!code || code.length > 4096 || url.searchParams.has('error'))
        throw new Error('Sign-in cancelled');
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw new Error('Sign-in could not be completed');
    } finally {
      await credentialStorage.removeItem('heykeen.oauth.pending');
      await Browser.close().catch(() => undefined);
    }
    // Some OS versions deliver the launch URL again after closing the browser.
    // Retain only the last successful delivery in memory, never in storage/logs.
    completedCallback = raw;
  })().finally(() => {
    callbackInFlight = undefined;
  });
  return callbackInFlight;
}

/**
 * Sign out current user
 */
export async function signOut(): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('Sign out error:', error);
    throw error;
  }
}
