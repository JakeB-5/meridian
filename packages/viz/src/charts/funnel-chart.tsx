/**
 * FunnelChart — Conversion funnel with ECharts.
 *
 * Features:
 * - Sorted descending (largest at top)
 * - Labels with name and value
 * - Percentage of total / previous step
 * - Color-coded stages
 * - Tooltip with conversion rates
 * - Click interaction
 */

import { useMemo, useRef, useCallback, useEffect } from 'react';
import * as echarts from 'echarts';
import type { ECharts, EChartsOption } from 'echarts';
import type { ChartProps, DataPoint } from '../types.js';
import { toFunnelData } from '../utils/data-transformer.js';
import { defaultNumberFormat, formatPercent } from '../utils/format.js';
import { getColor } from '../utils/color-palette.js';
import { lightTheme } from '../theme/light.js';
import { darkTheme } from '../theme/dark.js';
import { defaultRegistry } from '../chart-registry.js';

export function FunnelChart({
  data,
  config,
  loading,
  onDataPointClick,
  theme = 'light',
}: ChartProps): JSX.Element {
  const chartRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<ECharts | null>(null);

  const showLabels = config.options?.showLabels !== false;
  const showConversion = config.options?.showConversion !== false;
  const align = (config.options?.align as 'left' | 'center' | 'right') ?? 'center';
  const sort = (config.options?.sort as 'descending' | 'ascending' | 'none') ?? 'descending';

  // Transform data
  const funnelData = useMemo(() => toFunnelData(data, config), [data, config]);

  // Build option
  const option = useMemo((): EChartsOption => {
    if (!funnelData.length) return {};

    const colors = config.colors ?? funnelData.map((_, i) => getColor(i));
    const total = funnelData.length > 0 ? funnelData[0].value : 1;

    const seriesData = funnelData.map((d, i) => ({
      name: d.name,
      value: d.value,
      itemStyle: {
        color: colors[i % colors.length],
        borderWidth: 1,
        borderColor: theme === 'dark' ? '#111827' : '#FFFFFF',
      },
    }));

    const opt: EChartsOption = {
      tooltip: {
        show: config.tooltip !== false,
        trigger: 'item',
        formatter: (params: unknown) => {
          const p = params as {
            name: string;
            value: number;
            dataIndex: number;
            color: string;
          };
          const pctOfTotal = total > 0 ? p.value / total : 0;
          const prevValue = p.dataIndex > 0 ? funnelData[p.dataIndex - 1].value : p.value;
          const pctOfPrev = prevValue > 0 ? p.value / prevValue : 0;

          let html = `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">`;
          html += `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color}"></span>`;
          html += `<span style="font-weight:600">${p.name}</span>`;
          html += `</div>`;
          html += `<div>Value: <strong>${defaultNumberFormat(p.value)}</strong></div>`;
          html += `<div>% of total: ${formatPercent(pctOfTotal, 0, 1)}</div>`;
          if (p.dataIndex > 0 && showConversion) {
            html += `<div>Conversion: ${formatPercent(pctOfPrev, 0, 1)}</div>`;
          }
          return html;
        },
      },
      legend: config.legend?.show !== false
        ? {
            show: true,
            data: funnelData.map((d) => d.name),
            ...(config.legend?.position === 'bottom' ? { bottom: 0 } : { top: 0 }),
            ...(config.legend?.position === 'left' ? { left: 0 } : {}),
            ...(config.legend?.position === 'right' ? { right: 0 } : {}),
          }
        : { show: false },
      series: [
        {
          type: 'funnel',
          left: '10%',
          top: config.legend?.show !== false ? 40 : 16,
          bottom: 16,
          width: '80%',
          sort,
          gap: 2,
          funnelAlign: align,
          label: showLabels
            ? {
                show: true,
                position: 'inside',
                formatter: (params: { name: string; value: number }) => {
                  const pctOfTotal = total > 0 ? params.value / total : 0;
                  return `${params.name}\n${defaultNumberFormat(params.value)} (${formatPercent(pctOfTotal, 0, 1)})`;
                },
                fontSize: 12,
                lineHeight: 18,
                color: '#FFFFFF',
              }
            : { show: false },
          labelLine: {
            show: false,
          },
          emphasis: {
            label: {
              fontSize: 13,
              fontWeight: 'bold' as const,
            },
          },
          data: seriesData,
          animationDuration: 600,
          animationEasing: 'cubicOut',
        },
      ],
    };

    return opt;
  }, [funnelData, config, theme, showLabels, showConversion, align, sort]);

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
      data-testid="funnel-chart"
      style={{ width: '100%', height: '100%' }}
    />
  );
}

defaultRegistry.register('funnel', FunnelChart, 'Funnel Chart');
