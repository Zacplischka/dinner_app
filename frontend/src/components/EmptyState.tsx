// Empty state component for "no data" scenarios
// Provides friendly feedback when lists are empty or searches return no results

import type { ReactNode } from 'react';

interface EmptyStateProps {
  /** Icon to display (as ReactNode, typically an SVG) */
  icon?: ReactNode;
  /** Main heading */
  title: string;
  /** Descriptive text */
  description?: string;
  /** Optional call-to-action button */
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Additional class names */
  className?: string;
}

export default function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 px-4 text-center ${className}`}>
      {/* Icon container */}
      {icon && (
        <div className="w-16 h-16 mb-4 bg-midnight-200/50 rounded-full flex items-center justify-center text-cream-500">
          {icon}
        </div>
      )}

      {/* Title */}
      <h3 className="text-lg font-display font-semibold text-cream mb-2">
        {title}
      </h3>

      {/* Description */}
      {description && (
        <p className="text-sm text-cream-500 max-w-xs mb-6">
          {description}
        </p>
      )}

      {/* Action button */}
      {action && (
        <button
          onClick={action.onClick}
          className="px-6 py-2.5 text-sm font-medium text-midnight bg-gradient-to-r from-amber to-amber-300 rounded-xl hover:from-amber-300 hover:to-amber-200 active:scale-[0.98] transition-all duration-300 shadow-glow hover:shadow-glow-lg"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

// Preset empty states for common scenarios
export function NoResultsEmpty({ onRetry }: { onRetry?: () => void }) {
  return (
    <EmptyState
      icon={
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      }
      title="No results found"
      description="Try adjusting your search or filters to find what you're looking for."
      action={onRetry ? { label: 'Try Again', onClick: onRetry } : undefined}
    />
  );
}

export function NoRestaurantsEmpty({ onExpand }: { onExpand?: () => void }) {
  return (
    <EmptyState
      icon={
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      }
      title="No restaurants nearby"
      description="We couldn't find restaurants in your area. Try expanding the search radius."
      action={onExpand ? { label: 'Expand Search', onClick: onExpand } : undefined}
    />
  );
}

export function NoMatchesEmpty({ onRestart }: { onRestart?: () => void }) {
  return (
    <EmptyState
      icon={
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      }
      title="No overlapping choices"
      description="Nobody selected the same restaurants. Try again with different preferences!"
      action={onRestart ? { label: 'Select Again', onClick: onRestart } : undefined}
    />
  );
}

export function NoParticipantsEmpty() {
  return (
    <EmptyState
      icon={
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      }
      title="Waiting for participants"
      description="Share the session code with friends to get started."
    />
  );
}
