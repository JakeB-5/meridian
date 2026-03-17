/**
 * MapChart — Basic choropleth map using ECharts built-in map.
 *
 * Features:
 * - Region coloring by value (sequential palette)
 * - Visual map legend
 * - Tooltip with region name and value
 * - Zoom and pan
 * - Configurable map type (world, usa, etc.)
 *
 * Note: ECharts requires map geo data to be registered.
 * This component provides the rendering wrapper; actual map JSON
 * must be loaded and registered externally via `echarts.registerMap()`.
 */

import { useMemo, useRef, useEffect } from 'react';
import * as echarts from 'echarts';
import type { ECharts, EChartsOption } from 'echarts';
import type { ChartProps } from '../types.js';
import { toPieData } from '../utils/data-transformer.js';
import { defaultNumberFormat } from '../utils/format.js';
import { SEQUENTIAL_PALETTES } from '../utils/color-palette.js';
import { lightTheme } from '../theme/light.js';
import { darkTheme } from '../theme/dark.js';
import { defaultRegistry } from '../chart-registry.js';

export function MapChart({
  data,
  config,
  loading,
  theme = 'light',
}: ChartProps): JSX.Element {
  const chartRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<ECharts | null>(null);

  const mapName = (config.options?.mapName as string) ?? 'world';
  const paletteName = (config.options?.palette as keyof typeof SEQUENTIAL_PALETTES) ?? 'blue';
  const palette = SEQUENTIAL_PALETTES[paletteName] ?? SEQUENTIAL_PALETTES.blue;
  const roam = config.options?.roam !== false;
  const showLabels = config.options?.showLabels === true; // off by default for maps

  // Transform to name/value pairs (reuse pie data transformer)
  const mapData = useMemo(() => toPieData(data, config), [data, config]);

  // Build option
  const option = useMemo((): EChartsOption => {
    if (!mapData.length) return {};

    const values = mapData.map((d) => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);

    const inRange = {
      color: [palette[1], palette[Math.floor(palette.length / 2)], palette[palette.length - 1]],
    };

    const opt: EChartsOption = {
      tooltip: {
        show: config.tooltip !== false,
        trigger: 'item',
        formatter: (params: unknown) => {
          const p = params as { name: string; value: number; color: string };
          if (p.value == null || isNaN(p.value)) {
            return `<div style="font-weight:600">${p.name}</div><div>No data</div>`;
          }
          let html = `<div style="font-weight:600;margin-bottom:4px">${p.name}</div>`;
          html += `<div>Value: <strong>${defaultNumberFormat(p.value)}</strong></div>`;
          return html;
        },
      },
      visualMap: {
        min: isFinite(min) ? min : 0,
        max: isFinite(max) ? max : 100,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: 8,
        inRange,
        textStyle: {
          fontSize: 10,
          color: theme === 'dark' ? '#9CA3AF' : '#6B7280',
        },
      },
      series: [
        {
          type: 'map',
          map: mapName,
          roam,
          data: mapData.map((d) => ({
            name: d.name,
            value: d.value,
          })),
          label: showLabels
            ? {
                show: true,
                fontSize: 9,
                color: theme === 'dark' ? '#D1D5DB' : '#374151',
              }
            : { show: false },
          itemStyle: {
            areaColor: theme === 'dark' ? '#374151' : '#F3F4F6',
            borderColor: theme === 'dark' ? '#4B5563' : '#D1D5DB',
          },
          emphasis: {
            label: { show: true, fontSize: 11 },
            itemStyle: {
              areaColor: theme === 'dark' ? '#6B8FE6' : '#93C5FD',
            },
          },
          select: {
            itemStyle: {
              areaColor: theme === 'dark' ? '#6B8FE6' : '#5470C6',
            },
          },
          animationDurationUpdate: 500,
        },
      ],
    };

    return opt;
  }, [mapData, config, mapName, palette, roam, showLabels, theme]);

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
      data-testid="map-chart"
      style={{ width: '100%', height: '100%' }}
    />
  );
}

defaultRegistry.register('map', MapChart, 'Choropleth Map');
