// The cook view (#265): the snapshotted method on the Shopping List's own URL,
// full method on one screen, tap-to-dim rows, the screen held awake, and one
// end-of-method credit that doubles as the degrade path when steps are empty.
import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShoppingList } from '@dinder/shared/types';

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

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/list/list-1/cook']}>
      <Routes>
        <Route path="/list/:listId/cook" element={<CookViewPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('CookViewPage', () => {
  let wakeLock: ReturnType<typeof mockWakeLock>;

  beforeEach(() => {
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

  it('dims a step on tap and restores it on the next tap', async () => {
    renderPage();
    const row = (await screen.findByText(steps[1])).closest('button')!;

    fireEvent.click(row);
    expect(row).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(row);
    expect(row).toHaveAttribute('aria-pressed', 'false');
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
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
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
