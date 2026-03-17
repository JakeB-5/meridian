/**
 * ComboChart — Combined bar + line chart with ECharts.
 *
 * Features:
 * - Multiple series with independently configurable types (bar or line)
 * - Dual Y axes (left for bars, right for lines)
 * - Shared X category axis
 * - Per-series color and styling
 * - Tooltip combining all series
 * - Click interaction
 */

import { useMemo, useRef, useCallback, useEffect } from 'react';
import * as echarts from 'echarts';
import type { ECharts, EChartsOption } from 'echarts';
import type { ChartProps, DataPoint, ComboSeriesConfig } from '../types.js';
import { toCategorySeries } from '../utils/data-transformer.js';
import { defaultNumberFormat, createAxisFormatter } from '../utils/format.js';
import { getColor, withAlpha } from '../utils/color-palette.js';
import { lightTheme } from '../theme/light.js';
import { darkTheme } from '../theme/dark.js';
import { defaultRegistry } from '../chart-registry.js';

export function ComboChart({
  data,
  config,
  loading,
  onDataPointClick,
  theme = 'light',
}: ChartProps): JSX.Element {
  const chartRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<ECharts | null>(null);

  const dualAxis = config.options?.dualAxis !== false;
  const showDataLabels = config.options?.showDataLabels === true;

  // Series configuration: which columns are bars vs lines
  const seriesConfigs = config.options?.seriesConfig as ComboSeriesConfig[] | undefined;

  // Transform data
  const chartData = useMemo(
    () => toCategorySeries(data, config),
    [data, config],
  );

  // Build option
  const option = useMemo((): EChartsOption => {
    const { categories, series } = chartData;
    if (!categories.length) return {};

    const colors = config.colors ?? series.map((_, i) => getColor(i));

    // Determine series types
    const resolvedTypes: ('bar' | 'line')[] = series.map((s, i) => {
      // If explicit config provided, match by column name
      if (seriesConfigs) {
        const cfg = seriesConfigs.find((c) => c.column === s.name);
        if (cfg) return cfg.chartType;
      }
      // Default: first series is bar, rest are line
      return i === 0 ? 'bar' : 'line';
    });

    const hasBarSeries = resolvedTypes.includes('bar');
    const hasLineSeries = resolvedTypes.includes('line');

    // Axis formatters
    const dimCol = data.columns[0];
    const dimFormatter = dimCol
      ? createAxisFormatter(dimCol.type, config.xAxis?.format)
      : undefined;

    // Build ECharts series
    const echartsSeriesData = series.map((s, i) => {
      const type = resolvedTypes[i];
      const color = colors[i % colors.length];
      const yAxisIndex = dualAxis && type === 'line' && hasBarSeries ? 1 : 0;

      // Resolve explicit yAxisIndex from series config
      const explicitConfig = seriesConfigs?.find((c) => c.column === s.name);
      const effectiveYAxisIndex = explicitConfig?.yAxisIndex ?? yAxisIndex;

      if (type === 'line') {
        return {
          name: s.name,
          type: 'line' as const,
          data: s.values,
          yAxisIndex: effectiveYAxisIndex,
          smooth: 0.3,
          symbol: 'circle',
          symbolSize: 6,
          lineStyle: { width: 2, color },
          itemStyle: { color },
          emphasis: { lineStyle: { width: 3 } },
          label: showDataLabels
            ? {
                show: true,
                position: 'top' as const,
                formatter: (params: { value: number | null }) =>
                  params.value != null ? defaultNumberFormat(params.value) : '',
                fontSize: 10,
              }
            : { show: false },
        };
      }

      return {
        name: s.name,
        type: 'bar' as const,
        data: s.values,
        yAxisIndex: effectiveYAxisIndex,
        itemStyle: { color },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: withAlpha(color, 0.3),
          },
        },
        label: showDataLabels
          ? {
              show: true,
              position: 'top' as const,
              formatter: (params: { value: number | null }) =>
                params.value != null ? defaultNumberFormat(params.value) : '',
              fontSize: 10,
            }
          : { show: false },
      };
    });

    // Y axes
    const yAxes: Record<string, unknown>[] = [
      {
        type: 'value',
        name: config.yAxis?.label ?? '',
        position: 'left',
        min: config.yAxis?.min,
        max: config.yAxis?.max,
        axisLabel: {
          formatter: (v: number) => defaultNumberFormat(v),
        },
      },
    ];

    if (dualAxis && hasLineSeries && hasBarSeries) {
      yAxes.push({
        type: 'value',
        name: config.options?.rightAxisLabel ?? '',
        position: 'right',
        axisLabel: {
          formatter: (v: number) => defaultNumberFormat(v),
        },
        splitLine: { show: false },
      });
    }

    const opt: EChartsOption = {
      tooltip: {
        show: config.tooltip !== false,
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        formatter: (params: unknown) => {
          const items = Array.isArray(params) ? params : [params];
          const p = items as Array<{
            seriesName: string;
            value: number | null;
            color: string;
            axisValueLabel: string;
            seriesType: string;
          }>;
          if (!p.length) return '';
          let html = `<div style="font-weight:600;margin-bottom:4px">${p[0].axisValueLabel}</div>`;
          for (const item of p) {
            if (item.value == null) continue;
            const icon = item.seriesType === 'bar'
              ? `<span style="display:inline-block;width:8px;height:8px;border-radius:1px;background:${item.color}"></span>`
              : `<span style="display:inline-block;width:12px;height:2px;border-radius:1px;background:${item.color}"></span>`;
            html += `<div style="display:flex;align-items:center;gap:6px;margin:2px 0">`;
            html += icon;
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
          }
        : { show: false },
      grid: {
        left: 12,
        right: dualAxis && hasLineSeries && hasBarSeries ? 12 : 12,
        top: series.length > 1 ? 40 : 16,
        bottom: 12,
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: categories,
        name: config.xAxis?.label ?? '',
        axisLabel: {
          ...(dimFormatter ? { formatter: dimFormatter } : {}),
          rotate: categories.length > 10 ? 45 : 0,
        },
      },
      yAxis: yAxes,
      series: echartsSeriesData,
      animationDuration: 500,
      animationEasing: 'cubicOut',
    };

    return opt;
  }, [chartData, config, data.columns, dualAxis, showDataLabels, seriesConfigs]);

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
      data-testid="combo-chart"
      style={{ width: '100%', height: '100%' }}
    />
  );
}

defaultRegistry.register('combo', ComboChart, 'Combo Chart');
