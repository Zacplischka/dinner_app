// Shared "Current location / Suburb or postcode" selector for the two
// location-entry flows (Create Session and Venue discovery).

export type LocationMode = 'current' | 'manual';

interface LocationModeToggleProps {
  mode: LocationMode;
  onSelect: (mode: LocationMode) => void;
  disabled?: boolean;
  ariaLabel: string;
  className?: string;
}

export default function LocationModeToggle({
  mode,
  onSelect,
  disabled = false,
  ariaLabel,
  className = '',
}: LocationModeToggleProps) {
  const optionClass = (option: LocationMode) =>
    `btn text-sm ${
      mode === option
        ? 'border border-cyan/60 bg-cyan/10 text-cyan shadow-glow-cyan'
        : 'btn-secondary'
    }`;

  return (
    <div role="group" aria-label={ariaLabel} className={`grid grid-cols-2 gap-2 ${className}`}>
      <button
        type="button"
        onClick={() => onSelect('current')}
        disabled={disabled}
        aria-pressed={mode === 'current'}
        className={optionClass('current')}
      >
        Current location
      </button>
      <button
        type="button"
        onClick={() => onSelect('manual')}
        disabled={disabled}
        aria-pressed={mode === 'manual'}
        className={optionClass('manual')}
      >
        Suburb or postcode
      </button>
    </div>
  );
}
