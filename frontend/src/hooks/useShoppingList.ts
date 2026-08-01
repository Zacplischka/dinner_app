import { useEffect, useState } from 'react';
import type { ShoppingList } from '@dinder/shared/types';
import { getShoppingList } from '../services/apiClient';

/**
 * One read of a Shopping List from its own URL — the whole capability, shared
 * by the list page and the cook view (#265). Neither a Session nor a display
 * name is asked for anywhere in it.
 *
 * One read, no polling and no retry: the backend holds the request while a
 * fresh list is still being priced, and an expired list is an error, not a
 * thing to wait for.
 */
export function useShoppingList(listId: string | undefined): {
  list: ShoppingList | null;
  error: string;
} {
  const [list, setList] = useState<ShoppingList | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!listId) return;
    let active = true;
    getShoppingList(listId)
      .then((loaded) => active && setList(loaded))
      .catch(
        (err: unknown) =>
          active &&
          setError(err instanceof Error ? err.message : 'This shopping list could not be loaded.')
      );
    return () => {
      active = false;
    };
  }, [listId]);

  return { list, error };
}
