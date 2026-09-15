// The cook view (#265): the Shopping List's snapshotted method, for the person
// at the stove. Lives on the list's own URL and inherits everything about it —
// the 7-day TTL, the capability (no Session, no Participant check, no name),
// and the frozen payload, so cooking still works after the source has forgotten
// the Recipe. Full method on one screen, tap-to-dim rows for wet hands, the
// screen held awake, and no timers.

import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { nativeStateStorage } from '../services/nativeStorage';
import { toast } from '../hooks/useToast';
import { useNavigate, useParams } from 'react-router';
import NavigationHeader from '../components/NavigationHeader';
import { ErrorNote } from '../components/Notice';
import { useShoppingList } from '../hooks/useShoppingList';
import { useWakeLock } from '../hooks/useWakeLock';
import Spinner from '../components/Spinner';
import RecipeSourceCredit from '../components/RecipeSourceCredit';
import RecipePricingStatus from '../components/RecipePricingStatus';

// One record for whichever list was last cooked, on that list's 7-day clock.
const PROGRESS_KEY = 'heykeen.cook-progress';
const storage = () => (Capacitor.isNativePlatform() ? nativeStateStorage : sessionStorage);
// Progress not yet in storage: mid-write, or when storage is blocked or full.
// Never a shared fact about the Shopping List.
const unsavedProgress = new Map<string, number[]>();

async function readProgress(listId: string): Promise<number[]> {
  const unsaved = unsavedProgress.get(listId);
  if (unsaved) return unsaved;
  const saved = await storage().getItem(PROGRESS_KEY);
  const record: unknown = saved ? JSON.parse(saved) : null;
  const {
    listId: savedId,
    steps,
    expiresAt,
  } = record && typeof record === 'object' ? (record as Record<string, unknown>) : {};
  const live = typeof expiresAt === 'number' && expiresAt > Date.now();
  if (typeof expiresAt === 'number' && !live) await storage().removeItem(PROGRESS_KEY);
  if (!live || savedId !== listId || !Array.isArray(steps)) return [];
  return steps.filter((step): step is number => Number.isInteger(step) && step >= 0);
}

function Step({
  text,
  index,
  checked,
  onToggle,
}: {
  text: string;
  index: number;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        aria-pressed={checked}
        onClick={onToggle}
        className="flex w-full items-start gap-4 border-b border-line/30 py-5 text-left"
      >
        <span className="shrink-0 text-lg font-black text-lime">{index + 1}</span>
        <span
          className={`text-lg leading-relaxed ${checked ? 'text-muted line-through' : 'text-text'}`}
        >
          {text}
        </span>
      </button>
    </li>
  );
}

export default function CookViewPage() {
  const navigate = useNavigate();
  const { listId } = useParams<{ listId: string }>();
  const { list, error } = useShoppingList(listId);
  const [progress, setProgress] = useState<number[] | null>(null);
  useEffect(() => {
    let active = true;
    setProgress(null);
    readProgress(listId ?? '')
      .then((steps) => active && setProgress(steps))
      .catch(() => {
        if (!active) return;
        setProgress([]);
        if (Capacitor.isNativePlatform())
          toast.warning('Saved cooking progress could not be opened.');
      });
    return () => {
      active = false;
    };
  }, [listId]);

  function toggleStep(index: number) {
    if (!list || !progress) return;
    const next = progress.includes(index)
      ? progress.filter((step) => step !== index)
      : [...progress, index];
    setProgress(next);
    // Set before the write, so a reopen mid-write reads it.
    unsavedProgress.set(list.listId, next);
    const record = JSON.stringify({
      listId: list.listId,
      steps: next,
      expiresAt: Date.parse(list.mintedAt) + 7 * 24 * 60 * 60 * 1000,
    });
    Promise.resolve()
      .then(() => storage().setItem(PROGRESS_KEY, record))
      .then(() => {
        if (unsavedProgress.get(list.listId) === next) unsavedProgress.delete(list.listId);
      })
      .catch(() => {
        if (Capacitor.isNativePlatform())
          toast.warning('Cooking progress could not be saved. Keep this screen open.');
      });
  }
  // Only once there is something to cook: an expired list is not a stove, and
  // holding a dead URL's screen awake is just a flat battery.
  useWakeLock(list !== null);

  return (
    <main className="min-h-screen bg-ink">
      <NavigationHeader
        title="Method"
        subtitle={list ? list.recipeName : 'At the stove'}
        backLabel="List"
        onBack={() => navigate(listId ? `/list/${listId}` : '/')}
      />

      <div className="mx-auto max-w-2xl px-4 py-6 animate-fade-in">
        {error && <ErrorNote className="p-4">{error}</ErrorNote>}

        {!list && !error && (
          <div className="card p-8 text-center">
            <Spinner size="lg" className="text-text" label="Fetching the method…" />
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
                {progress === null && <p role="status">Opening your cooking progress…</p>}
                <ol>
                  {progress !== null &&
                    list.steps.map((step, index) => (
                      <Step
                        key={`${list.listId}:${index}`}
                        text={step}
                        index={index}
                        checked={progress.includes(index)}
                        onToggle={() => toggleStep(index)}
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
