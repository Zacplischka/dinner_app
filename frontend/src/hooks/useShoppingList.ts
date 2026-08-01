import { useCallback, useEffect, useRef, useState } from 'react';
import type { ShoppingList } from '@dinder/shared/types';
import { getShoppingList } from '../services/apiClient';

/**
 * A Shopping List read from its own URL — the whole capability, shared by the
 * list page and the cook view (#265). Neither a Session nor a display name is
 * asked for anywhere in it.
 *
 * The first read needs no retry: the backend holds the request while a fresh
 * list is still being priced, and an expired list is an error, not a thing to
 * wait for. Past that, `livePollMs` is the list's live-update channel (#263) —
 * the cook view leaves it off, because a snapshotted method never changes.
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
  /** A read of ours is out: a tick that stacks on it buys nothing. */
  const reading = useRef(false);
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
    onScreen.current = null;

    const read = async () => {
      if (reading.current) return;
      reading.current = true;
      const at = changes.current;
      try {
        const fresh = await getShoppingList(listId);
        // A Claim made while this read was in flight is newer than this read.
        if (active && at === changes.current) show(fresh);
      } catch (err: unknown) {
        // A tick that fails over a list already on screen changes nothing —
        // the Shopper keeps shopping from what they have.
        if (active && !onScreen.current) {
          setError(err instanceof Error ? err.message : 'This shopping list could not be loaded.');
        }
      } finally {
        reading.current = false;
      }
    };

    void read();
    if (!livePollMs) {
      return () => {
        active = false;
      };
    }
    const ticker = setInterval(() => void read(), livePollMs);
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
