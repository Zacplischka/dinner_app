// Mobile-native action sheet (bottom drawer)
// Provides contextual options in a familiar mobile pattern

import { useEffect, useRef, type ReactNode } from 'react';

interface ActionSheetOption {
  /** Unique identifier */
  id: string;
  /** Display label */
  label: string;
  /** Optional icon */
  icon?: ReactNode;
  /** Callback when selected */
  onSelect: () => void;
  /** Style variant */
  variant?: 'default' | 'danger';
  /** Disabled state */
  disabled?: boolean;
}

interface ActionSheetProps {
  /** Whether the sheet is open */
  isOpen: boolean;
  /** Close handler */
  onClose: () => void;
  /** Sheet title */
  title?: string;
  /** Optional description below title */
  description?: string;
  /** Action options */
  options: ActionSheetOption[];
  /** Show cancel button */
  showCancel?: boolean;
  /** Cancel button label */
  cancelLabel?: string;
}

export default function ActionSheet({
  isOpen,
  onClose,
  title,
  description,
  options,
  showCancel = true,
  cancelLabel = 'Cancel',
}: ActionSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Trap focus within sheet
  useEffect(() => {
    if (isOpen && sheetRef.current) {
      const focusableElements = sheetRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusableElements.length > 0) {
        focusableElements[0].focus();
      }
    }
  }, [isOpen]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleOptionClick = (option: ActionSheetOption) => {
    if (!option.disabled) {
      option.onSelect();
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'action-sheet-title' : undefined}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-midnight/70 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className="relative w-full max-w-md mx-4 mb-4 animate-slide-up"
      >
        {/* Main options container */}
        <div className="bg-midnight-100 rounded-2xl overflow-hidden border border-midnight-50/30 shadow-card">
          {/* Header */}
          {(title || description) && (
            <div className="px-4 py-3 text-center border-b border-midnight-50/30">
              {title && (
                <h3 id="action-sheet-title" className="text-sm font-semibold text-cream">
                  {title}
                </h3>
              )}
              {description && (
                <p className="text-xs text-cream-500 mt-1">{description}</p>
              )}
            </div>
          )}

          {/* Options */}
          <div className="divide-y divide-midnight-50/30">
            {options.map((option) => (
              <button
                key={option.id}
                onClick={() => handleOptionClick(option)}
                disabled={option.disabled}
                className={`
                  w-full min-h-[52px] px-4 py-3 flex items-center justify-center gap-3
                  text-base font-medium transition-colors duration-200
                  ${option.variant === 'danger'
                    ? 'text-error-light hover:bg-error/10 active:bg-error/20'
                    : 'text-cream hover:bg-midnight-200 active:bg-midnight-300'
                  }
                  ${option.disabled ? 'opacity-40 cursor-not-allowed' : ''}
                `}
              >
                {option.icon && (
                  <span className={option.variant === 'danger' ? 'text-error' : 'text-cream-400'}>
                    {option.icon}
                  </span>
                )}
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Cancel button (separate for iOS-style appearance) */}
        {showCancel && (
          <button
            onClick={onClose}
            className="w-full min-h-[52px] mt-2 px-4 py-3 bg-midnight-100 rounded-2xl text-base font-semibold text-amber border border-midnight-50/30 hover:bg-midnight-200 active:bg-midnight-300 transition-colors duration-200 shadow-card"
          >
            {cancelLabel}
          </button>
        )}
      </div>
    </div>
  );
}
