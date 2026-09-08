import { publicUrl } from '../services/device';
// The Shopping List (#262, #263): the priced list minted from a completed Cook
// Session's Top Pick, read and worked from its own URL. Every line renders in
// exactly one of #234's four states, every Woolworths link goes through the
// counting redirect, and every line is claimable by whoever holds the link —
// a self-declared name, never a Participant check (#229). The cook view (#265)
// is the same URL's other face; the swap picker is #264.

import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  MAX_SHOPPER_NAME,
  shoppingListTotal,
  type NeededAmount,
  type ShoppingListLine,
} from '@dinder/shared/types';
import NavigationHeader from '../components/NavigationHeader';
import { useShareLink } from '../hooks/useShareLink';
import { useShoppingList } from '../hooks/useShoppingList';
import {
  claimShoppingListLine,
  releaseShoppingListLine,
  retailerRedirectUrl,
  swapShoppingListLine,
} from '../services/apiClient';
import { useSessionStore } from '../stores/sessionStore';
import { formatPrice } from '../utils/money';
import Spinner from '../components/Spinner';
import RecipePricingStatus from '../components/RecipePricingStatus';
import RecipeSourceCredit from '../components/RecipeSourceCredit';

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

/** "Sat, 1 Aug" — the one date shape on this page, for both dates on it. */
const day = new Intl.DateTimeFormat('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });

/** The day the list goes, seven days after it was minted. */
const LIST_LIFETIME_DAYS = 7;
function formatExpiry(mintedAt: string): string {
  const expires = new Date(mintedAt);
  expires.setDate(expires.getDate() + LIST_LIFETIME_DAYS);
  return day.format(expires);
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
      className="min-w-0 break-words text-sm font-semibold text-cyan hover:underline"
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
  onSwap,
}: {
  line: ShoppingListLine;
  shopperName: string;
  onClaim: () => void;
  onRelease: () => void;
  /** A Stockcode from this line's own picker, or null for "none of these". */
  onSwap: (stockcode: number | null) => void;
}) {
  // Closed until asked for: the picker is the cure for a wrong match, not a
  // question every right one has to answer (#234).
  const [picking, setPicking] = useState(false);
  const pick = (stockcode: number | null) => {
    setPicking(false);
    onSwap(stockcode);
  };

  return (
    // Claimed titles recede without fading the price, owner or Release control.
    <li
      data-line-state={line.state}
      data-staple={line.staple || undefined}
      className={`border-b border-line/30 py-3 last:border-b-0 ${line.staple ? 'text-muted' : ''}`}
    >
      <p
        className={
          line.claimedBy || line.staple ? 'font-medium text-muted' : 'font-semibold text-text'
        }
      >
        {line.text}
      </p>

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

      <div className="mt-1 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <span className="flex min-w-0 flex-wrap items-center gap-x-3">
          {line.state === 'unmatched' ? (
            <WoolworthsLink target={{ q: line.searchTerm }}>Search Woolworths</WoolworthsLink>
          ) : (
            <WoolworthsLink target={{ stockcode: line.product.stockcode }}>
              {line.product.name} at Woolworths
            </WoolworthsLink>
          )}

          {/* The two-tap cure for a confidently-wrong match (#264): these are
              the runners-up the one search already fetched, so opening the
              picker costs Woolworths nothing. Offered on every matched line,
              empty runners-up included — "none of these" is always an answer,
              and on a line already demoted by it, the same picker is the way
              back, which is why it does not ask "wrong product?" there. The
              one exception is a demoted line with nothing to pick (#285): no
              way back exists, and its search link is already the whole offer. */}
          {line.runnersUp && !(line.state === 'unmatched' && line.runnersUp.length === 0) && (
            <button
              type="button"
              onClick={() => setPicking(!picking)}
              aria-expanded={picking}
              className="min-h-[44px] text-left text-sm text-muted hover:text-text"
            >
              {line.state === 'unmatched' ? 'Pick a product' : 'Wrong product?'}
            </button>
          )}
        </span>

        {/* Releasing is offered on every Claim, not only your own: a Shopper
            who goes dark leaves no live group to appeal to (#229). Taking the
            freed line over is then a second, deliberate tap. Somebody else's
            Claim is asked about first — they may be holding it in the aisle,
            and nothing here can undo the tap for them.
            ponytail: the browser's own confirm, as the Friends list already
            uses. Ceiling: unstyled and unbrandable. Upgrade path: the same
            dialog the leave flow has, if a designed one is ever wanted. */}
        {line.claimedBy ? (
          <span className="flex min-w-0 max-w-full items-center gap-2 text-sm">
            <span className="min-w-0 break-words text-muted">
              {line.claimedBy === shopperName ? 'Yours' : `Claimed by ${line.claimedBy}`}
            </span>
            <button
              type="button"
              onClick={() => {
                if (
                  line.claimedBy !== shopperName &&
                  !window.confirm(`Release ${line.claimedBy}'s claim on ${line.text}?`)
                ) {
                  return;
                }
                onRelease();
              }}
              className="min-h-[44px] shrink-0 rounded-full border border-line px-3 py-1 text-xs font-semibold text-muted hover:text-text"
            >
              Release
            </button>
          </span>
        ) : (
          // Always tappable, even with no name yet: a Shopper who has never
          // typed one here is the canonical link-holder (#229), and greying
          // the button out tells them nothing. The tap answers instead.
          <button
            type="button"
            onClick={onClaim}
            className="min-h-[44px] shrink-0 rounded-full bg-cyan/15 px-3 py-1 text-xs font-semibold text-cyan"
          >
            Claim
          </button>
        )}
      </div>

      {picking && line.runnersUp && (
        <ul className="mt-2 rounded-xl border border-line/50 bg-ink/40 p-2">
          {/* An empty picker says why it is empty (#285) — worded for every
              way it gets that way (one result found, or the rest unavailable
              at the store): nothing else is offerable, so the only cure left
              is demoting to its Woolworths search. */}
          {line.runnersUp.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted">
              The search behind this line has no other product to offer.
            </li>
          )}
          {line.runnersUp.map((product) => (
            <li key={product.stockcode}>
              <button
                type="button"
                onClick={() => pick(product.stockcode)}
                className="w-full rounded-lg px-3 py-2 text-left text-sm text-text hover:bg-line/20"
              >
                {product.name}
                {product.packageSize ? (
                  <span className="text-muted"> · {product.packageSize}</span>
                ) : null}
              </button>
            </li>
          ))}
          {/* No right answer among them: the line degrades to Unmatched — its
              recipe text and a Woolworths search — rather than blocking the
              shop with a product nobody wants (#234). */}
          <li>
            <button
              type="button"
              onClick={() => pick(null)}
              className="w-full rounded-lg px-3 py-2 text-left text-sm text-muted hover:bg-line/20"
            >
              None of these
            </button>
          </li>
        </ul>
      )}
    </li>
  );
}

export default function ShoppingListPage() {
  const navigate = useNavigate();
  const { listId } = useParams<{ listId: string }>();
  // The list page is the one that keeps reading: Claims are what move on it,
  // and everyone holding the URL has to see them.
  const { list, error, applyChange } = useShoppingList(listId, LIVE_POLL_MS);

  // The URL is the whole capability (#229), so forwarding it is the whole
  // invite — and this page is the only place it is on offer, since back goes
  // home and takes it with it. Rebuilt from the list id rather than read off
  // location, so no stray query or hash rides along.
  const shareList = useShareLink(
    list ? publicUrl(`/list/${list.listId}`) : undefined,
    'List link copied!'
  );

  // Carried over from the Session if you arrived from one, remembered if you
  // have shopped before, typed fresh by a new link-holder (#229).
  const sessionName = useSessionStore(
    (state) => state.participants.find((p) => p.participantId === state.currentUserId)?.displayName
  );
  const [shopperName, setShopperName] = useState(
    () => localStorage.getItem(SHOPPER_NAME_KEY) ?? sessionName ?? ''
  );
  const nameField = useRef<HTMLInputElement>(null);
  /**
   * Raised by a nameless Claim, and only by one: nothing nags up front. It goes
   * down when a Claim lands, never on the field's blur — the hint sits in the
   * card above the lines, and dropping it mid-tap slides every Claim button up
   * out from under the finger between mousedown and mouseup, so the browser
   * lands the click on an ancestor and the Shopper has to tap twice.
   */
  const [needsName, setNeedsName] = useState(false);

  function renameShopper(name: string) {
    setShopperName(name);
    localStorage.setItem(SHOPPER_NAME_KEY, name);
  }

  /** A Claim with nobody behind it: send the Shopper where the answer is. */
  function askForName() {
    setNeedsName(true);
    nameField.current?.focus();
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
        onClaim={() => {
          if (!shopperName) return askForName();
          setNeedsName(false);
          void applyChange(() => claimShoppingListLine(list.listId, line.id, shopperName));
        }}
        onRelease={() => void applyChange(() => releaseShoppingListLine(list.listId, line.id))}
        onSwap={(stockcode) =>
          void applyChange(() => swapShoppingListLine(list.listId, line.id, stockcode))
        }
      />
    );

  return (
    <main className="min-h-screen bg-ink">
      <NavigationHeader
        title="Shopping list"
        subtitle={list ? list.recipeName : 'Everything for tonight'}
        showBackButton
        onBack={() => navigate('/')}
        rightAction={
          list ? (
            <span className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void shareList()}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center text-cyan hover:text-cyan/80"
                aria-label="Share shopping list"
                title="Share shopping list"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 12.632a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z"
                  />
                </svg>
              </button>
              <Link
                to={`/list/${list.listId}/cook`}
                className="text-sm font-semibold text-cyan hover:underline"
              >
                Cook
              </Link>
            </span>
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
            <Spinner
              size="lg"
              className="text-cyan"
              label="Fetching your recipe and shopping list…"
            />
            <p className="mt-4 text-muted">Fetching your recipe and shopping list…</p>
          </div>
        )}

        {list && (
          <>
            <RecipePricingStatus status={list.pricingStatus} />
            {/* The headline is the list total over in-tally lines — solo and
                group need no separate design (#229). */}
            <div className="card mb-6 text-center">
              {/* Only claim a scale that happened: a source that never said
                  how many it serves leaves the recipe's own amounts, and
                  "Scaled for 6" over them would be the list lying. */}
              <p className="text-xs font-semibold tracking-[0.14em] text-lime">
                {list.servings ? `SCALED FOR ${list.headcount}` : 'RECIPE AMOUNTS, AS WRITTEN'}
              </p>
              {!list.pricingStatus && (
                <>
                  <p data-list-total className="mt-1 text-4xl font-black text-text">
                    {money(total)}
                  </p>
                  {total.unpricedCount > 0 && (
                    <p className="mt-1 text-sm text-muted">{unpriced(total.unpricedCount)}</p>
                  )}
                </>
              )}
              <p data-coverage className="mt-2 text-sm font-semibold text-lime">
                {claimed === shop.length && shop.length > 0
                  ? 'All covered ✓'
                  : `${claimed} of ${shop.length} claimed`}
              </p>
              {/* Prices are read once, at mint, and never again — so date them
                  in the Shopper's words rather than the mint's ("as minted"),
                  because a week-old total has to read as one. ADR 0010's
                  "no price-age UI" was amended here for exactly this page: a
                  list outlives the ≤24 h Freshness Window its truthfulness
                  rested on. The date is the mint's, and the cache entry behind
                  a line may be up to a day older — the skew the ADR accepts. */}
              {list.pricingStatus !== 'pending' && (
                <p className="mt-2 text-xs text-muted">
                  Prices from Woolworths on {day.format(new Date(list.mintedAt))}.
                </p>
              )}
            </div>

            {/* Identity is a label the Shopper types, never a check (#229) —
                whoever holds the link is a Shopper, Participant or not. */}
            <div className="card mb-6">
              <div className="flex items-center gap-3">
                <label htmlFor="shopper-name" className="shrink-0 text-sm text-muted">
                  Claiming as
                </label>
                {/* Committed on the way out of the field, never per keystroke:
                    a Claim matches on the whole name, so mid-edit every "Yours"
                    and the Tally itself would blink out on the first letter. */}
                <input
                  id="shopper-name"
                  autoComplete="name"
                  autoCorrect="off"
                  spellCheck={false}
                  ref={nameField}
                  defaultValue={shopperName}
                  onBlur={(event) => renameShopper(event.target.value.trim())}
                  placeholder="Your name"
                  maxLength={MAX_SHOPPER_NAME}
                  aria-describedby={needsName ? 'shopper-name-hint' : undefined}
                  className="input min-w-0 flex-1"
                />
              </div>
              {needsName && (
                <p id="shopper-name-hint" role="status" className="mt-2 text-sm text-amber">
                  Type your name here first — a Claim is a name on a line.
                </p>
              )}
            </div>

            {/* A Tally is a preview of your own receipt, not a debt: it lights
                up on your first Claim rather than sitting at $0 (#229). */}
            {mine.length > 0 && !list.pricingStatus && (
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

            <details className="card mb-6">
              <summary className="cursor-pointer font-semibold text-text">Read the method</summary>
              {list.steps.length > 0 && (
                <ol className="mt-4 list-decimal space-y-3 pl-5 text-text">
                  {list.steps.map((step, index) => (
                    <li key={index}>{step}</li>
                  ))}
                </ol>
              )}
              <RecipeSourceCredit
                hasMethod={list.steps.length > 0}
                label="Method"
                sourceName={list.sourceName}
                sourceUrl={list.sourceUrl}
                provenance={list.provenance}
              />
            </details>

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
