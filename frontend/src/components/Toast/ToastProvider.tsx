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

  return (
    <>
      {children}

      {/* Toast Container */}
      <div
        className="fixed bottom-0 left-0 right-0 z-[60] pointer-events-none"
        style={{
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
        }}
      >
        <div className="flex flex-col items-center gap-2 px-4">
          {toasts.map((toast) => (
            <div key={toast.id} className="pointer-events-auto w-full flex justify-center animate-slide-up">
              <Toast toast={toast} onDismiss={removeToast} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
