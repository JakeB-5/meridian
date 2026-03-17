import { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { formatDuration, copyToClipboard, downloadBlob } from '@/lib/utils';
import { useToast } from '@/components/common/toast';
import type { QueryResult } from '@/api/types';

interface ResultTableProps {
  result: QueryResult;
  compact?: boolean;
  maxHeight?: string;
}

export function ResultTable({
  result,
  compact = false,
  maxHeight = '500px',
}: ResultTableProps) {
  const toast = useToast();
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(0);

  const pageSize = compact ? 10 : 50;
  const totalPages = Math.ceil(result.rows.length / pageSize);

  // Sort rows locally
  const sortedRows = useMemo(() => {
    if (!sortCol) return result.rows;

    return [...result.rows].sort((a, b) => {
      const aVal = a[sortCol];
      const bVal = b[sortCol];

      if (aVal === null || aVal === undefined) return sortDir === 'asc' ? 1 : -1;
      if (bVal === null || bVal === undefined) return sortDir === 'asc' ? -1 : 1;

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }

      const aStr = String(aVal);
      const bStr = String(bVal);
      return sortDir === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
    });
  }, [result.rows, sortCol, sortDir]);

  // Get current page
  const pageRows = useMemo(() => {
    const start = page * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [sortedRows, page, pageSize]);

  const handleSort = useCallback(
    (col: string) => {
      if (sortCol === col) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortCol(col);
        setSortDir('asc');
      }
      setPage(0);
    },
    [sortCol],
  );

  const handleCopyCell = useCallback(
    async (value: unknown) => {
      const text = value === null || value === undefined ? '' : String(value);
      const ok = await copyToClipboard(text);
      if (ok) toast.info('Copied to clipboard');
    },
    [toast],
  );

  const handleExportCsv = useCallback(() => {
    const headers = result.columns.map((c) => c.name);
    const csvRows = [
      headers.join(','),
      ...result.rows.map((row) =>
        headers
          .map((h) => {
            const val = row[h];
            if (val === null || val === undefined) return '';
            const str = String(val);
            // Escape CSV values with commas or quotes
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
              return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
          })
          .join(','),
      ),
    ];

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    downloadBlob(blob, 'query-results.csv');
    toast.success('CSV exported');
  }, [result, toast]);

  if (result.rows.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Query returned 0 rows
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
          Execution time: {formatDuration(result.executionTimeMs)}
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Result metadata bar */}
      {!compact && (
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            <span>
              {result.rowCount.toLocaleString()} row{result.rowCount !== 1 ? 's' : ''}
              {result.truncated && ' (truncated)'}
            </span>
            <span>{result.columns.length} columns</span>
            <span>{formatDuration(result.executionTimeMs)}</span>
          </div>
          <button onClick={handleExportCsv} className="btn btn-ghost btn-sm">
            <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
              <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
            </svg>
            Export CSV
          </button>
        </div>
      )}

      {/* Table */}
      <div
        className="rounded-lg overflow-auto scrollbar-thin"
        style={{
          maxHeight,
          border: '1px solid var(--color-border)',
        }}
      >
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                borderBottom: '2px solid var(--color-border)',
              }}
            >
              {/* Row number */}
              {!compact && (
                <th
                  className="px-3 py-2 text-left text-xs font-medium w-12"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  #
                </th>
              )}
              {result.columns.map((col) => (
                <th
                  key={col.name}
                  onClick={() => handleSort(col.name)}
                  className="px-3 py-2 text-left text-xs font-semibold cursor-pointer hover:bg-[var(--color-bg-tertiary)] whitespace-nowrap select-none"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  <div className="flex items-center gap-1">
                    <span>{col.name}</span>
                    <span className="text-[10px] opacity-60">({col.type})</span>
                    {sortCol === col.name && (
                      <svg
                        className={cn('h-3 w-3 transition-transform', sortDir === 'desc' && 'rotate-180')}
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
            {pageRows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className="hover:bg-[var(--color-surface-hover)] transition-colors"
                style={{ borderBottom: '1px solid var(--color-border-light)' }}
              >
                {!compact && (
                  <td className="px-3 py-1.5 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                    {page * pageSize + rowIndex + 1}
                  </td>
                )}
                {result.columns.map((col) => (
                  <td
                    key={col.name}
                    className="px-3 py-1.5 max-w-xs truncate cursor-default"
                    style={{ color: 'var(--color-text)' }}
                    title={formatValue(row[col.name])}
                    onDoubleClick={() => handleCopyCell(row[col.name])}
                  >
                    <CellValue value={row[col.name]} type={col.type} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && !compact && (
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="btn btn-ghost btn-sm"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="btn btn-ghost btn-sm"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Cell rendering ───────────────────────────────────────────────────

function CellValue({ value, type }: { value: unknown; type: string }) {
  if (value === null || value === undefined) {
    return (
      <span className="italic text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
        NULL
      </span>
    );
  }

  if (typeof value === 'boolean') {
    return (
      <span className={value ? 'text-green-600' : 'text-red-500'}>
        {value ? 'true' : 'false'}
      </span>
    );
  }

  if (typeof value === 'number') {
    return <span className="tabular-nums">{value.toLocaleString()}</span>;
  }

  return <span>{String(value)}</span>;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
