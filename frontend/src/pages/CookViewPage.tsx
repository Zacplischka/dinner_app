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
import Spinner from '../components/Spinner';
import RecipeSourceCredit from '../components/RecipeSourceCredit';
import RecipePricingStatus from '../components/RecipePricingStatus';

// This tab's fallback when browser storage is blocked or full. Progress is
// never a shared fact about the Shopping List.
const unsavedProgress = new Map<string, boolean>();

function Step({ text, index, listId }: { text: string; index: number; listId: string }) {
  const storageKey = `dinder.cookProgress.${listId}.${index}`;
  const [dimmed, setDimmed] = useState(() => {
    if (unsavedProgress.has(storageKey)) return unsavedProgress.get(storageKey)!;
    try {
      return sessionStorage.getItem(storageKey) === 'true';
    } catch {
      return false;
    }
  });

  function toggle() {
    const next = !dimmed;
    setDimmed(next);
    try {
      sessionStorage.setItem(storageKey, String(next));
      unsavedProgress.delete(storageKey);
    } catch {
      unsavedProgress.set(storageKey, next);
    }
  }

  return (
    <li>
      <button
        type="button"
        aria-pressed={dimmed}
        onClick={toggle}
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
            <Spinner size="lg" className="text-cyan" label="Fetching the method…" />
            <p className="mt-4 text-muted">Fetching the method…</p>
          </div>
        )}

        {list && (
          <div className="card">
            <RecipePricingStatus status={list.pricingStatus} compact />
            {list.steps.length > 0 && (
              <>
                <p className="pb-2 text-xs font-semibold tracking-[0.14em] text-lime">
                  TAP A STEP TO DIM IT
                </p>
                <ol>
                  {list.steps.map((step, index) => (
                    <Step
                      key={`${list.listId}:${index}`}
                      listId={list.listId}
                      text={step}
                      index={index}
                    />
                  ))}
                </ol>
              </>
            )}
            <RecipeSourceCredit
              label="Method"
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
