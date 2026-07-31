// PROTOTYPE — throwaway. Issue #230 "Prototype the entry fork screen".
//
// Three variants of the top-level branch fork (eat out / takeaway / cook) plus the
// cook setup step behind it, switchable via `?variant=` on the existing `/` route.
//
//   A — fork REPLACES Home; solo/group is a second screen.
//   B — fork SITS AFTER Home (today's Home survives); solo/group is a toggle on the fork screen.
//   C — fork REPLACES Home; solo/group is never asked — solo is implied, inviting is an action.
//
// Nothing here is wired to a real Session. Not for production.

import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export const PROTOTYPE_VARIANTS = ['A', 'B', 'C'] as const;
export const VARIANT_NAMES: Record<string, string> = {
  A: 'Fork replaces Home · solo/group second screen',
  B: 'Fork after Home · solo/group toggle',
  C: 'Fork replaces Home · solo implied',
};

const BRANCHES = [
  {
    key: 'eatout',
    label: 'Eat out',
    icon: '🍽',
    blurb: 'Swipe nearby places, end on one Top Pick.',
    accent: 'coral',
  },
  {
    key: 'takeaway',
    label: 'Takeaway',
    icon: '🛵',
    blurb: 'Same nearby deck, then compare prices and split the order.',
    accent: 'cyan',
  },
  {
    key: 'cook',
    label: 'Cook',
    icon: '🍳',
    blurb: 'Swipe meals, get a priced Coles list you can claim from.',
    accent: 'lime',
  },
] as const;

const ACCENT: Record<string, string> = {
  coral: 'border-coral/50 hover:border-coral text-coral-soft shadow-glow-coral',
  cyan: 'border-cyan/50 hover:border-cyan text-cyan shadow-glow-cyan',
  lime: 'border-lime/50 hover:border-lime text-lime shadow-glow-lime',
};

const MEAL_TYPES = ['Dinner', 'Lunch', 'Breakfast', 'Dessert'];
const CUISINES = [
  'Italian',
  'Asian',
  'Mexican',
  'Indian',
  'Middle Eastern',
  'Pub food',
  'Surprise me',
];
const DIETS = ['Vegetarian', 'Vegan', 'Gluten free', 'Dairy free', 'Nut free', 'Pescatarian'];

// ---------------------------------------------------------------- state (URL)

function usePrototypeState() {
  const [params, setParams] = useSearchParams();
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) v === null ? next.delete(k) : next.set(k, v);
    setParams(next, { replace: true });
  };
  const list = (key: string) => (params.get(key) ?? '').split(',').filter(Boolean);
  const toggle = (key: string, value: string) => {
    const current = list(key);
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    set({ [key]: next.length ? next.join(',') : null });
  };
  return {
    variant: params.get('variant') ?? 'A',
    screen: params.get('screen'),
    branch: params.get('branch'),
    mode: params.get('mode'),
    meal: params.get('meal'),
    cuisines: list('cuisines'),
    diets: list('diets'),
    heads: Number(params.get('heads') ?? '2'),
    set,
    toggle,
  };
}

// ---------------------------------------------------------------- shared bits

function Chip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[44px] rounded-full border px-4 text-sm font-bold transition-colors ${
        on ? 'border-cyan bg-cyan/15 text-cyan' : 'border-line bg-raised text-muted hover:text-text'
      }`}
    >
      {label}
    </button>
  );
}

function BranchCard({
  branch,
  onClick,
  big,
}: {
  branch: (typeof BRANCHES)[number];
  onClick: () => void;
  big?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex w-full items-center gap-4 rounded-market-lg border bg-surface/90 text-left transition-all hover:-translate-y-0.5 ${ACCENT[branch.accent]} ${
        big ? 'p-6' : 'p-4'
      }`}
    >
      <span className={big ? 'text-4xl' : 'text-2xl'} aria-hidden="true">
        {branch.icon}
      </span>
      <span className="flex-1">
        <span
          className={`block font-black tracking-[-0.03em] ${big ? 'text-3xl' : 'text-xl'} text-text`}
        >
          {branch.label}
        </span>
        <span className="block text-sm text-muted">{branch.blurb}</span>
      </span>
      <span aria-hidden="true" className="text-2xl opacity-40 group-hover:opacity-100">
        →
      </span>
    </button>
  );
}

function StateReadout({ state }: { state: ReturnType<typeof usePrototypeState> }) {
  const { variant, screen, branch, mode, meal, cuisines, diets, heads } = state;
  return (
    <pre className="mx-auto mt-10 max-w-xl overflow-x-auto rounded-market-md border border-line bg-black/40 p-4 text-[11px] leading-relaxed text-muted">
      {JSON.stringify({ variant, screen, branch, mode, meal, cuisines, diets, heads }, null, 2)}
    </pre>
  );
}

function Shell({
  title,
  sub,
  onBack,
  children,
}: {
  title: string;
  sub?: string;
  onBack?: () => void;
  children: React.ReactNode;
}) {
  return (
    <main className="market-backdrop min-h-screen px-4 pb-32 pt-10">
      <div className="mx-auto w-full max-w-xl animate-fade-in">
        {onBack && (
          <button onClick={onBack} className="mb-6 min-h-[44px] text-sm font-bold text-cyan">
            ← Back
          </button>
        )}
        <h1 className="mb-2 text-[clamp(2.4rem,9vw,3.6rem)] font-black leading-[0.9] tracking-[-0.06em] text-text">
          {title}
        </h1>
        {sub && <p className="mb-8 text-base text-text/70">{sub}</p>}
        {children}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------- cook setup

function CookSetup({ state }: { state: ReturnType<typeof usePrototypeState> }) {
  const { mode, meal, cuisines, diets, heads, set, toggle, variant } = state;
  return (
    <Shell
      title="What are we cooking?"
      sub="Rough shape only — this narrows the meal deck, it doesn't promise anything."
      onBack={() => set({ screen: variant === 'C' ? null : 'mode', branch: null })}
    >
      <div className="card space-y-7">
        <div>
          <span className="label mb-3 block">Meal</span>
          <div className="flex flex-wrap gap-2">
            {MEAL_TYPES.map((m) => (
              <Chip key={m} label={m} on={meal === m} onClick={() => set({ meal: m })} />
            ))}
          </div>
        </div>

        <div>
          <span className="label mb-3 block">Cuisine</span>
          <div className="flex flex-wrap gap-2">
            {CUISINES.map((c) => (
              <Chip
                key={c}
                label={c}
                on={cuisines.includes(c)}
                onClick={() => toggle('cuisines', c)}
              />
            ))}
          </div>
        </div>

        <div>
          <span className="label mb-1 block">Diet</span>
          <p className="mb-3 text-xs text-muted">
            A filter on the deck — not an allergy-safety guarantee. Always check the recipe.
          </p>
          <div className="flex flex-wrap gap-2">
            {DIETS.map((d) => (
              <Chip key={d} label={d} on={diets.includes(d)} onClick={() => toggle('diets', d)} />
            ))}
          </div>
        </div>

        <div>
          <span className="label mb-3 block">Cooking for</span>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => set({ heads: String(Math.max(1, heads - 1)) })}
              className="btn btn-secondary h-12 w-12 text-xl"
              aria-label="Fewer people"
            >
              −
            </button>
            <span className="min-w-[5ch] text-center text-3xl font-black text-text">{heads}</span>
            <button
              type="button"
              onClick={() => set({ heads: String(Math.min(12, heads + 1)) })}
              className="btn btn-secondary h-12 w-12 text-xl"
              aria-label="More people"
            >
              +
            </button>
            <span className="text-sm text-muted">
              {mode === 'group' ? 'people eating (not just swipers)' : 'people eating'}
            </span>
          </div>
        </div>

        {/* Variant C never asked solo/group — inviting is an action available here instead. */}
        {variant === 'C' && (
          <div className="rounded-market-md border border-violet/40 bg-violet/10 p-4">
            <p className="text-sm font-bold text-text">Deciding on your own</p>
            <p className="mb-3 text-xs text-muted">
              You can pull people in at any point — before you swipe or halfway through.
            </p>
            <button type="button" className="btn btn-secondary min-h-[44px] w-full text-sm">
              ⌁ Invite people
            </button>
          </div>
        )}

        <button type="button" className="btn btn-primary min-h-[52px] w-full text-lg" disabled>
          Start swiping meals
        </button>
      </div>
      <StateReadout state={state} />
    </Shell>
  );
}

// ---------------------------------------------------------------- variant A

function VariantA({ state }: { state: ReturnType<typeof usePrototypeState> }) {
  const { screen, branch, set } = state;
  const navigate = useNavigate();

  if (screen === 'mode') {
    const picked = BRANCHES.find((b) => b.key === branch);
    return (
      <Shell
        title="Just you, or the table?"
        sub={`${picked?.label ?? 'Deciding'} — pick how you want to decide.`}
        onBack={() => set({ screen: null, branch: null })}
      >
        <div className="grid gap-4">
          <button
            type="button"
            onClick={() =>
              branch === 'cook' ? set({ mode: 'solo', screen: 'cook' }) : navigate('/create')
            }
            className="rounded-market-lg border border-line bg-surface/90 p-6 text-left hover:border-cyan"
          >
            <span className="block text-2xl font-black text-text">Just me</span>
            <span className="block text-sm text-muted">Swipe on your own, decide in a minute.</span>
          </button>
          <button
            type="button"
            onClick={() =>
              branch === 'cook' ? set({ mode: 'group', screen: 'cook' }) : navigate('/create')
            }
            className="rounded-market-lg border border-line bg-surface/90 p-6 text-left hover:border-coral"
          >
            <span className="block text-2xl font-black text-text">Decide with friends</span>
            <span className="block text-sm text-muted">
              Share a code, everyone swipes, the overlap wins.
            </span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/join')}
            className="btn btn-ghost min-h-[52px] text-base"
          >
            Someone sent me a code
          </button>
        </div>
        <StateReadout state={state} />
      </Shell>
    );
  }

  return (
    <Shell title="What's for dinner?" sub="Tonight · Melbourne">
      <div className="grid gap-4">
        {BRANCHES.map((b) => (
          <BranchCard
            key={b.key}
            branch={b}
            big
            onClick={() => set({ branch: b.key, screen: 'mode' })}
          />
        ))}
      </div>
      <div className="mt-8 flex flex-wrap justify-center gap-6 text-sm">
        <button onClick={() => navigate('/join')} className="min-h-[44px] font-bold text-cyan">
          Join with a code
        </button>
        <button onClick={() => navigate('/compare')} className="min-h-[44px] text-muted">
          Compare delivery prices
        </button>
      </div>
      <StateReadout state={state} />
    </Shell>
  );
}

// ---------------------------------------------------------------- variant B

function VariantB({ state }: { state: ReturnType<typeof usePrototypeState> }) {
  const { mode, set } = state;
  const navigate = useNavigate();
  const current = mode ?? 'group';

  return (
    <Shell
      title="How are we eating?"
      onBack={() => set({ screen: null, branch: null, mode: null })}
    >
      <div
        role="radiogroup"
        aria-label="Deciding alone or together"
        className="mb-7 grid grid-cols-2 gap-1 rounded-full border border-line bg-raised p-1"
      >
        {[
          ['solo', 'Just me'],
          ['group', 'With friends'],
        ].map(([value, label]) => (
          <button
            key={value}
            role="radio"
            aria-checked={current === value}
            onClick={() => set({ mode: value })}
            className={`min-h-[44px] rounded-full text-sm font-black transition-colors ${
              current === value ? 'bg-coral text-white' : 'text-muted'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-3">
        {BRANCHES.map((b) => (
          <BranchCard
            key={b.key}
            branch={b}
            onClick={() =>
              b.key === 'cook'
                ? set({ branch: b.key, mode: current, screen: 'cook' })
                : navigate('/create')
            }
          />
        ))}
      </div>

      <p className="mt-6 text-center text-sm text-muted">
        {current === 'group'
          ? "You'll get a code to share once you pick."
          : 'No code, no waiting — straight into swiping.'}
      </p>
      <StateReadout state={state} />
    </Shell>
  );
}

// ---------------------------------------------------------------- variant C

function VariantC({ state }: { state: ReturnType<typeof usePrototypeState> }) {
  const { set } = state;
  const navigate = useNavigate();

  return (
    <main className="market-backdrop min-h-screen px-4 pb-32 pt-10">
      <div className="mx-auto w-full max-w-xl animate-fade-in">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan/30 bg-surface/80 px-3 py-2 text-xs font-extrabold uppercase tracking-[0.06em] text-cyan">
          <span className="live-dot" aria-hidden="true" />
          Tonight · Melbourne
        </div>
        <h1 className="mb-8 text-[clamp(2.8rem,11vw,4.4rem)] font-black leading-[0.86] tracking-[-0.07em] text-text">
          Tonight <span className="neon-outline block italic">you&apos;re…</span>
        </h1>

        <div className="grid gap-3 sm:grid-cols-3">
          {BRANCHES.map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={() =>
                b.key === 'cook' ? set({ branch: b.key, screen: 'cook' }) : navigate('/create')
              }
              className={`flex min-h-[180px] flex-col justify-between rounded-market-lg border bg-surface/90 p-5 text-left transition-all hover:-translate-y-1 ${ACCENT[b.accent]}`}
            >
              <span className="text-4xl" aria-hidden="true">
                {b.icon}
              </span>
              <span>
                {/* C reads as one sentence: "Tonight you're… eating out". */}
                <span className="block text-2xl font-black tracking-[-0.03em] text-text">
                  {{ eatout: 'eating out', takeaway: 'getting takeaway', cook: 'cooking' }[b.key]}
                </span>
                <span className="block text-xs text-muted">{b.blurb}</span>
              </span>
            </button>
          ))}
        </div>

        <p className="mt-6 text-sm text-muted">
          Starts as just you. Pull friends in whenever — before you swipe or halfway through.
        </p>

        <div className="mt-8 flex flex-wrap gap-6 text-sm">
          <button onClick={() => navigate('/join')} className="min-h-[44px] font-bold text-cyan">
            Join with a code
          </button>
          <button onClick={() => navigate('/compare')} className="min-h-[44px] text-muted">
            Compare delivery prices
          </button>
        </div>
        <StateReadout state={state} />
      </div>
    </main>
  );
}

// ---------------------------------------------------------------- switcher

export function PrototypeSwitcher({ current }: { current: string }) {
  const [, setParams] = useSearchParams();

  const go = (step: number) => {
    const i = PROTOTYPE_VARIANTS.indexOf(current as (typeof PROTOTYPE_VARIANTS)[number]);
    const next =
      PROTOTYPE_VARIANTS[(i + step + PROTOTYPE_VARIANTS.length) % PROTOTYPE_VARIANTS.length];
    setParams(new URLSearchParams({ variant: next }), { replace: true });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (
        el instanceof HTMLElement &&
        (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      )
        return;
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (import.meta.env.PROD) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border-2 border-white bg-black px-2 py-2 text-white shadow-card">
      <button
        onClick={() => go(-1)}
        aria-label="Previous variant"
        className="h-10 w-10 rounded-full hover:bg-white/20"
      >
        ←
      </button>
      <span className="px-2 text-center text-xs font-bold leading-tight">
        {current} — {VARIANT_NAMES[current]}
      </span>
      <button
        onClick={() => go(1)}
        aria-label="Next variant"
        className="h-10 w-10 rounded-full hover:bg-white/20"
      >
        →
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- entry

export default function EntryForkPrototype() {
  const state = usePrototypeState();
  const { variant, screen } = state;

  if (screen === 'cook') return <CookSetup state={state} />;
  if (variant === 'B') return <VariantB state={state} />;
  if (variant === 'C') return <VariantC state={state} />;
  return <VariantA state={state} />;
}
