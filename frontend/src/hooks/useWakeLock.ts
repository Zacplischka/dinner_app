import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { KeepAwake } from '@capacitor-community/keep-awake';

let nativeWakeChanges = Promise.resolve();

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
    if (Capacitor.isNativePlatform()) {
      let unmounted = false;
      const change = (awake: boolean) => {
        nativeWakeChanges = nativeWakeChanges
          .catch(() => undefined)
          .then(() => (awake && !unmounted ? KeepAwake.keepAwake() : KeepAwake.allowSleep()))
          .catch(() => undefined);
      };
      change(true);
      const listener = App.addListener('appStateChange', ({ isActive }) => change(isActive));
      return () => {
        unmounted = true;
        change(false);
        void listener.then((handle) => handle.remove());
      };
    }
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
