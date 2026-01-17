// Skeleton loading placeholders
// Provides visual feedback during async data loading

interface SkeletonProps {
  className?: string;
  /** Animation can be disabled for reduced motion preference */
  animate?: boolean;
}

/** Base skeleton with shimmer animation */
function SkeletonBase({ className = '', animate = true }: SkeletonProps) {
  return (
    <div
      className={`
        bg-midnight-200 rounded
        ${animate ? 'animate-pulse' : ''}
        ${className}
      `}
      aria-hidden="true"
    />
  );
}

/** Single line of text */
export function SkeletonText({ className = '', animate = true }: SkeletonProps) {
  return <SkeletonBase className={`h-4 ${className}`} animate={animate} />;
}

/** Heading/title text */
export function SkeletonHeading({ className = '', animate = true }: SkeletonProps) {
  return <SkeletonBase className={`h-6 ${className}`} animate={animate} />;
}

/** Circular avatar */
export function SkeletonAvatar({ className = '', animate = true }: SkeletonProps & { size?: 'sm' | 'md' | 'lg' }) {
  return <SkeletonBase className={`rounded-full ${className}`} animate={animate} />;
}

/** Rectangular card/image placeholder */
export function SkeletonCard({ className = '', animate = true }: SkeletonProps) {
  return <SkeletonBase className={`rounded-xl ${className}`} animate={animate} />;
}

/** Button placeholder */
export function SkeletonButton({ className = '', animate = true }: SkeletonProps) {
  return <SkeletonBase className={`h-12 rounded-xl ${className}`} animate={animate} />;
}

/** Participant list item skeleton */
export function SkeletonParticipant({ animate = true }: { animate?: boolean }) {
  return (
    <div className="flex items-center space-x-3 p-3 bg-midnight-200/50 rounded-xl">
      <SkeletonBase className="w-10 h-10 rounded-full" animate={animate} />
      <div className="flex-1 space-y-2">
        <SkeletonText className="w-24" animate={animate} />
      </div>
      <SkeletonBase className="w-2.5 h-2.5 rounded-full" animate={animate} />
    </div>
  );
}

/** Restaurant card skeleton */
export function SkeletonRestaurantCard({ animate = true }: { animate?: boolean }) {
  return (
    <div className="bg-midnight-100 rounded-2xl p-4 space-y-3">
      <SkeletonCard className="w-full h-40" animate={animate} />
      <SkeletonHeading className="w-3/4" animate={animate} />
      <div className="flex items-center space-x-3">
        <SkeletonText className="w-12" animate={animate} />
        <SkeletonText className="w-8" animate={animate} />
        <SkeletonText className="w-16" animate={animate} />
      </div>
      <SkeletonText className="w-full" animate={animate} />
    </div>
  );
}

/** Selection result skeleton */
export function SkeletonResult({ animate = true }: { animate?: boolean }) {
  return (
    <div className="p-4 bg-midnight-200/30 rounded-xl space-y-2">
      <SkeletonHeading className="w-1/2" animate={animate} />
      <SkeletonText className="w-3/4" animate={animate} />
    </div>
  );
}

// Re-export base for custom use
export { SkeletonBase as Skeleton };
