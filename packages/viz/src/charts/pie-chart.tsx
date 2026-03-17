/**
 * PieChart — Pie and donut chart with ECharts.
 *
 * Features:
 * - Labels with percentages
 * - Interactive legend
 * - Donut variant via innerRadius option or 'donut' ChartType
 * - Customizable colors
 * - Click interaction
 */

import { useMemo, useRef, useCallback, useEffect } from 'react';
import * as echarts from 'echarts';
import type { ECharts, EChartsOption } from 'echarts';
import type { ChartProps, DataPoint } from '../types.js';
import { toPieData } from '../utils/data-transformer.js';
import { defaultNumberFormat } from '../utils/format.js';
import { getColor } from '../utils/color-palette.js';
import { lightTheme } from '../theme/light.js';
import { darkTheme } from '../theme/dark.js';
import { defaultRegistry } from '../chart-registry.js';

export function PieChart({
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

  // Donut variant: either via chart type or inner radius option
  const isDonut = config.type === 'donut' ||
    (config.options?.innerRadius != null && Number(config.options.innerRadius) > 0);
  const innerRadius = isDonut
    ? (config.options?.innerRadius != null ? `${config.options.innerRadius}%` : '50%')
    : '0%';
  const outerRadius = config.options?.outerRadius
    ? `${config.options.outerRadius}%`
    : '70%';

  const showLabels = config.options?.showLabels !== false;
  const showPercentage = config.options?.showPercentage !== false;
  const roseMode = config.options?.roseType as 'radius' | 'area' | undefined;

  // Transform data
  const pieData = useMemo(() => toPieData(data, config), [data, config]);

  // Build option
  const option = useMemo((): EChartsOption => {
    if (!pieData.length) return {};

    const colors = config.colors ?? pieData.map((_, i) => getColor(i));
    const total = pieData.reduce((sum, d) => sum + d.value, 0);

    const seriesData = pieData.map((d, i) => ({
      name: d.name,
      value: d.value,
      itemStyle: {
        color: colors[i % colors.length],
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
            percent: number;
            color: string;
          };
          let html = `<div style="display:flex;align-items:center;gap:6px">`;
          html += `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color}"></span>`;
          html += `<span style="font-weight:600">${p.name}</span>`;
          html += `</div>`;
          html += `<div style="margin-top:4px">`;
          html += `<span>${defaultNumberFormat(p.value)}</span>`;
          html += `<span style="margin-left:8px;color:#9CA3AF">(${p.percent.toFixed(1)}%)</span>`;
          html += `</div>`;
          return html;
        },
      },
      legend: config.legend?.show !== false
        ? {
            show: true,
            orient: (config.legend?.position === 'left' || config.legend?.position === 'right')
              ? 'vertical' as const
              : 'horizontal' as const,
            data: pieData.map((d) => d.name),
            ...(config.legend?.position === 'bottom' ? { bottom: 0 } : {}),
            ...(config.legend?.position === 'top' ? { top: 0 } : {}),
            ...(config.legend?.position === 'left' ? { left: 0 } : {}),
            ...(config.legend?.position === 'right' ? { right: 0 } : {}),
            ...(!config.legend?.position ? { bottom: 0 } : {}),
            textStyle: {
              fontSize: 12,
            },
            formatter: (name: string) => {
              const item = pieData.find((d) => d.name === name);
              if (!item || !showPercentage) return name;
              const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : '0';
              return `${name} (${pct}%)`;
            },
          }
        : { show: false },
      series: [
        {
          type: 'pie',
          radius: [innerRadius, outerRadius],
          center: ['50%', '45%'],
          data: seriesData,
          roseType: roseMode || undefined,
          label: showLabels
            ? {
                show: true,
                formatter: (params: { name: string; percent: number }) => {
                  if (showPercentage) {
                    return `${params.name}\n${params.percent.toFixed(1)}%`;
                  }
                  return params.name;
                },
                fontSize: 11,
                lineHeight: 16,
              }
            : { show: false },
          labelLine: showLabels
            ? { show: true, length: 12, length2: 8 }
            : { show: false },
          emphasis: {
            scaleSize: 6,
            itemStyle: {
              shadowBlur: 10,
              shadowColor: 'rgba(0,0,0,0.2)',
            },
          },
          animationType: 'scale',
          animationEasing: 'elasticOut',
          animationDuration: 600,
        },
      ],
    };

    // Center label for donut charts (show total)
    if (isDonut && config.options?.showTotal !== false) {
      (opt.series as Record<string, unknown>[])[0] = {
        ...(opt.series as Record<string, unknown>[])[0],
        label: showLabels
          ? {
              show: true,
              formatter: (params: { name: string; percent: number }) => {
                if (showPercentage) {
                  return `${params.name}\n${params.percent.toFixed(1)}%`;
                }
                return params.name;
              },
              fontSize: 11,
              lineHeight: 16,
            }
          : { show: false },
      };
    }

    return opt;
  }, [pieData, config, innerRadius, outerRadius, showLabels, showPercentage, roseMode, isDonut]);

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
      data-testid="pie-chart"
      style={{ width: '100%', height: '100%' }}
    />
  );
}

defaultRegistry.register('pie', PieChart, 'Pie Chart');
defaultRegistry.register('donut', PieChart, 'Donut Chart');
