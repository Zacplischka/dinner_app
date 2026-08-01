// The Shopping List (#262): the priced list minted from a completed Cook
// Session's Top Pick, read from its own URL. Deliberately read-only in this
// slice — Claims, Tallies, and the swap picker arrive with #263, and the cook
// view with #265. Every line renders in exactly one of #234's four states, and
// every Woolworths link goes through the counting redirect.

import { Link, useNavigate, useParams } from 'react-router-dom';
import { shoppingListTotal, type NeededAmount, type ShoppingListLine } from '@dinder/shared/types';
import NavigationHeader from '../components/NavigationHeader';
import { useShoppingList } from '../hooks/useShoppingList';
import { retailerRedirectUrl } from '../services/apiClient';
import { formatPrice } from '../utils/money';

/** "needs 250g", "needs 600mL", "needs 3" — the buy decision's own family. */
function formatNeeds(needs: NeededAmount): string {
  return needs.unit === 'each' ? `needs ${needs.amount}` : `needs ${needs.amount}${needs.unit}`;
}

/** The day the list goes, seven days after it was minted. */
const LIST_LIFETIME_DAYS = 7;
function formatExpiry(mintedAt: string): string {
  const expires = new Date(mintedAt);
  expires.setDate(expires.getDate() + LIST_LIFETIME_DAYS);
  return new Intl.DateTimeFormat('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(expires);
}

/** The one link shape a Retailer target may take (#228): never a direct URL. */
function WoolworthsLink({
  children,
  target,
}: {
  children: React.ReactNode;
  target: { stockcode: number } | { q: string };
}) {
  return (
    <a
      href={retailerRedirectUrl(target)}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sm font-semibold text-cyan hover:underline"
    >
      {children}
    </a>
  );
}

function Line({ line }: { line: ShoppingListLine }) {
  return (
    <li
      data-line-state={line.state}
      data-staple={line.staple || undefined}
      className={`border-b border-line/30 py-3 last:border-b-0 ${line.staple ? 'text-muted' : ''}`}
    >
      <p className={`font-semibold ${line.staple ? 'text-muted' : 'text-text'}`}>{line.text}</p>

      {line.state === 'priced' && (
        <p className="mt-0.5 text-sm text-muted">
          {formatNeeds(line.needs)} · buy {line.packs} ×{' '}
          {line.product.packageSize ?? line.product.name} —{' '}
          <span className="font-semibold text-lime">{formatPrice(line.priceCents)}</span>
        </p>
      )}

      {line.state === 'estimated' && (
        <p className="mt-0.5 text-sm text-muted">
          {formatNeeds(line.needs)} ·{' '}
          <span className="font-semibold text-lime">≈ {formatPrice(line.priceCents)} (est.)</span>
        </p>
      )}

      {line.state === 'unpriced_matched' && (
        <p className="mt-0.5 text-sm text-muted">
          {line.product.packageSize ? `${line.product.packageSize} · ` : ''}unpriced
        </p>
      )}

      <div className="mt-1">
        {line.state === 'unmatched' ? (
          <WoolworthsLink target={{ q: line.searchTerm }}>Search Woolworths</WoolworthsLink>
        ) : (
          <WoolworthsLink target={{ stockcode: line.product.stockcode }}>
            {line.product.name} at Woolworths
          </WoolworthsLink>
        )}
      </div>
    </li>
  );
}

export default function ShoppingListPage() {
  const navigate = useNavigate();
  const { listId } = useParams<{ listId: string }>();
  const { list, error } = useShoppingList(listId);

  const lines = list?.lines ?? [];
  const shop = lines.filter((line) => !line.staple);
  const pantry = lines.filter((line) => line.staple);
  const total = shoppingListTotal(lines);

  return (
    <main className="min-h-screen bg-ink">
      <NavigationHeader
        title="Shopping List"
        subtitle={list ? list.recipeName : 'Everything for tonight'}
        showBackButton
        onBack={() => navigate('/')}
        rightAction={
          list ? (
            <Link
              to={`/list/${list.listId}/cook`}
              className="text-sm font-semibold text-cyan hover:underline"
            >
              Cook
            </Link>
          ) : undefined
        }
      />

      <div className="mx-auto max-w-2xl px-4 py-6 animate-fade-in">
        {error && (
          <div className="rounded-xl border border-coral/30 bg-coral/10 p-4">
            <p className="text-sm text-coral-soft">{error}</p>
          </div>
        )}

        {!list && !error && (
          <div className="card p-8 text-center">
            <div className="mx-auto inline-block h-8 w-8 animate-spin rounded-full border-3 border-cyan border-t-transparent" />
            <p className="mt-4 text-muted">Pricing your list at Woolworths…</p>
          </div>
        )}

        {list && (
          <>
            {/* The headline is the list total over in-tally lines — solo and
                group need no separate design (#229). The ≈ is inherited the
                moment an Estimated line enters the sum, and never labelled. */}
            <div className="card mb-6 text-center">
              {/* Only claim a scale that happened: a source that never said
                  how many it serves leaves the recipe's own amounts, and
                  "Scaled for 6" over them would be the list lying. */}
              <p className="text-xs font-semibold tracking-[0.14em] text-lime">
                {list.servings ? `SCALED FOR ${list.headcount}` : 'RECIPE AMOUNTS, AS WRITTEN'}
              </p>
              <p data-list-total className="mt-1 text-4xl font-black text-text">
                {total.estimated ? '≈ ' : ''}
                {formatPrice(total.cents)}
              </p>
              {total.unpricedCount > 0 && (
                <p className="mt-1 text-sm text-muted">
                  + {total.unpricedCount} unpriced item{total.unpricedCount === 1 ? '' : 's'}
                </p>
              )}
              <p className="mt-2 text-xs text-muted">Prices from Woolworths, as minted.</p>
            </div>

            <div className="card mb-6">
              <ul>
                {shop.map((line) => (
                  <Line key={line.id} line={line} />
                ))}
              </ul>
            </div>

            {pantry.length > 0 && (
              <div className="card mb-6">
                <h2 className="font-display text-xl font-semibold text-text">From your pantry</h2>
                <p className="mb-2 text-sm text-muted">
                  Assumed already at home — nothing here counts toward the total.
                </p>
                <ul>
                  {pantry.map((line) => (
                    <Line key={line.id} line={line} />
                  ))}
                </ul>
              </div>
            )}

            {/* The lifetime is the honest part of the bargain (#229): the URL
                is the whole capability, and nothing extends it — so say the
                day it goes, not "7 days" from a date the Shopper can't see. */}
            <p className="text-center text-sm text-muted">
              This list is yours until {formatExpiry(list.mintedAt)}. Nothing extends it.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
