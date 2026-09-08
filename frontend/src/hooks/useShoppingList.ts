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
  /** Bumped per change, so a read begun before it cannot overwrite its answer. */
  const changes = useRef(0);

  const show = useCallback((fresh: ShoppingList) => {
    onScreen.current = fresh;
    setList(fresh);
    setError('');
  }, []);

  useEffect(() => {
    if (!listId) return;
    let active = true;
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

    const read = async () => {
      if (reading) return;
      reading = true;
      const at = changes.current;
      try {
        const fresh = await getShoppingList(listId);
        // A Claim made while this read was in flight is newer than this read.
        if (active && at === changes.current) {
          pendingSince =
            fresh.pricingStatus === 'pending' ? (pendingSince ?? Date.now()) : undefined;
          show(fresh);
        }
      } catch (err: unknown) {
        // A definitive expiry removes stale actions; transient failures retain
        // the recipe. An older read must not erase a successful newer Claim.
        if (active && at === changes.current && isMissingList(err)) {
          onScreen.current = null;
          setList(null);
          clearInterval(ticker);
        }
        if (
          active &&
          at === changes.current &&
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
      active = false;
      clearInterval(ticker);
    };
  }, [listId, livePollMs, show]);

  const applyChange = useCallback(
    async (action: () => Promise<ShoppingList>) => {
      changes.current += 1;
      try {
        show(await action());
      } catch (err: unknown) {
        if (isMissingList(err)) {
          onScreen.current = null;
          setList(null);
        }
        setError(err instanceof Error ? err.message : 'That did not go through. Try again.');
      }
    },
    [show]
  );

  return { list, error, applyChange };
}
