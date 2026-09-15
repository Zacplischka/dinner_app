import { forwardRef, type ComponentPropsWithoutRef } from 'react';

/**
 * The inline error box under a form or a screen's content. Spacing comes from
 * the call site; pass `role="alert"` where the message should interrupt.
 */
export const ErrorNote = forwardRef<HTMLParagraphElement, ComponentPropsWithoutRef<'p'>>(
  function ErrorNote({ className = '', ...props }, ref) {
    return (
      <p
        ref={ref}
        {...props}
        className={`rounded-xl border border-coral/30 bg-coral/10 text-sm text-coral-soft ${className}`}
      />
    );
  }
);
