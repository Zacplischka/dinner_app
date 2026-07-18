// NavigationHeader Component
// Reusable header providing consistent navigation across focused flows
// Title row: stable back target, centred title, page action.
// Secondary region: session code, progress, connection state and subtitle.

import { ReactNode, useState } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import ConfirmLeaveModal from './ConfirmLeaveModal';

export interface NavigationHeaderProps {
  /** Page title displayed in header */
  title: string;
  /** Optional subtitle, shown in the secondary region */
  subtitle?: string;
  /** Session code to display as badge (optional) */
  sessionCode?: string;
  /** Show back/exit button */
  showBackButton?: boolean;
  /** Custom back button handler - if not provided, will use browser back */
  onBack?: () => void | Promise<void>;
  /** Label for back button (default: "Back") */
  backLabel?: string;
  /** Show confirmation modal before navigating back */
  confirmOnBack?: boolean;
  /** Context for confirmation message */
  confirmContext?: 'lobby' | 'selecting' | 'results';
  /** Number of selections (for context-aware confirmation) */
  selectionsCount?: number;
  /** Optional right-side action element */
  rightAction?: ReactNode;
  /** Show connection status indicator */
  showConnectionStatus?: boolean;
  /** Optional progress info */
  progress?: {
    current: number;
    total: number;
  };
  /** Compact mode for pages needing more content space */
  compact?: boolean;
}

export default function NavigationHeader({
  title,
  subtitle,
  sessionCode,
  showBackButton = false,
  onBack,
  backLabel = 'Back',
  confirmOnBack = false,
  confirmContext = 'lobby',
  selectionsCount = 0,
  rightAction,
  showConnectionStatus = false,
  progress,
  compact = false,
}: NavigationHeaderProps) {
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const { isConnected } = useSessionStore();

  const handleBackClick = () => {
    if (confirmOnBack) {
      setShowConfirmModal(true);
    } else if (onBack) {
      void onBack();
    } else {
      window.history.back();
    }
  };

  const handleConfirmLeave = async () => {
    setIsLeaving(true);
    try {
      if (onBack) {
        await onBack();
      } else {
        window.history.back();
      }
    } finally {
      setIsLeaving(false);
      setShowConfirmModal(false);
    }
  };

  const hasSecondaryContent =
    Boolean(subtitle) || Boolean(sessionCode) || Boolean(progress) || showConnectionStatus;

  return (
    <>
      <header
        className={`sticky top-0 z-40 bg-raised/95 backdrop-blur-md border-b border-line ${
          compact ? 'py-2' : 'py-3'
        }`}
        style={{ paddingTop: `max(${compact ? '0.5rem' : '0.75rem'}, env(safe-area-inset-top))` }}
      >
        <div className="max-w-2xl mx-auto px-4">
          {/* Title row: equal-basis edge cells keep the title optically centred
              and stop long titles from moving or shrinking the edge actions. */}
          <div className="flex items-center gap-2">
            {/* Left edge - Back button */}
            <div className="flex flex-1 basis-0 items-center justify-start min-w-0">
              {showBackButton && (
                <button
                  onClick={handleBackClick}
                  className="flex shrink-0 items-center gap-1 text-muted hover:text-cyan transition-colors min-h-[44px] min-w-[44px] -ml-2 pl-2 pr-1"
                  aria-label={backLabel}
                >
                  <svg
                    className="w-5 h-5 flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                  <span className={compact ? 'sr-only' : 'hidden text-sm min-[420px]:inline'}>
                    {backLabel}
                  </span>
                </button>
              )}
            </div>

            {/* Center - Title only */}
            <div className="min-w-0 shrink text-center">
              <h1
                className={`font-display font-semibold text-text truncate ${
                  compact ? 'text-lg' : 'text-xl'
                }`}
              >
                {title}
              </h1>
            </div>

            {/* Right edge - page-specific action */}
            <div className="flex flex-1 basis-0 items-center justify-end min-w-0">
              {rightAction && (
                <div className="min-h-[44px] flex shrink-0 items-center">{rightAction}</div>
              )}
            </div>
          </div>

          {/* Secondary region - metadata that must not compete with the title row */}
          {hasSecondaryContent && (
            <div
              data-testid="nav-header-secondary"
              className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-line/60 pt-2"
            >
              {showConnectionStatus &&
                (() => {
                  const status = isConnected
                    ? { dot: 'bg-lime', text: 'text-lime', label: 'Connected' }
                    : {
                        dot: 'bg-amber animate-pulse',
                        text: 'text-amber',
                        label: 'Reconnecting…',
                      };
                  return (
                    <span
                      role="status"
                      className={`flex items-center gap-1.5 text-xs ${status.text}`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${status.dot}`}
                        aria-hidden="true"
                      />
                      {status.label}
                    </span>
                  );
                })()}

              {sessionCode && (
                <span className="inline-flex items-center px-2 py-0.5 bg-cyan/10 border border-cyan/30 rounded-full">
                  <span className="text-xs font-mono font-medium text-cyan tracking-wider">
                    {sessionCode}
                  </span>
                </span>
              )}

              {subtitle && <p className="text-xs text-muted">{subtitle}</p>}

              {progress && (
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1 bg-surface rounded-full overflow-hidden">
                    <div
                      className="h-full bg-coral rounded-full transition-all duration-300"
                      style={{ width: `${(progress.current / progress.total) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted">
                    {progress.current}/{progress.total}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Confirmation Modal */}
      <ConfirmLeaveModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleConfirmLeave}
        isLoading={isLeaving}
        context={confirmContext}
        selectionsCount={selectionsCount}
      />
    </>
  );
}
