// ConfirmLeaveModal Component
// Confirmation dialog before leaving a session
// UX: "Stay" is primary action (amber), "Leave" is secondary (outlined red)

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
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-midnight-100 rounded-2xl shadow-card border border-midnight-50/30 w-full max-w-sm p-6 animate-fade-in">
          {/* Warning Icon */}
          <div className="flex justify-center mb-4">
            <div className="w-14 h-14 bg-warning/20 rounded-full flex items-center justify-center">
              <svg
                className="w-7 h-7 text-warning"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
          </div>

          {/* Title */}
          <h2
            id="confirm-leave-title"
            className="text-xl font-display font-semibold text-cream text-center mb-2"
          >
            {getTitle()}
          </h2>

          {/* Message */}
          <p className="text-cream-400 text-center mb-6">
            {getMessage()}
          </p>

          {/* Buttons - UX: Primary action (Stay) is amber, secondary (Leave) is outlined */}
          <div className="flex gap-3">
            {/* Primary: Stay (non-destructive) */}
            <button
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 min-h-[48px] px-4 py-3 font-semibold text-midnight bg-gradient-to-r from-amber to-amber-300 rounded-xl hover:from-amber-300 hover:to-amber-200 disabled:from-midnight-50 disabled:to-midnight-50 disabled:text-cream-500 disabled:cursor-not-allowed active:scale-[0.98] transition-all shadow-glow hover:shadow-glow-lg disabled:shadow-none"
              autoFocus
            >
              {getStayLabel()}
            </button>
            {/* Secondary: Leave (destructive) */}
            <button
              onClick={onConfirm}
              disabled={isLoading}
              className="flex-1 min-h-[48px] px-4 py-3 font-medium text-error bg-transparent border border-error/40 rounded-xl hover:bg-error/10 hover:border-error disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-all"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-error border-t-transparent rounded-full animate-spin" />
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
