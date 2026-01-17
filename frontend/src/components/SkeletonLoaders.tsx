// Skeleton loading components for better perceived performance
// Creates smooth shimmer effects during data loading

interface SkeletonProps {
  className?: string;
}

// Base skeleton element with shimmer animation
export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`relative overflow-hidden bg-midnight-200 rounded ${className}`}
    >
      <div className="absolute inset-0 shimmer animate-shimmer" />
    </div>
  );
}

// Restaurant card skeleton
export function RestaurantCardSkeleton({ variant = 'grid' }: { variant?: 'grid' | 'list' }) {
  if (variant === 'list') {
    return (
      <div className="bg-midnight-100 rounded-2xl border border-midnight-50/30 overflow-hidden">
        <div className="flex flex-col sm:flex-row">
          {/* Rank placeholder */}
          <div className="hidden sm:flex w-20 flex-shrink-0 items-center justify-center bg-midnight-200 border-r border-midnight-50/30">
            <Skeleton className="w-8 h-10 rounded" />
          </div>

          {/* Image placeholder */}
          <div className="h-40 sm:h-auto sm:w-40 flex-shrink-0">
            <Skeleton className="w-full h-full rounded-none" />
          </div>

          {/* Content */}
          <div className="flex-1 p-5">
            <div className="space-y-3">
              <Skeleton className="h-7 w-3/4 rounded-lg" />
              <Skeleton className="h-4 w-1/2 rounded" />
              <Skeleton className="h-4 w-full rounded" />
              <div className="flex gap-2 pt-2">
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-midnight-100 rounded-2xl border border-midnight-50/30 overflow-hidden">
      <Skeleton className="h-36 w-full rounded-none" />
      <div className="p-4 space-y-3">
        <div className="flex justify-between items-start">
          <Skeleton className="h-5 w-2/3 rounded" />
          <Skeleton className="h-5 w-10 rounded" />
        </div>
        <Skeleton className="h-4 w-full rounded" />
      </div>
    </div>
  );
}

// Collection card skeleton
export function CollectionCardSkeleton() {
  return (
    <div className="aspect-[3/2] rounded-2xl overflow-hidden">
      <Skeleton className="w-full h-full rounded-none" />
    </div>
  );
}

// Cuisine card skeleton
export function CuisineCardSkeleton() {
  return (
    <div className="aspect-[4/3] rounded-2xl overflow-hidden">
      <Skeleton className="w-full h-full rounded-none" />
    </div>
  );
}

// Full page loading skeleton for Explore page
export function ExplorePageSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">
      {/* Hero section skeleton */}
      <div className="text-center py-8 space-y-4">
        <Skeleton className="h-12 w-80 mx-auto rounded-xl" />
        <Skeleton className="h-6 w-96 mx-auto rounded" />
      </div>

      {/* Collections skeleton */}
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-48 rounded-lg" />
          <Skeleton className="h-4 w-16 rounded" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <CollectionCardSkeleton key={i} />
          ))}
        </div>
      </div>

      {/* Cuisine skeleton */}
      <div className="space-y-6">
        <Skeleton className="h-8 w-40 rounded-lg" />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          {[...Array(10)].map((_, i) => (
            <CuisineCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

// Restaurant list skeleton
export function RestaurantListSkeleton({ count = 6, variant = 'grid' }: { count?: number; variant?: 'grid' | 'list' }) {
  if (variant === 'list') {
    return (
      <div className="space-y-4">
        {[...Array(count)].map((_, i) => (
          <RestaurantCardSkeleton key={i} variant="list" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {[...Array(count)].map((_, i) => (
        <RestaurantCardSkeleton key={i} variant="grid" />
      ))}
    </div>
  );
}

// Hero section skeleton for list pages
export function ListHeroSkeleton() {
  return (
    <div className="relative bg-midnight-200 py-16 sm:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl space-y-6">
          <div className="flex gap-2">
            <Skeleton className="h-4 w-16 rounded" />
            <Skeleton className="h-4 w-20 rounded" />
            <Skeleton className="h-4 w-24 rounded" />
          </div>
          <div className="flex items-start gap-6">
            <Skeleton className="w-20 h-20 rounded-2xl" />
            <div className="space-y-3 flex-1">
              <Skeleton className="h-12 w-64 rounded-xl" />
              <Skeleton className="h-8 w-40 rounded-lg" />
            </div>
          </div>
          <Skeleton className="h-16 w-full rounded-xl" />
          <div className="flex gap-4">
            <Skeleton className="h-4 w-24 rounded" />
            <Skeleton className="h-4 w-28 rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}
