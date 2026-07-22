// Group Order — opening (issue 2b, docs/specs/group-order.md §2/§3).
// This issue only opens the basket and renders it read-only: no order:item,
// no totals, no `I'll order`. Those land with #177/#178.

import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { MenuItemCapture } from '@dinder/shared/types';
import { openOrder } from '../services/socketBindings';
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
import { formatPrice } from '../utils/money';

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

export default function GroupOrderPage() {
  const navigate = useNavigate();
  const { sessionCode } = useParams<{ sessionCode: string }>();
  const { participants, sessionStatus, topPick, overlappingOptions } = useSessionStore();
  const { order, menu } = useOrderStore();
  const [failure, setFailure] = useState<FailureKind | null>(null);
  const retriedRef = useRef(false);

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
  } else if (order) {
    const sections = groupBySection(menu);
    const time = new Date(order.pricesAt).toLocaleTimeString('en-AU', {
      hour: 'numeric',
      minute: '2-digit',
    });

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
          <p className="mt-1 text-sm text-muted">
            Nothing in the basket yet — tap a menu item to add it.
          </p>

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
                  {items.map((item, index) => (
                    // ponytail: rows are plain non-interactive rows until
                    // order:item exists — a button that does nothing is a bug
                    // on screen. The live-basket issue swaps them for 44px
                    // <button>s with aria-label "Add {name}, {price}".
                    <li
                      key={`${item.name}-${index}`}
                      className="flex justify-between gap-4 text-sm text-text/90"
                    >
                      <span>{item.name}</span>
                      <span className="text-muted">{formatPrice(item.price_cents)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
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
