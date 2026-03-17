import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { CHART_TYPE_LABELS } from '@/lib/constants';
import type { DashboardCardResponse, QueryResult } from '@/api/types';

interface DashboardCardWrapperProps {
  card: DashboardCardResponse;
  result?: QueryResult;
  editable?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  onRemove?: () => void;
  onMove?: (position: { x: number; y: number }) => void;
  onResize?: (size: { width: number; height: number }) => void;
}

export function DashboardCardWrapper({
  card,
  result,
  editable = false,
  selected = false,
  onSelect,
  onRemove,
  onMove,
  onResize,
}: DashboardCardWrapperProps) {
  const [isHovered, setIsHovered] = useState(false);

  const showControls = editable && (isHovered || selected);

  return (
    <div
      className={cn(
        'relative h-full rounded-xl overflow-hidden transition-all',
        editable && 'cursor-move',
        selected && 'ring-2 ring-[var(--color-primary)]',
      )}
      style={{
        backgroundColor: 'var(--color-surface)',
        border: `1px solid ${selected ? 'var(--color-primary)' : 'var(--color-border)'}`,
        boxShadow: 'var(--shadow-sm)',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => editable && onSelect?.()}
    >
      {/* Card header */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b"
        style={{ borderColor: 'var(--color-border-light)' }}
      >
        <div className="flex-1 min-w-0">
          <h4
            className="text-sm font-medium truncate"
            style={{ color: 'var(--color-text)' }}
          >
            {card.title ?? card.questionName ?? 'Untitled Card'}
          </h4>
        </div>

        {/* Card controls */}
        {showControls && (
          <div className="flex items-center gap-1 ml-2">
            {/* Size controls */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onResize?.({
                  width: Math.max(2, card.size.width - 1),
                  height: card.size.height,
                });
              }}
              className="btn btn-ghost btn-icon btn-sm"
              title="Decrease width"
            >
              <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M4 10a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H4.75A.75.75 0 014 10z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onResize?.({
                  width: Math.min(12, card.size.width + 1),
                  height: card.size.height,
                });
              }}
              className="btn btn-ghost btn-icon btn-sm"
              title="Increase width"
            >
              <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
              </svg>
            </button>

            {/* Move controls */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMove?.({ x: card.position.x, y: Math.max(0, card.position.y - 1) });
              }}
              className="btn btn-ghost btn-icon btn-sm"
              title="Move up"
            >
              <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M14.77 12.79a.75.75 0 01-1.06-.02L10 8.832 6.29 12.77a.75.75 0 11-1.08-1.04l4.25-4.5a.75.75 0 011.08 0l4.25 4.5a.75.75 0 01-.02 1.06z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMove?.({ x: card.position.x, y: card.position.y + 1 });
              }}
              className="btn btn-ghost btn-icon btn-sm"
              title="Move down"
            >
              <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            </button>

            {/* Remove */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove?.();
              }}
              className="btn btn-ghost btn-icon btn-sm text-red-500"
              title="Remove card"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.519.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Card content — visualization or placeholder */}
      <div className="p-4 h-[calc(100%-45px)] overflow-hidden">
        {result ? (
          <CardVisualization result={result} card={card} />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="skeleton h-16 w-16 rounded-lg mx-auto mb-2" />
              <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                Loading data...
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Card Visualization ───────────────────────────────────────────────
// Renders query result data based on the visualization type

interface CardVisualizationProps {
  result: QueryResult;
  card: DashboardCardResponse;
}

function CardVisualization({ result, card }: CardVisualizationProps) {
  if (!result || result.rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
          No data available
        </p>
      </div>
    );
  }

  // For "number" type, show the first value prominently
  if (result.columns.length === 1 && result.rows.length === 1) {
    const value = Object.values(result.rows[0])[0];
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <p
          className="text-4xl font-bold"
          style={{ color: 'var(--color-text)' }}
        >
          {typeof value === 'number' ? value.toLocaleString() : String(value ?? '-')}
        </p>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
          {result.columns[0].name}
        </p>
      </div>
    );
  }

  // For table-like data, render a compact table
  const visibleColumns = result.columns.slice(0, 6);
  const visibleRows = result.rows.slice(0, 10);

  return (
    <div className="h-full overflow-auto scrollbar-thin">
      <table className="w-full text-xs">
        <thead>
          <tr>
            {visibleColumns.map((col) => (
              <th
                key={col.name}
                className="text-left px-2 py-1.5 font-medium whitespace-nowrap"
                style={{
                  color: 'var(--color-text-secondary)',
                  borderBottom: '1px solid var(--color-border)',
                }}
              >
                {col.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row, i) => (
            <tr key={i}>
              {visibleColumns.map((col) => (
                <td
                  key={col.name}
                  className="px-2 py-1.5 whitespace-nowrap"
                  style={{
                    color: 'var(--color-text)',
                    borderBottom: '1px solid var(--color-border-light)',
                  }}
                >
                  {formatCellValue(row[col.name])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {result.rows.length > 10 && (
        <p className="text-xs text-center py-2" style={{ color: 'var(--color-text-tertiary)' }}>
          Showing 10 of {result.rowCount} rows
        </p>
      )}
    </div>
  );
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'number') return value.toLocaleString();
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value instanceof Date) return value.toLocaleDateString();
  return String(value);
}
