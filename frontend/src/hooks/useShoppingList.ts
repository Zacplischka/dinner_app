import { useCallback, useEffect, useRef, useState } from 'react';
import type { ShoppingList } from '@dinder/shared/types';
import { ApiClientError, getShoppingList } from '../services/apiClient';

const isMissingList = (error: unknown) => error instanceof ApiClientError && error.status === 404;

/**
 * A Shopping List read from its own URL — the whole capability, shared by the
 * list page and the cook view (#265). Neither a Session nor a display name is
 * asked for anywhere in it.
 *
 * Legacy servers hold the first read; current servers return the Recipe while
 * pricing runs. Cook View polls only until pricing settles.
 * `livePollMs` keeps Claims current on the list page; Cook View stops reading
 * once its prices settle, checking again at its seven-day expiry.
 */
export function useShoppingList(
  listId: string | undefined,
  livePollMs?: number
): {
  list: ShoppingList | null;
  error: string;
  /**
   * Runs one Claim or release and installs the list it answers with. It lives
   * here because it races the reader above, and the two have to agree on which
   * answer is the newer one.
   */
  applyChange: (action: () => Promise<ShoppingList>) => Promise<void>;
} {
  const [list, setList] = useState<ShoppingList | null>(null);
  const [error, setError] = useState('');

  /** The list on screen, readable from inside the ticker. */
  const onScreen = useRef<ShoppingList | null>(null);
  // Each mounted list owns its queue. A previous URL can finish its request,
  // but cannot publish into this list or dispatch its queued writes.
  const scope = useRef({
    listId: undefined as string | undefined,
    active: false,
    pending: 0,
    changes: 0,
    queue: Promise.resolve(),
  });

  const show = useCallback((fresh: ShoppingList) => {
    onScreen.current = fresh;
    setList(fresh);
    setError('');
  }, []);

  useEffect(() => {
    const current = { listId, active: true, pending: 0, changes: 0, queue: Promise.resolve() };
    scope.current = current;
    // A read of ours is out: a tick that stacks on it buys nothing. Scoped to
    // this effect run, not a ref — a guard that outlives the mount would eat
    // the remount's only read under StrictMode's dev double-mount (#303),
    // while a cancelled mount's in-flight read is already discarded by
    // `active`, so letting the fresh run read past it is safe.
    let reading = false;
    let pendingSince: number | undefined;
    onScreen.current = null;
    setList(null);
    setError('');
    if (!listId) {
      current.active = false;
      return;
    }

    const read = async () => {
      if (reading || current.pending || !current.active) return;
      reading = true;
      const at = current.changes;
      try {
        const fresh = await getShoppingList(listId);
        // A Claim made while this read was in flight is newer than this read.
        if (current.active && at === current.changes) {
          pendingSince =
            fresh.pricingStatus === 'pending' ? (pendingSince ?? Date.now()) : undefined;
          show(fresh);
        }
      } catch (err: unknown) {
        // A definitive expiry removes stale actions; transient failures retain
        // the recipe. An older read must not erase a successful newer Claim.
        if (current.active && at === current.changes && isMissingList(err)) {
          onScreen.current = null;
          setList(null);
          clearInterval(ticker);
        }
        if (
          current.active &&
          at === current.changes &&
          (!onScreen.current ||
            (onScreen.current.pricingStatus === 'pending' &&
              pendingSince !== undefined &&
              Date.now() - pendingSince >= 120_000))
        ) {
          setError(
            onScreen.current
              ? 'Prices could not be refreshed. Your recipe is still available; reload to check again.'
              : err instanceof Error
                ? err.message
                : 'This shopping list could not be loaded.'
          );
        }
        if (current.active && at === current.changes && isMissingList(err)) current.active = false;
      } finally {
        reading = false;
      }
    };

    void read();
    const ticker = setInterval(() => {
      const current = onScreen.current;
      if (
        livePollMs ||
        current?.pricingStatus === 'pending' ||
        (current && Date.now() - Date.parse(current.mintedAt) >= 7 * 24 * 60 * 60 * 1000)
      )
        void read();
    }, livePollMs ?? 2000);
    return () => {
      current.active = false;
      clearInterval(ticker);
    };
  }, [listId, livePollMs, show]);

  const applyChange = useCallback(
    (action: () => Promise<ShoppingList>) => {
      const current = scope.current;
      if (!current.active || current.listId !== listId) return Promise.resolve();
      // Serialize requests, not just their displayed answers: otherwise an old
      // request can still commit after the newer intent on the server.
      current.pending += 1;
      current.changes += 1;
      current.queue = current.queue.then(async () => {
        try {
          if (!current.active) return;
          const fresh = await action();
          if (current.active) show(fresh);
        } catch (err: unknown) {
          if (!current.active) return;
          if (isMissingList(err)) {
            current.active = false;
            onScreen.current = null;
            setList(null);
          }
          setError(err instanceof Error ? err.message : 'That did not go through. Try again.');
        } finally {
          current.pending -= 1;
          current.changes += 1;
        }
      });
      return current.queue;
    },
    [listId, show]
  );

  return { list, error, applyChange };
}
