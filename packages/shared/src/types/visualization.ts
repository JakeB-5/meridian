/** Supported chart types */
export type ChartType =
  | 'bar' | 'line' | 'area' | 'pie' | 'donut'
  | 'scatter' | 'table' | 'number' | 'gauge'
  | 'funnel' | 'treemap' | 'heatmap' | 'map'
  | 'sankey' | 'radar' | 'waterfall' | 'boxplot'
  | 'histogram' | 'combo';

/** Axis configuration for charts */
export interface AxisConfig {
  label?: string;
  format?: string;
  min?: number;
  max?: number;
}

/** Legend configuration */
export interface LegendConfig {
  show: boolean;
  position: 'top' | 'bottom' | 'left' | 'right';
}

/** Complete visualization configuration for a question/card */
export interface VisualizationConfig {
  type: ChartType;
  title?: string;
  xAxis?: AxisConfig;
  yAxis?: AxisConfig;
  colors?: string[];
  legend?: LegendConfig;
  tooltip?: boolean;
  stacked?: boolean;
  options?: Record<string, unknown>;
}
