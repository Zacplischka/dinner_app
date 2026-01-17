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

interface ToastOptions {
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

/**
 * Hook to show toast notifications
 *
 * @example
 * const toast = useToast();
 * toast.success('Code copied to clipboard!');
 * toast.error('Failed to connect');
 * toast.info('John joined the session', { duration: 4000 });
 */
export function useToast() {
  const { addToast, removeToast, clearAll } = useToastStore();

  const show = (type: ToastType, message: string, options?: ToastOptions) => {
    const id = addToast({
      type,
      message,
      duration: options?.duration ?? DEFAULT_DURATIONS[type],
      action: options?.action,
    });
    return id;
  };

  return {
    success: (message: string, options?: ToastOptions) => show('success', message, options),
    error: (message: string, options?: ToastOptions) => show('error', message, options),
    warning: (message: string, options?: ToastOptions) => show('warning', message, options),
    info: (message: string, options?: ToastOptions) => show('info', message, options),
    dismiss: removeToast,
    clearAll,
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
