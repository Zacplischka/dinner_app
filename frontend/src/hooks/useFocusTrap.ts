import { useEffect, useRef, type RefObject } from 'react';

// ponytail: the usual tabbable set minus contenteditable, iframe, summary and
// visibility checks - neither dialog renders those. Extend the list if one does.
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The minimum a modal dialog owes the keyboard: Tab and Shift+Tab cycle
 * inside `ref` instead of walking off into the page behind it, and whatever
 * had focus before the dialog opened gets it back once `active` drops.
 * `autoFocus` on the dialog's primary still decides the first stop. Used by
 * the leave confirmation and the Full House takeover.
 */
export function useFocusTrap(ref: RefObject<HTMLElement>, active: boolean): void {
  // Captured during render, not in an effect: React honours `autoFocus` in
  // the commit, so by effect time the dialog's own button already has focus.
  const opener = useRef<HTMLElement | null>(null);
  if (active && !opener.current) opener.current = document.activeElement as HTMLElement | null;

  useEffect(() => {
    const dialog = ref.current;
    if (!active || !dialog) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const stops = dialog.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (stops.length === 0) return;
      const first = stops[0];
      const last = stops[stops.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    dialog.addEventListener('keydown', onKeyDown);
    return () => dialog.removeEventListener('keydown', onKeyDown);
  }, [ref, active]);

  // Restore on the close transition rather than in the listener's cleanup:
  // StrictMode's dev-only mount/unmount/mount would otherwise hand focus back
  // to the opener the instant the dialog opened, then forget the opener.
  useEffect(() => {
    if (active || !opener.current) return;
    opener.current.focus();
    opener.current = null;
  }, [active]);
}
