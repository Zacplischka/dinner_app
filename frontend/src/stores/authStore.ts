// Zustand store for authentication state
// Manages user session and auth status

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { User, Session, Subscription } from '@supabase/supabase-js';
import {
  supabase,
  signInWithGoogle as googleSignIn,
  signOut as supabaseSignOut,
} from '../services/supabase';

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
  setSession: (session: Session | null) => void;
}

export const useAuthStore = create<AuthState>()(
  devtools(
    (set, _get) => ({
      user: null,
      session: null,
      isLoading: true,
      isAuthenticated: false,

      initialize: async () => {
        if (!supabase) {
          set({ isLoading: false });
          return;
        }
        // Optional identity must not hold guest entry hostage to an auth outage.
        const guestFallback = setTimeout(() => set({ isLoading: false }), 3000);
        try {
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
          await googleSignIn();
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
          await supabaseSignOut();
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

      setSession: (session) => {
        set({
          session,
          user: session?.user ?? null,
          isAuthenticated: !!session,
        });
      },
    }),
    { name: 'AuthStore' }
  )
);
