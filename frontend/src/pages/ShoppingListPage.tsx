// The Shopping List (#262, #263): the priced list minted from a completed Cook
// Session's Top Pick, read and worked from its own URL. Every line renders in
// exactly one of #234's four states, every Woolworths link goes through the
// counting redirect, and every line is claimable by whoever holds the link —
// a self-declared name, never a Participant check (#229). The cook view (#265)
// is the same URL's other face; the swap picker is #264.

import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  MAX_SHOPPER_NAME,
  shoppingListTotal,
  type NeededAmount,
  type ShoppingListLine,
} from '@dinder/shared/types';
import NavigationHeader from '../components/NavigationHeader';
import { useShoppingList } from '../hooks/useShoppingList';
import {
  claimShoppingListLine,
  releaseShoppingListLine,
  retailerRedirectUrl,
} from '../services/apiClient';
import { useSessionStore } from '../stores/sessionStore';
import { formatPrice } from '../utils/money';

/**
 * How often the list re-reads itself — its live-update channel (#263), a timer
 * rather than a socket: the page has no Session behind it — the canonical
 * Shopper is a housemate on a forwarded link, days later — so a socket would
 * need its own rooms, its own identity and its own reconnect story for one
 * field that changes a dozen times an hour. The read is already the whole
 * resource, and Claims are the only thing on it that moves.
 * ponytail: a fixed interval, running as long as the page is mounted —
 * including in a backgrounded tab, where only the browser's own timer
 * throttling slows it. Ceiling: a Claim takes up to this long to reach somebody
 * else's phone, and an abandoned open tab keeps asking all week. Upgrade path:
 * pause on `visibilitychange`, or the existing socket seam if a list ever needs
 * sub-second agreement.
 */
const LIVE_POLL_MS = 4000;

/**
 * The Shopper's own name, kept where a forwarded link can find it again — a
 * second visit to the list should not ask twice. Not an account and not a
 * credential: it is a label on a Claim, and the backend verifies nothing.
 */
const SHOPPER_NAME_KEY = 'dinder.shopperName';

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

// The list total and a Tally are the same arithmetic over different lines
// (#234), so they say it the same two ways — the headline stacks them, a Tally
// runs them together as "≈ $23.40 + 2 unpriced items". The ≈ is inherited the
// moment an Estimated line enters the sum, and never labelled.
const money = (total: ReturnType<typeof shoppingListTotal>) =>
  `${total.estimated ? '≈ ' : ''}${formatPrice(total.cents)}`;
const unpriced = (count: number) => `+ ${count} unpriced item${count === 1 ? '' : 's'}`;

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

function Line({
  line,
  shopperName,
  onClaim,
  onRelease,
}: {
  line: ShoppingListLine;
  shopperName: string;
  onClaim: () => void;
  onRelease: () => void;
}) {
  return (
    // A claimed line recedes so the unclaimed ones are what the eye lands on —
    // what is left to pick up is the whole question the page answers (#229).
    <li
      data-line-state={line.state}
      data-staple={line.staple || undefined}
      className={`border-b border-line/30 py-3 last:border-b-0 ${line.staple ? 'text-muted' : ''} ${
        line.claimedBy ? 'opacity-55' : ''
      }`}
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

      <div className="mt-1 flex items-center justify-between gap-3">
        {line.state === 'unmatched' ? (
          <WoolworthsLink target={{ q: line.searchTerm }}>Search Woolworths</WoolworthsLink>
        ) : (
          <WoolworthsLink target={{ stockcode: line.product.stockcode }}>
            {line.product.name} at Woolworths
          </WoolworthsLink>
        )}

        {/* Releasing is offered on every Claim, not only your own: a Shopper
            who goes dark leaves no live group to appeal to (#229). Taking the
            freed line over is then a second, deliberate tap. */}
        {line.claimedBy ? (
          <span className="flex shrink-0 items-center gap-2 text-sm">
            <span className="text-muted">
              {line.claimedBy === shopperName ? 'Yours' : `Claimed by ${line.claimedBy}`}
            </span>
            <button
              type="button"
              onClick={onRelease}
              className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-muted hover:text-text"
            >
              Release
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={onClaim}
            disabled={!shopperName}
            className="shrink-0 rounded-full bg-cyan/15 px-3 py-1 text-xs font-semibold text-cyan disabled:opacity-40"
          >
            Claim
          </button>
        )}
      </div>
    </li>
  );
}

export default function ShoppingListPage() {
  const navigate = useNavigate();
  const { listId } = useParams<{ listId: string }>();
  // The list page is the one that keeps reading: Claims are what move on it,
  // and everyone holding the URL has to see them.
  const { list, error, applyChange } = useShoppingList(listId, LIVE_POLL_MS);

  // Carried over from the Session if you arrived from one, remembered if you
  // have shopped before, typed fresh by a new link-holder (#229).
  const sessionName = useSessionStore(
    (state) => state.participants.find((p) => p.participantId === state.currentUserId)?.displayName
  );
  const [shopperName, setShopperName] = useState(
    () => localStorage.getItem(SHOPPER_NAME_KEY) ?? sessionName ?? ''
  );

  function renameShopper(name: string) {
    setShopperName(name);
    localStorage.setItem(SHOPPER_NAME_KEY, name);
  }

  const lines = list?.lines ?? [];
  const shop = lines.filter((line) => !line.staple);
  const pantry = lines.filter((line) => line.staple);
  const total = shoppingListTotal(lines);
  // A Tally is the list total's arithmetic over your own Claims. Staples fall
  // out of it exactly as they fall out of the headline — and out of the test
  // for whether you have a Tally at all, or claiming the salt would conjure the
  // $0 Tally #229 dissolved.
  const mine = shop.filter((line) => shopperName && line.claimedBy === shopperName);
  const tally = shoppingListTotal(mine);
  // Covered means every non-Staple line is claimed. Derived, and nothing fires
  // on it: the list stays editable after it reads covered (#229).
  const claimed = shop.filter((line) => line.claimedBy).length;

  const renderLine = (line: ShoppingListLine) =>
    list && (
      <Line
        key={line.id}
        line={line}
        shopperName={shopperName}
        onClaim={() =>
          void applyChange(() => claimShoppingListLine(list.listId, line.id, shopperName))
        }
        onRelease={() => void applyChange(() => releaseShoppingListLine(list.listId, line.id))}
      />
    );

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
          <div className="mb-6 rounded-xl border border-coral/30 bg-coral/10 p-4">
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
                group need no separate design (#229). */}
            <div className="card mb-6 text-center">
              {/* Only claim a scale that happened: a source that never said
                  how many it serves leaves the recipe's own amounts, and
                  "Scaled for 6" over them would be the list lying. */}
              <p className="text-xs font-semibold tracking-[0.14em] text-lime">
                {list.servings ? `SCALED FOR ${list.headcount}` : 'RECIPE AMOUNTS, AS WRITTEN'}
              </p>
              <p data-list-total className="mt-1 text-4xl font-black text-text">
                {money(total)}
              </p>
              {total.unpricedCount > 0 && (
                <p className="mt-1 text-sm text-muted">{unpriced(total.unpricedCount)}</p>
              )}
              <p data-coverage className="mt-2 text-sm font-semibold text-lime">
                {claimed === shop.length && shop.length > 0
                  ? 'All covered ✓'
                  : `${claimed} of ${shop.length} claimed`}
              </p>
              <p className="mt-2 text-xs text-muted">Prices from Woolworths, as minted.</p>
            </div>

            {/* Identity is a label the Shopper types, never a check (#229) —
                whoever holds the link is a Shopper, Participant or not. */}
            <div className="card mb-6 flex items-center gap-3">
              <label htmlFor="shopper-name" className="shrink-0 text-sm text-muted">
                Claiming as
              </label>
              {/* Committed on the way out of the field, never per keystroke:
                  a Claim matches on the whole name, so mid-edit every "Yours"
                  and the Tally itself would blink out on the first letter. */}
              <input
                id="shopper-name"
                defaultValue={shopperName}
                onBlur={(event) => renameShopper(event.target.value.trim())}
                placeholder="Your name"
                maxLength={MAX_SHOPPER_NAME}
                className="input flex-1"
              />
            </div>

            {/* A Tally is a preview of your own receipt, not a debt: it lights
                up on your first Claim rather than sitting at $0 (#229). */}
            {mine.length > 0 && (
              <div className="card mb-6">
                <p className="text-xs font-semibold tracking-[0.14em] text-muted">YOUR TALLY</p>
                <p data-tally className="mt-1 text-2xl font-black text-text">
                  {money(tally)}
                  {tally.unpricedCount > 0 ? ` ${unpriced(tally.unpricedCount)}` : ''}
                </p>
              </div>
            )}

            {/* A Staple is claimable exactly like any other line (#234) — it
                just counts toward nothing once claimed. */}
            <div className="card mb-6">
              <ul>{shop.map(renderLine)}</ul>
            </div>

            {pantry.length > 0 && (
              <div className="card mb-6">
                <h2 className="font-display text-xl font-semibold text-text">From your pantry</h2>
                <p className="mb-2 text-sm text-muted">
                  Assumed already at home — nothing here counts toward the total.
                </p>
                <ul>{pantry.map(renderLine)}</ul>
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
