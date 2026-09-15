// ConfirmLeaveModal Component
// Confirmation dialog before leaving a session
// UX: "Stay" is the safe action, "Leave" is destructive.

import { useRef } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import Spinner from './Spinner';

type Context = 'lobby' | 'selecting' | 'results' | 'ordering' | 'switching';

interface ConfirmLeaveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading?: boolean;
  /** Context determines the warning message shown */
  context?: Context;
  /** Number of selections made (for selecting context) */
  selectionsCount?: number;
}

// Context-aware messaging; only the selecting message reads the count.
const COPY: Record<
  Context,
  { title: string; stay: string; leave: string; message: string | ((selections: number) => string) }
> = {
  lobby: {
    title: 'Leave session?',
    stay: 'Stay in session',
    leave: 'Leave session',
    message: "You'll leave the session and the others won't see you in it anymore.",
  },
  selecting: {
    title: 'Leave session?',
    stay: 'Keep swiping',
    leave: 'Leave session',
    message: (selections) =>
      selections > 0
        ? `Your ${selections} selection${selections !== 1 ? 's' : ''} will be lost and won't count toward the Match.`
        : "You'll leave without submitting any selections.",
  },
  results: {
    title: 'Leave session?',
    stay: 'Stay here',
    leave: 'Leave session',
    message:
      'Leave this session and stop participating? Use the YupCrew logo to go home and keep your place.',
  },
  ordering: {
    title: 'Leave the basket?',
    stay: 'Back to the basket',
    leave: 'Leave session',
    message:
      "Your items stay in the basket and still count — whoever taps I'll order still buys them.",
  },
  switching: {
    title: 'Leave this session to continue?',
    stay: 'Stay in session',
    leave: 'Leave and continue',
    message:
      'Leave this session to create or join another? Your participation and selections in this session will be removed.',
  },
};

export default function ConfirmLeaveModal({
  isOpen,
  onClose,
  onConfirm,
  isLoading = false,
  context = 'lobby',
  selectionsCount = 0,
}: ConfirmLeaveModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, isOpen);

  if (!isOpen) return null;

  const copy = COPY[context];
  const message = typeof copy.message === 'function' ? copy.message(selectionsCount) : copy.message;

  // Handle keyboard escape
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !isLoading) {
      onClose();
    }
  };

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-leave-title"
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-ink/80 backdrop-blur-[10px] transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="card relative w-full max-w-sm shadow-glow-coral animate-fade-in">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h2
                id="confirm-leave-title"
                className="text-2xl font-display font-black text-text mb-2"
              >
                {copy.title}
              </h2>
              <p className="text-muted">{message}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="w-11 h-11 flex-shrink-0 rounded-full border border-line bg-surface text-xl text-muted hover:text-text disabled:opacity-50"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 min-h-[48px] rounded-xl bg-lime px-4 py-3 font-extrabold text-white shadow-glow-lime transition-all duration-150 active:scale-[0.98] disabled:opacity-50"
              autoFocus
            >
              {copy.stay}
            </button>
            <button
              onClick={onConfirm}
              disabled={isLoading}
              className="flex-1 min-h-[48px] rounded-xl border border-coral bg-transparent px-4 py-3 font-bold text-coral-soft transition-all duration-150 hover:bg-coral/10 disabled:opacity-50 active:scale-[0.98]"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <Spinner size="sm" label="Leaving…" />
                  Leaving…
                </span>
              ) : (
                copy.leave
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
