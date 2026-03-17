import type {
  QueryResult,
  ChartType,
  VisualizationConfig,
} from '@meridian/shared';

/** A single data point selected or hovered on a chart */
export interface DataPoint {
  /** Series name (e.g., column header or legend label) */
  series: string;
  /** Category label on the axis (or pie slice label) */
  category: string;
  /** Numeric value at this point */
  value: number;
  /** Full row data for cross-referencing */
  row: Record<string, unknown>;
}

/** Trend direction for KPI / number charts */
export type TrendDirection = 'up' | 'down' | 'flat';

/** Download format for chart export */
export type ExportFormat = 'png' | 'svg';

/** Common props for all chart components */
export interface ChartProps {
  /** Query result data to visualize */
  data: QueryResult;
  /** Visualization configuration (chart type, axes, colors, etc.) */
  config: VisualizationConfig;
  /** Chart width — number (px) or CSS string */
  width?: number | string;
  /** Chart height — number (px) or CSS string */
  height?: number | string;
  /** Whether data is still loading */
  loading?: boolean;
  /** Callback when a data point is clicked */
  onDataPointClick?: (point: DataPoint) => void;
  /** Color theme */
  theme?: 'light' | 'dark';
  /** Additional CSS class name */
  className?: string;
}

/** Props for the chart container wrapper */
export interface ChartContainerProps {
  /** Chart width — number (px) or CSS string */
  width?: number | string;
  /** Chart height — number (px) or CSS string */
  height?: number | string;
  /** Whether data is still loading */
  loading?: boolean;
  /** Color theme */
  theme?: 'light' | 'dark';
  /** Additional CSS class name */
  className?: string;
  /** Child chart component */
  children: React.ReactNode;
  /** Title displayed above the chart */
  title?: string;
  /** Callback to trigger PNG/SVG download */
  onExport?: (format: ExportFormat) => void;
  /** Error to display (if any) */
  error?: Error | null;
}

/** Sort state for table chart */
export interface SortState {
  column: string;
  direction: 'asc' | 'desc';
}

/** Conditional formatting rule for table cells */
export interface ConditionalFormatRule {
  column: string;
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'between';
  value: number | [number, number];
  color: string;
  backgroundColor?: string;
}

/** Number format specification */
export interface NumberFormatConfig {
  style: 'decimal' | 'currency' | 'percent' | 'compact';
  currency?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  notation?: 'standard' | 'compact' | 'scientific' | 'engineering';
  compactDisplay?: 'short' | 'long';
}

/** KPI comparison data for number-chart */
export interface KpiComparison {
  previousValue: number;
  label?: string;
}

/** Series configuration for combo charts */
export interface ComboSeriesConfig {
  column: string;
  chartType: 'bar' | 'line';
  yAxisIndex?: number;
}

/** Regression line type for scatter charts */
export type RegressionType = 'linear' | 'exponential' | 'logarithmic' | 'polynomial';

/** Map region data for choropleth maps */
export interface MapRegionData {
  name: string;
  value: number;
}

/** Funnel stage data */
export interface FunnelStageData {
  name: string;
  value: number;
  percentage?: number;
}

/** Heatmap cell data */
export interface HeatmapCellData {
  x: string | number;
  y: string | number;
  value: number;
}

/** Treemap node data */
export interface TreemapNodeData {
  name: string;
  value: number;
  children?: TreemapNodeData[];
}

/** ECharts instance ref for export and direct manipulation */
export interface EChartsRef {
  getEchartsInstance: () => import('echarts').ECharts | undefined;
}

/** Internal chart component registration entry */
export interface ChartRegistryEntry {
  type: ChartType;
  component: React.ComponentType<ChartProps>;
  label: string;
  icon?: string;
}
