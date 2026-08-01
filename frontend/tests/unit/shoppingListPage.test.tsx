// The Shopping List page (#262): four line states, a headline that is the list
// total over in-tally lines, Staples out of every count, and every Woolworths
// link through the counting redirect.
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShoppingList, ShoppingListLine } from '@dinder/shared/types';

const serviceMocks = vi.hoisted(() => ({ getShoppingList: vi.fn() }));

vi.mock('../../src/services/apiClient', async () => {
  const actual = await vi.importActual<typeof import('../../src/services/apiClient')>(
    '../../src/services/apiClient'
  );
  return { ...actual, getShoppingList: serviceMocks.getShoppingList };
});

import ShoppingListPage from '../../src/pages/ShoppingListPage';

const tomatoes = { stockcode: 12345, name: 'Woolworths Diced Tomatoes', packageSize: '400g' };
const beef = { stockcode: 777, name: 'Beef Chuck Steak', packageSize: 'per 1kg' };

const lines: ShoppingListLine[] = [
  {
    id: '0',
    text: '250 g canned tomatoes',
    staple: false,
    state: 'priced',
    needs: { amount: 250, unit: 'g' },
    packs: 1,
    priceCents: 140,
    product: tomatoes,
  },
  {
    id: '1',
    text: '600 g beef chuck',
    staple: false,
    state: 'estimated',
    needs: { amount: 600, unit: 'g' },
    priceCents: 774,
    product: beef,
  },
  {
    id: '2',
    text: '1 bunch coriander',
    staple: false,
    state: 'unpriced_matched',
    product: { stockcode: 999, name: 'Coriander Bunch' },
  },
  {
    id: '3',
    text: '1 tbsp yuzu kosho',
    staple: false,
    state: 'unmatched',
    searchTerm: 'yuzu kosho',
  },
  { id: '4', text: '2 tsp salt', staple: true, state: 'unmatched', searchTerm: 'salt' },
];

const list: ShoppingList = {
  listId: 'list-1',
  recipeName: 'Beef Rendang',
  headcount: 4,
  servings: 2,
  mintedAt: '2026-08-01T10:00:00.000Z',
  steps: ['Boil the pasta.'],
  lines,
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/list/list-1']}>
      <Routes>
        <Route path="/list/:listId" element={<ShoppingListPage />} />
      </Routes>
    </MemoryRouter>
  );
}

const lineFor = (text: string) => screen.getByText(text).closest('li')!;

describe('ShoppingListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceMocks.getShoppingList.mockResolvedValue(list);
  });

  it('says what the list was scaled to', async () => {
    renderPage();
    expect(await screen.findByText('SCALED FOR 4')).toBeInTheDocument();
  });

  // A source that never said how many it serves leaves the recipe's own
  // amounts, and the header must not claim a scale that never happened.
  it('claims no scale when the source never said how many it serves', async () => {
    serviceMocks.getShoppingList.mockResolvedValue({ ...list, servings: undefined });
    renderPage();

    expect(await screen.findByText('RECIPE AMOUNTS, AS WRITTEN')).toBeInTheDocument();
    expect(screen.queryByText(/SCALED FOR/)).not.toBeInTheDocument();
  });

  it('names the day the list goes, not a vague seven days', async () => {
    renderPage();
    // Minted 1 Aug 2026, so it is gone on the 8th.
    expect(await screen.findByText(/yours until Sat, 8 Aug/i)).toBeInTheDocument();
  });

  it('headlines the list total, ≈-prefixed because an Estimated line is in it', async () => {
    renderPage();
    // $1.40 + $7.74, in-tally only; the Staple and the two unpriced lines are out.
    expect(await screen.findByText('≈ $9.14')).toBeInTheDocument();
    expect(screen.getByText('+ 2 unpriced items')).toBeInTheDocument();
  });

  it('renders a Priced line as needs, packs, and price', async () => {
    renderPage();
    await screen.findByText('250 g canned tomatoes');

    const line = lineFor('250 g canned tomatoes');
    expect(line).toHaveAttribute('data-line-state', 'priced');
    expect(line.textContent).toContain('needs 250g · buy 1 × 400g');
    expect(line.textContent).toContain('$1.40');
  });

  it('marks an Estimated line as an estimate', async () => {
    renderPage();
    await screen.findByText('600 g beef chuck');

    const line = lineFor('600 g beef chuck');
    expect(line).toHaveAttribute('data-line-state', 'estimated');
    expect(line.textContent).toContain('≈ $7.74 (est.)');
  });

  it('shows an Unpriced-matched line as its product with no price', async () => {
    renderPage();
    await screen.findByText('1 bunch coriander');

    const line = lineFor('1 bunch coriander');
    expect(line).toHaveAttribute('data-line-state', 'unpriced_matched');
    expect(line.textContent).toContain('unpriced');
    expect(line.textContent).not.toContain('$');
  });

  it('gives an Unmatched line its recipe text and a Woolworths search', async () => {
    renderPage();
    await screen.findByText('1 tbsp yuzu kosho');

    const line = lineFor('1 tbsp yuzu kosho');
    expect(line).toHaveAttribute('data-line-state', 'unmatched');
    expect(line.querySelector('a')).toHaveTextContent('Search Woolworths');
  });

  it('shows Staples apart, counted by nothing', async () => {
    renderPage();
    await screen.findByText('2 tsp salt');

    expect(lineFor('2 tsp salt')).toHaveAttribute('data-staple', 'true');
    expect(screen.getByText('From your pantry')).toBeInTheDocument();
    expect(screen.getByText(/nothing here counts toward the total/i)).toBeInTheDocument();
  });

  it('routes every Woolworths link through the counting redirect', async () => {
    renderPage();
    await screen.findByText('250 g canned tomatoes');

    const hrefs = [...document.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '');
    expect(hrefs.length).toBe(5);
    for (const href of hrefs) {
      expect(href).toContain('/redirect?retailer=woolworths');
      expect(href).not.toContain('woolworths.com.au');
    }
    expect(hrefs[0]).toContain('stockcode=12345');
    expect(hrefs[3]).toContain('q=yuzu%20kosho');
  });

  it('names Woolworths as the source of the prices', async () => {
    renderPage();
    expect(await screen.findByText(/Prices from Woolworths/i)).toBeInTheDocument();
  });

  it('waits while a fresh list is still being priced', () => {
    serviceMocks.getShoppingList.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText(/Pricing your list at Woolworths/i)).toBeInTheDocument();
  });

  it('says so when the list has expired', async () => {
    serviceMocks.getShoppingList.mockRejectedValue(
      new Error('This shopping list has expired or does not exist')
    );
    renderPage();

    await waitFor(() =>
      expect(screen.getByText(/has expired or does not exist/i)).toBeInTheDocument()
    );
  });

  it('asks for no display name and no Session — the URL is the capability', async () => {
    renderPage();
    await screen.findByText('250 g canned tomatoes');

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(serviceMocks.getShoppingList).toHaveBeenCalledWith('list-1');
  });
});
