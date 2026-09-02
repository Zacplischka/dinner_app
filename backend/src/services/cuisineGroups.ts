// The cuisine groupings the Nearest Craving's ladder walks (#334), shipped as
// reference data beside the AU term table and the Staples (ADR 0011): a
// partition of the setup screen's cuisine chips into the neighbourhoods a Host
// would accept a swap within.
//
// Relaxation is an offer, never an act (#317), and only cuisine ever moves:
// widening a diet chip would silently serve a vegan Craving a non-vegan
// Recipe, and a meal type is not a preference at all. Both ride through
// untouched here by construction — a step is the same Craving with a different
// cuisine set, and nothing else.
import type { Craving, Cuisine } from '@dinder/shared/types';

/**
 * Every chip lands in exactly one group, so widening is a lookup rather than a
 * distance metric. `cuisineGroups.test.ts` holds the partition to the shared
 * vocabulary: a new chip (#322's `modern australian`) fails that test until it
 * is placed here.
 */
export const CUISINE_GROUPS: readonly { label: string; cuisines: readonly Cuisine[] }[] = [
  { label: 'Asian', cuisines: ['chinese', 'indian', 'japanese', 'korean', 'thai', 'vietnamese'] },
  {
    label: 'Mediterranean',
    cuisines: ['french', 'greek', 'italian', 'mediterranean', 'middle eastern', 'spanish'],
  },
  { label: 'the Americas', cuisines: ['american', 'mexican'] },
];

/** One rung: the Craving on offer, and the words that name what widened. */
export interface RelaxationStep {
  craving: Craving;
  label: string;
}

const key = (cuisines: readonly Cuisine[]) => [...cuisines].sort().join(',');

/**
 * The Cravings a Craving may be offered instead of, nearest first: its cuisine
 * widened to the group(s) its chips reach into, then cuisine dropped
 * altogether. A step that would be the Craving that already dealt nothing is
 * skipped, and a Craving naming no cuisine has no ladder at all — nothing may
 * be relaxed but cuisine, so the refusal stands.
 */
export function relaxationLadder(craving: Craving): RelaxationStep[] {
  const groups = CUISINE_GROUPS.filter((group) =>
    craving.cuisines.some((cuisine) => group.cuisines.includes(cuisine))
  );
  const rungs = [
    {
      cuisines: groups.flatMap((group) => [...group.cuisines]),
      label: groups.map((group) => group.label).join(' or '),
    },
    { cuisines: [] as Cuisine[], label: 'any cuisine' },
  ];
  const seen = new Set([key(craving.cuisines)]);
  const ladder: RelaxationStep[] = [];
  for (const rung of rungs) {
    if (seen.has(key(rung.cuisines))) continue;
    seen.add(key(rung.cuisines));
    ladder.push({ craving: { ...craving, cuisines: rung.cuisines }, label: rung.label });
  }
  return ladder;
}
