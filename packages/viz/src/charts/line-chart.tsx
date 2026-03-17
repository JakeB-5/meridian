/**
 * LineChart — Single/multi-series line chart with ECharts.
 *
 * Features:
 * - Single and multi-series
 * - Area fill option
 * - Smooth and step lines
 * - Data point markers
 * - Min/max annotations
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

export function LineChart({
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

  const isSmooth = config.options?.smooth === true;
  const isStep = config.options?.step === true;
  const showArea = config.options?.area === true;
  const showMarkers = config.options?.showMarkers !== false;
  const showMinMax = config.options?.showMinMax === true;
  const showDataLabels = config.options?.showDataLabels === true;

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

    // Axis formatters
    const dimCol = data.columns[0];
    const dimFormatter = dimCol
      ? createAxisFormatter(dimCol.type, config.xAxis?.format)
      : undefined;

    // Build series with optional min/max markPoints
    const echartsSeriesData = series.map((s, i) => {
      const color = colors[i % colors.length];

      // Compute min/max indices for annotations
      let markPoint: Record<string, unknown> | undefined;
      if (showMinMax) {
        const validValues = s.values.filter((v): v is number => v != null);
        if (validValues.length > 0) {
          markPoint = {
            data: [
              { type: 'max', name: 'Max' },
              { type: 'min', name: 'Min' },
            ],
            symbol: 'pin',
            symbolSize: 40,
            label: {
              formatter: (params: { value: number }) =>
                defaultNumberFormat(params.value),
              fontSize: 10,
            },
          };
        }
      }

      return {
        name: s.name,
        type: 'line' as const,
        data: s.values,
        smooth: isSmooth && !isStep ? 0.3 : false,
        step: isStep ? ('middle' as const) : undefined,
        symbol: showMarkers ? 'circle' : 'none',
        symbolSize: showMarkers ? 6 : 0,
        showSymbol: showMarkers,
        lineStyle: {
          width: 2,
          color,
        },
        itemStyle: {
          color,
        },
        areaStyle: showArea
          ? {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: withAlpha(color, 0.4) },
                { offset: 1, color: withAlpha(color, 0.05) },
              ]),
            }
          : undefined,
        emphasis: {
          lineStyle: { width: 3 },
          itemStyle: {
            borderWidth: 2,
            borderColor: '#FFFFFF',
          },
        },
        label: showDataLabels
          ? {
              show: true,
              position: 'top',
              formatter: (params: { value: number | null }) =>
                params.value != null ? defaultNumberFormat(params.value) : '',
              fontSize: 10,
            }
          : { show: false },
        markPoint,
      };
    });

    const opt: EChartsOption = {
      tooltip: {
        show: config.tooltip !== false,
        trigger: 'axis',
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
      xAxis: {
        type: 'category',
        data: categories,
        name: config.xAxis?.label ?? '',
        boundaryGap: false,
        axisLabel: {
          ...(dimFormatter ? { formatter: dimFormatter } : {}),
          rotate: categories.length > 10 ? 45 : 0,
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
      series: echartsSeriesData,
      animationDuration: 500,
      animationEasing: 'cubicOut',
    };

    return opt;
  }, [chartData, config, data.columns, isSmooth, isStep, showArea, showMarkers, showMinMax, showDataLabels]);

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

  // Initialize and update
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

  // Resize observer
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
      data-testid="line-chart"
      style={{ width: '100%', height: '100%' }}
    />
  );
}

defaultRegistry.register('line', LineChart, 'Line Chart');
