/**
 * Value formatting utilities for chart labels, tooltips, and table cells.
 */

import type { NumberFormatConfig } from '../types.js';

// --- Number Formatting ---

/**
 * Format a number according to a format config.
 */
export function formatNumber(value: number, config?: NumberFormatConfig): string {
  if (value == null || !isFinite(value)) return '—';

  if (!config) {
    return defaultNumberFormat(value);
  }

  switch (config.style) {
    case 'currency':
      return formatCurrency(value, config.currency, config.minimumFractionDigits, config.maximumFractionDigits);
    case 'percent':
      return formatPercent(value, config.minimumFractionDigits, config.maximumFractionDigits);
    case 'compact':
      return formatCompact(value, config.compactDisplay, config.maximumFractionDigits);
    case 'decimal':
    default:
      return formatDecimal(value, config.minimumFractionDigits, config.maximumFractionDigits);
  }
}

/**
 * Default number format — compact for large numbers, decimal otherwise.
 */
export function defaultNumberFormat(value: number): string {
  if (value == null || !isFinite(value)) return '—';

  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) {
    return formatCompact(value, 'short', 1);
  }
  if (abs >= 1_000_000) {
    return formatCompact(value, 'short', 1);
  }
  if (abs >= 10_000) {
    return formatCompact(value, 'short', 1);
  }
  if (abs >= 1_000) {
    return formatWithThousands(value, 0);
  }
  if (Number.isInteger(value)) {
    return value.toString();
  }
  return formatDecimal(value, 0, 2);
}

/**
 * Format a number with decimal places.
 */
export function formatDecimal(
  value: number,
  minimumFractionDigits = 0,
  maximumFractionDigits = 2,
): string {
  if (!isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'decimal',
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(value);
}

/**
 * Format a number with thousands separators.
 */
export function formatWithThousands(value: number, fractionDigits = 0): string {
  if (!isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'decimal',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
    useGrouping: true,
  }).format(value);
}

/**
 * Format a number in compact notation (e.g., 1.2K, 3.4M, 5.6B).
 */
export function formatCompact(
  value: number,
  display: 'short' | 'long' = 'short',
  maximumFractionDigits = 1,
): string {
  if (!isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    compactDisplay: display,
    maximumFractionDigits,
  }).format(value);
}

/**
 * Format a number as currency.
 */
export function formatCurrency(
  value: number,
  currency = 'USD',
  minimumFractionDigits = 2,
  maximumFractionDigits = 2,
): string {
  if (!isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(value);
}

/**
 * Format a number as percentage.
 * Input value is treated as a ratio (0.5 = 50%).
 */
export function formatPercent(
  value: number,
  minimumFractionDigits = 0,
  maximumFractionDigits = 0,
): string {
  if (!isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(value);
}

// --- Date Formatting ---

/** Supported date format presets */
export type DateFormatPreset =
  | 'date'         // Jan 15, 2024
  | 'datetime'     // Jan 15, 2024, 3:45 PM
  | 'time'         // 3:45 PM
  | 'short-date'   // 1/15/24
  | 'iso'          // 2024-01-15
  | 'month-year'   // Jan 2024
  | 'month-day'    // Jan 15
  | 'year'         // 2024
  | 'quarter';     // Q1 2024

/**
 * Format a date value.
 * Accepts Date, ISO string, or Unix timestamp (ms).
 */
export function formatDate(
  value: Date | string | number,
  preset: DateFormatPreset = 'date',
): string {
  const date = toDate(value);
  if (!date || isNaN(date.getTime())) return '—';

  switch (preset) {
    case 'date':
      return new Intl.DateTimeFormat('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      }).format(date);

    case 'datetime':
      return new Intl.DateTimeFormat('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit',
      }).format(date);

    case 'time':
      return new Intl.DateTimeFormat('en-US', {
        hour: 'numeric', minute: '2-digit',
      }).format(date);

    case 'short-date':
      return new Intl.DateTimeFormat('en-US', {
        month: 'numeric', day: 'numeric', year: '2-digit',
      }).format(date);

    case 'iso': {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }

    case 'month-year':
      return new Intl.DateTimeFormat('en-US', {
        month: 'short', year: 'numeric',
      }).format(date);

    case 'month-day':
      return new Intl.DateTimeFormat('en-US', {
        month: 'short', day: 'numeric',
      }).format(date);

    case 'year':
      return date.getFullYear().toString();

    case 'quarter': {
      const q = Math.ceil((date.getMonth() + 1) / 3);
      return `Q${q} ${date.getFullYear()}`;
    }

    default:
      return date.toLocaleDateString('en-US');
  }
}

/**
 * Try to parse a value into a Date object.
 */
export function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  if (typeof value === 'string') {
    // ISO date string
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) return parsed;
    return null;
  }
  return null;
}

// --- Duration Formatting ---

/**
 * Format a duration in milliseconds to human-readable form.
 * Examples: "2h 15m", "45s", "3d 4h", "120ms"
 */
export function formatDuration(ms: number): string {
  if (!isFinite(ms) || ms < 0) return '—';

  if (ms < 1000) return `${Math.round(ms)}ms`;

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remainingHours = hours % 24;
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  }
  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }
  return `${seconds}s`;
}

// --- Axis Value Formatting ---

/**
 * Create an axis label formatter suitable for ECharts based on column type.
 * Returns a function that converts raw axis values to formatted strings.
 */
export function createAxisFormatter(
  columnType: string,
  format?: string,
): (value: unknown) => string {
  const normalizedType = columnType.toLowerCase();

  if (isDateType(normalizedType)) {
    const preset = (format as DateFormatPreset) || 'short-date';
    return (value: unknown) => formatDate(value as string | number | Date, preset);
  }

  if (isNumericType(normalizedType)) {
    return (value: unknown) => {
      if (typeof value !== 'number') return String(value ?? '');
      if (format === 'percent') return formatPercent(value);
      if (format === 'currency') return formatCurrency(value);
      return defaultNumberFormat(value);
    };
  }

  // String/categorical — return as-is
  return (value: unknown) => String(value ?? '');
}

/**
 * Determine if a column type represents a date/time.
 */
export function isDateType(columnType: string): boolean {
  const dateTypes = [
    'date', 'datetime', 'timestamp', 'timestamptz',
    'time', 'timetz', 'interval',
  ];
  return dateTypes.some((t) => columnType.toLowerCase().includes(t));
}

/**
 * Determine if a column type represents a numeric value.
 */
export function isNumericType(columnType: string): boolean {
  const numericTypes = [
    'int', 'integer', 'bigint', 'smallint', 'tinyint',
    'float', 'double', 'decimal', 'numeric', 'real',
    'number', 'money',
  ];
  return numericTypes.some((t) => columnType.toLowerCase().includes(t));
}

/**
 * Format a tooltip value, choosing the best format based on column type.
 */
export function formatTooltipValue(value: unknown, columnType: string): string {
  if (value == null) return '—';

  if (isDateType(columnType)) {
    return formatDate(value as string | number | Date, 'datetime');
  }

  if (isNumericType(columnType) && typeof value === 'number') {
    return defaultNumberFormat(value);
  }

  return String(value);
}
