import { useState } from 'react';
import { MIN_DECK_SIZE, type Branch } from '@dinder/shared/types';
import pizza from '../assets/deck-preview/pizza.webp';
import dumplings from '../assets/deck-preview/dumplings.webp';
import noodles from '../assets/deck-preview/noodles.webp';
import orbit from '../assets/deck-preview/watch-orbit.webp';
import noir from '../assets/deck-preview/watch-noir.webp';
import summer from '../assets/deck-preview/watch-summer.webp';
import './DeckSizeStepper.css';

const STEP = 5;
// Illustrative artwork only: choosing the Deck size must never fetch its supply.
const PREVIEWS = {
  takeaway: [
    { image: dumplings, name: 'Golden dumplings', detail: 'Japanese · Gyoza' },
    { image: pizza, name: 'Wood-fired pizza', detail: 'Italian · Pizza' },
    { image: noodles, name: 'Chilli oil noodles', detail: 'Chinese · Noodles' },
  ],
  eatout: [
    { image: dumplings, name: 'Dumpling house', detail: 'Japanese · Restaurant' },
    { image: pizza, name: 'Pizza kitchen', detail: 'Italian · Restaurant' },
    { image: noodles, name: 'Noodle bar', detail: 'Chinese · Restaurant' },
  ],
  cook: [
    { image: dumplings, name: 'Pan-fried dumplings', detail: 'Recipe · Japanese' },
    { image: pizza, name: 'Margherita pizza', detail: 'Recipe · Italian' },
    { image: noodles, name: 'Chilli oil noodles', detail: 'Recipe · Chinese' },
  ],
  watch: [
    { image: noir, name: 'After midnight', detail: 'Series · Mystery' },
    { image: orbit, name: 'Beyond orbit', detail: 'Film · Sci-fi' },
    { image: summer, name: 'One last summer', detail: 'Film · Drama' },
  ],
} satisfies Record<Branch, { image: string; name: string; detail: string }[]>;

interface DeckSizeStepperProps {
  branch: Branch;
  value: number;
  onChange: (deckSize: number) => void;
  /** The largest Deck this Branch can deal. */
  max: number;
  /** What the Deck holds: restaurants, recipes or titles (films and series). */
  unit: string;
  disabled?: boolean;
}

export default function DeckSizeStepper({
  branch,
  value,
  onChange,
  max,
  unit,
  disabled,
}: DeckSizeStepperProps) {
  const [sizes, setSizes] = useState({ value, previous: value });
  // Keep each transition stable through unrelated roster or pending-state renders.
  if (sizes.value !== value) setSizes({ value, previous: sizes.value });
  const previous = sizes.previous;
  const photos = PREVIEWS[branch];
  return (
    <div>
      <label className="label" id="deckSizeLabel">
        Deck size
      </label>
      <p className="mb-3 text-xs text-muted">
        How many you&apos;ll swipe through. A thin night deals fewer.
      </p>
      <div className="deck-preview" data-deck-preview={branch} aria-hidden="true">
        <div className="deck-preview-stack">
          {Array.from({ length: max }, (_, index) => {
            const active = index < value;
            const depth = value - index - 1;
            const top = Math.min(2, Math.max(0, depth));
            const tail = Math.max(0, depth - 2);
            const photo = photos[index % photos.length];
            const entering = active && index >= previous;
            const leaving = !active && index < previous;
            return (
              <div
                key={index}
                className={`deck-preview-card${depth === 0 ? ' deck-preview-front' : ''}`}
                data-deck-preview-card
                data-active={active}
                style={{
                  zIndex: index + 1,
                  opacity: active ? 1 : 0,
                  transform: active
                    ? `translate(${-10 + top * (20 + (value - 20) * 0.09) + tail * 0.25}%,${25 - top * 23 + tail * 1.25}px) rotate(${-8 + top * 8}deg)`
                    : `translate(${leaving ? -110 : 120}%,-70px) rotate(${leaving ? -30 : 24}deg)`,
                  transitionDelay: `${entering ? (index - previous) * 45 : leaving ? (previous - index - 1) * 30 : 0}ms`,
                  filter: `brightness(${depth <= 2 ? 1 : 0.65})`,
                }}
              >
                <img src={photo.image} alt="" className="deck-preview-photo" decoding="async" />
                <div className="deck-preview-caption">
                  <span>{photo.name}</span>
                  <small>{photo.detail}</small>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div
        className="flex items-center justify-center gap-4"
        role="group"
        aria-labelledby="deckSizeLabel"
      >
        <button
          type="button"
          aria-label="Smaller Deck"
          onClick={() => onChange(Math.max(MIN_DECK_SIZE, value - STEP))}
          disabled={disabled || value <= MIN_DECK_SIZE}
          className="btn btn-secondary min-h-[44px] min-w-[44px] text-xl"
        >
          −
        </button>
        <span
          aria-live="polite"
          aria-atomic="true"
          className="min-w-0 text-center text-lg font-black"
        >
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
