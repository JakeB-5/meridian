// ── API request/response types ───────────────────────────────────────
// These mirror the server API contracts but are web-specific DTOs.

import type {
  DatabaseType,
  DataSourceConfig,
  ConnectionTestResult,
  SchemaInfo,
  VisualQuery,
  VisualizationConfig,
  QueryResult,
  DashboardCardData,
  DashboardFilter,
  DashboardLayout,
  Permission,
} from '@meridian/shared';

// ── Auth ─────────────────────────────────────────────────────────────

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  organizationName?: string;
}

export interface AuthResponse {
  user: UserResponse;
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

// ── Users ────────────────────────────────────────────────────────────

export interface UserResponse {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string;
  avatarUrl?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

export interface UpdateUserRequest {
  name?: string;
  email?: string;
  role?: string;
  status?: string;
}

export interface InviteUserRequest {
  email: string;
  role: string;
}

// ── Data Sources ─────────────────────────────────────────────────────

export interface DataSourceResponse {
  id: string;
  name: string;
  type: DatabaseType;
  host?: string;
  port?: number;
  database: string;
  ssl?: boolean;
  options?: Record<string, unknown>;
  organizationId: string;
  status: 'connected' | 'disconnected' | 'error';
  lastSyncAt?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  tableCount?: number;
}

export interface CreateDataSourceRequest {
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

export interface UpdateDataSourceRequest {
  name?: string;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  ssl?: boolean;
  options?: Record<string, unknown>;
}

export interface TestConnectionRequest {
  type: DatabaseType;
  host?: string;
  port?: number;
  database: string;
  username?: string;
  password?: string;
  ssl?: boolean;
  options?: Record<string, unknown>;
}

export { ConnectionTestResult, SchemaInfo };

// ── Questions ────────────────────────────────────────────────────────

export interface QuestionResponse {
  id: string;
  name: string;
  description?: string;
  type: 'visual' | 'sql';
  dataSourceId: string;
  dataSourceName?: string;
  query: VisualQuery | string;
  visualization: VisualizationConfig;
  organizationId: string;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
  collectionId?: string;
  tags?: string[];
  isFavorite?: boolean;
}

export interface CreateQuestionRequest {
  name: string;
  description?: string;
  type: 'visual' | 'sql';
  dataSourceId: string;
  query: VisualQuery | string;
  visualization: VisualizationConfig;
  collectionId?: string;
  tags?: string[];
}

export interface UpdateQuestionRequest {
  name?: string;
  description?: string;
  query?: VisualQuery | string;
  visualization?: VisualizationConfig;
  collectionId?: string;
  tags?: string[];
}

export interface ExecuteQuestionRequest {
  questionId?: string;
  type: 'visual' | 'sql';
  dataSourceId: string;
  query: VisualQuery | string;
  limit?: number;
}

export { QueryResult, VisualQuery, VisualizationConfig };

// ── Dashboards ───────────────────────────────────────────────────────

export interface DashboardResponse {
  id: string;
  name: string;
  description?: string;
  organizationId: string;
  layout: DashboardLayout;
  cards: DashboardCardResponse[];
  filters: DashboardFilter[];
  createdBy: string;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
  isPublic: boolean;
  refreshInterval?: number;
  tags?: string[];
  isFavorite?: boolean;
}

export interface DashboardCardResponse extends DashboardCardData {
  title?: string;
  questionName?: string;
}

export interface CreateDashboardRequest {
  name: string;
  description?: string;
  layout?: DashboardLayout;
  cards?: Omit<DashboardCardData, 'id' | 'dashboardId'>[];
  filters?: Omit<DashboardFilter, 'id'>[];
  isPublic?: boolean;
  refreshInterval?: number;
  tags?: string[];
}

export interface UpdateDashboardRequest {
  name?: string;
  description?: string;
  layout?: DashboardLayout;
  cards?: DashboardCardData[];
  filters?: DashboardFilter[];
  isPublic?: boolean;
  refreshInterval?: number;
  tags?: string[];
}

// ── Pagination ───────────────────────────────────────────────────────

export interface PaginatedRequest {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ── Generic API ──────────────────────────────────────────────────────

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  statusCode: number;
}

export interface ApiSuccessResponse<T = void> {
  data: T;
  message?: string;
}
