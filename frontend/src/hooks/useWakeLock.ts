import { useEffect } from 'react';

/**
 * Holds the screen awake while `enabled` — the phone must not lock at step four
 * (#265). Released the moment the calling view goes, and re-taken when the tab
 * comes back: the browser drops the lock on every hide, and stepping out to a
 * timer and back is the normal thing to do at a stove.
 *
 * A browser without the API, or one that refuses the lock, just dims — never a
 * broken cook view.
 */
export function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    let sentinel: WakeLockSentinel | null = null;
    let unmounted = false;
    const letGo = (held: WakeLockSentinel) => held.release().catch(() => undefined);

    const acquire = () => {
      if (unmounted || document.visibilityState !== 'visible') return;
      if (sentinel && !sentinel.released) return;
      navigator.wakeLock
        ?.request('screen')
        .then((held) => {
          if (unmounted) void letGo(held);
          else sentinel = held;
        })
        .catch(() => undefined);
    };

    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      unmounted = true;
      document.removeEventListener('visibilitychange', acquire);
      if (sentinel) void letGo(sentinel);
      sentinel = null;
    };
  }, [enabled]);
}
