// ── Number and data formatting utilities ─────────────────────────────
// Specialized formatting functions for BI data display.

import type { MetricFormat } from '@meridian/shared';

/**
 * Format a numeric value according to a MetricFormat specification.
 */
export function formatMetricValue(value: number, format: MetricFormat): string {
  switch (format) {
    case 'number':
      return value.toLocaleString('en-US');

    case 'currency':
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(value);

    case 'percent':
      return new Intl.NumberFormat('en-US', {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(value / 100);

    case 'decimal':
      return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);

    case 'integer':
      return Math.round(value).toLocaleString('en-US');

    case 'compact':
      return formatCompactNumber(value);

    default:
      return String(value);
  }
}

/**
 * Format large numbers with compact notation (K, M, B, T).
 */
export function formatCompactNumber(value: number): string {
  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (absValue >= 1_000_000_000_000) {
    return `${sign}${(absValue / 1_000_000_000_000).toFixed(1)}T`;
  }
  if (absValue >= 1_000_000_000) {
    return `${sign}${(absValue / 1_000_000_000).toFixed(1)}B`;
  }
  if (absValue >= 1_000_000) {
    return `${sign}${(absValue / 1_000_000).toFixed(1)}M`;
  }
  if (absValue >= 1_000) {
    return `${sign}${(absValue / 1_000).toFixed(1)}K`;
  }
  return `${sign}${absValue.toLocaleString()}`;
}

/**
 * Format bytes into human-readable size.
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

/**
 * Format a number as a percentage string.
 */
export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format a number as a change indicator (+12.5% or -3.2%).
 */
export function formatChange(value: number, decimals = 1): string {
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(decimals)}%`;
}

/**
 * Format a large number with magnitude suffix for chart axes.
 */
export function formatAxisValue(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toFixed(0)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(0)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(0)}K`;
  if (abs < 1 && abs > 0) return value.toFixed(2);
  return value.toFixed(0);
}

/**
 * Parse a potentially formatted number string back to a number.
 * Handles: "1,234", "$1,234.56", "12.5%", "1.2K", "3.4M"
 */
export function parseFormattedNumber(value: string): number | null {
  if (!value || typeof value !== 'string') return null;

  const cleaned = value.trim();

  // Handle compact notation
  const compactMatch = cleaned.match(/^[-+]?[\d.]+([KMBT])$/i);
  if (compactMatch) {
    const num = parseFloat(cleaned);
    const suffix = compactMatch[1].toUpperCase();
    const multipliers: Record<string, number> = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 };
    return num * (multipliers[suffix] ?? 1);
  }

  // Handle percent
  if (cleaned.endsWith('%')) {
    const num = parseFloat(cleaned.slice(0, -1));
    return isNaN(num) ? null : num;
  }

  // Strip currency and grouping
  const stripped = cleaned.replace(/[$,\s]/g, '');
  const num = parseFloat(stripped);
  return isNaN(num) ? null : num;
}

/**
 * Generate tick values for chart axes.
 */
export function generateAxisTicks(
  min: number,
  max: number,
  targetCount = 5,
): number[] {
  const range = max - min;
  if (range === 0) return [min];

  // Calculate a nice step size
  const roughStep = range / targetCount;
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const residual = roughStep / magnitude;

  let niceStep: number;
  if (residual <= 1.5) niceStep = 1 * magnitude;
  else if (residual <= 3) niceStep = 2 * magnitude;
  else if (residual <= 7) niceStep = 5 * magnitude;
  else niceStep = 10 * magnitude;

  const niceMin = Math.floor(min / niceStep) * niceStep;
  const niceMax = Math.ceil(max / niceStep) * niceStep;

  const ticks: number[] = [];
  for (let v = niceMin; v <= niceMax; v += niceStep) {
    ticks.push(Math.round(v * 1e10) / 1e10); // Avoid floating point issues
  }

  return ticks;
}

/**
 * Format a date for chart axis labels based on the time range.
 */
export function formatChartDate(date: Date, rangeMs: number): string {
  const day = 86_400_000;
  const month = day * 30;
  const year = day * 365;

  if (rangeMs <= day) {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }
  if (rangeMs <= month) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  if (rangeMs <= year) {
    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  }
  return date.toLocaleDateString('en-US', { year: 'numeric' });
}

/**
 * Calculate basic statistics for a numeric array.
 */
export function calculateStats(values: number[]): {
  count: number;
  sum: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  stdDev: number;
} {
  if (values.length === 0) {
    return { count: 0, sum: 0, mean: 0, median: 0, min: 0, max: 0, stdDev: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const count = values.length;
  const sum = values.reduce((acc, v) => acc + v, 0);
  const mean = sum / count;
  const min = sorted[0];
  const max = sorted[count - 1];

  // Median
  const mid = Math.floor(count / 2);
  const median = count % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  // Standard deviation
  const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
  const avgSquaredDiff = squaredDiffs.reduce((acc, v) => acc + v, 0) / count;
  const stdDev = Math.sqrt(avgSquaredDiff);

  return { count, sum, mean, median, min, max, stdDev };
}
