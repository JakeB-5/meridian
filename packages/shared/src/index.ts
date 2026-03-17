// ── @meridian/shared ────────────────────────────────────────────────
// Shared types, utilities, constants, and schemas for the Meridian platform.

// Errors
export {
  MeridianError,
  NotFoundError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  RateLimitError,
  ConnectionError,
  QueryExecutionError,
} from './errors/index.js';

// Result type
export type { Result } from './result/index.js';
export {
  ok,
  err,
  isOk,
  isErr,
  unwrap,
  unwrapOr,
  map,
  mapErr,
  flatMap,
  tryCatch,
  tryCatchSync,
} from './result/index.js';

// Types
export type {
  DatabaseType,
  DataSourceConfig,
  ConnectionTestResult,
  SchemaInfo,
  TableInfo,
  TableColumnInfo,
  CreateDataSourceDto,
  UpdateDataSourceDto,
} from './types/index.js';

export type {
  ColumnInfo,
  QueryResult,
  AggregationType,
  SortDirection,
  FilterOperator,
  FilterClause,
  SortClause,
  AggregationClause,
  VisualQuery,
} from './types/index.js';

export type {
  CardPosition,
  CardSize,
  DashboardLayout,
  DashboardCardData,
  DashboardFilter,
} from './types/index.js';

export type {
  ChartType,
  AxisConfig,
  LegendConfig,
  VisualizationConfig,
} from './types/index.js';

export type {
  Permission,
  RoleData,
  UserStatus,
} from './types/index.js';

export type {
  QuestionType,
  QuestionData,
} from './types/index.js';

export type {
  PluginType,
  PluginManifest,
} from './types/index.js';

export type {
  WSMessageType,
  WSMessage,
  Subscription,
} from './types/index.js';

export type {
  MetricType,
  MetricAggregation,
  MetricFormat,
  MetricData,
} from './types/index.js';

// Schemas
export {
  databaseTypeSchema,
  dataSourceConfigSchema,
  createDataSourceSchema,
  updateDataSourceSchema,
  connectionTestResultSchema,
  type CreateDataSourceInput,
  type UpdateDataSourceInput,
} from './schemas/index.js';

export {
  filterOperatorSchema,
  sortDirectionSchema,
  aggregationTypeSchema,
  filterClauseSchema,
  sortClauseSchema,
  aggregationClauseSchema,
  visualQuerySchema,
  columnInfoSchema,
  queryResultSchema,
  type VisualQueryInput,
  type FilterClauseInput,
  type SortClauseInput,
} from './schemas/index.js';

export {
  cardPositionSchema,
  cardSizeSchema,
  dashboardLayoutSchema,
  dashboardFilterSchema,
  dashboardCardSchema,
  createDashboardSchema,
  updateDashboardSchema,
  type CreateDashboardInput,
  type UpdateDashboardInput,
} from './schemas/index.js';

export {
  questionTypeSchema,
  chartTypeSchema,
  axisConfigSchema,
  legendConfigSchema,
  visualizationConfigSchema,
  createQuestionSchema,
  updateQuestionSchema,
  type CreateQuestionInput,
  type UpdateQuestionInput,
} from './schemas/index.js';

export {
  permissionSchema,
  registerUserSchema,
  loginSchema,
  updateUserSchema,
  changePasswordSchema,
  createRoleSchema,
  updateRoleSchema,
  type RegisterUserInput,
  type LoginInput,
  type UpdateUserInput,
  type ChangePasswordInput,
  type CreateRoleInput,
  type UpdateRoleInput,
} from './schemas/index.js';

// Utilities
export {
  formatDate,
  parseDate,
  isExpired,
  addDuration,
  toISOString,
  fromISOString,
  diffMs,
  isWithinRange,
  type DurationUnit,
} from './utils/index.js';

export {
  slugify,
  truncate,
  capitalize,
  camelToSnake,
  snakeToCamel,
  generateId,
  generateShortId,
  hashString,
  toTitleCase,
  normalizeWhitespace,
} from './utils/index.js';

export {
  isEmail,
  isUrl,
  isUUID,
  sanitizeHtml,
  isNonEmpty,
  isInRange,
  hasMinLength,
  hasMaxLength,
  isSlug,
} from './utils/index.js';

export {
  retry,
  withTimeout,
  delay,
  pMap,
  allSettled,
  type RetryOptions,
  type SettledResult,
} from './utils/index.js';

// Constants
export {
  DEFAULT_PAGE_SIZE,
  MAX_QUERY_ROWS,
  DEFAULT_QUERY_TIMEOUT_MS,
  MAX_QUERY_TIMEOUT_MS,
  DEFAULT_CACHE_TTL_SECONDS,
  MAX_DASHBOARD_COLUMNS,
  DEFAULT_ROW_HEIGHT,
  MIN_CARD_WIDTH,
  MIN_CARD_HEIGHT,
  MAX_CARD_WIDTH,
  MAX_CARD_HEIGHT,
  DEFAULT_DASHBOARD_COLUMNS,
  MAX_CARDS_PER_DASHBOARD,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
  MAX_SQL_LENGTH,
  MAX_NAME_LENGTH,
  MAX_DESCRIPTION_LENGTH,
} from './constants/index.js';

export {
  ERR_NOT_FOUND,
  ERR_VALIDATION,
  ERR_AUTHENTICATION,
  ERR_AUTHORIZATION,
  ERR_CONFLICT,
  ERR_RATE_LIMIT,
  ERR_CONNECTION,
  ERR_QUERY_EXECUTION,
  ERR_UNEXPECTED,
  ERR_TIMEOUT,
  ERR_INVALID_STATE,
  ERR_DUPLICATE,
  ERR_PLUGIN_LOAD,
  ERR_DATASOURCE_CONNECTION,
  ERR_SCHEMA_FETCH,
} from './constants/index.js';

// Logger
export {
  type Logger,
  type LogLevel,
  type LoggerOptions,
  createLogger,
  createNoopLogger,
} from './logger/index.js';
