/**
 * NumberChart — Single number / KPI card (pure React, no ECharts).
 *
 * Features:
 * - Large prominent value display
 * - Trend indicator (up/down/flat) with color
 * - Comparison to previous period
 * - Number formatting (number, currency, percentage, compact)
 * - Customizable label
 */

import { useMemo } from 'react';
import type { ChartProps, TrendDirection, NumberFormatConfig } from '../types.js';
import { toSingleValue } from '../utils/data-transformer.js';
import { formatNumber, defaultNumberFormat, formatPercent } from '../utils/format.js';
import { defaultRegistry } from '../chart-registry.js';

/** Determine trend from current vs previous value */
function computeTrend(current: number, previous: number | undefined): TrendDirection {
  if (previous == null || previous === current) return 'flat';
  return current > previous ? 'up' : 'down';
}

/** Trend arrow character */
function trendArrow(direction: TrendDirection): string {
  switch (direction) {
    case 'up': return '\u2191';  // up arrow
    case 'down': return '\u2193'; // down arrow
    case 'flat': return '\u2192'; // right arrow
  }
}

/** Trend color */
function trendColor(
  direction: TrendDirection,
  positiveIsGood = true,
): string {
  if (direction === 'flat') return '#9CA3AF';
  if (direction === 'up') return positiveIsGood ? '#10B981' : '#EF4444';
  return positiveIsGood ? '#EF4444' : '#10B981';
}

export function NumberChart({
  data,
  config,
  theme = 'light',
}: ChartProps): JSX.Element {
  const isDark = theme === 'dark';

  // Extract options
  const formatConfig = config.options?.format as NumberFormatConfig | undefined;
  const comparisonValue = config.options?.comparisonValue as number | undefined;
  const comparisonLabel = (config.options?.comparisonLabel as string) ?? 'vs previous';
  const customLabel = config.options?.label as string | undefined;
  const prefix = (config.options?.prefix as string) ?? '';
  const suffix = (config.options?.suffix as string) ?? '';
  const positiveIsGood = config.options?.positiveIsGood !== false;
  const targetValue = config.options?.targetValue as number | undefined;

  // Extract value from data
  const extracted = useMemo(() => toSingleValue(data, config), [data, config]);

  if (!extracted) {
    return (
      <div
        data-testid="number-chart"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: isDark ? '#9CA3AF' : '#6B7280',
          fontSize: 14,
        }}
      >
        No data
      </div>
    );
  }

  const { value, label } = extracted;
  const displayLabel = customLabel ?? label;
  const formattedValue = prefix + formatNumber(value, formatConfig) + suffix;

  // Trend calculation
  const trend = computeTrend(value, comparisonValue);
  const trendDir = trendArrow(trend);
  const trendClr = trendColor(trend, positiveIsGood);

  // Change calculation
  let changeText = '';
  let changePercent = '';
  if (comparisonValue != null && comparisonValue !== 0) {
    const diff = value - comparisonValue;
    const pct = diff / Math.abs(comparisonValue);
    changeText = (diff >= 0 ? '+' : '') + defaultNumberFormat(diff);
    changePercent = (diff >= 0 ? '+' : '') + formatPercent(pct, 0, 1);
  }

  // Target progress
  let targetProgress: number | null = null;
  if (targetValue != null && targetValue !== 0) {
    targetProgress = Math.min(value / targetValue, 1);
  }

  const primaryColor = isDark ? '#F3F4F6' : '#111827';
  const secondaryColor = isDark ? '#D1D5DB' : '#4B5563';
  const mutedColor = isDark ? '#9CA3AF' : '#6B7280';
  const progressBg = isDark ? '#374151' : '#E5E7EB';
  const progressFg = isDark ? '#6B8FE6' : '#5470C6';

  return (
    <div
      data-testid="number-chart"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: 24,
        gap: 8,
      }}
    >
      {/* Label */}
      <div
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: mutedColor,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {displayLabel}
      </div>

      {/* Main value */}
      <div
        style={{
          fontSize: 36,
          fontWeight: 700,
          color: primaryColor,
          lineHeight: 1.1,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {formattedValue}
      </div>

      {/* Trend and comparison */}
      {comparisonValue != null && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
          }}
        >
          {/* Trend arrow + percent */}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 2,
              color: trendClr,
              fontWeight: 600,
            }}
          >
            {trendDir} {changePercent}
          </span>

          {/* Absolute change */}
          <span style={{ color: secondaryColor }}>
            ({changeText})
          </span>

          {/* Comparison label */}
          <span style={{ color: mutedColor, fontSize: 12 }}>
            {comparisonLabel}
          </span>
        </div>
      )}

      {/* Target progress bar */}
      {targetProgress != null && (
        <div style={{ width: '80%', maxWidth: 200, marginTop: 8 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 11,
              color: mutedColor,
              marginBottom: 4,
            }}
          >
            <span>Target</span>
            <span>{formatPercent(targetProgress, 0, 0)}</span>
          </div>
          <div
            style={{
              width: '100%',
              height: 6,
              borderRadius: 3,
              backgroundColor: progressBg,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${targetProgress * 100}%`,
                height: '100%',
                borderRadius: 3,
                backgroundColor: progressFg,
                transition: 'width 0.5s ease',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

defaultRegistry.register('number', NumberChart, 'Number / KPI');
