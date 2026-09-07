import { useCallback, useEffect, useRef, useState } from 'react';
import type { ShoppingList } from '@dinder/shared/types';
import { getShoppingList } from '../services/apiClient';

/**
 * A Shopping List read from its own URL — the whole capability, shared by the
 * list page and the cook view (#265). Neither a Session nor a display name is
 * asked for anywhere in it.
 *
 * Legacy servers hold the first read; current servers return the Recipe while
 * pricing runs. Cook View polls only until pricing settles.
 * `livePollMs` keeps Claims current on the list page; Cook View stops reading
 * once its prices settle because the snapshotted method never changes.
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
        // A tick that fails over a list already on screen changes nothing —
        // the Shopper keeps shopping from what they have.
        if (
          active &&
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
      if (livePollMs || onScreen.current?.pricingStatus === 'pending') void read();
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
        setError(err instanceof Error ? err.message : 'That did not go through. Try again.');
      }
    },
    [show]
  );

  return { list, error, applyChange };
}
