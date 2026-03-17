import {
  forwardRef,
  useState,
  useCallback,
  useMemo,
  useId,
  type HTMLAttributes,
  type ReactNode,
  type ThHTMLAttributes,
  type TdHTMLAttributes,
} from 'react';
import { cn } from '../../utils/cn.js';
import { Skeleton } from '../skeleton/skeleton.js';
import { Pagination, type PaginationProps } from './pagination.js';

// ---- Types ----

export type SortDirection = 'asc' | 'desc' | null;

export interface SortState {
  column: string;
  direction: SortDirection;
}

export interface ColumnDef<T> {
  /** Unique key for the column */
  key: string;
  /** Column header text */
  header: ReactNode;
  /** Cell renderer */
  cell: (row: T, rowIndex: number) => ReactNode;
  /** Whether column is sortable */
  sortable?: boolean;
  /** Column width (CSS value) */
  width?: string | number;
  /** Column alignment */
  align?: 'left' | 'center' | 'right';
  /** Header class override */
  headerClassName?: string;
  /** Cell class override */
  cellClassName?: string;
}

export interface DataTableProps<T> extends HTMLAttributes<HTMLDivElement> {
  /** Column definitions */
  columns: ColumnDef<T>[];
  /** Row data */
  data: T[];
  /** Unique key extractor for each row */
  rowKey: (row: T, index: number) => string;
  /** Sort state */
  sort?: SortState;
  /** Sort change handler */
  onSortChange?: (sort: SortState) => void;
  /** Whether rows are selectable */
  selectable?: boolean;
  /** Selected row keys */
  selectedKeys?: Set<string>;
  /** Selection change handler */
  onSelectionChange?: (keys: Set<string>) => void;
  /** Loading state (shows skeletons) */
  loading?: boolean;
  /** Number of skeleton rows when loading */
  skeletonRows?: number;
  /** Empty state content */
  emptyState?: ReactNode;
  /** Pagination config (pass to show pagination) */
  pagination?: Omit<PaginationProps, 'className'>;
  /** Striped rows */
  striped?: boolean;
  /** Hover highlight on rows */
  hoverable?: boolean;
  /** Compact sizing */
  compact?: boolean;
  /** Row click handler */
  onRowClick?: (row: T, index: number) => void;
}

// ---- Sort Icon ----

function SortIcon({ direction }: { direction: SortDirection }) {
  return (
    <svg
      className={cn(
        'ml-1 inline-block h-3.5 w-3.5 transition-transform',
        !direction && 'text-zinc-300 dark:text-zinc-600',
        direction && 'text-zinc-700 dark:text-zinc-300',
      )}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      {direction === 'asc' ? (
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
      ) : direction === 'desc' ? (
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      ) : (
        <>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 15l4 4 4-4" />
        </>
      )}
    </svg>
  );
}

// ---- Checkbox ----

function Checkbox({
  checked,
  indeterminate,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      ref={(el) => {
        if (el) el.indeterminate = !!indeterminate;
      }}
      onChange={(e) => onChange(e.target.checked)}
      aria-label={ariaLabel}
      className={cn(
        'h-4 w-4 rounded border-zinc-300 text-blue-600',
        'focus:ring-2 focus:ring-blue-500 focus:ring-offset-1',
        'dark:border-zinc-600 dark:bg-zinc-800',
      )}
    />
  );
}

// ---- Primitive table parts ----

export interface TableRootProps extends HTMLAttributes<HTMLTableElement> {}

export const TableRoot = forwardRef<HTMLTableElement, TableRootProps>(
  ({ className, ...props }, ref) => (
    <table
      ref={ref}
      className={cn('w-full caption-bottom text-sm', className)}
      {...props}
    />
  ),
);
TableRoot.displayName = 'TableRoot';

export const TableHead = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead ref={ref} className={cn('[&_tr]:border-b', className)} {...props} />
  ),
);
TableHead.displayName = 'TableHead';

export const TableBody = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />
  ),
);
TableBody.displayName = 'TableBody';

export const TableRow = forwardRef<HTMLTableRowElement, HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        'border-b border-zinc-200 transition-colors dark:border-zinc-800',
        className,
      )}
      {...props}
    />
  ),
);
TableRow.displayName = 'TableRow';

export const TableHeaderCell = forwardRef<HTMLTableCellElement, ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        'h-10 px-3 text-left align-middle font-medium text-zinc-500 dark:text-zinc-400',
        '[&:has([role=checkbox])]:pr-0',
        className,
      )}
      {...props}
    />
  ),
);
TableHeaderCell.displayName = 'TableHeaderCell';

export const TableCell = forwardRef<HTMLTableCellElement, TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td
      ref={ref}
      className={cn(
        'px-3 py-3 align-middle text-zinc-900 dark:text-zinc-100',
        '[&:has([role=checkbox])]:pr-0',
        className,
      )}
      {...props}
    />
  ),
);
TableCell.displayName = 'TableCell';

// ---- DataTable ----

/**
 * Full-featured data table with sorting, selection, pagination, loading, and empty states.
 * Built on accessible HTML table primitives.
 */
export function DataTable<T>({
  columns,
  data,
  rowKey,
  sort,
  onSortChange,
  selectable = false,
  selectedKeys,
  onSelectionChange,
  loading = false,
  skeletonRows = 5,
  emptyState,
  pagination,
  striped = false,
  hoverable = true,
  compact = false,
  onRowClick,
  className,
  ...props
}: DataTableProps<T>) {
  const tableId = useId();

  // Selection helpers
  const allKeys = useMemo(
    () => new Set(data.map((row, i) => rowKey(row, i))),
    [data, rowKey],
  );

  const allSelected =
    selectable && allKeys.size > 0 && selectedKeys?.size === allKeys.size;
  const someSelected =
    selectable && (selectedKeys?.size ?? 0) > 0 && !allSelected;

  const toggleAll = useCallback(
    (checked: boolean) => {
      onSelectionChange?.(checked ? new Set(allKeys) : new Set());
    },
    [allKeys, onSelectionChange],
  );

  const toggleRow = useCallback(
    (key: string, checked: boolean) => {
      const next = new Set(selectedKeys);
      if (checked) {
        next.add(key);
      } else {
        next.delete(key);
      }
      onSelectionChange?.(next);
    },
    [selectedKeys, onSelectionChange],
  );

  const handleSort = useCallback(
    (columnKey: string) => {
      if (!onSortChange) return;
      if (sort?.column === columnKey) {
        // Cycle: asc -> desc -> null
        const next: SortDirection =
          sort.direction === 'asc' ? 'desc' : sort.direction === 'desc' ? null : 'asc';
        onSortChange({ column: columnKey, direction: next });
      } else {
        onSortChange({ column: columnKey, direction: 'asc' });
      }
    },
    [sort, onSortChange],
  );

  const colAlignClass = (align?: 'left' | 'center' | 'right') => {
    if (align === 'center') return 'text-center';
    if (align === 'right') return 'text-right';
    return 'text-left';
  };

  return (
    <div className={cn('w-full', className)} {...props}>
      <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
        <TableRoot>
          <TableHead>
            <TableRow>
              {selectable && (
                <TableHeaderCell className="w-10">
                  <Checkbox
                    checked={allSelected}
                    indeterminate={someSelected}
                    onChange={toggleAll}
                    ariaLabel="Select all rows"
                  />
                </TableHeaderCell>
              )}
              {columns.map((col) => (
                <TableHeaderCell
                  key={col.key}
                  className={cn(
                    colAlignClass(col.align),
                    col.sortable && 'cursor-pointer select-none',
                    compact && 'h-8 px-2 py-1 text-xs',
                    col.headerClassName,
                  )}
                  style={{ width: typeof col.width === 'number' ? `${col.width}px` : col.width }}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                  aria-sort={
                    sort?.column === col.key && sort.direction
                      ? sort.direction === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : undefined
                  }
                >
                  <span className="inline-flex items-center">
                    {col.header}
                    {col.sortable && (
                      <SortIcon
                        direction={sort?.column === col.key ? sort.direction : null}
                      />
                    )}
                  </span>
                </TableHeaderCell>
              ))}
            </TableRow>
          </TableHead>

          <TableBody>
            {loading
              ? Array.from({ length: skeletonRows }, (_, i) => (
                  <TableRow key={`skeleton-${i}`}>
                    {selectable && (
                      <TableCell className={compact ? 'px-2 py-1' : undefined}>
                        <Skeleton variant="rectangular" width={16} height={16} />
                      </TableCell>
                    )}
                    {columns.map((col) => (
                      <TableCell
                        key={col.key}
                        className={cn(compact && 'px-2 py-1', col.cellClassName)}
                      >
                        <Skeleton variant="text" className="h-4 w-3/4" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : data.length === 0
                ? (
                    <TableRow>
                      <TableCell
                        colSpan={columns.length + (selectable ? 1 : 0)}
                        className="h-32 text-center"
                      >
                        {emptyState ?? (
                          <div className="flex flex-col items-center gap-2 text-zinc-400 dark:text-zinc-500">
                            <svg
                              className="h-8 w-8"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={1.5}
                              aria-hidden="true"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                              />
                            </svg>
                            <span className="text-sm">No data</span>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                : data.map((row, rowIndex) => {
                    const key = rowKey(row, rowIndex);
                    const isSelected = selectedKeys?.has(key) ?? false;

                    return (
                      <TableRow
                        key={key}
                        data-state={isSelected ? 'selected' : undefined}
                        className={cn(
                          hoverable && 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50',
                          striped && rowIndex % 2 === 1 && 'bg-zinc-50/50 dark:bg-zinc-800/20',
                          isSelected && 'bg-blue-50/50 dark:bg-blue-900/10',
                          onRowClick && 'cursor-pointer',
                        )}
                        onClick={() => onRowClick?.(row, rowIndex)}
                      >
                        {selectable && (
                          <TableCell
                            className={compact ? 'px-2 py-1' : undefined}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Checkbox
                              checked={isSelected}
                              onChange={(checked) => toggleRow(key, checked)}
                              ariaLabel={`Select row ${rowIndex + 1}`}
                            />
                          </TableCell>
                        )}
                        {columns.map((col) => (
                          <TableCell
                            key={col.key}
                            className={cn(
                              colAlignClass(col.align),
                              compact && 'px-2 py-1 text-xs',
                              col.cellClassName,
                            )}
                          >
                            {col.cell(row, rowIndex)}
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })}
          </TableBody>
        </TableRoot>
      </div>

      {pagination && (
        <div className="mt-4">
          <Pagination {...pagination} />
        </div>
      )}
    </div>
  );
}
DataTable.displayName = 'DataTable';
