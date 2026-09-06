// useToast Hook
// Global toast notification system using Zustand for state management
// Provides a simple API: toast.success('message'), toast.error('message'), etc.

import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastStore {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => string;
  removeToast: (id: string) => void;
  clearAll: () => void;
}

// Generate unique IDs for toasts
let toastId = 0;
const generateId = () => `toast-${++toastId}-${Date.now()}`;

// A flapping connection with four friends stacked toasts until they buried the
// Submit button (#409). Three is what a phone shows without covering the CTA.
const MAX_TOASTS = 3;

// Zustand store for global toast state
export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],

  addToast: (toast) => {
    const id = generateId();

    // A repeat of what's already on top doesn't stack — it replaces it, so the
    // timer restarts. Returning the old id instead left a second tap with
    // whatever was left of the first toast's 5s, or nothing at all when the
    // repeat landed inside its 200ms exit animation.
    const last = get().toasts.at(-1);
    if (last && last.type === toast.type && last.message === toast.message) {
      set((state) => ({ toasts: [...state.toasts.slice(0, -1), { ...toast, id }] }));
      return id;
    }

    set((state) => ({
      toasts: [...state.toasts, { ...toast, id }].slice(-MAX_TOASTS),
    }));
    return id;
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  clearAll: () => {
    set({ toasts: [] });
  },
}));

// Default durations by type
const DEFAULT_DURATIONS: Record<ToastType, number> = {
  success: 3000,
  error: 5000,
  warning: 4000,
  info: 3000,
};

interface ToastOptions {
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

// Export a singleton for use outside React components (e.g., in socket handlers)
export const toast = {
  success: (message: string, options?: ToastOptions) => {
    return useToastStore.getState().addToast({
      type: 'success',
      message,
      duration: options?.duration ?? DEFAULT_DURATIONS.success,
      action: options?.action,
    });
  },
  error: (message: string, options?: ToastOptions) => {
    return useToastStore.getState().addToast({
      type: 'error',
      message,
      duration: options?.duration ?? DEFAULT_DURATIONS.error,
      action: options?.action,
    });
  },
  warning: (message: string, options?: ToastOptions) => {
    return useToastStore.getState().addToast({
      type: 'warning',
      message,
      duration: options?.duration ?? DEFAULT_DURATIONS.warning,
      action: options?.action,
    });
  },
  info: (message: string, options?: ToastOptions) => {
    return useToastStore.getState().addToast({
      type: 'info',
      message,
      duration: options?.duration ?? DEFAULT_DURATIONS.info,
      action: options?.action,
    });
  },
  dismiss: (id: string) => useToastStore.getState().removeToast(id),
  clearAll: () => useToastStore.getState().clearAll(),
};

export function useToast() {
  return toast;
}
