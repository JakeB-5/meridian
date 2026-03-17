/**
 * ChartRenderer — Dynamic chart renderer using the registry.
 *
 * Looks up the correct chart component by VisualizationConfig.type,
 * wraps it in a ChartContainer, and renders it.
 */

import { useMemo, useRef, useCallback } from 'react';
import type { ECharts } from 'echarts';
import { defaultRegistry } from '../chart-registry.js';
import { ChartContainer } from './chart-container.js';
import type { ChartProps, ExportFormat } from '../types.js';

/**
 * ChartRenderer resolves the chart component from the registry
 * and wraps it in a responsive container with export support.
 */
export function ChartRenderer({
  data,
  config,
  width,
  height,
  loading,
  onDataPointClick,
  theme = 'light',
  className,
}: ChartProps): JSX.Element {
  const echartsRef = useRef<ECharts | null>(null);

  // Resolve chart component from registry
  const ChartComponent = useMemo(() => {
    // Handle 'donut' as a variant of 'pie'
    const type = config.type === 'donut' ? 'pie' : config.type;
    return defaultRegistry.get(type);
  }, [config.type]);

  // Export handler: get chart data URL from ECharts instance
  const handleExport = useCallback(
    (format: ExportFormat) => {
      const instance = echartsRef.current;
      if (!instance) return;

      try {
        const dataUrl = instance.getDataURL({
          type: format === 'svg' ? 'svg' : 'png',
          pixelRatio: 2,
          backgroundColor: theme === 'dark' ? '#111827' : '#FFFFFF',
        });

        // Trigger download
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `chart-${config.type}-${Date.now()}.${format}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch {
        // SVG renderer may not support getDataURL — silently fail
        console.warn(`Failed to export chart as ${format}`);
      }
    },
    [config.type, theme],
  );

  if (!ChartComponent) {
    return (
      <ChartContainer
        width={width}
        height={height}
        theme={theme}
        className={className}
        title={config.title}
        error={new Error(`Unsupported chart type: "${config.type}". Register it with the chart registry.`)}
      >
        <div />
      </ChartContainer>
    );
  }

  return (
    <ChartContainer
      width={width}
      height={height}
      loading={loading}
      theme={theme}
      className={className}
      title={config.title}
      onExport={handleExport}
    >
      <ChartComponent
        data={data}
        config={config}
        loading={loading}
        onDataPointClick={onDataPointClick}
        theme={theme}
      />
    </ChartContainer>
  );
}
