// The cook view (#265): the Shopping List's snapshotted method, for the person
// at the stove. Lives on the list's own URL and inherits everything about it —
// the 7-day TTL, the capability (no Session, no Participant check, no name),
// and the frozen payload, so cooking still works after the source has forgotten
// the Recipe. Full method on one screen, tap-to-dim rows for wet hands, the
// screen held awake, and no timers.

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import NavigationHeader from '../components/NavigationHeader';
import { useShoppingList } from '../hooks/useShoppingList';
import { useWakeLock } from '../hooks/useWakeLock';

/**
 * The one end-of-method credit, which doubles as the degrade path: a Recipe
 * whose snapshotted steps are empty shows this line in place of the method.
 * Spoonacular is the sole recipe *vendor* in v1, so a missing source name still
 * has an honest thing to credit; a missing URL is simply not a link.
 *
 * An Owned Recipe is the one thing that renders nothing at all, in both paths:
 * it names no source and the absence is correct (ADR 0012). Only the explicit
 * `provenance` says so — a missing name alone is a data glitch, and the vendor
 * credit is a licence obligation that must survive one (#314).
 */
function SourceCredit({
  hasMethod,
  sourceName,
  sourceUrl,
  provenance,
}: {
  hasMethod: boolean;
  sourceName?: string;
  sourceUrl?: string;
  provenance?: 'owned';
}) {
  if (provenance === 'owned') return null;
  const name = sourceName ?? 'Spoonacular';
  const source = sourceUrl ? (
    <a
      href={sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="font-semibold text-cyan hover:underline"
    >
      {name}
    </a>
  ) : (
    <span className="font-semibold text-text">{name}</span>
  );

  return hasMethod ? (
    <p className="mt-6 text-center text-sm text-muted">Method from {source}.</p>
  ) : (
    <p className="text-center text-muted">
      This recipe&rsquo;s method didn&rsquo;t come through with the list. The full method is at{' '}
      {source}.
    </p>
  );
}

function Step({ text, index }: { text: string; index: number }) {
  // Dimming is where the cook is up to, not a fact about the list — it lives
  // here and dies with the tab. Nothing to write, nothing to share.
  const [dimmed, setDimmed] = useState(false);

  return (
    <li>
      <button
        type="button"
        aria-pressed={dimmed}
        onClick={() => setDimmed((was) => !was)}
        className={`flex w-full items-start gap-4 border-b border-line/30 py-5 text-left transition-opacity ${
          dimmed ? 'opacity-40' : ''
        }`}
      >
        <span className="shrink-0 font-display text-lg font-black text-lime">{index + 1}</span>
        <span className={`text-lg leading-relaxed ${dimmed ? '' : 'text-text'}`}>{text}</span>
      </button>
    </li>
  );
}

export default function CookViewPage() {
  const navigate = useNavigate();
  const { listId } = useParams<{ listId: string }>();
  const { list, error } = useShoppingList(listId);
  // Only once there is something to cook: an expired list is not a stove, and
  // holding a dead URL's screen awake is just a flat battery.
  useWakeLock(list !== null);

  return (
    <main className="min-h-screen bg-ink">
      <NavigationHeader
        title="Method"
        subtitle={list ? list.recipeName : 'At the stove'}
        showBackButton
        backLabel="List"
        onBack={() => navigate(listId ? `/list/${listId}` : '/')}
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
            <p className="mt-4 text-muted">Fetching the method…</p>
          </div>
        )}

        {list && (
          <div className="card">
            {list.steps.length > 0 && (
              <>
                <p className="pb-2 text-xs font-semibold tracking-[0.14em] text-lime">
                  TAP A STEP TO DIM IT
                </p>
                <ol>
                  {list.steps.map((step, index) => (
                    <Step key={index} text={step} index={index} />
                  ))}
                </ol>
              </>
            )}
            <SourceCredit
              hasMethod={list.steps.length > 0}
              sourceName={list.sourceName}
              sourceUrl={list.sourceUrl}
              provenance={list.provenance}
            />
          </div>
        )}
      </div>
    </main>
  );
}
