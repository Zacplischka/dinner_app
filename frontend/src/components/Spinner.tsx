// The one loading spinner. Decoration only (`aria-hidden`): a label on the
// spinner itself lands in the name of whatever contains it — inside a button
// that reads "Leaving Leaving...".
//
// The words go to LoadingAnnouncer instead, a single live region mounted for
// the app's whole life. A `role="status"` that is inserted with its text
// already in it is not reliably announced (iOS VoiceOver commonly says
// nothing), and every wait here mounts exactly that way — spinner, caption and
// region all at once. The region has to be in the DOM first and the text has
// to arrive after, so the spinner publishes and the region already exists.

import { useEffect } from 'react';
import { create } from 'zustand';

const useWaitStore = create<{ label: string }>(() => ({ label: '' }));

const SIZES = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
  xl: 'h-10 w-10',
} as const;

interface SpinnerProps {
  size?: keyof typeof SIZES;
  className?: string;
  /** What this wait is. Usually the words of the caption beside the spinner. */
  label?: string;
}

/**
 * The app's loading live region. Render it once, above the router, so it
 * outlives every spinner below it.
 */
export function LoadingAnnouncer() {
  const label = useWaitStore((state) => state.label);
  return (
    <p role="status" aria-live="polite" className="sr-only">
      {label}
    </p>
  );
}

/**
 * Colour comes from the call site's text colour (`border-current`), so a
 * spinner inside a coral button is coral and one on a dark page is whatever
 * `text-*` its wrapper sets — no colour prop to keep in sync.
 */
export default function Spinner({ size = 'md', className = '', label = '' }: SpinnerProps) {
  // ponytail: one slot, last spinner to mount wins. Two overlapping waits would
  // announce only the newer one; give the store a stack if that ever happens.
  useEffect(() => {
    if (!label) return;
    useWaitStore.setState({ label });
    return () => {
      if (useWaitStore.getState().label === label) useWaitStore.setState({ label: '' });
    };
  }, [label]);

  return (
    <span
      aria-hidden="true"
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${SIZES[size]} ${className}`}
    />
  );
}
