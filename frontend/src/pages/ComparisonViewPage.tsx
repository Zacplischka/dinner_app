import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import type {
  Comparison,
  MenuItemCapture,
  SnapshotPayload,
  StorefrontCapture,
} from '@dinder/shared/types';
import NavigationHeader from '../components/NavigationHeader';
import { subscribeToComparison } from '../services/comparisonStream';

const FAILED_STOREFRONT: StorefrontCapture = { status: 'failed', deals: [], menu: [] };

function fetchedLabel(fetchedAt: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(fetchedAt)) / 60_000));
  if (minutes === 0) return 'Fetched just now';
  return `Fetched ${minutes} min${minutes === 1 ? '' : 's'} ago`;
}

function formatPrice(priceCents: number) {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(priceCents / 100);
}

function OutboundLink({ name, url }: { name: 'Uber Eats' | 'DoorDash'; url: string }) {
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

function UnmatchedSection({ name, items }: {
  name: 'Uber Eats' | 'DoorDash';
  items: MenuItemCapture[];
}) {
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

function PlatformColumn({
  name,
  testId,
  capture,
}: {
  name: 'Uber Eats' | 'DoorDash';
  testId: string;
  capture?: StorefrontCapture;
}) {
  return (
    <section
      data-testid={testId}
      className="rounded-2xl border border-line/30 bg-raised p-5 shadow-card"
    >
      <h2 className="font-display text-xl font-semibold">{name}</h2>
      {!capture && <p className="mt-4 animate-pulse text-muted">Searching…</p>}
      {capture?.status === 'not_found' && (
        <p className="mt-4 text-muted">Not on {name}.</p>
      )}
      {capture?.status === 'failed' && (
        <p className="mt-4 text-amber">
          Couldn’t reach {name} — try again in a couple of minutes.
        </p>
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
                {capture.deals.map((deal) => <li key={deal}>{deal}</li>)}
              </ul>
            ) : <p className="mt-1 text-muted">—</p>}
          </div>
          {capture.storeUrl && <OutboundLink name={name} url={capture.storeUrl} />}
        </div>
      )}
    </section>
  );
}

export default function ComparisonViewPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { placeId } = useParams();
  const [venueName, setVenueName] = useState('');
  const [storefronts, setStorefronts] = useState<Partial<SnapshotPayload>>({});
  const [fetchedAt, setFetchedAt] = useState('');
  const [comparison, setComparison] = useState<Comparison>();
  const [error, setError] = useState('');
  const fromComparisonList = Boolean(
    (location.state as { fromComparisonList?: boolean } | null)?.fromComparisonList
  );
  const complete = Boolean(fetchedAt);
  const onlyUberEats = complete
    && storefronts.ubereats?.status === 'resolved'
    && storefronts.doordash?.status === 'not_found';
  const onlyDoorDash = complete
    && storefronts.doordash?.status === 'resolved'
    && storefronts.ubereats?.status === 'not_found';
  const neitherFound = complete
    && storefronts.ubereats?.status === 'not_found'
    && storefronts.doordash?.status === 'not_found';

  useEffect(() => {
    if (!placeId) return;

    setVenueName('');
    setStorefronts({});
    setFetchedAt('');
    setComparison(undefined);
    setError('');
    return subscribeToComparison(placeId, {
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
      onError: (event) => {
        setError(event.message);
        setStorefronts((current) => ({
          ubereats: current.ubereats ?? FAILED_STOREFRONT,
          doordash: current.doordash ?? FAILED_STOREFRONT,
        }));
      },
    });
  }, [placeId]);

  return (
    <main className="min-h-screen bg-ink text-text">
      <NavigationHeader
        title={venueName || 'Price comparison'}
        showBackButton
        onBack={() => fromComparisonList ? navigate(-1) : navigate('/compare', { replace: true })}
      />
      <div className="mx-auto max-w-2xl space-y-5 px-4 py-6">
        {error && (
          <p role="alert" className="rounded-xl bg-amber/10 p-4 text-amber">
            {error}
          </p>
        )}
        {comparison && (
          <div className="space-y-1 text-center">
            {comparison.cheaperMenu && (
              <p className="font-semibold text-lime">
                {comparison.cheaperMenu.platform === 'ubereats' ? 'Uber Eats' : 'DoorDash'} menu ~{comparison.cheaperMenu.percent}% cheaper
              </p>
            )}
            {fetchedAt && <p className="text-sm text-muted">{fetchedLabel(fetchedAt)}</p>}
            {!neitherFound && (
              <p className="text-xs text-muted">
                Prices shown are non-member menu prices.
              </p>
            )}
          </div>
        )}
        {neitherFound ? (
          <p className="rounded-2xl border border-line/30 bg-raised p-6 text-center text-text/80">
            Couldn’t find this venue on either delivery app.
          </p>
        ) : (
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
                />
              )}
              {!onlyUberEats && (
                <PlatformColumn
                  name="DoorDash"
                  testId="doordash-column"
                  capture={storefronts.doordash}
                />
              )}
            </div>
          </>
        )}
        {comparison && !neitherFound && (
          <div className="space-y-5">
            {comparison.matchedItems.length > 0 ? (
              <section className="overflow-hidden rounded-2xl border border-line/30 bg-raised shadow-card">
                <h2 className="px-5 pt-5 font-display text-xl font-semibold">Matched items</h2>
                <div className="grid grid-cols-[minmax(0,1fr)_5rem_5rem] gap-4 px-5 pt-3 text-xs font-semibold text-muted">
                  <span>Item</span>
                  <span className="text-right">Uber Eats</span>
                  <span className="text-right">DoorDash</span>
                </div>
                <div className="mt-2 divide-y divide-line/20">
                  {comparison.matchedItems.map((item, index) => {
                    const uberEatsCheaper = item.ubereats.price_cents < item.doordash.price_cents;
                    const doorDashCheaper = item.doordash.price_cents < item.ubereats.price_cents;
                    return (
                      <div
                        key={`${item.name}-${index}`}
                        data-testid={`matched-item-${index}`}
                        className="grid grid-cols-[minmax(0,1fr)_5rem_5rem] items-center gap-4 px-5 py-4 text-sm"
                      >
                        <span className="font-medium">{item.name}</span>
                        <span className={`text-right ${uberEatsCheaper ? 'font-semibold text-lime' : 'text-text/80'}`}>
                          {formatPrice(item.ubereats.price_cents)}
                        </span>
                        <span className={`text-right ${doorDashCheaper ? 'font-semibold text-lime' : 'text-text/80'}`}>
                          {formatPrice(item.doordash.price_cents)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : storefronts.ubereats?.status === 'resolved'
              && storefronts.doordash?.status === 'resolved' && (
              <p className="rounded-xl bg-raised p-4 text-center text-muted">
                These menus are too different to compare item by item.
              </p>
            )}

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
