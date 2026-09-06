// How big a Deck the Host wants to swipe (#415) — one stepper, shared by all
// three setup screens because the question is the same on every Branch. Modelled
// on Cook setup's Headcount stepper, and stepping in fives so the whole range is
// a few taps on a phone.
//
// `max` differs per Branch: Eat Out and Takeaway stop at one Places page.

import { MIN_DECK_SIZE } from '@dinder/shared/types';

const STEP = 5;

interface DeckSizeStepperProps {
  value: number;
  onChange: (deckSize: number) => void;
  /** The largest Deck this Branch can deal. */
  max: number;
  /** What the Deck holds, in the Host's words: "restaurants", "recipes", "movies". */
  unit: string;
  disabled?: boolean;
}

export default function DeckSizeStepper({
  value,
  onChange,
  max,
  unit,
  disabled,
}: DeckSizeStepperProps) {
  return (
    <div>
      <label className="label" id="deckSizeLabel">
        Deck size
      </label>
      <p className="mb-3 text-xs text-muted">
        How many you&apos;ll swipe through. A thin night deals fewer.
      </p>
      <div className="flex items-center gap-4" role="group" aria-labelledby="deckSizeLabel">
        <button
          type="button"
          aria-label="Smaller Deck"
          onClick={() => onChange(Math.max(MIN_DECK_SIZE, value - STEP))}
          disabled={disabled || value <= MIN_DECK_SIZE}
          className="btn btn-secondary min-h-[44px] min-w-[44px] text-xl"
        >
          −
        </button>
        <span aria-live="polite" className="min-w-[7rem] text-center text-lg font-black">
          {value} {unit}
        </span>
        <button
          type="button"
          aria-label="Bigger Deck"
          onClick={() => onChange(Math.min(max, value + STEP))}
          disabled={disabled || value >= max}
          className="btn btn-secondary min-h-[44px] min-w-[44px] text-xl"
        >
          +
        </button>
      </div>
    </div>
  );
}
