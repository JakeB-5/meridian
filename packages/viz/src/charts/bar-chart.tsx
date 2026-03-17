/**
 * BarChart — Vertical & horizontal bar chart with ECharts.
 *
 * Features:
 * - Vertical (default) and horizontal orientation
 * - Single and multi-series
 * - Stacked and grouped modes
 * - Data labels
 * - Axis formatting
 * - Click interaction
 */

import { useMemo, useRef, useCallback, useEffect } from 'react';
import * as echarts from 'echarts';
import type { ECharts, EChartsOption } from 'echarts';
import type { ChartProps, DataPoint } from '../types.js';
import { toCategorySeries } from '../utils/data-transformer.js';
import { defaultNumberFormat, createAxisFormatter } from '../utils/format.js';
import { getColor, withAlpha } from '../utils/color-palette.js';
import { lightTheme } from '../theme/light.js';
import { darkTheme } from '../theme/dark.js';
import { defaultRegistry } from '../chart-registry.js';

export function BarChart({
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

  const isHorizontal = config.options?.orientation === 'horizontal';
  const isStacked = config.stacked === true;
  const showDataLabels = config.options?.showDataLabels === true;
  const barWidth = config.options?.barWidth as number | string | undefined;

  // Transform data
  const chartData = useMemo(
    () => toCategorySeries(data, config),
    [data, config],
  );

  // Build ECharts option
  const option = useMemo((): EChartsOption => {
    const { categories, series } = chartData;
    if (!categories.length) return {};

    const colors = config.colors ?? series.map((_, i) => getColor(i));

    // Axis formatters
    const dimCol = data.columns[0];
    const dimFormatter = dimCol
      ? createAxisFormatter(dimCol.type, config.xAxis?.format)
      : undefined;

    const categoryAxisConfig: Record<string, unknown> = {
      type: 'category' as const,
      data: categories,
      name: isHorizontal ? (config.yAxis?.label ?? '') : (config.xAxis?.label ?? ''),
      axisLabel: {
        ...(dimFormatter ? { formatter: dimFormatter } : {}),
        rotate: !isHorizontal && categories.length > 10 ? 45 : 0,
        overflow: 'truncate',
        width: 80,
      },
    };

    const valueAxisConfig: Record<string, unknown> = {
      type: 'value' as const,
      name: isHorizontal ? (config.xAxis?.label ?? '') : (config.yAxis?.label ?? ''),
      min: isHorizontal ? config.xAxis?.min : config.yAxis?.min,
      max: isHorizontal ? config.xAxis?.max : config.yAxis?.max,
      axisLabel: {
        formatter: (v: number) => defaultNumberFormat(v),
      },
    };

    const echartsSeriesData = series.map((s, i) => ({
      name: s.name,
      type: 'bar' as const,
      data: s.values,
      stack: isStacked ? 'total' : undefined,
      barWidth: barWidth,
      itemStyle: {
        color: colors[i % colors.length],
      },
      emphasis: {
        itemStyle: {
          color: colors[i % colors.length],
          shadowBlur: 10,
          shadowColor: withAlpha(colors[i % colors.length], 0.3),
        },
      },
      label: showDataLabels
        ? {
            show: true,
            position: isStacked ? 'inside' : (isHorizontal ? 'right' : 'top'),
            formatter: (params: { value: number | null }) =>
              params.value != null ? defaultNumberFormat(params.value) : '',
            fontSize: 10,
          }
        : { show: false },
    }));

    const opt: EChartsOption = {
      tooltip: {
        show: config.tooltip !== false,
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: unknown) => {
          const items = Array.isArray(params) ? params : [params];
          const p = items as Array<{
            seriesName: string;
            value: number | null;
            color: string;
            axisValueLabel: string;
          }>;
          if (!p.length) return '';
          let html = `<div style="font-weight:600;margin-bottom:4px">${p[0].axisValueLabel}</div>`;
          for (const item of p) {
            if (item.value == null) continue;
            html += `<div style="display:flex;align-items:center;gap:6px;margin:2px 0">`;
            html += `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${item.color}"></span>`;
            html += `<span>${item.seriesName}</span>`;
            html += `<span style="margin-left:auto;font-weight:600">${defaultNumberFormat(item.value)}</span>`;
            html += `</div>`;
          }
          return html;
        },
      },
      legend: config.legend?.show !== false && series.length > 1
        ? {
            show: true,
            data: series.map((s) => s.name),
            ...(config.legend?.position === 'bottom' ? { bottom: 0 } : { top: 0 }),
            ...(config.legend?.position === 'left' ? { left: 0 } : {}),
            ...(config.legend?.position === 'right' ? { right: 0 } : {}),
          }
        : { show: false },
      grid: {
        left: 12,
        right: 12,
        top: series.length > 1 ? 40 : 16,
        bottom: 12,
        containLabel: true,
      },
      xAxis: isHorizontal ? valueAxisConfig : categoryAxisConfig,
      yAxis: isHorizontal ? categoryAxisConfig : valueAxisConfig,
      series: echartsSeriesData,
      animationDuration: 500,
      animationEasing: 'cubicOut',
    };

    return opt;
  }, [chartData, config, data.columns, isHorizontal, isStacked, showDataLabels, barWidth]);

  // Click handler
  const handleClick = useCallback(
    (params: { seriesName: string; name: string; value: number; dataIndex: number }) => {
      if (!onDataPointClick) return;
      const row = data.rows[params.dataIndex] ?? {};
      const point: DataPoint = {
        series: params.seriesName ?? '',
        category: params.name ?? '',
        value: typeof params.value === 'number' ? params.value : 0,
        row,
      };
      onDataPointClick(point);
    },
    [onDataPointClick, data.rows],
  );

  // Initialize and update chart
  useEffect(() => {
    if (!chartRef.current) return;

    const themeObj = theme === 'dark' ? darkTheme : lightTheme;

    if (!instanceRef.current) {
      instanceRef.current = echarts.init(chartRef.current, themeObj);
    }

    instanceRef.current.setOption(option, { notMerge: true });

    // Attach click handler
    instanceRef.current.off('click');
    instanceRef.current.on('click', handleClick as (...args: unknown[]) => void);

    return () => {
      // Dispose on unmount
    };
  }, [option, theme, handleClick]);

  // Handle resize
  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance) return;

    const observer = new ResizeObserver(() => {
      instance.resize();
    });

    if (chartRef.current) {
      observer.observe(chartRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      instanceRef.current?.dispose();
      instanceRef.current = null;
    };
  }, []);

  // Loading state
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
      data-testid="bar-chart"
      style={{ width: '100%', height: '100%' }}
    />
  );
}

// Register with the default registry
defaultRegistry.register('bar', BarChart, 'Bar Chart');
