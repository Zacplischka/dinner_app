// The Shopping List page (#262, #263): four line states, a headline that is the
// list total over in-tally lines, Staples out of every count, every Woolworths
// link through the counting redirect — and one-tap Claims, a Tally of your own,
// and a coverage count that everyone on the list watches move.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShoppingList, ShoppingListLine } from '@dinder/shared/types';

const serviceMocks = vi.hoisted(() => ({
  getShoppingList: vi.fn(),
  claimShoppingListLine: vi.fn(),
  releaseShoppingListLine: vi.fn(),
  swapShoppingListLine: vi.fn(),
}));

vi.mock('../../src/services/apiClient', async () => {
  const actual = await vi.importActual<typeof import('../../src/services/apiClient')>(
    '../../src/services/apiClient'
  );
  return { ...actual, ...serviceMocks };
});

import ShoppingListPage from '../../src/pages/ShoppingListPage';

const tomatoes = { stockcode: 12345, name: 'Woolworths Diced Tomatoes', packageSize: '400g' };
const beef = { stockcode: 777, name: 'Beef Chuck Steak', packageSize: 'per 1kg' };
/** The runners-up behind line 0 — the swap picker's other two (#264). */
const ardmona = { stockcode: 222, name: 'Ardmona Rich & Thick', packageSize: '400g' };
const mutti = { stockcode: 333, name: 'Mutti Polpa', packageSize: '400g' };

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
    runnersUp: [ardmona, mutti],
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

    // Every anchor on the page, minus the page's own navigation — the guard is
    // that nothing anywhere reaches Woolworths except through the redirect.
    const hrefs = [...document.querySelectorAll('a')]
      .map((a) => a.getAttribute('href') ?? '')
      .filter((href) => href !== '/list/list-1/cook');
    expect(hrefs.length).toBe(5);
    for (const href of hrefs) {
      expect(href).toContain('/redirect?retailer=woolworths');
      expect(href).not.toContain('woolworths.com.au');
    }
    expect(hrefs[0]).toContain('stockcode=12345');
    expect(hrefs[3]).toContain('q=yuzu%20kosho');
  });

  it('offers the cook view on the same list URL', async () => {
    renderPage();
    expect(await screen.findByRole('link', { name: /cook/i })).toHaveAttribute(
      'href',
      '/list/list-1/cook'
    );
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

  it('asks for no Session and no token — the URL is the capability', async () => {
    renderPage();
    await screen.findByText('250 g canned tomatoes');

    // A self-declared name is all a Shopper ever gives, and it is a label on a
    // Claim, not a login: the read carries nothing but the list id (#229).
    expect(serviceMocks.getShoppingList).toHaveBeenCalledWith('list-1');
    expect(screen.getByLabelText('Claiming as')).toHaveValue('');
  });
});

// Claiming (#263). The backend owns the race; what the page owns is the tap,
// the name behind it, the Tally that follows, and keeping every viewer current.
describe('ShoppingListPage claims', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceMocks.getShoppingList.mockResolvedValue(list);
    serviceMocks.claimShoppingListLine.mockResolvedValue(list);
    serviceMocks.releaseShoppingListLine.mockResolvedValue(list);
  });

  // Only the two live-channel tests fake the clock; the rest would rather not
  // wait out an interval that exists for real phones.
  afterEach(() => vi.useRealTimers());

  const withClaims = (claims: Record<string, string>): ShoppingList => ({
    ...list,
    lines: lines.map((line) => (claims[line.id] ? { ...line, claimedBy: claims[line.id] } : line)),
  });

  /** Named, on screen, and ready to tap. The name commits on the way out. */
  async function shopping(as = 'Alice') {
    renderPage();
    await screen.findByText('250 g canned tomatoes');
    const field = screen.getByLabelText('Claiming as');
    fireEvent.change(field, { target: { value: as } });
    fireEvent.blur(field);
  }

  /** A tap, and whatever it set in motion. */
  const tap = async (button: HTMLElement) => act(async () => void fireEvent.click(button));

  /** The first read landing, under fake timers — nothing to wait on but it. */
  const settle = () => act(async () => {});

  /** One turn of the live channel. Generous, so the interval can be retuned. */
  const tick = () => act(async () => void (await vi.advanceTimersByTimeAsync(10_000)));

  const buttonOn = (text: string, name: string) =>
    within(lineFor(text)).getByRole('button', { name });

  it('claims a line in one tap, under the name the Shopper typed', async () => {
    await shopping();

    await tap(buttonOn('250 g canned tomatoes', 'Claim'));

    expect(serviceMocks.claimShoppingListLine).toHaveBeenCalledWith('list-1', '0', 'Alice');
  });

  it('will not claim without a name behind the Claim', async () => {
    renderPage();
    await screen.findByText('250 g canned tomatoes');

    expect(buttonOn('250 g canned tomatoes', 'Claim')).toBeDisabled();
  });

  it('remembers the Shopper, so a second visit does not ask again', async () => {
    localStorage.setItem('dinder.shopperName', 'Dana');

    renderPage();

    expect(await screen.findByLabelText('Claiming as')).toHaveValue('Dana');
  });

  it('shows a line lost to a faster tap as claimed by whoever won it', async () => {
    // The tap answers 200 with somebody else's name — the truth, not an error.
    serviceMocks.claimShoppingListLine.mockResolvedValue(withClaims({ '0': 'Bob' }));
    await shopping();

    await tap(buttonOn('250 g canned tomatoes', 'Claim'));

    expect(await screen.findByText('Claimed by Bob')).toBeInTheDocument();
    expect(buttonOn('250 g canned tomatoes', 'Release')).toBeInTheDocument();
  });

  it('offers to release a Claim that is not yours', async () => {
    serviceMocks.getShoppingList.mockResolvedValue(withClaims({ '0': 'Bob' }));
    await shopping();

    await tap(buttonOn('250 g canned tomatoes', 'Release'));

    expect(serviceMocks.releaseShoppingListLine).toHaveBeenCalledWith('list-1', '0');
  });

  it('leaves a freed line to be taken by its own deliberate tap', async () => {
    serviceMocks.getShoppingList.mockResolvedValue(withClaims({ '0': 'Bob' }));
    serviceMocks.releaseShoppingListLine.mockResolvedValue(list);
    await shopping();

    await tap(buttonOn('250 g canned tomatoes', 'Release'));

    // Releasing did not hand it to Alice: claiming it is a separate act.
    expect(buttonOn('250 g canned tomatoes', 'Claim')).toBeInTheDocument();
    expect(serviceMocks.claimShoppingListLine).not.toHaveBeenCalled();
  });

  it('tallies only your own Priced and Estimated lines, ≈ and all', async () => {
    // Alice holds the $1.40 tin, the $7.74 estimate, one unpriced line, and a
    // Staple; Bob holds the other. The Staple counts toward nothing.
    serviceMocks.getShoppingList.mockResolvedValue(
      withClaims({ '0': 'Alice', '1': 'Alice', '2': 'Alice', '3': 'Bob', '4': 'Alice' })
    );
    await shopping();

    expect(await screen.findByText('≈ $9.14 + 1 unpriced item')).toBeInTheDocument();
  });

  it('keeps a Tally off screen until the Shopper actually holds something', async () => {
    await shopping();

    expect(screen.queryByText('YOUR TALLY')).not.toBeInTheDocument();
  });

  it('conjures no Tally out of a Staple, which counts toward nothing', async () => {
    serviceMocks.getShoppingList.mockResolvedValue(withClaims({ '4': 'Alice' }));

    await shopping();

    // Alice holds the salt and nothing else: a $0.00 Tally is the absurdity
    // #229 dissolved, so there is no Tally at all.
    expect(screen.queryByText('YOUR TALLY')).not.toBeInTheDocument();
  });

  it('counts coverage over non-Staple lines, and says when it is complete', async () => {
    vi.useFakeTimers();
    renderPage();
    await settle();

    // Four non-Staple lines; the Staple is in neither number.
    expect(screen.getByText('0 of 4 claimed')).toBeInTheDocument();
    serviceMocks.getShoppingList.mockResolvedValue(
      withClaims({ '0': 'Alice', '1': 'Alice', '2': 'Bob', '3': 'Bob' })
    );

    await tick();

    expect(screen.getByText('All covered ✓')).toBeInTheDocument();
  });

  it('re-reads the list so a Claim made elsewhere shows up here', async () => {
    vi.useFakeTimers();
    renderPage();
    await settle();
    serviceMocks.getShoppingList.mockResolvedValue(withClaims({ '2': 'Bob' }));

    // Nobody on this phone tapped anything: the live channel is the only way
    // Bob's Claim can arrive.
    await tick();

    expect(screen.getByText('Claimed by Bob')).toBeInTheDocument();
  });

  it('claims a Staple like any other line', async () => {
    await shopping();

    await tap(buttonOn('2 tsp salt', 'Claim'));

    expect(serviceMocks.claimShoppingListLine).toHaveBeenCalledWith('list-1', '4', 'Alice');
  });

  it('keeps the list on screen when a tap does not go through', async () => {
    serviceMocks.claimShoppingListLine.mockRejectedValue(new Error('Network is down'));
    await shopping();

    await tap(buttonOn('250 g canned tomatoes', 'Claim'));

    expect(await screen.findByText('Network is down')).toBeInTheDocument();
    expect(screen.getByText('250 g canned tomatoes')).toBeInTheDocument();
  });
});

// The top-5 swap picker (#264): the two-tap cure for a confidently-wrong
// Product Match. Open the picker, pick the right product — no new search, and
// the correction lands on the shared list where everyone else sees it.
describe('ShoppingListPage swap picker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceMocks.getShoppingList.mockResolvedValue(list);
    serviceMocks.swapShoppingListLine.mockResolvedValue(list);
  });

  const tap = async (button: HTMLElement) => act(async () => void fireEvent.click(button));
  const buttonOn = (text: string, name: string | RegExp) =>
    within(lineFor(text)).getByRole('button', { name });

  /** The picker open on a line, which is the first of the two taps. */
  async function picking(text = '250 g canned tomatoes') {
    renderPage();
    await screen.findByText(text);
    await tap(buttonOn(text, /wrong product/i));
    return lineFor(text);
  }

  it('offers the picker on a matched line, and nothing on a line without one', async () => {
    renderPage();
    await screen.findByText('250 g canned tomatoes');

    expect(buttonOn('250 g canned tomatoes', /wrong product/i)).toBeInTheDocument();
    // The Staple was never matched, so there is nothing to pick between.
    expect(
      within(lineFor('2 tsp salt')).queryByRole('button', { name: /wrong product/i })
    ).not.toBeInTheDocument();
  });

  it('still offers "none of these" when there are no runners-up to offer, and says why', async () => {
    serviceMocks.getShoppingList.mockResolvedValue({
      ...list,
      lines: lines.map((line) => (line.id === '0' ? { ...line, runnersUp: [] } : line)),
    });

    const line = await picking();

    expect(within(line).getByRole('button', { name: /none of these/i })).toBeInTheDocument();
    // Not an empty list (#285): the picker explains itself before its one button.
    expect(within(line).getByText(/no other product to offer/i)).toBeInTheDocument();
  });

  it('offers no way back on a demoted line with nothing to pick', async () => {
    // An Unmatched line whose picker holds nothing has no way back (#285) —
    // its search link is already the whole offer, so no button dangles.
    serviceMocks.getShoppingList.mockResolvedValue({
      ...list,
      lines: lines.map((line) =>
        line.id === '0'
          ? {
              id: '0',
              text: line.text,
              staple: false,
              state: 'unmatched' as const,
              searchTerm: 'tomatoes',
              runnersUp: [],
            }
          : line
      ),
    });
    renderPage();
    await screen.findByText('250 g canned tomatoes');

    expect(
      within(lineFor('250 g canned tomatoes')).queryByRole('button', { name: /pick a product/i })
    ).not.toBeInTheDocument();
  });

  it('shows the runner-up products the list already carries', async () => {
    const line = await picking();

    expect(within(line).getByRole('button', { name: /Ardmona Rich & Thick/ })).toBeInTheDocument();
    expect(within(line).getByRole('button', { name: /Mutti Polpa/ })).toBeInTheDocument();
  });

  it('corrects the line in a second tap', async () => {
    const line = await picking();

    await tap(within(line).getByRole('button', { name: /Ardmona Rich & Thick/ }));

    expect(serviceMocks.swapShoppingListLine).toHaveBeenCalledWith('list-1', '0', 222);
  });

  it('closes the picker once the swap has landed', async () => {
    const line = await picking();

    await tap(within(line).getByRole('button', { name: /Mutti Polpa/ }));

    expect(within(line).queryByRole('button', { name: /Mutti Polpa/ })).not.toBeInTheDocument();
  });

  it('offers a demoted line the way back, and does not call it a wrong product', async () => {
    serviceMocks.getShoppingList.mockResolvedValue({
      ...list,
      lines: lines.map((line) =>
        line.id === '0'
          ? {
              id: '0',
              text: line.text,
              staple: false,
              state: 'unmatched',
              searchTerm: 'tomatoes',
              runnersUp: [tomatoes, ardmona, mutti],
            }
          : line
      ),
    });
    renderPage();
    await screen.findByText('250 g canned tomatoes');
    const line = lineFor('250 g canned tomatoes');

    await tap(within(line).getByRole('button', { name: /pick a product/i }));

    expect(
      within(line).getByRole('button', { name: /Woolworths Diced Tomatoes/ })
    ).toBeInTheDocument();
  });

  it('demotes the line on "none of these"', async () => {
    const line = await picking();

    await tap(within(line).getByRole('button', { name: /none of these/i }));

    expect(serviceMocks.swapShoppingListLine).toHaveBeenCalledWith('list-1', '0', null);
  });

  it('installs the re-priced list the swap answers with', async () => {
    const swapped: ShoppingList = {
      ...list,
      lines: lines.map((line) =>
        line.id === '0'
          ? {
              ...line,
              state: 'priced',
              packs: 1,
              priceCents: 250,
              product: ardmona,
              runnersUp: [tomatoes, mutti],
            }
          : line
      ) as ShoppingListLine[],
    };
    serviceMocks.swapShoppingListLine.mockResolvedValue(swapped);
    const line = await picking();

    await tap(within(line).getByRole('button', { name: /Ardmona Rich & Thick/ }));

    // The line now names the product that was picked, and the headline has
    // moved with it: $2.50 + the $7.74 estimate.
    expect(within(lineFor('250 g canned tomatoes')).getByRole('link')).toHaveTextContent(
      'Ardmona Rich & Thick at Woolworths'
    );
    expect(screen.getByText('≈ $10.24')).toBeInTheDocument();
  });

  it('keeps the list on screen when a swap does not go through', async () => {
    serviceMocks.swapShoppingListLine.mockRejectedValue(new Error('Network is down'));
    const line = await picking();

    await tap(within(line).getByRole('button', { name: /Mutti Polpa/ }));

    expect(await screen.findByText('Network is down')).toBeInTheDocument();
    expect(screen.getByText('250 g canned tomatoes')).toBeInTheDocument();
  });
});
