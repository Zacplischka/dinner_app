// A Shopping List read from its own URL (#265): one read that needs no retry,
// an optional live channel past it (#263), and a Claim path that has to agree
// with the reader about which answer is newer.
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShoppingList } from '@dinder/shared/types';

const mocks = vi.hoisted(() => ({ getShoppingList: vi.fn() }));

vi.mock('../../src/services/apiClient', async () => {
  const actual = await vi.importActual<typeof import('../../src/services/apiClient')>(
    '../../src/services/apiClient'
  );
  return { ...actual, getShoppingList: mocks.getShoppingList };
});

import { useShoppingList } from '../../src/hooks/useShoppingList';

const list: ShoppingList = {
  listId: 'list-1',
  recipeName: 'Beef Rendang',
  headcount: 4,
  mintedAt: '2026-08-01T10:00:00.000Z',
  steps: ['Boil the pasta.'],
  lines: [
    { id: '0', text: '250 g canned tomatoes', staple: false, state: 'unmatched' },
    { id: '1', text: '2 tsp salt', staple: true, state: 'unmatched' },
  ],
};

const withClaims = (claims: Record<string, string>): ShoppingList => ({
  ...list,
  lines: list.lines.map((line) =>
    claims[line.id] ? { ...line, claimedBy: claims[line.id] } : line
  ),
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe('useShoppingList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getShoppingList.mockResolvedValue(list);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads the list at its id once and shows it', async () => {
    const { result } = renderHook(() => useShoppingList('list-1'));
    expect(result.current.list).toBeNull();

    await waitFor(() => expect(result.current.list).toEqual(list));
    expect(result.current.error).toBe('');
    expect(mocks.getShoppingList).toHaveBeenCalledTimes(1);
    expect(mocks.getShoppingList).toHaveBeenCalledWith('list-1');
  });

  it('reads nothing without a list id', () => {
    const { result } = renderHook(() => useShoppingList(undefined));

    expect(mocks.getShoppingList).not.toHaveBeenCalled();
    expect(result.current.list).toBeNull();
  });

  it('says so when the first read fails — an expired list is an error, not a wait', async () => {
    mocks.getShoppingList.mockRejectedValue(
      new Error('This shopping list has expired or does not exist')
    );
    const { result } = renderHook(() => useShoppingList('list-1'));

    await waitFor(() =>
      expect(result.current.error).toBe('This shopping list has expired or does not exist')
    );
    expect(result.current.list).toBeNull();
  });

  it('keeps the list live on the poll, and keeps shopping from it when a tick fails', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useShoppingList('list-1', 5_000));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(result.current.list).toEqual(list);

    mocks.getShoppingList.mockResolvedValue(withClaims({ '0': 'Bob' }));
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(result.current.list).toEqual(withClaims({ '0': 'Bob' }));

    mocks.getShoppingList.mockRejectedValue(new Error('Woolworths is down'));
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(result.current.list).toEqual(withClaims({ '0': 'Bob' }));
    expect(result.current.error).toBe('');
  });

  it('does not stack a tick on a read that is still out', async () => {
    vi.useFakeTimers();
    mocks.getShoppingList.mockReturnValue(new Promise(() => {}));
    renderHook(() => useShoppingList('list-1', 5_000));

    await act(() => vi.advanceTimersByTimeAsync(15_000));
    expect(mocks.getShoppingList).toHaveBeenCalledTimes(1);
  });

  it('stops polling once the view has gone', async () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useShoppingList('list-1', 5_000));
    await act(() => vi.advanceTimersByTimeAsync(0));

    unmount();
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(mocks.getShoppingList).toHaveBeenCalledTimes(1);
  });

  it('installs the list a Claim answers with', async () => {
    const { result } = renderHook(() => useShoppingList('list-1'));
    await waitFor(() => expect(result.current.list).toEqual(list));

    await act(() => result.current.applyChange(async () => withClaims({ '0': 'Alice' })));

    expect(result.current.list).toEqual(withClaims({ '0': 'Alice' }));
    expect(result.current.error).toBe('');
  });

  it('reports a Claim that did not go through and keeps the list on screen', async () => {
    const { result } = renderHook(() => useShoppingList('list-1'));
    await waitFor(() => expect(result.current.list).toEqual(list));

    await act(() =>
      result.current.applyChange(() => Promise.reject(new Error('Line already claimed')))
    );

    expect(result.current.error).toBe('Line already claimed');
    expect(result.current.list).toEqual(list);
  });

  // The reason applyChange lives in the hook: a read begun before the Claim
  // answers after it, and must not put the pre-Claim list back on screen.
  it('lets a Claim win over a read that was already in flight', async () => {
    const read = deferred<ShoppingList>();
    mocks.getShoppingList.mockReturnValue(read.promise);
    const { result } = renderHook(() => useShoppingList('list-1'));

    await act(() => result.current.applyChange(async () => withClaims({ '0': 'Alice' })));
    expect(result.current.list).toEqual(withClaims({ '0': 'Alice' }));

    await act(async () => {
      read.resolve(list);
      await read.promise;
    });
    expect(result.current.list).toEqual(withClaims({ '0': 'Alice' }));
  });
});
