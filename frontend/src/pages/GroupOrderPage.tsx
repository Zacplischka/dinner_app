// Group Order — opening (issue 2b, docs/specs/group-order.md §2/§3).
// This issue only opens the basket and renders it read-only: no order:item,
// no totals, no `I'll order`. Those land with #177/#178.

import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { MenuItemCapture, OrderLine } from '@dinder/shared/types';
import { openOrder, addOrderItem, claimBuyer } from '../services/socketBindings';
import { subscribeToComparison } from '../services/comparisonStream';
import { useSessionStore } from '../stores/sessionStore';
import { useOrderStore } from '../stores/orderStore';
import NavigationHeader from '../components/NavigationHeader';
import {
  DeliveryActions,
  generateUberEatsUrl,
  generateDoorDashUrl,
} from '../components/DeliveryActions';
import { participantRingClass } from '../utils/participantStyles';
import { formatPrice, parseDollarsToCents } from '../utils/money';
import { toast } from '../hooks/useToast';

const PLATFORM_LABEL = { ubereats: 'Uber Eats', doordash: 'DoorDash' } as const;

type FailureKind = 'cold' | 'unavailable' | 'no_menu' | 'not_in_session' | 'expired' | 'internal';

const FAILURE_COPY: Record<Exclude<FailureKind, 'cold'>, { heading: string; body: string }> = {
  unavailable: {
    heading: "Couldn't get tonight's menu.",
    body: "We may have hit tonight's limit on price lookups. Try again in an hour, or just order the usual way.",
  },
  no_menu: {
    heading: 'No menu for this venue on Uber Eats or DoorDash.',
    body: 'You can still order the old way:',
  },
  not_in_session: {
    heading: "You're not in this session any more.",
    body: 'Someone may have restarted it, or you were away too long.',
  },
  expired: {
    heading: 'This session has expired.',
    body: 'Sessions last 30 minutes. Start a new one to swipe again.',
  },
  internal: {
    heading: 'Something went wrong getting the menu.',
    body: 'You can still order the old way:',
  },
};

function FailureScreen({
  heading,
  body,
  children,
}: {
  heading: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-lg font-semibold text-text">{heading}</p>
      <p className="text-sm text-muted">{body}</p>
      {children}
    </div>
  );
}

// The line under the basket, naming who still hasn't added anything. Pure and
// exported for its test. (The spec's copy jumps to "and 2 others" — pluralised
// here so three missing reads "and 1 other", not "and 1 others".)
export function progressLine(participantNames: string[], lineOwners: string[]): string {
  const missing = participantNames.filter((n) => !lineOwners.includes(n));
  if (missing.length === 0) return "Everyone's added something";
  if (missing.length === 1) return `${missing[0]} hasn't added anything yet`;
  if (missing.length === 2) return `${missing[0]} and ${missing[1]} haven't added anything yet`;
  const rest = missing.length - 2;
  return `${missing[0]}, ${missing[1]} and ${rest} other${rest === 1 ? '' : 's'} haven't added anything yet`;
}

// Sections in first-appearance order off the Pinned Menu — a section with
// zero items cannot exist by construction, so no filter or hardcoded count.
function groupBySection(menu: MenuItemCapture[]): Map<string, MenuItemCapture[]> {
  const sections = new Map<string, MenuItemCapture[]>();
  for (const item of menu) {
    const key = item.section ?? 'Menu';
    const existing = sections.get(key);
    if (existing) existing.push(item);
    else sections.set(key, [item]);
  }
  return sections;
}

// The Buyer re-adds one combined cart: every Participant's qty for the same
// menu index, summed. Keyed on the flat Pinned Menu index (the wire identity).
function sumQtyByIndex(lines: OrderLine[]): Map<number, number> {
  const totals = new Map<number, number>();
  for (const line of lines) {
    totals.set(line.index, (totals.get(line.index) ?? 0) + line.qty);
  }
  return totals;
}

// The clipboard-only pattern at ResultsPage.tsx:349-355, reused verbatim by
// both handoff branches' copy buttons.
function copyToClipboard(text: string) {
  navigator.clipboard
    .writeText(text)
    .then(() => toast.success('Share copied!'))
    .catch(() => toast.error('Could not copy'));
}

export default function GroupOrderPage() {
  const navigate = useNavigate();
  const { sessionCode } = useParams<{ sessionCode: string }>();
  const { participants, sessionStatus, topPick, overlappingOptions, currentUserId } =
    useSessionStore();
  const { order, menu, change } = useOrderStore();
  const me = participants.find((p) => p.participantId === currentUserId)?.displayName;
  const [failure, setFailure] = useState<FailureKind | null>(null);
  const retriedRef = useRef(false);

  // The Buyer's delivery-fee input (#179): debounced 400ms, emitted only for
  // a value parseDollarsToCents accepts. useRef timer pattern per ComparePage.tsx:42.
  const feeTimer = useRef<ReturnType<typeof setTimeout>>();
  const [feeText, setFeeText] = useState('');
  useEffect(() => () => clearTimeout(feeTimer.current), []);

  // Same effect ResultsPage.tsx runs: a Restart flips the Session back to
  // selecting for every tab, including this one.
  useEffect(() => {
    if (sessionStatus === 'selecting' && sessionCode) {
      navigate(`/session/${sessionCode}/select`);
    }
  }, [sessionStatus, sessionCode, navigate]);

  useEffect(() => {
    if (!sessionCode) return;
    const placeId = useSessionStore.getState().orderPlaceId;
    if (!placeId) {
      navigate(`/session/${sessionCode}/results`);
      return;
    }

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    retriedRef.current = false;

    async function attemptOpen() {
      const ack = await openOrder(sessionCode!, placeId!);
      if (cancelled) return;

      if (ack.success) {
        useOrderStore.getState().setOrder(ack.data, ack.data.menu);
        setFailure(null);
        return;
      }

      const { error } = ack;
      if (error.code === 'NOT_FOUND' && 'reason' in error && error.reason === 'no_menu') {
        useOrderStore.getState().markNoMenu(placeId!);
        setFailure('no_menu');
        return;
      }
      if (error.code === 'NOT_FOUND' && 'reason' in error && error.reason === 'stale') {
        if (retriedRef.current) {
          setFailure('unavailable');
          return;
        }
        retriedRef.current = true;
        setFailure('cold');
        unsubscribe = subscribeToComparison(placeId!, {
          onComparison: () => void attemptOpen(),
          onError: () => setFailure('unavailable'),
        });
        return;
      }
      if (error.code === 'NOT_IN_SESSION') {
        setFailure('not_in_session');
        return;
      }
      if (error.code === 'SESSION_NOT_FOUND') {
        setFailure('expired');
        return;
      }
      if (error.code === 'VALIDATION_ERROR') {
        navigate(`/session/${sessionCode}/select`);
        return;
      }
      setFailure('internal');
    }

    void attemptOpen();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionCode, navigate]);

  // The crowned Restaurant's name/address for the delivery pills on a
  // failure screen — the same lookup ResultsPage already builds its map from.
  // ponytail: falls back to an empty search query if this page is opened
  // without the crowned Restaurant in the store (e.g. a direct navigation) —
  // a narrow, untested edge case.
  const orderPlaceId = useSessionStore((state) => state.orderPlaceId);
  const crownedRestaurant =
    topPick?.restaurant.placeId === orderPlaceId
      ? topPick.restaurant
      : overlappingOptions.find((r) => r.placeId === orderPlaceId);
  const deliveryPills = (
    <DeliveryActions
      ubereatsHref={generateUberEatsUrl(crownedRestaurant?.name ?? '', crownedRestaurant?.address)}
      doordashHref={generateDoorDashUrl(crownedRestaurant?.name ?? '', crownedRestaurant?.address)}
    />
  );

  const handleBack = () => navigate(`/session/${sessionCode}/results`);

  const handleClaimBuyer = async () => {
    if (!sessionCode) return;
    const ack = await claimBuyer(sessionCode);
    if (!ack.success) toast.error(ack.error.message);
  };

  const handleFeeChange = (raw: string) => {
    setFeeText(raw);
    const feeCents = parseDollarsToCents(raw);
    if (feeCents === null || !sessionCode) return; // rejected before emitting
    clearTimeout(feeTimer.current);
    feeTimer.current = setTimeout(() => void claimBuyer(sessionCode, feeCents), 400);
  };

  let content: React.ReactNode;

  if (sessionStatus === 'expired') {
    content = (
      <FailureScreen {...FAILURE_COPY.expired}>
        <button className="btn btn-primary min-h-[48px] px-6" onClick={() => navigate('/')}>
          Start over
        </button>
      </FailureScreen>
    );
  } else if (failure === 'cold') {
    content = (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <div
          className="inline-block w-10 h-10 border-3 border-cyan border-t-transparent rounded-full animate-spin"
          role="status"
          aria-label="Loading"
        />
        <p className="text-lg font-semibold text-text">Getting tonight&apos;s menu…</p>
        <p className="text-sm text-muted">
          This can take up to a minute the first time. Everyone else is waiting on the same fetch.
        </p>
      </div>
    );
  } else if (failure === 'not_in_session') {
    content = (
      <FailureScreen {...FAILURE_COPY.not_in_session}>
        <div className="flex gap-3">
          <button className="btn btn-secondary min-h-[48px] px-6" onClick={handleBack}>
            Back to results
          </button>
          <button className="btn btn-primary min-h-[48px] px-6" onClick={() => navigate('/')}>
            Start over
          </button>
        </div>
      </FailureScreen>
    );
  } else if (failure === 'no_menu' || failure === 'unavailable' || failure === 'internal') {
    content = <FailureScreen {...FAILURE_COPY[failure]}>{deliveryPills}</FailureScreen>;
  } else if (order && order.state === 'locked') {
    const platformLabel = PLATFORM_LABEL[order.platform];
    const celebration = (
      <div className="match-celebration mb-6 text-center">
        <div className="match-rays" data-match-rays aria-hidden="true" />
        <h2 className="relative inline-block animate-match-pop rounded-market-md px-5 py-2 text-4xl font-black tracking-[0.14em] text-lime shadow-match">
          LOCKED IN
        </h2>
      </div>
    );

    if (order.buyer === me) {
      const qtyByIndex = sumQtyByIndex(order.lines);
      const sections = [...groupBySection(menu).entries()]
        .map(
          ([section, items]) =>
            [
              section,
              items
                .map((item) => ({
                  item,
                  index: menu.indexOf(item),
                  qty: qtyByIndex.get(menu.indexOf(item)),
                }))
                .filter((row) => (row.qty ?? 0) > 0),
            ] as const
        )
        .filter(([, rows]) => rows.length > 0);
      const time = new Date(order.pricesAt).toLocaleTimeString('en-AU', {
        hour: 'numeric',
        minute: '2-digit',
      });
      const othersShares = order.shares.filter((s) => s.displayName !== me);
      const feeClause = order.feeCents !== 0 ? ` + ${formatPrice(order.feeCents)} delivery` : '';
      // Solo buyer (no one else has a Line yet): skip the "— " lead-in rather
      // than copy a stray "— ." with nothing between the dash and the period.
      const splitText =
        othersShares.length === 0
          ? `${order.venueName}. ${me} paid ${formatPrice(order.itemsCents)}${feeClause}.`
          : `${order.venueName} — ${othersShares
              .map((s) => `${s.displayName} ${formatPrice(s.totalCents)}`)
              .join(', ')}. ${me} paid ${formatPrice(order.itemsCents)}${feeClause}.`;

      content = (
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
          {celebration}
          <h2 className="text-lg font-display font-semibold text-text">
            You&apos;re ordering from {order.venueName} on {platformLabel}
          </h2>

          <div className="mt-4 space-y-3">
            {sections.map(([section, rows]) => (
              <div key={section}>
                <p className="text-sm font-semibold text-text">{section}</p>
                <ul className="mt-1 space-y-1">
                  {rows.map(({ item, index, qty }) => (
                    <li key={index} className="flex items-center gap-2">
                      <input type="checkbox" id={`checklist-${index}`} className="h-5 w-5" />
                      <label htmlFor={`checklist-${index}`} className="text-sm text-text/90">
                        {qty} × {item.name}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-muted">Items</span>
            <span className="font-semibold text-text">{formatPrice(order.itemsCents)}</span>
          </div>
          <p className="mt-1 text-xs text-muted">Prices as at {time}. Check them at checkout.</p>

          <label htmlFor="order-fee" className="mt-4 block text-sm font-semibold text-text">
            Delivery + fees from the checkout screen
          </label>
          <input
            id="order-fee"
            inputMode="decimal"
            className="mt-1 w-full rounded-lg border-2 border-line/30 bg-surface/60 px-3 py-2 text-sm text-text"
            value={feeText}
            onChange={(e) => handleFeeChange(e.target.value)}
          />

          <h3 className="mt-6 text-sm font-semibold text-text">What everyone owes you</h3>
          <p className="mt-1 text-sm text-text/90">
            {othersShares.map((s) => `${s.displayName} ${formatPrice(s.totalCents)}`).join(' · ')}
          </p>

          <button
            type="button"
            className="btn btn-secondary mt-3 w-full min-h-[48px]"
            onClick={() => copyToClipboard(splitText)}
          >
            Copy the split
          </button>

          {order.storeUrl ? (
            <a
              href={order.storeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary mt-3 flex w-full min-h-[48px] items-center justify-center"
            >
              Open {platformLabel}
            </a>
          ) : (
            deliveryPills
          )}

          <p className="mt-4 text-xs text-muted">
            One of you orders — Dinder can&apos;t check out for you.
          </p>
        </div>
      );
    } else {
      const myLines = order.lines.filter((l) => l.by === me);
      const myShare = order.shares.find((s) => s.displayName === me);
      const myFeeClause =
        myShare && myShare.feeCents !== 0 ? `, + ${formatPrice(myShare.feeCents)} delivery` : '';
      const oweText = myShare
        ? `You owe ${formatPrice(myShare.totalCents)} — ${myLines.map((l) => `${l.qty} × ${l.name}`).join(', ')}${myFeeClause}.`
        : null;

      content = (
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
          {celebration}
          <p className="text-lg font-semibold text-text">
            {order.buyer} is ordering from {order.venueName}.
          </p>
          {oweText && (
            <>
              <p className="mt-3 text-sm text-text/90">{oweText}</p>
              <button
                type="button"
                className="btn btn-primary mt-3 w-full min-h-[48px]"
                onClick={() => copyToClipboard(oweText)}
              >
                Copy my share
              </button>
            </>
          )}
        </div>
      );
    }
  } else if (order) {
    const sections = groupBySection(menu);
    const time = new Date(order.pricesAt).toLocaleTimeString('en-AU', {
      hour: 'numeric',
      minute: '2-digit',
    });

    // A departed Participant's lines survive with no roster tile (§ Hard cases),
    // so findIndex returns -1 — fall back to a neutral ring, never `-1 % 4`.
    const ringFor = (by: string) => {
      const index = participants.findIndex((p) => p.displayName === by);
      return index === -1 ? 'border-line opacity-60' : participantRingClass(index);
    };
    const youOwe = order.shares.find((s) => s.displayName === me)?.totalCents ?? 0;
    const progress = progressLine(
      participants.map((p) => p.displayName),
      order.lines.map((l) => l.by)
    );
    const changedLine =
      change && order.lines.find((l) => l.by === change.by && l.name === change.name);
    const announcement =
      change && change.delta === 1 && changedLine
        ? `${changedLine.qty} × ${change.name} added by ${change.by}. Items now ${formatPrice(order.itemsCents)}.`
        : '';

    content = (
      <>
        {/* FIXED — roster + venue line */}
        <div className="shrink-0 px-4 pt-3 pb-2 border-b border-line/30">
          <div className="flex gap-2 min-w-0">
            {participants.map((participant, index) => {
              const share = order.shares.find((s) => s.displayName === participant.displayName);
              return (
                <div
                  key={participant.participantId}
                  className="flex min-w-0 flex-1 flex-col items-center gap-1"
                >
                  <div
                    className={`w-9 h-9 shrink-0 bg-surface border-2 rounded-full flex items-center justify-center text-text text-sm font-semibold ${participantRingClass(index)}`}
                  >
                    {participant.displayName.charAt(0).toUpperCase()}
                  </div>
                  <span className="w-full truncate text-center text-xs text-muted">
                    {participant.displayName}
                  </span>
                  <span className="text-xs font-semibold text-text">
                    {share ? formatPrice(share.totalCents) : '—'}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-sm text-muted">
            {order.venueName} · {PLATFORM_LABEL[order.platform]} · prices as at {time}
            {order.cheaperPercent != null && (
              <span className="ml-2 text-lime">~{order.cheaperPercent}% cheaper</span>
            )}
          </p>
        </div>

        {/* SCROLLS — the only overflow on the page */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
          <h2 className="text-lg font-display font-semibold text-text">In the basket</h2>

          {/* Live region holds ONLY the sr-only sentence, kept out of the
              visible list so a new row isn't announced twice (its own text
              plus this). */}
          <p role="status" aria-live="polite" className="sr-only">
            {announcement}
          </p>

          {/* Keyed on index:by so React remounts only genuinely new rows and
              animate-slide-up fires for exactly the row that arrived. */}
          <ul className="mt-2 space-y-1">
            {order.lines.length === 0 ? (
              <p className="text-sm text-muted">
                Nothing in the basket yet — tap a menu item to add it.
              </p>
            ) : (
              order.lines.map((line) => {
                const flash =
                  change?.delta === 1 && line.by === change.by && line.name === change.name;
                return (
                  <li
                    key={`${line.index}:${line.by}`}
                    className={`flex items-center justify-between gap-3 rounded-lg border-2 bg-surface/60 px-3 py-2 animate-slide-up ${ringFor(line.by)} ${flash ? 'animate-pulse-glow' : ''}`}
                  >
                    <span className="min-w-0 truncate text-sm text-text/90">
                      {line.qty} × {line.name}
                      <span className="text-muted"> · {line.by}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-sm text-muted">
                        {formatPrice(line.priceCents * line.qty)}
                      </span>
                      {line.by === me && (
                        <button
                          type="button"
                          className="flex min-h-[44px] min-w-[44px] items-center justify-center text-lg text-muted"
                          aria-label={`Remove one ${line.name}`}
                          onClick={() => void addOrderItem(sessionCode!, line.index, -1)}
                        >
                          ×
                        </button>
                      )}
                    </span>
                  </li>
                );
              })
            )}
          </ul>

          <p className="mt-6 text-xs text-muted">
            Base items only — add sizes and extras at checkout.
          </p>
          <div className="mt-2 space-y-2">
            {[...sections.entries()].map(([section, items]) => (
              <details key={section} className="rounded-xl border border-line/30 bg-surface/60 p-3">
                <summary className="cursor-pointer text-sm font-semibold text-text">
                  {section} ({items.length})
                </summary>
                <ul className="mt-2 space-y-1">
                  {items.map((item) => {
                    // Flat index into the whole Pinned Menu — sections are a
                    // render-time grouping; the wire identity is the flat index.
                    const flatIndex = menu.indexOf(item);
                    return (
                      <li key={`${item.name}-${flatIndex}`}>
                        <button
                          type="button"
                          className="flex min-h-[44px] w-full items-center justify-between gap-4 text-left text-sm text-text/90"
                          aria-label={`Add ${item.name}, ${formatPrice(item.price_cents)}`}
                          onClick={() => void addOrderItem(sessionCode!, flatIndex, 1)}
                        >
                          <span>{item.name}</span>
                          <span className="text-muted">{formatPrice(item.price_cents)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </details>
            ))}
          </div>
        </div>

        {/* PINNED totals + the always-primary `I'll order` — the only primary
            button on the building screen. */}
        <div className="safe-bottom shrink-0 border-t border-line/30 px-4 pb-3 pt-2">
          <p className="text-sm text-muted">{progress}</p>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-sm text-muted">
              Items <span className="font-semibold text-text">{formatPrice(order.itemsCents)}</span>
            </span>
            <span className="text-sm text-muted">
              You owe <span className="font-semibold text-cyan">{formatPrice(youOwe)}</span>
            </span>
          </div>
          <button
            type="button"
            className="btn btn-primary mt-2 w-full min-h-[48px]"
            onClick={() => void handleClaimBuyer()}
          >
            I&apos;ll order
          </button>
        </div>
      </>
    );
  } else {
    // Ack still pending (the normal, near-instant warm path). Nothing to
    // show yet; the ack resolves into either the basket above or a failure
    // branch within a tick.
    content = null;
  }

  return (
    <main className="h-screen-dvh overflow-hidden bg-ink flex flex-col">
      <NavigationHeader
        title="Group order"
        sessionCode={sessionCode}
        showBackButton
        onBack={handleBack}
        compact
      />
      {content}
    </main>
  );
}
