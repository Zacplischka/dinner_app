// ConfirmLeaveModal Component
// Confirmation dialog before leaving a session
// UX: "Stay" is the safe action, "Leave" is destructive.

interface ConfirmLeaveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading?: boolean;
  /** Context determines the warning message shown */
  context?: 'lobby' | 'selecting' | 'results';
  /** Number of selections made (for selecting context) */
  selectionsCount?: number;
}

export default function ConfirmLeaveModal({
  isOpen,
  onClose,
  onConfirm,
  isLoading = false,
  context = 'lobby',
  selectionsCount = 0,
}: ConfirmLeaveModalProps) {
  if (!isOpen) return null;

  // Context-aware messaging
  const getTitle = () => {
    switch (context) {
      case 'results':
        return 'Leave Session?';
      case 'selecting':
        return 'Leave Session?';
      case 'lobby':
      default:
        return 'Leave Session?';
    }
  };

  const getMessage = () => {
    switch (context) {
      case 'results':
        return 'Return to the home screen? You can always start a new session.';
      case 'selecting':
        if (selectionsCount > 0) {
          return `Your ${selectionsCount} selection${selectionsCount !== 1 ? 's' : ''} will be lost and won't count toward the results.`;
        }
        return "You'll leave without submitting any preferences.";
      case 'lobby':
      default:
        return "You'll leave the session and others won't see you in the lobby anymore.";
    }
  };

  const getStayLabel = () => {
    switch (context) {
      case 'results':
        return 'Stay Here';
      case 'selecting':
        return 'Keep Swiping';
      case 'lobby':
      default:
        return 'Stay in Session';
    }
  };

  const getLeaveLabel = () => {
    switch (context) {
      case 'results':
        return 'Go Home';
      default:
        return 'Leave Session';
    }
  };

  // Handle keyboard escape
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !isLoading) {
      onClose();
    }
  };

  return (
    <div
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
                {getTitle()}
              </h2>
              <p className="text-muted">
                {getMessage()}
              </p>
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
              className="flex-1 min-h-[48px] rounded-xl bg-lime px-4 py-3 font-extrabold text-ink shadow-glow-lime transition-all duration-150 active:scale-[0.98] disabled:opacity-50"
              autoFocus
            >
              {getStayLabel()}
            </button>
            <button
              onClick={onConfirm}
              disabled={isLoading}
              className="flex-1 min-h-[48px] rounded-xl border border-coral bg-transparent px-4 py-3 font-bold text-coral-soft transition-all duration-150 hover:bg-coral/10 disabled:opacity-50 active:scale-[0.98]"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-coral border-t-transparent rounded-full animate-spin" />
                  Leaving...
                </span>
              ) : (
                getLeaveLabel()
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
