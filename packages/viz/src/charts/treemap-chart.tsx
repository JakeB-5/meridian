/**
 * TreemapChart — Hierarchical treemap with ECharts.
 *
 * Features:
 * - Flat or hierarchical data
 * - Color by value or by category
 * - Labels with name and value
 * - Drill-down on click (navigates into sub-tree)
 * - Breadcrumb navigation
 * - Tooltip with percentage
 */

import { useMemo, useRef, useCallback, useEffect } from 'react';
import * as echarts from 'echarts';
import type { ECharts, EChartsOption } from 'echarts';
import type { ChartProps, DataPoint } from '../types.js';
import { toTreemapData } from '../utils/data-transformer.js';
import { defaultNumberFormat, formatPercent } from '../utils/format.js';
import { getColor } from '../utils/color-palette.js';
import { lightTheme } from '../theme/light.js';
import { darkTheme } from '../theme/dark.js';
import { defaultRegistry } from '../chart-registry.js';

export function TreemapChart({
  data,
  config,
  loading,
  onDataPointClick,
  theme = 'light',
}: ChartProps): JSX.Element {
  const chartRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<ECharts | null>(null);

  const showLabels = config.options?.showLabels !== false;
  const showBreadcrumb = config.options?.showBreadcrumb !== false;
  const leafDepth = (config.options?.leafDepth as number) ?? 1;
  const roam = config.options?.roam !== false;

  // Transform data
  const treeData = useMemo(() => toTreemapData(data, config), [data, config]);

  // Build option
  const option = useMemo((): EChartsOption => {
    if (!treeData.length) return {};

    const colors = config.colors ?? treeData.map((_, i) => getColor(i));
    const total = treeData.reduce((sum, n) => sum + n.value, 0);

    // Assign colors to top-level nodes
    const coloredData = treeData.map((node, i) => ({
      ...node,
      itemStyle: {
        color: colors[i % colors.length],
      },
    }));

    const opt: EChartsOption = {
      tooltip: {
        show: config.tooltip !== false,
        formatter: (params: unknown) => {
          const p = params as {
            name: string;
            value: number;
            treePathInfo: Array<{ name: string; value: number }>;
            color: string;
          };
          const pct = total > 0 ? p.value / total : 0;
          let html = `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">`;
          html += `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${p.color}"></span>`;
          html += `<span style="font-weight:600">${p.name}</span>`;
          html += `</div>`;
          html += `<div>Value: <strong>${defaultNumberFormat(p.value)}</strong></div>`;
          html += `<div>Share: ${formatPercent(pct, 0, 1)}</div>`;
          if (p.treePathInfo && p.treePathInfo.length > 1) {
            const path = p.treePathInfo.map((info) => info.name).join(' > ');
            html += `<div style="color:#9CA3AF;font-size:11px;margin-top:4px">${path}</div>`;
          }
          return html;
        },
      },
      series: [
        {
          type: 'treemap',
          data: coloredData,
          top: 8,
          left: 8,
          right: 8,
          bottom: showBreadcrumb ? 36 : 8,
          roam: roam ? 'move' : false,
          leafDepth,
          nodeClick: 'zoomToNode',
          breadcrumb: showBreadcrumb
            ? {
                show: true,
                bottom: 4,
                left: 8,
                itemStyle: {
                  color: theme === 'dark' ? '#374151' : '#F3F4F6',
                  borderColor: theme === 'dark' ? '#4B5563' : '#D1D5DB',
                  textStyle: {
                    color: theme === 'dark' ? '#D1D5DB' : '#374151',
                    fontSize: 11,
                  },
                },
                emphasis: {
                  itemStyle: {
                    color: theme === 'dark' ? '#4B5563' : '#E5E7EB',
                  },
                },
              }
            : { show: false },
          label: showLabels
            ? {
                show: true,
                formatter: (params: { name: string; value: number }) => {
                  return `${params.name}\n${defaultNumberFormat(params.value)}`;
                },
                fontSize: 12,
                lineHeight: 16,
                color: '#FFFFFF',
                textShadowBlur: 2,
                textShadowColor: 'rgba(0,0,0,0.3)',
              }
            : { show: false },
          upperLabel: {
            show: true,
            height: 24,
            color: theme === 'dark' ? '#D1D5DB' : '#374151',
            fontSize: 11,
          },
          itemStyle: {
            borderWidth: 1,
            borderColor: theme === 'dark' ? '#111827' : '#FFFFFF',
            gapWidth: 1,
          },
          levels: [
            {
              itemStyle: {
                borderWidth: 2,
                gapWidth: 2,
              },
            },
            {
              itemStyle: {
                borderWidth: 1,
                gapWidth: 1,
              },
              upperLabel: { show: true },
            },
            {
              itemStyle: {
                borderWidth: 0,
                gapWidth: 1,
              },
            },
          ],
          animationDuration: 500,
          animationEasing: 'cubicOut',
        },
      ],
    };

    return opt;
  }, [treeData, config, theme, showLabels, showBreadcrumb, leafDepth, roam]);

  // Click handler
  const handleClick = useCallback(
    (params: { name: string; value: number; dataIndex: number }) => {
      if (!onDataPointClick) return;
      const row = data.rows[params.dataIndex] ?? {};
      const point: DataPoint = {
        series: params.name,
        category: params.name,
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
      data-testid="treemap-chart"
      style={{ width: '100%', height: '100%' }}
    />
  );
}

defaultRegistry.register('treemap', TreemapChart, 'Treemap');
