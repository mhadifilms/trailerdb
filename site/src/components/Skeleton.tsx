export function MovieCardSkeleton() {
  return (
    <div className="w-full">
      <div className="skeleton aspect-[2/3] rounded-lg" />
      <div className="mt-2 space-y-1.5">
        <div className="skeleton h-4 w-3/4 rounded" />
        <div className="skeleton h-3 w-1/2 rounded" />
      </div>
    </div>
  )
}

export function TrailerCardSkeleton() {
  return (
    <div className="w-full">
      <div className="skeleton aspect-video rounded-lg" />
      <div className="mt-2 space-y-1.5">
        <div className="skeleton h-4 w-5/6 rounded" />
        <div className="skeleton h-3 w-1/3 rounded" />
      </div>
    </div>
  )
}

export function MovieDetailSkeleton() {
  return (
    <div>
      {/* Backdrop */}
      <div className="skeleton w-full h-[50vh] min-h-[400px]" />
      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 -mt-32 relative z-10">
        <div className="flex gap-8">
          <div className="skeleton w-[200px] h-[300px] rounded-lg shrink-0 hidden md:block" />
          <div className="flex-1 space-y-4 pt-8">
            <div className="skeleton h-10 w-2/3 rounded" />
            <div className="skeleton h-5 w-1/3 rounded" />
            <div className="skeleton h-4 w-1/4 rounded" />
          </div>
        </div>
        <div className="mt-12 space-y-4">
          <div className="skeleton h-6 w-40 rounded" />
          <div className="skeleton h-20 w-full rounded" />
        </div>
        <div className="mt-12 space-y-4">
          <div className="skeleton h-6 w-56 rounded" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <TrailerCardSkeleton />
            <TrailerCardSkeleton />
            <TrailerCardSkeleton />
          </div>
        </div>
      </div>
    </div>
  )
}

export function GridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-6">
      {Array.from({ length: count }).map((_, i) => (
        <MovieCardSkeleton key={i} />
      ))}
    </div>
  )
}
