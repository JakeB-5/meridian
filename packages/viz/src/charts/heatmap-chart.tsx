/**
 * HeatmapChart — 2D matrix with color encoding via ECharts.
 *
 * Features:
 * - X and Y category axes
 * - Color intensity mapped to value
 * - Configurable color range (sequential palette)
 * - Value labels in cells
 * - Visual map (legend/gradient bar)
 * - Tooltip with x, y, value
 */

import { useMemo, useRef, useEffect } from 'react';
import * as echarts from 'echarts';
import type { ECharts, EChartsOption } from 'echarts';
import type { ChartProps } from '../types.js';
import { toHeatmapData } from '../utils/data-transformer.js';
import { defaultNumberFormat } from '../utils/format.js';
import { SEQUENTIAL_PALETTES } from '../utils/color-palette.js';
import { lightTheme } from '../theme/light.js';
import { darkTheme } from '../theme/dark.js';
import { defaultRegistry } from '../chart-registry.js';

export function HeatmapChart({
  data,
  config,
  loading,
  theme = 'light',
}: ChartProps): JSX.Element {
  const chartRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<ECharts | null>(null);

  const showLabels = config.options?.showLabels !== false;
  const paletteName = (config.options?.palette as keyof typeof SEQUENTIAL_PALETTES) ?? 'blue';
  const palette = SEQUENTIAL_PALETTES[paletteName] ?? SEQUENTIAL_PALETTES.blue;

  // Transform data
  const heatmapData = useMemo(() => toHeatmapData(data, config), [data, config]);

  // Build option
  const option = useMemo((): EChartsOption => {
    const { xLabels, yLabels, points, min, max } = heatmapData;
    if (!points.length) return {};

    // Map the sequential palette to the visualMap range
    const inRange = {
      color: [palette[0], palette[Math.floor(palette.length / 2)], palette[palette.length - 1]],
    };

    const opt: EChartsOption = {
      tooltip: {
        show: config.tooltip !== false,
        position: 'top',
        formatter: (params: unknown) => {
          const p = params as {
            value: [number, number, number];
            color: string;
          };
          const [xi, yi, val] = p.value;
          const xLabel = xLabels[xi] ?? '';
          const yLabel = yLabels[yi] ?? '';
          let html = `<div style="font-weight:600;margin-bottom:4px">${xLabel} / ${yLabel}</div>`;
          html += `<div>Value: <strong>${defaultNumberFormat(val)}</strong></div>`;
          return html;
        },
      },
      grid: {
        left: 12,
        right: 60,
        top: 12,
        bottom: 40,
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: xLabels,
        name: config.xAxis?.label ?? '',
        splitArea: { show: true },
        axisLabel: {
          fontSize: 11,
          rotate: xLabels.length > 10 ? 45 : 0,
        },
      },
      yAxis: {
        type: 'category',
        data: yLabels,
        name: config.yAxis?.label ?? '',
        splitArea: { show: true },
        axisLabel: { fontSize: 11 },
      },
      visualMap: {
        min,
        max,
        calculable: true,
        orient: 'vertical',
        right: 4,
        top: 'center',
        inRange,
        textStyle: {
          fontSize: 10,
          color: theme === 'dark' ? '#9CA3AF' : '#6B7280',
        },
      },
      series: [
        {
          type: 'heatmap',
          data: points.map((p) => [p.x, p.y, p.value]),
          label: showLabels
            ? {
                show: true,
                formatter: (params: { value: [number, number, number] }) =>
                  defaultNumberFormat(params.value[2]),
                fontSize: 10,
                color: theme === 'dark' ? '#F3F4F6' : '#374151',
              }
            : { show: false },
          itemStyle: {
            borderWidth: 1,
            borderColor: theme === 'dark' ? '#111827' : '#FFFFFF',
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: 'rgba(0,0,0,0.2)',
            },
          },
          animationDuration: 500,
        },
      ],
    };

    return opt;
  }, [heatmapData, config, palette, showLabels, theme]);

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
      data-testid="heatmap-chart"
      style={{ width: '100%', height: '100%' }}
    />
  );
}

defaultRegistry.register('heatmap', HeatmapChart, 'Heatmap');
