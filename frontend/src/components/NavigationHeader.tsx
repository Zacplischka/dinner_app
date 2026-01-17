// NavigationHeader Component
// Reusable header providing consistent navigation across all pages
// Supports back button with optional confirmation, session code badge, and connection status

import { ReactNode, useState } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import ConfirmLeaveModal from './ConfirmLeaveModal';

export interface NavigationHeaderProps {
  /** Page title displayed in header */
  title: string;
  /** Optional subtitle below title */
  subtitle?: string;
  /** Session code to display as badge (optional) */
  sessionCode?: string;
  /** Show back/exit button */
  showBackButton?: boolean;
  /** Custom back button handler - if not provided, will use browser back */
  onBack?: () => void;
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
      onBack();
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

  // Connection status indicator
  const ConnectionIndicator = () => {
    if (!showConnectionStatus) return null;

    const statusConfig = isConnected
      ? { color: 'bg-success', label: 'Connected' }
      : { color: 'bg-warning animate-pulse', label: 'Reconnecting...' };

    return (
      <div
        className="flex items-center gap-1.5"
        title={statusConfig.label}
        aria-label={statusConfig.label}
      >
        <div className={`w-2 h-2 rounded-full ${statusConfig.color}`} />
        {!isConnected && (
          <span className="text-xs text-warning hidden sm:inline">Reconnecting</span>
        )}
      </div>
    );
  };

  return (
    <>
      <header
        className={`sticky top-0 z-40 bg-midnight-100/95 backdrop-blur-md border-b border-midnight-50/30 ${
          compact ? 'py-2' : 'py-3'
        }`}
        style={{ paddingTop: `max(${compact ? '0.5rem' : '0.75rem'}, env(safe-area-inset-top))` }}
      >
        <div className="max-w-2xl mx-auto px-4">
          <div className="flex items-center justify-between gap-3">
            {/* Left section - Back button */}
            <div className="flex items-center gap-3 min-w-0 flex-shrink-0">
              {showBackButton && (
                <button
                  onClick={handleBackClick}
                  className="flex items-center gap-1 text-cream-400 hover:text-amber transition-colors min-h-[44px] min-w-[44px] -ml-2 pl-2 pr-1"
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
                  <span className={compact ? 'sr-only' : 'text-sm'}>{backLabel}</span>
                </button>
              )}
            </div>

            {/* Center section - Title and session info */}
            <div className="flex-1 min-w-0 text-center">
              <div className="flex flex-col items-center">
                {/* Title */}
                <h1 className={`font-display font-semibold text-cream truncate ${
                  compact ? 'text-lg' : 'text-xl'
                }`}>
                  {title}
                </h1>

                {/* Subtitle or session code badge */}
                {(subtitle || sessionCode) && (
                  <div className="flex items-center gap-2 mt-0.5">
                    {subtitle && !compact && (
                      <p className="text-xs text-cream-400 truncate">{subtitle}</p>
                    )}
                    {sessionCode && (
                      <span className="inline-flex items-center px-2 py-0.5 bg-amber/10 border border-amber/20 rounded-full">
                        <span className="text-xs font-mono font-medium text-amber tracking-wider">
                          {sessionCode}
                        </span>
                      </span>
                    )}
                  </div>
                )}

                {/* Progress indicator */}
                {progress && (
                  <div className="flex items-center gap-2 mt-1">
                    <div className="w-16 h-1 bg-midnight-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-amber to-amber-300 rounded-full transition-all duration-300"
                        style={{ width: `${(progress.current / progress.total) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-cream-500">
                      {progress.current}/{progress.total}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Right section - Connection status and custom action */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <ConnectionIndicator />
              {rightAction && (
                <div className="min-h-[44px] flex items-center">
                  {rightAction}
                </div>
              )}
              {/* Invisible spacer to balance layout when no right action */}
              {!rightAction && showBackButton && (
                <div className="w-[44px]" aria-hidden="true" />
              )}
            </div>
          </div>
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
