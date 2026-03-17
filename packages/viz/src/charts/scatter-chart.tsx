/**
 * ScatterChart — Scatter / bubble chart with ECharts.
 *
 * Features:
 * - X/Y numeric axes
 * - Size encoding (bubble chart)
 * - Color encoding by series
 * - Optional regression line
 * - Tooltips with label
 * - Click interaction
 */

import { useMemo, useRef, useCallback, useEffect } from 'react';
import * as echarts from 'echarts';
import type { ECharts, EChartsOption } from 'echarts';
import type { ChartProps, DataPoint, RegressionType } from '../types.js';
import { toScatterData } from '../utils/data-transformer.js';
import { defaultNumberFormat } from '../utils/format.js';
import { getColor, withAlpha } from '../utils/color-palette.js';
import { lightTheme } from '../theme/light.js';
import { darkTheme } from '../theme/dark.js';
import { defaultRegistry } from '../chart-registry.js';

/**
 * Compute linear regression line: y = mx + b
 */
function linearRegression(
  points: Array<{ x: number | string; y: number }>,
): { slope: number; intercept: number; minX: number; maxX: number } | null {
  const numericPoints = points.filter(
    (p): p is { x: number; y: number } => typeof p.x === 'number',
  );
  if (numericPoints.length < 2) return null;

  const n = numericPoints.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  let minX = Infinity, maxX = -Infinity;

  for (const p of numericPoints) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumX2 += p.x * p.x;
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
  }

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return null;

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  return { slope, intercept, minX, maxX };
}

export function ScatterChart({
  data,
  config,
  width,
  height,
  loading,
  onDataPointClick,
  theme = 'light',
}: ChartProps): JSX.Element {
  const chartRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<ECharts | null>(null);

  const showRegression = config.options?.regression === true ||
    config.options?.regressionType != null;
  const maxBubbleSize = (config.options?.maxBubbleSize as number) ?? 40;
  const minBubbleSize = (config.options?.minBubbleSize as number) ?? 6;

  // Transform data
  const scatterData = useMemo(() => toScatterData(data, config), [data, config]);

  // Build option
  const option = useMemo((): EChartsOption => {
    if (!scatterData.length) return {};

    const colors = config.colors ?? scatterData.map((_, i) => getColor(i));

    // Normalize size values for bubble chart
    const allSizes: number[] = [];
    for (const series of scatterData) {
      for (const p of series.points) {
        if (p.size != null) allSizes.push(p.size);
      }
    }
    const hasSizeEncoding = allSizes.length > 0;
    const sizeMin = hasSizeEncoding ? Math.min(...allSizes) : 0;
    const sizeMax = hasSizeEncoding ? Math.max(...allSizes) : 0;
    const sizeRange = sizeMax - sizeMin || 1;

    const normalizeSize = (size: number | undefined): number => {
      if (size == null || !hasSizeEncoding) return 8;
      const normalized = (size - sizeMin) / sizeRange;
      return minBubbleSize + normalized * (maxBubbleSize - minBubbleSize);
    };

    // Build series
    const echartsSeries: Record<string, unknown>[] = scatterData.map((s, i) => {
      const color = colors[i % colors.length];
      return {
        name: s.name,
        type: 'scatter',
        data: s.points.map((p) => ({
          value: [p.x, p.y],
          symbolSize: normalizeSize(p.size),
          label: p.label,
          _size: p.size,
        })),
        itemStyle: {
          color: withAlpha(color, 0.7),
          borderColor: color,
          borderWidth: 1,
        },
        emphasis: {
          itemStyle: {
            color,
            borderWidth: 2,
            shadowBlur: 10,
            shadowColor: withAlpha(color, 0.3),
          },
        },
      };
    });

    // Add regression line
    if (showRegression) {
      for (let i = 0; i < scatterData.length; i++) {
        const regression = linearRegression(scatterData[i].points);
        if (regression) {
          const { slope, intercept, minX, maxX } = regression;
          const color = colors[i % colors.length];
          echartsSeries.push({
            name: `${scatterData[i].name} (trend)`,
            type: 'line',
            data: [
              [minX, slope * minX + intercept],
              [maxX, slope * maxX + intercept],
            ],
            lineStyle: {
              color,
              type: 'dashed',
              width: 1.5,
              opacity: 0.6,
            },
            symbol: 'none',
            tooltip: { show: false },
          });
        }
      }
    }

    const opt: EChartsOption = {
      tooltip: {
        show: config.tooltip !== false,
        trigger: 'item',
        formatter: (params: unknown) => {
          const p = params as {
            seriesName: string;
            value: [number, number];
            data: { label?: string; _size?: number };
            color: string;
          };
          const [x, y] = p.value;
          let html = `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">`;
          html += `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color}"></span>`;
          html += `<span style="font-weight:600">${p.data.label || p.seriesName}</span>`;
          html += `</div>`;
          html += `<div>X: ${defaultNumberFormat(x)}</div>`;
          html += `<div>Y: ${defaultNumberFormat(y)}</div>`;
          if (p.data._size != null) {
            html += `<div>Size: ${defaultNumberFormat(p.data._size)}</div>`;
          }
          return html;
        },
      },
      legend: config.legend?.show !== false && scatterData.length > 1
        ? {
            show: true,
            data: scatterData.map((s) => s.name),
            ...(config.legend?.position === 'bottom' ? { bottom: 0 } : { top: 0 }),
          }
        : { show: false },
      grid: {
        left: 12,
        right: 12,
        top: scatterData.length > 1 ? 40 : 16,
        bottom: 12,
        containLabel: true,
      },
      xAxis: {
        type: 'value',
        name: config.xAxis?.label ?? '',
        min: config.xAxis?.min,
        max: config.xAxis?.max,
        axisLabel: {
          formatter: (v: number) => defaultNumberFormat(v),
        },
      },
      yAxis: {
        type: 'value',
        name: config.yAxis?.label ?? '',
        min: config.yAxis?.min,
        max: config.yAxis?.max,
        axisLabel: {
          formatter: (v: number) => defaultNumberFormat(v),
        },
      },
      series: echartsSeries,
      animationDuration: 500,
    };

    return opt;
  }, [scatterData, config, showRegression, maxBubbleSize, minBubbleSize]);

  // Click handler
  const handleClick = useCallback(
    (params: { seriesName: string; value: [number, number]; dataIndex: number }) => {
      if (!onDataPointClick) return;
      const row = data.rows[params.dataIndex] ?? {};
      const point: DataPoint = {
        series: params.seriesName ?? '',
        category: String(params.value?.[0] ?? ''),
        value: params.value?.[1] ?? 0,
        row,
      };
      onDataPointClick(point);
    },
    [onDataPointClick, data.rows],
  );

  // Init and update
  useEffect(() => {
    if (!chartRef.current) return;
    const themeObj = theme === 'dark' ? darkTheme : lightTheme;
    if (!instanceRef.current) {
      instanceRef.current = echarts.init(chartRef.current, themeObj);
    }
    instanceRef.current.setOption(option, { notMerge: true });
    instanceRef.current.off('click');
    instanceRef.current.on('click', handleClick as (...args: unknown[]) => void);
  }, [option, theme, handleClick]);

  // Resize
  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance || !chartRef.current) return;
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(chartRef.current);
    return () => observer.disconnect();
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      instanceRef.current?.dispose();
      instanceRef.current = null;
    };
  }, []);

  // Loading
  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance) return;
    if (loading) {
      instance.showLoading('default', {
        text: '',
        color: theme === 'dark' ? '#6B8FE6' : '#5470C6',
        maskColor: theme === 'dark' ? 'rgba(17,24,39,0.6)' : 'rgba(255,255,255,0.6)',
      });
    } else {
      instance.hideLoading();
    }
  }, [loading, theme]);

  return (
    <div
      ref={chartRef}
      data-testid="scatter-chart"
      style={{ width: '100%', height: '100%' }}
    />
  );
}

defaultRegistry.register('scatter', ScatterChart, 'Scatter Chart');
