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

// Zustand store for global toast state
export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],

  addToast: (toast) => {
    const id = generateId();
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id }],
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

type Show = (message: string, options?: { duration?: number }) => string;

// Export a singleton for use outside React components (e.g., in socket handlers)
export const toast = Object.fromEntries(
  (Object.keys(DEFAULT_DURATIONS) as ToastType[]).map((type): [ToastType, Show] => [
    type,
    (message, options) =>
      useToastStore.getState().addToast({
        type,
        message,
        duration: options?.duration ?? DEFAULT_DURATIONS[type],
      }),
  ])
) as Record<ToastType, Show>;
