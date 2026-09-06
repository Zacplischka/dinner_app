// ToastProvider Component
// Renders toast notifications at the bottom of the screen
// Wrap your app with this component to enable toast notifications

import { useToastStore } from '../../hooks/useToast';
import Toast from './Toast';

interface ToastProviderProps {
  children: React.ReactNode;
}

export default function ToastProvider({ children }: ToastProviderProps) {
  const { toasts, removeToast } = useToastStore();

  // A polite live region is only announced when text changes inside a node
  // that was already in the tree — a region minted with its card stays silent.
  // So one region outlives every toast and carries the newest non-error
  // message; errors interrupt through their own role="alert" on the card.
  const politeMessage = toasts.filter((t) => t.type !== 'error').at(-1)?.message ?? '';

  return (
    <>
      {children}

      <p role="status" aria-live="polite" className="sr-only">
        {politeMessage}
      </p>

      {/* Toast Container */}
      <div
        className="fixed bottom-0 left-0 right-0 z-[60] pointer-events-none"
        style={{
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
        }}
      >
        <div className="flex flex-col items-center gap-2 px-4">
          {/* Taps pass through everywhere except the toast card itself —
              a full-width interactive band here swallowed bottom-edge taps
              on small phones (#289). */}
          {toasts.map((toast) => (
            <div key={toast.id} className="w-full flex justify-center animate-slide-up">
              <Toast toast={toast} onDismiss={removeToast} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
