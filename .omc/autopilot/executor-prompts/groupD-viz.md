# Group D4: @meridian/viz — Visualization Components

## Task
Build React chart components wrapping Apache ECharts with a type-safe configuration API.

## Files to Create

### src/types.ts
```typescript
export interface ChartProps {
  data: QueryResult;
  config: VisualizationConfig;
  width?: number | string;
  height?: number | string;
  loading?: boolean;
  onDataPointClick?: (point: DataPoint) => void;
  theme?: 'light' | 'dark';
  className?: string;
}

export interface DataPoint {
  series: string;
  category: string;
  value: number;
  row: Record<string, unknown>;
}
```

### src/chart-registry.ts
```typescript
export class ChartRegistry {
  register(type: ChartType, component: React.ComponentType<ChartProps>): void;
  get(type: ChartType): React.ComponentType<ChartProps> | undefined;
  listTypes(): ChartType[];
}
export const defaultRegistry: ChartRegistry;
```

### src/components/chart-container.tsx
Responsive wrapper:
- Auto-resize on container change (ResizeObserver)
- Loading overlay with skeleton
- Error boundary with fallback
- Download as PNG/SVG

### src/components/chart-renderer.tsx
Dynamic chart renderer:
```typescript
export function ChartRenderer({ data, config, ...props }: ChartProps) {
  const Component = defaultRegistry.get(config.type);
  return <ChartContainer><Component {...props} /></ChartContainer>;
}
```

### src/charts/bar-chart.tsx
Bar chart (horizontal & vertical):
- Single/multi series
- Stacked/grouped
- Data labels
- Axis formatting

### src/charts/line-chart.tsx
Line chart:
- Single/multi series
- Area fill option
- Smooth/step lines
- Data point markers
- Min/max annotations

### src/charts/area-chart.tsx
Area chart (extends line with fill)

### src/charts/pie-chart.tsx
Pie chart:
- Labels with percentages
- Legend
- Donut variant (innerRadius)

### src/charts/scatter-chart.tsx
Scatter plot:
- Size encoding (bubble chart)
- Color encoding
- Regression line option

### src/charts/table-chart.tsx
Data table visualization:
- Sortable columns
- Conditional formatting
- Mini bar/sparkline in cells
- Truncation with tooltip

### src/charts/number-chart.tsx
Single number/KPI card:
- Current value
- Trend indicator (up/down/flat)
- Comparison to previous period
- Format (number, currency, percentage)

### src/charts/gauge-chart.tsx
Gauge/speedometer chart

### src/charts/funnel-chart.tsx
Funnel chart for conversion tracking

### src/charts/treemap-chart.tsx
Hierarchical treemap

### src/charts/heatmap-chart.tsx
Heatmap (2D matrix with color encoding)

### src/charts/map-chart.tsx
Choropleth map (basic, using ECharts map)

### src/charts/combo-chart.tsx
Combined bar + line chart

### src/utils/data-transformer.ts
Transform QueryResult into ECharts-compatible data format:
- Column-to-series mapping
- Date parsing and grouping
- Aggregation helpers
- Null handling

### src/utils/color-palette.ts
Default color palettes:
- Default (10 colors)
- Categorical
- Sequential
- Diverging

### src/utils/format.ts
Value formatting:
- Number (compact, decimal places, thousands separator)
- Currency
- Percentage
- Date/time
- Duration

### src/theme/light.ts
### src/theme/dark.ts
ECharts theme definitions

### src/index.ts — re-exports

## Tests
- src/charts/bar-chart.test.tsx (render, click handler)
- src/charts/line-chart.test.tsx
- src/charts/pie-chart.test.tsx
- src/charts/table-chart.test.tsx
- src/charts/number-chart.test.tsx
- src/utils/data-transformer.test.ts (various data shapes)
- src/utils/format.test.ts
- src/chart-registry.test.ts

## Dependencies
- @meridian/core, @meridian/shared
- echarts, echarts-for-react
- react (peer)

## Estimated LOC: ~8000 + ~2000 tests
