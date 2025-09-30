// OptionSelector component - Multi-select list of dinner options with checkboxes
// Based on: specs/001-dinner-decider-enables/tasks.md T058

import type { DinnerOption } from '@dinner-app/shared/types';

interface OptionSelectorProps {
  options: DinnerOption[];
  selectedOptions: string[];
  onSelectionChange: (optionId: string) => void;
  disabled?: boolean;
}

export default function OptionSelector({
  options,
  selectedOptions,
  onSelectionChange,
  disabled = false,
}: OptionSelectorProps) {
  if (options.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <p>No options available</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {options.map((option) => {
        const isSelected = selectedOptions.includes(option.optionId);

        return (
          <button
            key={option.optionId}
            onClick={() => !disabled && onSelectionChange(option.optionId)}
            disabled={disabled}
            className={`w-full min-h-[44px] p-4 text-left rounded-lg border-2 transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${
              isSelected
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
            // Accessibility
            role="checkbox"
            aria-checked={isSelected}
            aria-label={`${option.displayName}${option.description ? `: ${option.description}` : ''}`}
          >
            <div className="flex items-center space-x-3">
              {/* Checkbox */}
              <div
                className={`w-6 h-6 min-w-[24px] rounded border-2 flex items-center justify-center ${
                  isSelected
                    ? 'border-blue-500 bg-blue-500'
                    : 'border-gray-300 bg-white'
                }`}
              >
                {isSelected && (
                  <svg
                    className="w-4 h-4 text-white"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M5 13l4 4L19 7"></path>
                  </svg>
                )}
              </div>

              {/* Option details */}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900">
                  {option.displayName}
                </p>
                {option.description && (
                  <p className="text-sm text-gray-500 mt-0.5">
                    {option.description}
                  </p>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}