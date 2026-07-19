import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type {
  Comparison,
  ComparisonTapSource,
  MenuItemCapture,
  SnapshotPayload,
  StorefrontCapture,
} from '@dinder/shared/types';
import { COMPARISON_TAP_SOURCE_SET } from '@dinder/shared/types';
import NavigationHeader from '../components/NavigationHeader';
import { subscribeToComparison } from '../services/comparisonStream';

const FAILED_STOREFRONT: StorefrontCapture = { status: 'failed', deals: [], menu: [] };
// ponytail: matches the backend's 20 min Snapshot freshness window; served
// Snapshots older than this only appear when the tab sat open.
const STALE_AFTER_MINUTES = 20;
// How long we let Storefronts resolve before offering recovery. The stream
// keeps going — this only surfaces Retry / Back to venues.
const WAIT_RECOVERY_MS = 30_000;

const PLATFORM_NAMES = { ubereats: 'Uber Eats', doordash: 'DoorDash' } as const;
type PlatformName = (typeof PLATFORM_NAMES)[keyof typeof PLATFORM_NAMES];

function fetchedLabel(fetchedAt: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(fetchedAt)) / 60_000));
  if (minutes === 0) return 'Fetched just now';
  const base = `Fetched ${minutes} min${minutes === 1 ? '' : 's'} ago`;
  return minutes >= STALE_AFTER_MINUTES ? `${base} — may be out of date` : base;
}

function formatPrice(priceCents: number) {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(priceCents / 100);
}

function OutboundLink({ name, url }: { name: PlatformName; url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-coral px-4 py-2 font-semibold text-white shadow-glow-coral transition-all duration-150 hover:brightness-110"
    >
      Open in {name}
    </a>
  );
}

function RecoveryActions({ onRetry, onBack }: { onRetry: () => void; onBack: () => void }) {
  return (
    <div className="flex justify-center gap-3">
      <button
        onClick={onRetry}
        className="min-h-[44px] rounded-xl bg-cyan px-4 py-2 font-semibold text-ink transition-all duration-150 hover:brightness-110"
      >
        Retry
      </button>
      <button
        onClick={onBack}
        className="min-h-[44px] rounded-xl border border-line/40 px-4 py-2 font-semibold text-text transition-all duration-150 hover:bg-raised"
      >
        Back to venues
      </button>
    </div>
  );
}

function UnmatchedSection({ name, items }: { name: PlatformName; items: MenuItemCapture[] }) {
  if (items.length === 0) return null;
  return (
    <details className="rounded-2xl border border-line/30 bg-raised p-5">
      <summary className="cursor-pointer font-display text-lg font-semibold">
        Only on {name} ({items.length})
      </summary>
      <ul className="mt-4 divide-y divide-line/20">
        {items.map((item, index) => (
          <li key={`${item.name}-${index}`} className="flex justify-between gap-4 py-3 text-sm">
            <span>{item.name}</span>
            <span className="text-muted">{formatPrice(item.price_cents)}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

const STATUS_PRESENTATION = {
  checking: { label: 'Still checking…', className: 'animate-pulse text-muted' },
  resolved: { label: 'Ready', className: 'text-lime' },
  not_found: { label: 'Not found', className: 'text-muted' },
  failed: { label: 'Failed', className: 'text-amber' },
  unavailable: { label: 'Unavailable', className: 'text-amber' },
} as const;

function PlatformColumn({
  name,
  testId,
  capture,
  streamClosed,
}: {
  name: PlatformName;
  testId: string;
  capture?: StorefrontCapture;
  streamClosed: boolean;
}) {
  const status = capture?.status ?? (streamClosed ? 'unavailable' : 'checking');
  const presentation = STATUS_PRESENTATION[status];

  return (
    <section
      data-testid={testId}
      className="rounded-2xl border border-line/30 bg-raised p-5 shadow-card"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-xl font-semibold">{name}</h2>
        <span className={`text-sm font-semibold ${presentation.className}`}>
          {presentation.label}
        </span>
      </div>
      {status === 'not_found' && <p className="mt-4 text-muted">Not on {name}.</p>}
      {status === 'failed' && (
        <p className="mt-4 text-amber">Couldn’t reach {name} — try again in a couple of minutes.</p>
      )}
      {capture?.status === 'resolved' && (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-text/80">
            {capture.menu.length} menu item{capture.menu.length === 1 ? '' : 's'}
          </p>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Deals</p>
            {capture.deals.length > 0 ? (
              <ul className="mt-1 space-y-2 text-sm text-cyan">
                {capture.deals.map((deal) => (
                  <li key={deal}>{deal}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-muted">No deals reported</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function MatchedPrice({ priceCents, otherCents }: { priceCents: number; otherCents: number }) {
  const cheaper = priceCents < otherCents;
  return (
    <span className={`text-right ${cheaper ? 'font-semibold text-lime' : 'text-text/80'}`}>
      {formatPrice(priceCents)}
      {cheaper && (
        <span className="block text-[10px] font-semibold uppercase tracking-wide text-lime">
          Save {formatPrice(otherCents - priceCents)}
        </span>
      )}
    </span>
  );
}

export default function ComparisonViewPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { placeId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  // Captured once (lazy init): the source names the tap, not the page. It is
  // stripped from the URL below so a refresh or share doesn't re-count the tap
  // (#68 kill gate).
  const [tapSource] = useState(() => {
    const sourceParam = searchParams.get('source');
    return sourceParam !== null && COMPARISON_TAP_SOURCE_SET.has(sourceParam)
      ? (sourceParam as ComparisonTapSource)
      : undefined;
  });

  useEffect(() => {
    if (!searchParams.has('source')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('source');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  const [venueName, setVenueName] = useState('');
  const [storefronts, setStorefronts] = useState<Partial<SnapshotPayload>>({});
  const [fetchedAt, setFetchedAt] = useState('');
  const [comparison, setComparison] = useState<Comparison>();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [waitedTooLong, setWaitedTooLong] = useState(false);
  const fromComparisonList = Boolean(
    (location.state as { fromComparisonList?: boolean } | null)?.fromComparisonList
  );
  const complete = Boolean(fetchedAt);
  const onlyUberEats =
    complete &&
    storefronts.ubereats?.status === 'resolved' &&
    storefronts.doordash?.status === 'not_found';
  const onlyDoorDash =
    complete &&
    storefronts.doordash?.status === 'resolved' &&
    storefronts.ubereats?.status === 'not_found';
  const neitherFound =
    complete &&
    storefronts.ubereats?.status === 'not_found' &&
    storefronts.doordash?.status === 'not_found';
  const bothFailed =
    complete &&
    storefronts.ubereats?.status === 'failed' &&
    storefronts.doordash?.status === 'failed';
  const heroImageUrl = storefronts.ubereats?.imageUrl ?? storefronts.doordash?.imageUrl;
  const showRecoveryBanner = waitedTooLong && !complete && !error;
  const matchedCount = comparison?.matchedItems.length ?? 0;
  const matchedCountLabel = `${matchedCount} matched item${matchedCount === 1 ? '' : 's'}`;

  const backToVenues = () =>
    fromComparisonList ? navigate(-1) : navigate('/compare', { replace: true });
  const retry = () => setAttempt((current) => current + 1);

  useEffect(() => {
    if (!placeId) return;

    setVenueName('');
    setStorefronts({});
    setFetchedAt('');
    setComparison(undefined);
    setError('');
    setWaitedTooLong(false);
    const waitTimer = window.setTimeout(() => setWaitedTooLong(true), WAIT_RECOVERY_MS);
    const unsubscribe = subscribeToComparison(
      placeId,
      {
        onVenue: (event) => setVenueName(event.venueName),
        onStorefront: (event) => {
          setStorefronts((current) => ({ ...current, [event.platform]: event.storefront }));
        },
        onComparison: (event) => {
          setVenueName(event.comparison.venueName);
          setStorefronts((current) => {
            const storefronts = { ...current, ...event.comparison.storefronts };
            return {
              ubereats: storefronts.ubereats ?? FAILED_STOREFRONT,
              doordash: storefronts.doordash ?? FAILED_STOREFRONT,
            };
          });
          setFetchedAt(event.comparison.fetchedAt);
          setComparison(event.comparison);
        },
        onError: (event) => setError(event.message),
      },
      // A Retry is not a new tap; only the first attempt may carry the
      // source, or the #68 kill-gate metric double-counts it.
      attempt === 0 ? tapSource : undefined
    );
    return () => {
      window.clearTimeout(waitTimer);
      unsubscribe();
    };
  }, [placeId, tapSource, attempt]);

  return (
    <main className="min-h-screen bg-ink text-text">
      <NavigationHeader
        title={venueName || 'Price comparison'}
        showBackButton
        onBack={backToVenues}
      />
      <div className="mx-auto max-w-2xl space-y-5 px-4 py-6">
        {heroImageUrl && (
          <img
            // A fresh node per URL: a stale onError `hidden` must not survive a
            // switch to the other platform's image.
            key={heroImageUrl}
            src={heroImageUrl}
            alt=""
            data-testid="venue-hero-image"
            className="h-40 w-full rounded-2xl border border-line/30 object-cover shadow-card"
            onError={(event) => {
              event.currentTarget.hidden = true;
            }}
          />
        )}
        {error && (
          <div className="space-y-4">
            <p role="alert" className="rounded-xl bg-amber/10 p-4 text-amber">
              {error}
            </p>
            <RecoveryActions onRetry={retry} onBack={backToVenues} />
          </div>
        )}
        {showRecoveryBanner && (
          <div className="space-y-4 rounded-2xl border border-line/30 bg-raised p-5 text-center">
            <p className="text-text/80">
              This is taking longer than usual. You can keep waiting, retry, or go back — anything
              already found stays below.
            </p>
            <RecoveryActions onRetry={retry} onBack={backToVenues} />
          </div>
        )}
        {comparison && !neitherFound && !bothFailed && (
          <div className="space-y-1 text-center">
            {comparison.cheaperMenu ? (
              <>
                <p className="font-display text-2xl font-bold text-lime">
                  {PLATFORM_NAMES[comparison.cheaperMenu.platform]} is cheaper here
                </p>
                {matchedCount > 0 && (
                  <p className="text-sm text-text/80">
                    Menu prices ~{comparison.cheaperMenu.percent}% lower across {matchedCountLabel}
                  </p>
                )}
              </>
            ) : (
              matchedCount > 0 && (
                <>
                  <p className="font-display text-2xl font-bold text-text">
                    Prices are about the same on both apps
                  </p>
                  <p className="text-sm text-text/80">Across {matchedCountLabel}</p>
                </>
              )
            )}
            {fetchedAt && <p className="text-sm text-muted">{fetchedLabel(fetchedAt)}</p>}
            <p className="text-xs text-muted">Prices shown are non-member menu prices.</p>
          </div>
        )}
        {comparison && !neitherFound && !bothFailed && (
          <>
            {comparison.matchedItems.length > 0 ? (
              <section className="overflow-hidden rounded-2xl border border-line/30 bg-raised shadow-card">
                <h2 className="px-5 pt-5 font-display text-xl font-semibold">Matched items</h2>
                <div className="grid grid-cols-[minmax(0,1fr)_5rem_5rem] gap-4 px-5 pt-3 text-xs font-semibold text-muted">
                  <span>Item</span>
                  <span className="text-right">Uber Eats</span>
                  <span className="text-right">DoorDash</span>
                </div>
                <div className="mt-2 divide-y divide-line/20">
                  {comparison.matchedItems.map((item, index) => (
                    <div
                      key={`${item.name}-${index}`}
                      data-testid={`matched-item-${index}`}
                      className="grid grid-cols-[minmax(0,1fr)_5rem_5rem] items-center gap-4 px-5 py-4 text-sm"
                    >
                      <span className="font-medium">{item.name}</span>
                      <MatchedPrice
                        priceCents={item.ubereats.price_cents}
                        otherCents={item.doordash.price_cents}
                      />
                      <MatchedPrice
                        priceCents={item.doordash.price_cents}
                        otherCents={item.ubereats.price_cents}
                      />
                    </div>
                  ))}
                </div>
              </section>
            ) : (
              storefronts.ubereats?.status === 'resolved' &&
              storefronts.doordash?.status === 'resolved' && (
                <p className="rounded-xl bg-raised p-4 text-center text-muted">
                  These menus are too different to compare item by item.
                </p>
              )
            )}
          </>
        )}
        {neitherFound && (
          <p className="rounded-2xl border border-line/30 bg-raised p-6 text-center text-text/80">
            Couldn’t find this venue on either delivery app.
          </p>
        )}
        {bothFailed && (
          <div className="space-y-4 rounded-2xl border border-line/30 bg-raised p-6 text-center">
            <p className="text-text/80">Couldn’t reach either delivery app right now.</p>
            <RecoveryActions onRetry={retry} onBack={backToVenues} />
          </div>
        )}
        {!neitherFound && !bothFailed && (
          <>
            {(onlyUberEats || onlyDoorDash) && (
              <p className="mx-auto w-fit rounded-full bg-cyan/10 px-4 py-2 text-sm font-semibold text-cyan">
                Only on {onlyUberEats ? 'Uber Eats' : 'DoorDash'}
              </p>
            )}
            <div className={`grid gap-4 ${onlyUberEats || onlyDoorDash ? '' : 'sm:grid-cols-2'}`}>
              {!onlyDoorDash && (
                <PlatformColumn
                  name="Uber Eats"
                  testId="ubereats-column"
                  capture={storefronts.ubereats}
                  streamClosed={Boolean(error)}
                />
              )}
              {!onlyUberEats && (
                <PlatformColumn
                  name="DoorDash"
                  testId="doordash-column"
                  capture={storefronts.doordash}
                  streamClosed={Boolean(error)}
                />
              )}
            </div>
          </>
        )}
        {comparison && !neitherFound && !bothFailed && (
          <div className="space-y-5">
            <UnmatchedSection name="Uber Eats" items={comparison.unmatched.ubereats} />
            <UnmatchedSection name="DoorDash" items={comparison.unmatched.doordash} />

            <div className="grid gap-3 sm:grid-cols-2">
              {storefronts.ubereats?.status === 'resolved' && storefronts.ubereats.storeUrl && (
                <OutboundLink name="Uber Eats" url={storefronts.ubereats.storeUrl} />
              )}
              {storefronts.doordash?.status === 'resolved' && storefronts.doordash.storeUrl && (
                <OutboundLink name="DoorDash" url={storefronts.doordash.storeUrl} />
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
