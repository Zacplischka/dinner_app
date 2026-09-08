// The cook view (#265): the snapshotted method on the Shopping List's own URL,
// full method on one screen, tap-to-dim rows, the screen held awake, and one
// end-of-method credit that doubles as the degrade path when steps are empty.
import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShoppingList } from '@dinder/shared/types';
import { Capacitor } from '@capacitor/core';
import { nativeStateStorage } from '../../src/services/nativeStorage';
vi.mock('@capacitor/app', () => ({
  App: { addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }) },
}));
vi.mock('@capacitor-community/keep-awake', () => ({
  KeepAwake: {
    keepAwake: vi.fn().mockResolvedValue(undefined),
    allowSleep: vi.fn().mockResolvedValue(undefined),
  },
}));

const serviceMocks = vi.hoisted(() => ({ getShoppingList: vi.fn() }));

vi.mock('../../src/services/apiClient', async () => {
  const actual = await vi.importActual<typeof import('../../src/services/apiClient')>(
    '../../src/services/apiClient'
  );
  return { ...actual, getShoppingList: serviceMocks.getShoppingList };
});

import CookViewPage from '../../src/pages/CookViewPage';

const steps = [
  'Toast the spice paste until it darkens.',
  'Add the beef and brown it on every side.',
  'Simmer uncovered for three hours.',
];

const list: ShoppingList = {
  listId: 'list-1',
  recipeName: 'Beef Rendang',
  headcount: 4,
  servings: 2,
  mintedAt: '2026-08-01T10:00:00.000Z',
  steps,
  sourceName: 'Serious Eats',
  sourceUrl: 'https://example.com/rendang',
  lines: [],
};

/** The mocked wake-lock boundary: what was asked for, and what was released. */
function mockWakeLock() {
  const sentinel = {
    released: false,
    release: vi.fn().mockImplementation(() => {
      sentinel.released = true;
      return Promise.resolve();
    }),
  };
  const request = vi.fn().mockImplementation(() => {
    sentinel.released = false;
    return Promise.resolve(sentinel);
  });
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
  return { request, sentinel, release: sentinel.release };
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
  fireEvent(document, new Event('visibilitychange'));
}

function renderPage(listId = 'list-1') {
  return render(
    <MemoryRouter initialEntries={[`/list/${listId}/cook`]}>
      <Routes>
        <Route path="/list/:listId/cook" element={<CookViewPage />} />
        <Route path="/list/:listId" element={<Link to={`/list/${listId}/cook`}>Cook</Link>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('CookViewPage', () => {
  it('restores native cooking progress from one bounded list record after reopening', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    const saved = new Map<string, string>();
    vi.spyOn(nativeStateStorage, 'getItem').mockImplementation(
      async (key) => saved.get(key) ?? null
    );
    vi.spyOn(nativeStateStorage, 'setItem').mockImplementation(async (key, value) => {
      saved.set(key, value);
    });
    serviceMocks.getShoppingList.mockResolvedValue({ ...list, mintedAt: new Date().toISOString() });
    const first = renderPage();
    const step = await screen.findByRole('button', { name: /Toast the spice paste/ });
    fireEvent.click(step);
    await waitFor(() => expect(saved.get('heykeen.cook-progress')).toContain('"steps":[0]'));
    first.unmount();
    renderPage();
    expect(await screen.findByRole('button', { name: /Toast the spice paste/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect([...saved.keys()]).toEqual(['heykeen.cook-progress']);
  });
  let wakeLock: ReturnType<typeof mockWakeLock>;

  beforeEach(() => {
    sessionStorage.clear();
    serviceMocks.getShoppingList.mockReset().mockResolvedValue(list);
    wakeLock = mockWakeLock();
  });

  it('opens from the list URL alone — no Session, no Participant check, no name', async () => {
    renderPage();
    await screen.findByText(steps[0]);

    expect(serviceMocks.getShoppingList).toHaveBeenCalledWith('list-1');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('renders on first visit under StrictMode — no poll exists to paper over a lost read (#303)', async () => {
    // Dev double-mount: mount 1's read is cancelled, and a guard that outlives
    // the mount must not swallow mount 2's read — there is no third.
    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/list/list-1/cook']}>
          <Routes>
            <Route path="/list/:listId/cook" element={<CookViewPage />} />
          </Routes>
        </MemoryRouter>
      </StrictMode>
    );

    expect(await screen.findByText(steps[0])).toBeInTheDocument();
  });

  it('renders the whole method on one screen', async () => {
    renderPage();
    for (const step of steps) expect(await screen.findByText(step)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { pressed: false })).toHaveLength(steps.length);
  });

  it.each(['pending', 'failed'] as const)(
    'keeps every step usable while pricing is %s',
    async (pricingStatus) => {
      serviceMocks.getShoppingList.mockResolvedValue({ ...list, pricingStatus });
      renderPage();
      const step = (await screen.findByText(steps[0])).closest('button')!;

      for (const text of steps) expect(screen.getByText(text)).toBeInTheDocument();
      fireEvent.click(step);
      expect(step).toHaveAttribute('aria-pressed', 'true');
      if (pricingStatus === 'pending') {
        expect(screen.getByRole('group', { name: 'Grocery run' })).toHaveStyle({ height: '96px' });
      } else {
        expect(screen.queryByRole('group', { name: 'Grocery run' })).not.toBeInTheDocument();
        expect(screen.getByText('Prices are unavailable')).toBeInTheDocument();
      }
    }
  );

  it('dims a step on tap and restores it on the next tap', async () => {
    renderPage();
    const row = (await screen.findByText(steps[1])).closest('button')!;

    fireEvent.click(row);
    expect(row).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(row);
    expect(row).toHaveAttribute('aria-pressed', 'false');
  });

  it('remembers progress through ingredient lookup and a fresh mount, only for that list', async () => {
    let view = renderPage();
    fireEvent.click((await screen.findByText(steps[1])).closest('button')!);
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    fireEvent.click(screen.getByRole('link', { name: 'Cook' }));
    expect((await screen.findByText(steps[1])).closest('button')).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    view.unmount();
    view = renderPage();
    expect((await screen.findByText(steps[1])).closest('button')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    view.unmount();

    serviceMocks.getShoppingList.mockResolvedValue({ ...list, listId: 'list-2' });
    renderPage('list-2');
    expect((await screen.findByText(steps[1])).closest('button')).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('keeps tab-local progress on navigation when storage is denied', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    serviceMocks.getShoppingList.mockResolvedValue({ ...list, listId: 'storage-denied' });
    renderPage('storage-denied');
    fireEvent.click((await screen.findByText(steps[0])).closest('button')!);
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    fireEvent.click(screen.getByRole('link', { name: 'Cook' }));
    const step = (await screen.findByText(steps[0])).closest('button')!;
    expect(step).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(step);
    expect(step).toHaveAttribute('aria-pressed', 'false');
  });

  it('holds the screen awake while the view is open and lets go on leaving', async () => {
    const { request, release } = wakeLock;
    const view = renderPage();
    await screen.findByText(steps[0]);

    await waitFor(() => expect(request).toHaveBeenCalledWith('screen'));
    expect(release).not.toHaveBeenCalled();

    view.unmount();
    await waitFor(() => expect(release).toHaveBeenCalled());
  });

  it('takes the lock again when the tab comes back — the browser drops it on hide', async () => {
    const { request, sentinel } = wakeLock;
    renderPage();
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));

    // What a real browser does when the cook checks a message: drops the lock.
    sentinel.released = true;
    setVisibility('hidden');
    expect(request).toHaveBeenCalledTimes(1);

    setVisibility('visible');
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  });

  it('survives a browser with no wake lock at all', async () => {
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: undefined });
    renderPage();
    expect(await screen.findByText(steps[0])).toBeInTheDocument();
  });

  it('closes the method with a credit line linking the source Recipe', async () => {
    renderPage();
    // The credit names the ORIGINATING site, hyperlinked — a licence
    // obligation of the recipe supply (#288), not a style choice. Spoonacular
    // itself is owed nothing on the paid tier.
    const credit = await screen.findByRole('link', { name: /Serious Eats/ });
    expect(credit).toHaveAttribute('href', 'https://example.com/rendang');
    expect(screen.getByText(steps[2])).toBeInTheDocument();
    expect(screen.getByText(/Method from/)).toBeInTheDocument();
  });

  it('degrades a method-less Recipe to the source link alone', async () => {
    serviceMocks.getShoppingList.mockResolvedValue({ ...list, steps: [] });
    renderPage();

    // The credit line replaces the method, and still carries the source link.
    const credit = await screen.findByRole('link', { name: /Serious Eats/ });
    expect(credit).toHaveAttribute('href', 'https://example.com/rendang');
    expect(screen.queryAllByRole('button', { pressed: false })).toHaveLength(0);
    expect(screen.getByText(/The full method is at/)).toBeInTheDocument();
    expect(screen.queryByText(/Method from/)).not.toBeInTheDocument();
  });

  it('renders no credit at all for an Owned Recipe, in either path', async () => {
    // Dinder authored it, so there is no source to name and the absence is
    // correct (ADR 0012). Only the explicit provenance buys that silence — an
    // absent source name alone still reads as Spoonacular.
    const owned = {
      ...list,
      provenance: 'owned' as const,
      sourceName: undefined,
      sourceUrl: undefined,
    };
    serviceMocks.getShoppingList.mockResolvedValue(owned);
    const view = renderPage();

    await screen.findByText(steps[0]);
    expect(screen.queryByText(/Method from/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Spoonacular/)).not.toBeInTheDocument();

    // The degrade path is silent too — it is a credit line, not a method.
    view.unmount();
    serviceMocks.getShoppingList.mockResolvedValue({ ...owned, steps: [] });
    renderPage();

    await waitFor(() => expect(serviceMocks.getShoppingList).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/The full method is at/)).not.toBeInTheDocument();
  });

  it('credits a source that left no link without pretending it is one', async () => {
    serviceMocks.getShoppingList.mockResolvedValue({ ...list, sourceUrl: undefined });
    renderPage();

    await screen.findByText(steps[0]);
    expect(screen.queryByRole('link', { name: 'Serious Eats' })).not.toBeInTheDocument();
    expect(screen.getByText(/Serious Eats/)).toBeInTheDocument();
  });

  it('dies with the list — an expired URL says so and holds nothing awake', async () => {
    serviceMocks.getShoppingList.mockRejectedValue(
      new Error('This shopping list has expired or does not exist')
    );
    renderPage();

    expect(await screen.findByText(/has expired or does not exist/i)).toBeInTheDocument();
    expect(wakeLock.request).not.toHaveBeenCalled();
  });
});
