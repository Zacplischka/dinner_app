import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';

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

/** A centred card with a heading, a line of body copy and whatever actions follow. */
export function Notice({
  heading,
  body,
  children,
}: {
  heading: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <div className="p-8 text-center bg-raised rounded-2xl shadow-card border border-line/30">
      <p className="text-lg text-text">{heading}</p>
      <p className="text-sm mt-1 text-muted">{body}</p>
      {children}
    </div>
  );
}
