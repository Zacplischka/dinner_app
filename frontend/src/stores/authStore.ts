// Zustand store for authentication state
// Manages user session and auth status

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { User, Session, Subscription } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';

// supabase-js is loaded on demand (#521): most visitors are guests who never
// sign in, and it is the biggest chunk in the app.
const loadSupabase = () => import('../services/supabase');

// On the web supabase-js keeps the session in localStorage under its default
// key, sb-<project-ref>-auth-token, and the Google sign-in lands back on `/`
// with the tokens in the hash (the implicit flow). Native keeps it in
// credentialStorage, so the app always restores there.
function hasSessionToRestore(): boolean {
  if (Capacitor.isNativePlatform()) return true;
  if (new URLSearchParams(window.location.hash.slice(1)).has('access_token')) return true;
  try {
    return Object.keys(localStorage).some((key) => /^sb-.+-auth-token/.test(key));
  } catch {
    return true; // storage blocked: let supabase-js decide, as it always did
  }
}

interface AuthState {
  // Auth data
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  // Actions
  // Resolves to the auth-change subscription so the caller can unsubscribe
  // on unmount (#351); undefined when initialization failed.
  initialize: () => Promise<Subscription | undefined>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  devtools(
    (set, _get) => ({
      user: null,
      session: null,
      isLoading: true,
      isAuthenticated: false,

      initialize: async () => {
        if (!hasSessionToRestore()) {
          set({ isLoading: false });
          return;
        }
        let guestFallback: ReturnType<typeof setTimeout> | undefined;
        try {
          const { supabase } = await loadSupabase();
          if (!supabase) {
            set({ isLoading: false });
            return;
          }
          // Optional identity must not hold guest entry hostage to an auth outage.
          guestFallback = setTimeout(() => set({ isLoading: false }), 3000);
          // Get initial session
          const {
            data: { session },
          } = await supabase.auth.getSession();

          set({
            session,
            user: session?.user ?? null,
            isAuthenticated: !!session,
            isLoading: false,
          });

          // Listen for auth state changes
          const {
            data: { subscription },
          } = supabase.auth.onAuthStateChange((_event, session) => {
            set({
              session,
              user: session?.user ?? null,
              isAuthenticated: !!session,
              isLoading: false,
            });
          });
          return subscription;
        } catch (error) {
          console.error('Auth initialization error:', error);
          set({ isLoading: false });
          return undefined;
        } finally {
          clearTimeout(guestFallback);
        }
      },

      signInWithGoogle: async () => {
        set({ isLoading: true });
        try {
          await (await loadSupabase()).signInWithGoogle();
          set({ isLoading: false });
        } catch (error) {
          console.error('Sign in error:', error);
          set({ isLoading: false });
          throw error;
        }
      },

      signOut: async () => {
        set({ isLoading: true });
        try {
          await (await loadSupabase()).signOut();
          set({
            user: null,
            session: null,
            isAuthenticated: false,
            isLoading: false,
          });
        } catch (error) {
          console.error('Sign out error:', error);
          set({ isLoading: false });
          throw error;
        }
      },
    }),
    { name: 'AuthStore' }
  )
);
