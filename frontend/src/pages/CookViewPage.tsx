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

function Step({
  text,
  index,
  listId,
  checked,
  onToggle,
}: {
  text: string;
  index: number;
  listId: string;
  checked?: boolean;
  onToggle?: () => void;
}) {
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
    if (onToggle) {
      onToggle();
      return;
    }
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
        aria-pressed={checked ?? dimmed}
        onClick={toggle}
        className="flex w-full items-start gap-4 border-b border-line/30 py-5 text-left"
      >
        <span className="shrink-0 font-display text-lg font-black text-lime">{index + 1}</span>
        <span
          className={`text-lg leading-relaxed ${(checked ?? dimmed) ? 'text-muted line-through' : 'text-text'}`}
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
  const native = Capacitor.isNativePlatform();
  const [progress, setProgress] = useState<number[] | null>(native ? null : []);
  useEffect(() => {
    if (!native) return;
    let active = true;
    setProgress(null);
    void (async () => {
      try {
        const saved = await nativeStateStorage.getItem('heykeen.cook-progress');
        const value: unknown = saved ? JSON.parse(saved) : null;
        const record = value && typeof value === 'object' ? value : null;
        const expiresAt = record && 'expiresAt' in record ? record.expiresAt : undefined;
        const steps: unknown[] =
          record && 'steps' in record && Array.isArray(record.steps) ? record.steps : [];
        if (active)
          setProgress(
            record &&
              'listId' in record &&
              record.listId === listId &&
              typeof expiresAt === 'number' &&
              expiresAt > Date.now()
              ? steps.filter(
                  (step): step is number =>
                    typeof step === 'number' && Number.isInteger(step) && step >= 0
                )
              : []
          );
        if (typeof expiresAt === 'number' && expiresAt <= Date.now())
          await nativeStateStorage.removeItem('heykeen.cook-progress');
      } catch {
        if (active) {
          setProgress([]);
          toast.warning('Saved cooking progress could not be opened.');
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [listId, native]);

  function toggleNativeStep(index: number) {
    if (!list || !progress) return;
    const next = progress.includes(index)
      ? progress.filter((step) => step !== index)
      : [...progress, index];
    setProgress(next);
    void Promise.resolve(
      nativeStateStorage.setItem(
        'heykeen.cook-progress',
        JSON.stringify({
          listId: list.listId,
          steps: next,
          expiresAt: Date.parse(list.mintedAt) + 7 * 24 * 60 * 60 * 1000,
        })
      )
    ).catch(() => toast.warning('Cooking progress could not be saved. Keep this screen open.'));
  }
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
                {progress === null && <p role="status">Opening your cooking progress…</p>}
                <ol>
                  {progress !== null &&
                    list.steps.map((step, index) => (
                      <Step
                        key={`${list.listId}:${index}`}
                        listId={list.listId}
                        text={step}
                        index={index}
                        checked={native ? progress.includes(index) : undefined}
                        onToggle={native ? () => toggleNativeStep(index) : undefined}
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
