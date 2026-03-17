// ASCII table formatter for terminal output

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TableFormatterOptions {
  /** Maximum column width before truncation (default: 50) */
  maxColumnWidth?: number;
  /** Whether to show row borders (default: true) */
  showBorders?: boolean;
  /** Padding spaces inside cells (default: 1) */
  padding?: number;
  /** Whether to show row numbers (default: false) */
  showRowNumbers?: boolean;
}

// ---------------------------------------------------------------------------
// Formatter
// ---------------------------------------------------------------------------

/**
 * Format an array of objects as an ASCII table.
 *
 * Example output:
 * ┌────┬──────────────┬────────┐
 * │ id │ name         │ status │
 * ├────┼──────────────┼────────┤
 * │  1 │ Production   │ active │
 * │  2 │ Staging      │ error  │
 * └────┴──────────────┴────────┘
 */
export function formatAsTable(
  rows: Record<string, unknown>[],
  options: TableFormatterOptions = {},
): string {
  const {
    maxColumnWidth = 50,
    showBorders = true,
    padding = 1,
    showRowNumbers = false,
  } = options;

  if (rows.length === 0) {
    return '(no results)';
  }

  // Collect column names
  const allKeys = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      allKeys.add(key);
    }
  }

  let columns: string[] = Array.from(allKeys);
  if (showRowNumbers) {
    columns = ['#', ...columns];
  }

  // Compute column widths
  const widths: number[] = columns.map((col) => {
    if (col === '#') return String(rows.length).length;
    return Math.min(col.length, maxColumnWidth);
  });

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]!;
    for (let c = showRowNumbers ? 1 : 0; c < columns.length; c++) {
      const col = columns[c]!;
      const value = formatCellValue(row[col]);
      const displayValue = truncate(value, maxColumnWidth);
      widths[c] = Math.max(widths[c]!, displayValue.length);
    }
    if (showRowNumbers) {
      widths[0] = Math.max(widths[0]!, String(r + 1).length);
    }
  }

  const pad = ' '.repeat(padding);

  if (!showBorders) {
    return renderBorderless(rows, columns, widths, pad, showRowNumbers, maxColumnWidth);
  }

  return renderBordered(rows, columns, widths, pad, showRowNumbers, maxColumnWidth);
}

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

function renderBordered(
  rows: Record<string, unknown>[],
  columns: string[],
  widths: number[],
  pad: string,
  showRowNumbers: boolean,
  maxColumnWidth: number,
): string {
  const lines: string[] = [];

  // Top border
  lines.push(
    '┌' + widths.map((w) => '─'.repeat(w + pad.length * 2)).join('┬') + '┐',
  );

  // Header row
  const headerCells = columns.map((col, i) =>
    pad + col.substring(0, widths[i]!).padEnd(widths[i]!) + pad,
  );
  lines.push('│' + headerCells.join('│') + '│');

  // Separator
  lines.push(
    '├' + widths.map((w) => '─'.repeat(w + pad.length * 2)).join('┼') + '┤',
  );

  // Data rows
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]!;
    const cells = columns.map((col, i) => {
      const rawValue = col === '#'
        ? String(r + 1)
        : formatCellValue(row[col]);
      const value = truncate(rawValue, maxColumnWidth);
      const isNumeric = col !== '#' && isNumericValue(row[col]);
      const padded = isNumeric
        ? value.padStart(widths[i]!)
        : value.padEnd(widths[i]!);
      return pad + padded + pad;
    });
    lines.push('│' + cells.join('│') + '│');
  }

  // Bottom border
  lines.push(
    '└' + widths.map((w) => '─'.repeat(w + pad.length * 2)).join('┴') + '┘',
  );

  return lines.join('\n');
}

function renderBorderless(
  rows: Record<string, unknown>[],
  columns: string[],
  widths: number[],
  pad: string,
  showRowNumbers: boolean,
  maxColumnWidth: number,
): string {
  const lines: string[] = [];

  // Header
  const headerCells = columns.map((col, i) =>
    col.substring(0, widths[i]!).padEnd(widths[i]!),
  );
  lines.push(headerCells.join('  '));

  // Separator line
  lines.push(widths.map((w) => '-'.repeat(w)).join('  '));

  // Data rows
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]!;
    const cells = columns.map((col, i) => {
      const rawValue = col === '#' ? String(r + 1) : formatCellValue(row[col]);
      const value = truncate(rawValue, maxColumnWidth);
      const isNumeric = col !== '#' && isNumericValue(row[col]);
      return isNumeric ? value.padStart(widths[i]!) : value.padEnd(widths[i]!);
    });
    lines.push(cells.join('  '));
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Value helpers
// ---------------------------------------------------------------------------

export function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function isNumericValue(value: unknown): boolean {
  return typeof value === 'number' || typeof value === 'bigint';
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 1) + '…';
}

// ---------------------------------------------------------------------------
// Key-value formatter (for single objects)
// ---------------------------------------------------------------------------

/**
 * Format a single object as a two-column key → value table.
 */
export function formatAsKeyValue(
  obj: Record<string, unknown>,
  options: { maxValueWidth?: number } = {},
): string {
  const { maxValueWidth = 80 } = options;

  const keys = Object.keys(obj);
  if (keys.length === 0) return '(empty)';

  const maxKeyLen = Math.max(...keys.map((k) => k.length));
  const lines: string[] = [];

  for (const key of keys) {
    const value = formatCellValue(obj[key]);
    const truncatedValue = value.length > maxValueWidth
      ? value.substring(0, maxValueWidth - 1) + '…'
      : value;
    lines.push(`  ${key.padEnd(maxKeyLen)}  ${truncatedValue}`);
  }

  return lines.join('\n');
}
