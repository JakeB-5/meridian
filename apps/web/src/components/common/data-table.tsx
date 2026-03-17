import { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Pagination } from './pagination';
import { LoadingSpinner } from './loading-spinner';
import { EmptyState } from './empty-state';

// ── Types ────────────────────────────────────────────────────────────

interface Column<T> {
  id: string;
  header: string;
  accessorFn?: (row: T) => unknown;
  cell?: (row: T) => React.ReactNode;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  width?: string;
  className?: string;
  hideOnMobile?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyFn: (row: T) => string;
  isLoading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  onRowClick?: (row: T) => void;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  onSort?: (columnId: string, direction: 'asc' | 'desc') => void;
  page?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  stickyHeader?: boolean;
  compact?: boolean;
  striped?: boolean;
  className?: string;
  rowClassName?: (row: T) => string | undefined;
}

// ── Component ────────────────────────────────────────────────────────

export function DataTable<T>({
  columns,
  data,
  keyFn,
  isLoading = false,
  emptyTitle = 'No data',
  emptyDescription,
  emptyAction,
  onRowClick,
  sortBy,
  sortDirection = 'asc',
  onSort,
  page,
  totalPages,
  onPageChange,
  stickyHeader = false,
  compact = false,
  striped = false,
  className,
  rowClassName,
}: DataTableProps<T>) {
  const handleSort = useCallback(
    (columnId: string) => {
      if (!onSort) return;
      const newDir = sortBy === columnId && sortDirection === 'asc' ? 'desc' : 'asc';
      onSort(columnId, newDir);
    },
    [sortBy, sortDirection, onSort],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    );
  }

  const cellPadding = compact ? 'px-3 py-1.5' : 'px-4 py-3';
  const headerPadding = compact ? 'px-3 py-2' : 'px-4 py-3';

  return (
    <div className={cn('space-y-4', className)}>
      <div
        className="rounded-lg overflow-auto scrollbar-thin"
        style={{ border: '1px solid var(--color-border)' }}
      >
        <table className="w-full">
          <thead className={stickyHeader ? 'sticky top-0 z-10' : ''}>
            <tr
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                borderBottom: '2px solid var(--color-border)',
              }}
            >
              {columns.map((col) => (
                <th
                  key={col.id}
                  className={cn(
                    headerPadding,
                    'text-xs font-semibold uppercase tracking-wider whitespace-nowrap',
                    col.align === 'right' && 'text-right',
                    col.align === 'center' && 'text-center',
                    col.align !== 'right' && col.align !== 'center' && 'text-left',
                    col.sortable && onSort && 'cursor-pointer select-none hover:bg-[var(--color-bg-tertiary)]',
                    col.hideOnMobile && 'hidden md:table-cell',
                    col.className,
                  )}
                  style={{
                    color: 'var(--color-text-secondary)',
                    width: col.width,
                  }}
                  onClick={() => col.sortable && handleSort(col.id)}
                >
                  <div className="flex items-center gap-1">
                    <span>{col.header}</span>
                    {col.sortable && sortBy === col.id && (
                      <svg
                        className={cn(
                          'h-3 w-3 transition-transform',
                          sortDirection === 'desc' && 'rotate-180',
                        )}
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M14.77 12.79a.75.75 0 01-1.06-.02L10 8.832 6.29 12.77a.75.75 0 11-1.08-1.04l4.25-4.5a.75.75 0 011.08 0l4.25 4.5a.75.75 0 01-.02 1.06z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rowIndex) => (
              <tr
                key={keyFn(row)}
                onClick={() => onRowClick?.(row)}
                className={cn(
                  'transition-colors',
                  onRowClick && 'cursor-pointer',
                  'hover:bg-[var(--color-surface-hover)]',
                  striped && rowIndex % 2 === 1 && 'bg-[var(--color-bg-secondary)]',
                  rowClassName?.(row),
                )}
                style={{
                  borderBottom: '1px solid var(--color-border-light)',
                }}
              >
                {columns.map((col) => (
                  <td
                    key={col.id}
                    className={cn(
                      cellPadding,
                      'text-sm',
                      col.align === 'right' && 'text-right',
                      col.align === 'center' && 'text-center',
                      col.hideOnMobile && 'hidden md:table-cell',
                      col.className,
                    )}
                    style={{ color: 'var(--color-text)' }}
                  >
                    {col.cell
                      ? col.cell(row)
                      : col.accessorFn
                        ? String(col.accessorFn(row) ?? '-')
                        : '-'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {page !== undefined && totalPages !== undefined && onPageChange && totalPages > 1 && (
        <div className="flex justify-center">
          <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} />
        </div>
      )}
    </div>
  );
}
