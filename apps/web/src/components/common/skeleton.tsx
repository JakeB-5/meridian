import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
}

export function Skeleton({ className, width, height }: SkeletonProps) {
  return (
    <div
      className={cn('skeleton', className)}
      style={{ width, height }}
    />
  );
}

/** Skeleton for a card in a grid */
export function CardSkeleton() {
  return (
    <div className="card p-4 space-y-3">
      <Skeleton height={20} width="60%" />
      <Skeleton height={14} width="90%" />
      <Skeleton height={14} width="40%" />
      <div className="pt-2">
        <Skeleton height={32} width="100%" />
      </div>
    </div>
  );
}

/** Skeleton for a table row */
export function TableRowSkeleton({ columns = 4 }: { columns?: number }) {
  return (
    <tr>
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton height={16} width={`${60 + Math.random() * 30}%`} />
        </td>
      ))}
    </tr>
  );
}

/** Skeleton for a list page */
export function ListPageSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-4">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton height={28} width={200} />
          <Skeleton height={16} width={300} />
        </div>
        <Skeleton height={36} width={120} className="rounded-lg" />
      </div>

      {/* Search + filters skeleton */}
      <div className="flex items-center gap-3">
        <Skeleton height={36} width={280} className="rounded-lg" />
        <Skeleton height={36} width={100} className="rounded-lg" />
      </div>

      {/* Table skeleton */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
              {Array.from({ length: columns }).map((_, i) => (
                <th key={i} className="px-4 py-3 text-left">
                  <Skeleton height={14} width={`${50 + Math.random() * 40}%`} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, i) => (
              <TableRowSkeleton key={i} columns={columns} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Skeleton for card grid */
export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

/** Skeleton for a form */
export function FormSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <div className="space-y-6 max-w-lg">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton height={16} width={100} />
          <Skeleton height={36} width="100%" className="rounded-lg" />
        </div>
      ))}
      <div className="flex gap-3 pt-2">
        <Skeleton height={36} width={80} className="rounded-lg" />
        <Skeleton height={36} width={80} className="rounded-lg" />
      </div>
    </div>
  );
}
