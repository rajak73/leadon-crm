import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';

/** Loading shape for lead and contact pages: header, info card, side card, tabs. */
export function DetailSkeleton({ label }: { label: string }) {
  return (
    <LoadingRegion label={label}>
      <Skeleton className="mb-3 h-4 w-16" />
      <Skeleton className="mb-2 h-8 w-64 max-w-full" />
      <Skeleton className="mb-4 h-4 w-48" />
      <Skeleton className="mb-4 h-14 w-full rounded-xl" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
      <Skeleton className="mt-4 h-10 w-72" />
    </LoadingRegion>
  );
}
