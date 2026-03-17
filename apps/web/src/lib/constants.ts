// ── Application constants ────────────────────────────────────────────

/** API base URL — proxied through Vite in development */
export const API_BASE_URL = '/api';

/** WebSocket URL */
export const WS_BASE_URL =
  typeof window !== 'undefined'
    ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`
    : 'ws://localhost:3001/ws';

/** Local storage keys */
export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'meridian_access_token',
  REFRESH_TOKEN: 'meridian_refresh_token',
  THEME: 'meridian_theme',
  SIDEBAR_COLLAPSED: 'meridian_sidebar_collapsed',
} as const;

/** Default stale times for TanStack Query */
export const STALE_TIMES = {
  /** User data — rarely changes */
  USER: 5 * 60 * 1000,
  /** List data — moderate frequency */
  LIST: 2 * 60 * 1000,
  /** Detail data */
  DETAIL: 60 * 1000,
  /** Query results — can be stale quickly */
  QUERY_RESULT: 30 * 1000,
  /** Schema data — changes infrequently */
  SCHEMA: 10 * 60 * 1000,
} as const;

/** Pagination defaults */
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_PAGE_SIZE: 20,
  PAGE_SIZE_OPTIONS: [10, 20, 50, 100],
} as const;

/** Dashboard grid defaults */
export const DASHBOARD_GRID = {
  COLUMNS: 12,
  ROW_HEIGHT: 80,
  MARGIN: 16,
  DEFAULT_CARD_WIDTH: 4,
  DEFAULT_CARD_HEIGHT: 3,
  MIN_CARD_WIDTH: 2,
  MIN_CARD_HEIGHT: 2,
} as const;

/** Database type display labels */
export const DATABASE_TYPE_LABELS: Record<string, string> = {
  postgresql: 'PostgreSQL',
  mysql: 'MySQL',
  sqlite: 'SQLite',
  clickhouse: 'ClickHouse',
  bigquery: 'BigQuery',
  snowflake: 'Snowflake',
  duckdb: 'DuckDB',
} as const;

/** Database type default ports */
export const DATABASE_DEFAULT_PORTS: Record<string, number> = {
  postgresql: 5432,
  mysql: 3306,
  clickhouse: 8123,
  snowflake: 443,
} as const;

/** Chart type display labels */
export const CHART_TYPE_LABELS: Record<string, string> = {
  bar: 'Bar Chart',
  line: 'Line Chart',
  area: 'Area Chart',
  pie: 'Pie Chart',
  donut: 'Donut Chart',
  scatter: 'Scatter Plot',
  table: 'Table',
  number: 'Number',
  gauge: 'Gauge',
  funnel: 'Funnel',
  treemap: 'Treemap',
  heatmap: 'Heatmap',
  map: 'Map',
  sankey: 'Sankey',
  radar: 'Radar',
  waterfall: 'Waterfall',
  boxplot: 'Box Plot',
  histogram: 'Histogram',
  combo: 'Combo Chart',
} as const;

/** Aggregation type display labels */
export const AGGREGATION_LABELS: Record<string, string> = {
  count: 'Count',
  sum: 'Sum',
  avg: 'Average',
  min: 'Minimum',
  max: 'Maximum',
  count_distinct: 'Count Distinct',
} as const;

/** Filter operator display labels */
export const FILTER_OPERATOR_LABELS: Record<string, string> = {
  eq: 'equals',
  neq: 'not equals',
  gt: 'greater than',
  gte: 'greater than or equal',
  lt: 'less than',
  lte: 'less than or equal',
  in: 'is in',
  not_in: 'is not in',
  like: 'contains',
  not_like: 'does not contain',
  is_null: 'is empty',
  is_not_null: 'is not empty',
  between: 'is between',
} as const;

/** Debounce delays */
export const DEBOUNCE = {
  SEARCH: 300,
  RESIZE: 150,
  AUTOSAVE: 2000,
} as const;
