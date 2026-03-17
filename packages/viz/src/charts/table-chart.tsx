/**
 * TableChart — Data table visualization (non-ECharts, pure React).
 *
 * Features:
 * - Sortable columns (click header to sort)
 * - Conditional formatting (color cells based on rules)
 * - Mini bar sparklines in numeric cells
 * - Text truncation with title tooltip
 * - Responsive horizontal scroll
 */

import { useState, useMemo, useCallback } from 'react';
import type { ChartProps, DataPoint, SortState, ConditionalFormatRule } from '../types.js';
import { toTableData } from '../utils/data-transformer.js';
import { defaultNumberFormat, isNumericType, isDateType, formatDate } from '../utils/format.js';
import { getColor, withAlpha } from '../utils/color-palette.js';
import { defaultRegistry } from '../chart-registry.js';

/** Evaluate a conditional format rule against a value */
function evaluateRule(rule: ConditionalFormatRule, value: number): boolean {
  switch (rule.operator) {
    case 'gt': return value > (rule.value as number);
    case 'gte': return value >= (rule.value as number);
    case 'lt': return value < (rule.value as number);
    case 'lte': return value <= (rule.value as number);
    case 'eq': return value === (rule.value as number);
    case 'between': {
      const [min, max] = rule.value as [number, number];
      return value >= min && value <= max;
    }
    default: return false;
  }
}

/** Get the max value for a column (for mini bar scale) */
function getColumnMax(
  rows: Record<string, unknown>[],
  columnName: string,
): number {
  let max = 0;
  for (const row of rows) {
    const val = Number(row[columnName]);
    if (isFinite(val) && val > max) max = val;
  }
  return max || 1;
}

export function TableChart({
  data,
  config,
  onDataPointClick,
  theme = 'light',
}: ChartProps): JSX.Element {
  const [sort, setSort] = useState<SortState | null>(null);

  const showMiniBars = config.options?.showMiniBars === true;
  const maxRows = (config.options?.maxRows as number) ?? 200;
  const conditionalRules = (config.options?.conditionalFormatting as ConditionalFormatRule[]) ?? [];
  const stripedRows = config.options?.striped !== false;

  // Get sorted data
  const rows = useMemo(
    () => toTableData(data, sort?.column, sort?.direction).slice(0, maxRows),
    [data, sort, maxRows],
  );

  // Column max values for mini bars
  const columnMaxes = useMemo(() => {
    const maxes: Record<string, number> = {};
    if (showMiniBars) {
      for (const col of data.columns) {
        if (isNumericType(col.type)) {
          maxes[col.name] = getColumnMax(rows, col.name);
        }
      }
    }
    return maxes;
  }, [data.columns, rows, showMiniBars]);

  // Sort handler
  const handleSort = useCallback((columnName: string) => {
    setSort((prev) => {
      if (prev?.column === columnName) {
        if (prev.direction === 'asc') return { column: columnName, direction: 'desc' };
        if (prev.direction === 'desc') return null; // 3rd click removes sort
        return { column: columnName, direction: 'asc' };
      }
      return { column: columnName, direction: 'asc' };
    });
  }, []);

  // Row click handler
  const handleRowClick = useCallback(
    (row: Record<string, unknown>, rowIndex: number) => {
      if (!onDataPointClick) return;
      const point: DataPoint = {
        series: '',
        category: String(rowIndex),
        value: 0,
        row,
      };
      onDataPointClick(point);
    },
    [onDataPointClick],
  );

  // Format cell value
  const formatCell = useCallback(
    (value: unknown, columnType: string): string => {
      if (value == null) return '—';
      if (isNumericType(columnType) && typeof value === 'number') {
        return defaultNumberFormat(value);
      }
      if (isDateType(columnType)) {
        return formatDate(value as string | number | Date, 'date');
      }
      return String(value);
    },
    [],
  );

  // Get conditional style for a cell
  const getCellStyle = useCallback(
    (columnName: string, value: unknown): React.CSSProperties => {
      if (typeof value !== 'number') return {};
      const style: React.CSSProperties = {};

      for (const rule of conditionalRules) {
        if (rule.column === columnName && evaluateRule(rule, value)) {
          style.color = rule.color;
          if (rule.backgroundColor) {
            style.backgroundColor = rule.backgroundColor;
          }
          break; // First matching rule wins
        }
      }
      return style;
    },
    [conditionalRules],
  );

  const isDark = theme === 'dark';
  const bgColor = isDark ? '#111827' : '#FFFFFF';
  const headerBg = isDark ? '#1F2937' : '#F9FAFB';
  const borderColor = isDark ? '#374151' : '#E5E7EB';
  const textColor = isDark ? '#D1D5DB' : '#374151';
  const mutedColor = isDark ? '#9CA3AF' : '#6B7280';
  const hoverBg = isDark ? '#1F2937' : '#F3F4F6';
  const stripedBg = isDark ? '#111827' : '#FAFBFC';

  return (
    <div
      data-testid="table-chart"
      style={{
        width: '100%',
        height: '100%',
        overflow: 'auto',
        backgroundColor: bgColor,
      }}
    >
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 13,
          color: textColor,
        }}
      >
        <thead>
          <tr>
            {data.columns.map((col) => {
              const isSorted = sort?.column === col.name;
              const arrow = isSorted
                ? sort.direction === 'asc' ? ' \u2191' : ' \u2193'
                : '';
              return (
                <th
                  key={col.name}
                  onClick={() => handleSort(col.name)}
                  style={{
                    position: 'sticky',
                    top: 0,
                    padding: '8px 12px',
                    textAlign: isNumericType(col.type) ? 'right' : 'left',
                    fontWeight: 600,
                    fontSize: 12,
                    color: mutedColor,
                    backgroundColor: headerBg,
                    borderBottom: `2px solid ${borderColor}`,
                    cursor: 'pointer',
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                    zIndex: 1,
                  }}
                  title={`${col.name} (${col.type})`}
                >
                  {col.name}{arrow}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIdx) => (
            <tr
              key={rowIdx}
              onClick={() => handleRowClick(row, rowIdx)}
              style={{
                backgroundColor: stripedRows && rowIdx % 2 === 1 ? stripedBg : 'transparent',
                cursor: onDataPointClick ? 'pointer' : 'default',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget.style.backgroundColor = hoverBg);
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor =
                  stripedRows && rowIdx % 2 === 1 ? stripedBg : 'transparent';
              }}
            >
              {data.columns.map((col, colIdx) => {
                const rawValue = row[col.name];
                const isNum = isNumericType(col.type);
                const cellStyle = getCellStyle(col.name, rawValue);
                const formatted = formatCell(rawValue, col.type);

                // Mini bar for numeric cells
                const miniBar =
                  showMiniBars && isNum && typeof rawValue === 'number' && rawValue > 0
                    ? {
                        width: `${(rawValue / (columnMaxes[col.name] || 1)) * 100}%`,
                        backgroundColor: withAlpha(getColor(colIdx), 0.15),
                      }
                    : null;

                return (
                  <td
                    key={col.name}
                    style={{
                      padding: '6px 12px',
                      textAlign: isNum ? 'right' : 'left',
                      borderBottom: `1px solid ${borderColor}`,
                      position: 'relative',
                      maxWidth: 200,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      ...cellStyle,
                    }}
                    title={String(rawValue ?? '')}
                  >
                    {miniBar && (
                      <div
                        style={{
                          position: 'absolute',
                          top: 0,
                          right: 0,
                          bottom: 0,
                          width: miniBar.width,
                          backgroundColor: miniBar.backgroundColor,
                          zIndex: 0,
                        }}
                      />
                    )}
                    <span style={{ position: 'relative', zIndex: 1 }}>
                      {formatted}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={data.columns.length}
                style={{
                  padding: 24,
                  textAlign: 'center',
                  color: mutedColor,
                }}
              >
                No data
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {data.truncated && (
        <div
          style={{
            padding: '8px 12px',
            fontSize: 11,
            color: mutedColor,
            textAlign: 'center',
            borderTop: `1px solid ${borderColor}`,
          }}
        >
          Showing {rows.length} of {data.rowCount} rows
        </div>
      )}
    </div>
  );
}

defaultRegistry.register('table', TableChart, 'Table');
