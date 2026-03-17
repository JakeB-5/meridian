// CSV formatter for CLI output

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface CsvFormatterOptions {
  /** Column delimiter (default: ',') */
  delimiter?: string;
  /** Whether to include a header row (default: true) */
  includeHeader?: boolean;
  /** Line ending style (default: '\r\n' per RFC 4180) */
  lineEnding?: '\r\n' | '\n';
  /** Columns to include, in order (default: all columns from first row) */
  columns?: string[];
}

// ---------------------------------------------------------------------------
// Formatter
// ---------------------------------------------------------------------------

/**
 * Format an array of objects as a CSV string.
 *
 * Follows RFC 4180:
 * - Fields containing delimiters, double-quotes, or newlines are enclosed in double-quotes.
 * - Double-quote characters within quoted fields are escaped by doubling them.
 */
export function formatAsCsv(
  rows: Record<string, unknown>[],
  options: CsvFormatterOptions = {},
): string {
  const {
    delimiter = ',',
    includeHeader = true,
    lineEnding = '\r\n',
    columns: columnOverride,
  } = options;

  if (rows.length === 0 && !includeHeader) {
    return '';
  }

  // Determine columns
  const columns =
    columnOverride ??
    (() => {
      const keys = new Set<string>();
      for (const row of rows) {
        for (const key of Object.keys(row)) {
          keys.add(key);
        }
      }
      return Array.from(keys);
    })();

  if (columns.length === 0) {
    return '';
  }

  const lines: string[] = [];

  // Header
  if (includeHeader) {
    lines.push(columns.map((col) => quoteCsvField(col, delimiter)).join(delimiter));
  }

  // Data rows
  for (const row of rows) {
    const csvRow = columns
      .map((col) => {
        const value = formatCsvValue(row[col]);
        return quoteCsvField(value, delimiter);
      })
      .join(delimiter);
    lines.push(csvRow);
  }

  return lines.join(lineEnding);
}

// ---------------------------------------------------------------------------
// Field-level helpers
// ---------------------------------------------------------------------------

/**
 * Serialize a value to its CSV string representation.
 */
export function formatCsvValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
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

/**
 * Wrap a field in double-quotes if it contains special characters,
 * escaping embedded double-quotes by doubling them.
 */
export function quoteCsvField(value: string, delimiter: string = ','): string {
  const needsQuoting =
    value.includes(delimiter) ||
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r');

  if (!needsQuoting) {
    return value;
  }

  return `"${value.replace(/"/g, '""')}"`;
}

// ---------------------------------------------------------------------------
// Parse helper (simple, no RFC-full compliance)
// ---------------------------------------------------------------------------

/**
 * Parse a CSV string back to an array of string arrays.
 * Each inner array is one row; each string is one field.
 *
 * Note: This is a minimal parser for CLI use. It handles quoted fields and
 * escaped double-quotes but does not handle multi-line fields.
 */
export function parseCsvLine(line: string, delimiter: string = ','): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    const next = line[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else if (char === '"') {
        // End of quoted field
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        fields.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }

  fields.push(current);
  return fields;
}

/**
 * Parse a multi-line CSV string to an array of objects, using the first row as headers.
 */
export function parseCsv(
  content: string,
  options: { delimiter?: string } = {},
): Record<string, string>[] {
  const { delimiter = ',' } = options;
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);

  if (lines.length === 0) return [];

  const headers = parseCsvLine(lines[0]!, delimiter);
  const results: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]!, delimiter);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]!] = values[j] ?? '';
    }
    results.push(row);
  }

  return results;
}
