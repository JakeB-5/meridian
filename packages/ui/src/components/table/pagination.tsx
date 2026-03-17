import { forwardRef, useCallback, type HTMLAttributes } from 'react';
import { cn } from '../../utils/cn.js';

// ---- Types ----

export interface PaginationProps extends HTMLAttributes<HTMLElement> {
  /** Current page (1-indexed) */
  currentPage: number;
  /** Total number of pages */
  totalPages: number;
  /** Callback when page changes */
  onPageChange: (page: number) => void;
  /** Current page size */
  pageSize?: number;
  /** Available page sizes */
  pageSizeOptions?: number[];
  /** Callback when page size changes */
  onPageSizeChange?: (size: number) => void;
  /** Total number of items (for display) */
  totalItems?: number;
  /** Maximum page buttons to show */
  maxVisiblePages?: number;
  /** Disable all controls */
  disabled?: boolean;
}

// ---- Helpers ----

function ChevronLeftIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

/**
 * Compute visible page numbers with ellipsis.
 */
function getPageNumbers(
  currentPage: number,
  totalPages: number,
  maxVisible: number,
): (number | 'ellipsis')[] {
  if (totalPages <= maxVisible) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages: (number | 'ellipsis')[] = [];
  const sideCount = Math.floor((maxVisible - 3) / 2);

  // Always show first page
  pages.push(1);

  const leftBound = Math.max(2, currentPage - sideCount);
  const rightBound = Math.min(totalPages - 1, currentPage + sideCount);

  if (leftBound > 2) {
    pages.push('ellipsis');
  }

  for (let i = leftBound; i <= rightBound; i++) {
    pages.push(i);
  }

  if (rightBound < totalPages - 1) {
    pages.push('ellipsis');
  }

  // Always show last page
  if (totalPages > 1) {
    pages.push(totalPages);
  }

  return pages;
}

// ---- Component ----

/**
 * Pagination component with page numbers, prev/next, and page size selector.
 * Accessible with proper ARIA navigation landmark.
 */
export const Pagination = forwardRef<HTMLElement, PaginationProps>(
  (
    {
      currentPage,
      totalPages,
      onPageChange,
      pageSize,
      pageSizeOptions = [10, 25, 50, 100],
      onPageSizeChange,
      totalItems,
      maxVisiblePages = 7,
      disabled = false,
      className,
      ...props
    },
    ref,
  ) => {
    const pageNumbers = getPageNumbers(currentPage, totalPages, maxVisiblePages);

    const goToPage = useCallback(
      (page: number) => {
        if (page >= 1 && page <= totalPages && page !== currentPage && !disabled) {
          onPageChange(page);
        }
      },
      [currentPage, totalPages, onPageChange, disabled],
    );

    const buttonBase = cn(
      'inline-flex h-8 min-w-[2rem] items-center justify-center rounded-md px-2 text-sm transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
      disabled && 'pointer-events-none opacity-50',
    );

    // Item range display
    const rangeStart = totalItems != null ? (currentPage - 1) * (pageSize ?? 10) + 1 : null;
    const rangeEnd =
      totalItems != null
        ? Math.min(currentPage * (pageSize ?? 10), totalItems)
        : null;

    return (
      <nav
        ref={ref}
        role="navigation"
        aria-label="Pagination"
        className={cn(
          'flex flex-wrap items-center justify-between gap-4',
          className,
        )}
        {...props}
      >
        {/* Left: item count / page size */}
        <div className="flex items-center gap-4 text-sm text-zinc-500 dark:text-zinc-400">
          {totalItems != null && rangeStart != null && rangeEnd != null && (
            <span>
              {rangeStart}-{rangeEnd} of {totalItems}
            </span>
          )}
          {onPageSizeChange && pageSize != null && (
            <div className="flex items-center gap-1.5">
              <label htmlFor="page-size-select" className="text-sm">
                Rows:
              </label>
              <select
                id="page-size-select"
                value={pageSize}
                onChange={(e) => onPageSizeChange(Number(e.target.value))}
                disabled={disabled}
                className={cn(
                  'rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm',
                  'dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                )}
              >
                {pageSizeOptions.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Right: page navigation */}
        <div className="flex items-center gap-1">
          {/* Previous */}
          <button
            type="button"
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 1 || disabled}
            className={cn(
              buttonBase,
              'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800',
              (currentPage <= 1 || disabled) && 'pointer-events-none opacity-50',
            )}
            aria-label="Go to previous page"
          >
            <ChevronLeftIcon />
          </button>

          {/* Page numbers */}
          {pageNumbers.map((page, idx) => {
            if (page === 'ellipsis') {
              return (
                <span
                  key={`ellipsis-${idx}`}
                  className="inline-flex h-8 min-w-[2rem] items-center justify-center text-sm text-zinc-400"
                  aria-hidden="true"
                >
                  ...
                </span>
              );
            }

            const isActive = page === currentPage;
            return (
              <button
                key={page}
                type="button"
                onClick={() => goToPage(page)}
                disabled={disabled}
                aria-label={`Go to page ${page}`}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  buttonBase,
                  isActive
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800',
                )}
              >
                {page}
              </button>
            );
          })}

          {/* Next */}
          <button
            type="button"
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= totalPages || disabled}
            className={cn(
              buttonBase,
              'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800',
              (currentPage >= totalPages || disabled) && 'pointer-events-none opacity-50',
            )}
            aria-label="Go to next page"
          >
            <ChevronRightIcon />
          </button>
        </div>
      </nav>
    );
  },
);
Pagination.displayName = 'Pagination';
