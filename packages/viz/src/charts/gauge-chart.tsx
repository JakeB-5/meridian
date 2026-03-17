/**
 * GaugeChart — Speedometer gauge with ECharts.
 *
 * Features:
 * - Configurable min/max range
 * - Color zones (red/yellow/green)
 * - Custom axis labels
 * - Current value pointer with formatted label
 * - Title and detail text
 */

import { useMemo, useRef, useEffect } from 'react';
import * as echarts from 'echarts';
import type { ECharts, EChartsOption } from 'echarts';
import type { ChartProps } from '../types.js';
import { toSingleValue } from '../utils/data-transformer.js';
import { defaultNumberFormat } from '../utils/format.js';
import { lightTheme } from '../theme/light.js';
import { darkTheme } from '../theme/dark.js';
import { defaultRegistry } from '../chart-registry.js';

export function GaugeChart({
  data,
  config,
  loading,
  theme = 'light',
}: ChartProps): JSX.Element {
  const chartRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<ECharts | null>(null);

  // Options
  const min = (config.options?.min as number) ?? 0;
  const max = (config.options?.max as number) ?? 100;
  const startAngle = (config.options?.startAngle as number) ?? 225;
  const endAngle = (config.options?.endAngle as number) ?? -45;
  const splitNumber = (config.options?.splitNumber as number) ?? 10;
  const showProgress = config.options?.showProgress !== false;
  const title = config.options?.gaugeTitle as string | undefined;

  // Color zones: [[threshold, color], ...]
  const defaultZones: [number, string][] = [
    [0.3, '#EE6666'],
    [0.7, '#FAC858'],
    [1.0, '#91CC75'],
  ];
  const zones = (config.options?.colorZones as [number, string][]) ?? defaultZones;

  // Extract value
  const extracted = useMemo(() => toSingleValue(data, config), [data, config]);
  const value = extracted?.value ?? 0;

  // Clamp value to range
  const clampedValue = Math.max(min, Math.min(max, value));

  // Build option
  const option = useMemo((): EChartsOption => {
    const opt: EChartsOption = {
      series: [
        {
          type: 'gauge',
          min,
          max,
          startAngle,
          endAngle,
          splitNumber,
          radius: '85%',
          center: ['50%', '55%'],
          axisLine: {
            lineStyle: {
              width: 20,
              color: zones,
            },
          },
          axisTick: {
            show: true,
            splitNumber: 5,
            length: 6,
            lineStyle: {
              color: 'auto',
              width: 1,
            },
          },
          splitLine: {
            show: true,
            length: 12,
            lineStyle: {
              color: 'auto',
              width: 2,
            },
          },
          axisLabel: {
            show: true,
            distance: 28,
            fontSize: 11,
            formatter: (v: number) => defaultNumberFormat(v),
          },
          pointer: {
            show: true,
            length: '60%',
            width: 5,
            itemStyle: {
              color: 'auto',
            },
          },
          anchor: {
            show: true,
            showAbove: true,
            size: 12,
            itemStyle: {
              borderWidth: 2,
              borderColor: theme === 'dark' ? '#4B5563' : '#D1D5DB',
            },
          },
          progress: showProgress
            ? {
                show: true,
                width: 20,
                overlap: false,
              }
            : { show: false },
          title: title
            ? {
                show: true,
                offsetCenter: [0, '70%'],
                fontSize: 14,
                fontWeight: 500,
                color: theme === 'dark' ? '#D1D5DB' : '#374151',
              }
            : { show: false },
          detail: {
            show: true,
            valueAnimation: true,
            fontSize: 24,
            fontWeight: 700,
            offsetCenter: [0, '45%'],
            formatter: (v: number) => defaultNumberFormat(v),
            color: theme === 'dark' ? '#F3F4F6' : '#111827',
          },
          data: [
            {
              value: clampedValue,
              name: title ?? '',
            },
          ],
          animationDuration: 800,
          animationEasing: 'cubicOut',
        },
      ],
    };

    return opt;
  }, [min, max, startAngle, endAngle, splitNumber, zones, clampedValue, title, showProgress, theme]);

  // Init and update
  useEffect(() => {
    if (!chartRef.current) return;
    const themeObj = theme === 'dark' ? darkTheme : lightTheme;
    if (!instanceRef.current) {
      instanceRef.current = echarts.init(chartRef.current, themeObj);
    }
    instanceRef.current.setOption(option, { notMerge: true });
  }, [option, theme]);

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
      data-testid="gauge-chart"
      style={{ width: '100%', height: '100%' }}
    />
  );
}

defaultRegistry.register('gauge', GaugeChart, 'Gauge');
