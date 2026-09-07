// NavigationHeader Component
// Reusable header providing consistent navigation across focused flows
// Title row: stable back target, centred title, page action.
// Secondary region: session code, progress, connection state and subtitle.

import { ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSessionStore } from '../stores/sessionStore';
import { useLeaveSession } from '../hooks/useLeaveSession';
import { toast } from '../hooks/useToast';
import ConfirmLeaveModal from './ConfirmLeaveModal';

/** "Expires in 27 min" — whole minutes, never negative, "under a minute" below one. */
function expiryLabel(expiresAt: string): string {
  const minutes = Math.max(0, Math.floor((Date.parse(expiresAt) - Date.now()) / 60_000));
  return minutes < 1 ? 'Expires in under a minute' : `Expires in ${minutes} min`;
}

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
  confirmContext?: 'lobby' | 'selecting' | 'results' | 'ordering';
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
  const [copied, setCopied] = useState(false);
  const { isConnected, expiresAt, sessionStatus, lobby, participants, currentUserId } =
    useSessionStore();
  const me = participants.find((participant) => participant.participantId === currentUserId);
  const canReviewWaiting =
    me &&
    !me.waitingForNextRound &&
    (me.isHost ||
      !participants.some((participant) => participant.isHost && participant.isOnline !== false));
  const waitingCount =
    lobby?.participants.filter((participant) => participant.waitingForNextRound).length ?? 0;
  // Only a Session screen (one that shows the code) carries the countdown or
  // the expired banner; the store's expiresAt and status can linger after a
  // Session ends and must not leak onto Join or Create.
  const expired = Boolean(sessionCode) && sessionStatus === 'expired';
  // #402: once it has expired there is nothing left to count down to — every
  // Session screen says so here, instead of sticking on "under a minute".
  const showExpiry = Boolean(sessionCode && expiresAt) && !expired;
  // Start over is a leave, not a link: an <a href="/"> reloads the SPA, and the
  // sessionStorage-persisted Session survives that reload long enough for the
  // connect binding to auto-rejoin the dead Session and toast the failed ack.
  const leaveSession = useLeaveSession(sessionCode);

  // Tick, don't decrement: the label re-reads expiresAt and Date.now() on every
  // render, so a throttled background tab is right again the moment it wakes,
  // and a store refresh after a TTL slide updates the line at once.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!showExpiry) return;
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, [showExpiry]);

  // Tap-to-copy Session Code, on every in-Session screen — the lobby's copy
  // button used to be the only one. The badge flashes lime for 1.5s as the
  // pressed cue; the toast says what happened.
  const handleCopyCode = () => {
    if (!sessionCode) return;
    navigator.clipboard
      .writeText(sessionCode)
      .then(() => {
        toast.success('Session code copied!');
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => toast.error('Could not copy code'));
  };

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

  const showSubtitle = Boolean(subtitle) && !compact;
  const hasSecondaryContent =
    showSubtitle || Boolean(sessionCode) || Boolean(progress) || showConnectionStatus || showExpiry;
  const connectionStatus = isConnected
    ? { dot: 'bg-lime', text: 'text-lime', label: 'Connected' }
    : { dot: 'bg-amber animate-pulse', text: 'text-amber', label: 'Reconnecting…' };

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
            <div
              className={`flex flex-1 basis-0 items-center justify-start ${showBackButton ? 'min-w-[88px]' : 'min-w-[44px]'}`}
            >
              <Link
                to="/"
                aria-label="Dinder home"
                title="Dinder home"
                className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center"
              >
                <span className="logo-mark scale-75" aria-hidden="true" />
              </Link>
              {showBackButton && (
                <button
                  onClick={handleBackClick}
                  className="flex shrink-0 items-center gap-1 text-muted hover:text-cyan transition-colors min-h-[44px] min-w-[44px] pl-2 pr-1"
                  aria-label={confirmOnBack && sessionCode ? 'Leave session' : backLabel}
                >
                  <svg
                    className="w-5 h-5 flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
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
            <div
              className={`flex flex-1 basis-0 items-center justify-end ${showBackButton ? 'min-w-[88px]' : 'min-w-[44px]'}`}
            >
              {rightAction && (
                <div className="min-h-[44px] flex shrink-0 items-center">{rightAction}</div>
              )}
            </div>
          </div>

          {expired && (
            <div
              role="alert"
              className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-lg border border-coral/30 bg-coral/10 px-3 py-2 text-center"
            >
              <span className="text-sm font-semibold text-coral">This session has expired</span>
              {/* -my-2 buys the 44px tap target without growing the banner. */}
              <button
                type="button"
                onClick={() => void leaveSession()}
                className="-my-2 inline-flex min-h-[44px] items-center text-sm font-medium text-cyan underline underline-offset-2"
              >
                Start over
              </button>
            </div>
          )}

          {sessionCode && waitingCount > 0 && canReviewWaiting && sessionStatus !== 'waiting' && (
            <Link
              to={`/session/${sessionCode}`}
              className="mt-2 flex min-h-[44px] items-center justify-center rounded-xl border border-amber/40 bg-amber/10 px-3 py-2 text-center text-sm text-amber"
            >
              {waitingCount === 1
                ? 'Someone is waiting with dietary requirements.'
                : `${waitingCount} people are waiting with dietary requirements.`}{' '}
              Review in the lobby
            </Link>
          )}

          {/* Secondary region - metadata that must not compete with the title row */}
          {hasSecondaryContent && (
            <div
              data-testid="nav-header-secondary"
              className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-line/60 pt-2"
            >
              {showConnectionStatus && (
                <span
                  role="status"
                  className={`flex items-center gap-1.5 text-xs ${connectionStatus.text}`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${connectionStatus.dot}`}
                    aria-hidden="true"
                  />
                  {connectionStatus.label}
                </span>
              )}

              {sessionCode && (
                // 44px tap target without growing the row: the button overhangs the pill.
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="-my-3 inline-flex min-h-[44px] items-center"
                  aria-label="Copy session code"
                  title="Copy session code"
                >
                  <span
                    className={`inline-flex items-center px-2 py-0.5 border rounded-full transition-colors ${
                      copied ? 'bg-lime/10 border-lime/30' : 'bg-cyan/10 border-cyan/30'
                    }`}
                  >
                    <span
                      className={`text-xs font-mono font-medium tracking-wider ${copied ? 'text-lime' : 'text-cyan'}`}
                    >
                      {sessionCode}
                    </span>
                  </span>
                </button>
              )}

              {showSubtitle && <p className="text-xs text-muted">{subtitle}</p>}

              {showExpiry && expiresAt && (
                <p className="text-xs text-muted">{expiryLabel(expiresAt)}</p>
              )}

              {progress && (
                <div
                  className="flex items-center gap-2"
                  role="progressbar"
                  aria-label="Deck progress"
                  aria-valuemin={1}
                  aria-valuemax={progress.total}
                  aria-valuenow={progress.current}
                >
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
