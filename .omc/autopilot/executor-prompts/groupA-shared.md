# Group A2: @meridian/shared — Shared Types, Utils, Constants

## Task
Implement the complete shared package with all foundational types, utilities, and constants used across the entire Meridian platform.

## Files to Create

### src/errors/meridian-error.ts
```typescript
export class MeridianError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly details?: Record<string, unknown>,
  ) { ... }
}
```
Subclasses:
- NotFoundError (404)
- ValidationError (400)
- AuthenticationError (401)
- AuthorizationError (403)
- ConflictError (409)
- RateLimitError (429)
- ConnectionError (503)
- QueryExecutionError (500)

### src/errors/index.ts — re-exports

### src/result/result.ts
Result<T, E> type (Ok/Err pattern):
```typescript
type Result<T, E = MeridianError> = { ok: true; value: T } | { ok: false; error: E };
export const ok = <T>(value: T): Result<T, never> => ...
export const err = <E>(error: E): Result<never, E> => ...
export const isOk/isErr helpers
export const unwrap, unwrapOr, map, flatMap
```

### src/types/datasource.ts
```typescript
export type DatabaseType = 'postgresql' | 'mysql' | 'sqlite' | 'clickhouse' | 'bigquery' | 'snowflake' | 'duckdb';

export interface DataSourceConfig {
  id: string;
  name: string;
  type: DatabaseType;
  host?: string;
  port?: number;
  database: string;
  username?: string;
  password?: string;
  ssl?: boolean;
  options?: Record<string, unknown>;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  latencyMs: number;
}
```

### src/types/query.ts
```typescript
export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
}

export interface QueryResult {
  columns: ColumnInfo[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTimeMs: number;
  truncated: boolean;
}

export type AggregationType = 'count' | 'sum' | 'avg' | 'min' | 'max' | 'count_distinct';
export type SortDirection = 'asc' | 'desc';
export type FilterOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'not_in' | 'like' | 'not_like' | 'is_null' | 'is_not_null' | 'between';

export interface FilterClause {
  column: string;
  operator: FilterOperator;
  value: unknown;
}

export interface SortClause {
  column: string;
  direction: SortDirection;
}

export interface AggregationClause {
  column: string;
  aggregation: AggregationType;
  alias?: string;
}

export interface VisualQuery {
  dataSourceId: string;
  table: string;
  columns: string[];
  filters: FilterClause[];
  sorts: SortClause[];
  aggregations: AggregationClause[];
  groupBy: string[];
  limit?: number;
  offset?: number;
}
```

### src/types/dashboard.ts
```typescript
export interface Dashboard {
  id: string;
  name: string;
  description?: string;
  organizationId: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  isPublic: boolean;
  layout: DashboardLayout;
  filters: DashboardFilter[];
}

export interface DashboardCard {
  id: string;
  dashboardId: string;
  questionId: string;
  position: CardPosition;
  size: CardSize;
}

export interface CardPosition { x: number; y: number; }
export interface CardSize { width: number; height: number; }
export interface DashboardLayout { columns: number; rowHeight: number; }
export interface DashboardFilter { id: string; type: string; column: string; defaultValue?: unknown; }
```

### src/types/visualization.ts
```typescript
export type ChartType = 'bar' | 'line' | 'area' | 'pie' | 'donut' | 'scatter' | 'table' | 'number' | 'gauge' | 'funnel' | 'treemap' | 'heatmap' | 'map' | 'sankey' | 'radar' | 'waterfall' | 'boxplot' | 'histogram' | 'combo';

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

export interface AxisConfig { label?: string; format?: string; min?: number; max?: number; }
export interface LegendConfig { show: boolean; position: 'top' | 'bottom' | 'left' | 'right'; }
```

### src/types/user.ts
```typescript
export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  organizationId: string;
  roleId: string;
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Role {
  id: string;
  name: string;
  permissions: Permission[];
  organizationId: string;
}

export type Permission =
  | 'datasource:read' | 'datasource:write' | 'datasource:delete'
  | 'question:read' | 'question:write' | 'question:delete'
  | 'dashboard:read' | 'dashboard:write' | 'dashboard:delete'
  | 'user:read' | 'user:write' | 'user:delete'
  | 'role:read' | 'role:write' | 'role:delete'
  | 'organization:read' | 'organization:write'
  | 'plugin:read' | 'plugin:write'
  | 'admin';
```

### src/types/plugin.ts
```typescript
export type PluginType = 'connector' | 'visualization' | 'transformation' | 'api';

export interface PluginManifest {
  name: string;
  version: string;
  type: PluginType;
  description: string;
  author?: string;
  entryPoint: string;
}

export interface PluginContext {
  logger: Logger;
  config: Record<string, unknown>;
  registerConnector?: (connector: unknown) => void;
  registerVisualization?: (viz: unknown) => void;
  registerTransformation?: (transform: unknown) => void;
  registerRoute?: (route: unknown) => void;
}
```

### src/types/realtime.ts
```typescript
export type WSMessageType = 'subscribe' | 'unsubscribe' | 'data_update' | 'error' | 'ping' | 'pong' | 'auth';

export interface WSMessage<T = unknown> {
  type: WSMessageType;
  channel?: string;
  payload?: T;
  timestamp: number;
  id: string;
}

export interface Subscription {
  channel: string;
  entityType: 'dashboard' | 'question';
  entityId: string;
}
```

### src/types/question.ts
```typescript
export type QuestionType = 'visual' | 'sql';

export interface Question {
  id: string;
  name: string;
  description?: string;
  type: QuestionType;
  dataSourceId: string;
  query: VisualQuery | string; // VisualQuery for visual, raw SQL string for sql
  visualization: VisualizationConfig;
  organizationId: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  cachedResult?: QueryResult;
  cacheExpiresAt?: Date;
}
```

### src/types/index.ts — re-exports all types

### src/schemas/datasource.schema.ts
Zod schemas for DataSource types (create, update)

### src/schemas/query.schema.ts
Zod schemas for Query types (visual query, filter, sort)

### src/schemas/dashboard.schema.ts
Zod schemas for Dashboard types

### src/schemas/question.schema.ts
Zod schemas for Question types

### src/schemas/user.schema.ts
Zod schemas for User types (register, login, update)

### src/schemas/index.ts — re-exports

### src/utils/date.ts
- formatDate, parseDate, isExpired, addDuration
- toISOString, fromISOString

### src/utils/string.ts
- slugify, truncate, capitalize, camelToSnake, snakeToCamel
- generateId (nanoid-based)
- hashString (for cache keys)

### src/utils/validation.ts
- isEmail, isUrl, isUUID
- sanitizeHtml (basic XSS prevention)

### src/utils/async.ts
- retry(fn, options), withTimeout, delay
- pMap (concurrent map)

### src/utils/index.ts — re-exports

### src/constants/http.ts
HTTP status codes as named constants

### src/constants/errors.ts
Error code constants (ERR_NOT_FOUND, ERR_AUTH_FAILED, etc.)

### src/constants/defaults.ts
Default values (DEFAULT_PAGE_SIZE, MAX_QUERY_ROWS, etc.)

### src/constants/index.ts — re-exports

### src/logger/logger.ts
Logger abstraction wrapping pino:
```typescript
export interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
}
export function createLogger(name: string): Logger;
```

### src/index.ts — main entry, re-exports everything

## Tests (co-located)
- src/errors/meridian-error.test.ts
- src/result/result.test.ts
- src/utils/date.test.ts
- src/utils/string.test.ts
- src/utils/validation.test.ts
- src/utils/async.test.ts
- src/schemas/*.test.ts (schema validation tests)

## Estimated LOC: ~3000 + ~1000 tests
