// Toast Component
// Individual toast notification with auto-dismiss and swipe-to-dismiss

import { useEffect, useState, useRef } from 'react';
import type { Toast as ToastType, ToastType as ToastVariant } from '../../hooks/useToast';

interface ToastProps {
  toast: ToastType;
  onDismiss: (id: string) => void;
}

// Icon components for each toast type
const icons: Record<ToastVariant, React.ReactNode> = {
  success: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  ),
  error: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  warning: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  info: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

// Colors for each toast type
const colorClasses: Record<ToastVariant, { border: string; icon: string; bg: string }> = {
  success: {
    border: 'border-l-success',
    icon: 'text-success',
    bg: 'bg-success/10',
  },
  error: {
    border: 'border-l-error',
    icon: 'text-error',
    bg: 'bg-error/10',
  },
  warning: {
    border: 'border-l-warning',
    icon: 'text-warning',
    bg: 'bg-warning/10',
  },
  info: {
    border: 'border-l-amber',
    icon: 'text-amber',
    bg: 'bg-amber/10',
  },
};

export default function Toast({ toast, onDismiss }: ToastProps) {
  const [isExiting, setIsExiting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remainingTimeRef = useRef(toast.duration);
  const startTimeRef = useRef(Date.now());

  // Handle auto-dismiss with pause/resume capability
  useEffect(() => {
    const startTimer = () => {
      startTimeRef.current = Date.now();
      timeoutRef.current = setTimeout(() => {
        handleDismiss();
      }, remainingTimeRef.current);
    };

    const pauseTimer = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        const elapsed = Date.now() - startTimeRef.current;
        remainingTimeRef.current = Math.max(0, remainingTimeRef.current - elapsed);
      }
    };

    if (isPaused) {
      pauseTimer();
    } else {
      startTimer();
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isPaused, toast.duration]);

  const handleDismiss = () => {
    setIsExiting(true);
    // Wait for exit animation before removing
    setTimeout(() => {
      onDismiss(toast.id);
    }, 200);
  };

  const colors = colorClasses[toast.type];

  return (
    <div
      className={`
        relative flex items-start gap-3 w-full max-w-sm
        bg-midnight-100/95 backdrop-blur-md
        border border-midnight-50/30 border-l-4 ${colors.border}
        rounded-xl shadow-card
        px-4 py-3
        transform transition-all duration-200 ease-out
        ${isExiting ? 'opacity-0 translate-y-2 scale-95' : 'opacity-100 translate-y-0 scale-100'}
      `}
      role="alert"
      aria-live="polite"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
    >
      {/* Icon */}
      <div className={`flex-shrink-0 ${colors.icon}`}>
        {icons[toast.type]}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pt-0.5">
        <p className="text-sm text-cream leading-snug">{toast.message}</p>

        {/* Action button */}
        {toast.action && (
          <button
            onClick={() => {
              toast.action?.onClick();
              handleDismiss();
            }}
            className="mt-2 text-sm font-medium text-amber hover:text-amber-300 transition-colors"
          >
            {toast.action.label}
          </button>
        )}
      </div>

      {/* Close button */}
      <button
        onClick={handleDismiss}
        className="flex-shrink-0 p-1 -m-1 text-cream-500 hover:text-cream transition-colors rounded-lg focus:outline-none focus:ring-2 focus:ring-amber/50"
        aria-label="Dismiss notification"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Progress bar for auto-dismiss */}
      {!isPaused && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-midnight-50/30 rounded-b-xl overflow-hidden">
          <div
            className={`h-full ${colors.bg.replace('/10', '')}`}
            style={{
              animation: `shrink ${remainingTimeRef.current}ms linear forwards`,
            }}
          />
        </div>
      )}

      {/* Inline style for shrink animation */}
      <style>{`
        @keyframes shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  );
}
