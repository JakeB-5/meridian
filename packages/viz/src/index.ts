/**
 * @meridian/viz — Visualization / Chart Components
 *
 * Apache ECharts-based chart library with a type-safe configuration API.
 * All charts auto-register with the defaultRegistry on import.
 */

// --- Types ---
export type {
  ChartProps,
  DataPoint,
  TrendDirection,
  ExportFormat,
  ChartContainerProps,
  SortState,
  ConditionalFormatRule,
  NumberFormatConfig,
  KpiComparison,
  ComboSeriesConfig,
  RegressionType,
  MapRegionData,
  FunnelStageData,
  HeatmapCellData,
  TreemapNodeData,
  EChartsRef,
  ChartRegistryEntry,
} from './types.js';

// --- Registry ---
export { ChartRegistry, defaultRegistry } from './chart-registry.js';

// --- Components ---
export { ChartContainer, ChartErrorBoundary, useResizeObserver } from './components/chart-container.js';
export { ChartRenderer } from './components/chart-renderer.js';

// --- Charts (each import triggers auto-registration) ---
export { BarChart } from './charts/bar-chart.js';
export { LineChart } from './charts/line-chart.js';
export { AreaChart } from './charts/area-chart.js';
export { PieChart } from './charts/pie-chart.js';
export { ScatterChart } from './charts/scatter-chart.js';
export { TableChart } from './charts/table-chart.js';
export { NumberChart } from './charts/number-chart.js';
export { GaugeChart } from './charts/gauge-chart.js';
export { FunnelChart } from './charts/funnel-chart.js';
export { TreemapChart } from './charts/treemap-chart.js';
export { HeatmapChart } from './charts/heatmap-chart.js';
export { MapChart } from './charts/map-chart.js';
export { ComboChart } from './charts/combo-chart.js';

// --- Utils ---
export {
  toCategorySeries,
  toPieData,
  toScatterData,
  toHeatmapData,
  toFunnelData,
  toTreemapData,
  toSingleValue,
  toTableData,
  detectColumnRoles,
  getDimensionColumnIndex,
  getMeasureColumnIndices,
} from './utils/data-transformer.js';

export type {
  SeriesData,
  CategorySeriesData,
  XYSeriesData,
  PieSliceData,
  TreeNode,
  HeatmapPoint,
} from './utils/data-transformer.js';

export {
  formatNumber,
  defaultNumberFormat,
  formatDecimal,
  formatWithThousands,
  formatCompact,
  formatCurrency,
  formatPercent,
  formatDate,
  formatDuration,
  createAxisFormatter,
  formatTooltipValue,
  isDateType,
  isNumericType,
  toDate,
} from './utils/format.js';

export type { DateFormatPreset } from './utils/format.js';

export {
  DEFAULT_PALETTE,
  CATEGORICAL_PALETTE,
  SEQUENTIAL_PALETTES,
  DIVERGING_PALETTES,
  getColor,
  getColors,
  getSequentialPalette,
  getDivergingPalette,
  interpolateColor,
  generateColorScale,
  withAlpha,
} from './utils/color-palette.js';

export type {
  SequentialPaletteName,
  DivergingPaletteName,
} from './utils/color-palette.js';

// --- Themes ---
export { lightTheme } from './theme/light.js';
export { darkTheme } from './theme/dark.js';
