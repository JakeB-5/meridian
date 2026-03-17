// ── Schema ──────────────────────────────────────────────────────────

export {
  // Tables
  organizations,
  users,
  roles,
  datasources,
  questions,
  dashboards,
  dashboardCards,
  cacheEntries,
  auditLogs,
  pluginRegistry,
  // Enums
  databaseTypeEnum,
  datasourceStatusEnum,
  questionTypeEnum,
  pluginTypeEnum,
  // Relations
  organizationsRelations,
  usersRelations,
  rolesRelations,
  datasourcesRelations,
  questionsRelations,
  dashboardsRelations,
  dashboardCardsRelations,
  auditLogsRelations,
} from './schema/index.js';

// Schema types
export type {
  Organization,
  NewOrganization,
  User,
  NewUser,
  Role,
  NewRole,
  DataSource,
  NewDataSource,
  Question,
  NewQuestion,
  Dashboard,
  NewDashboard,
  DashboardCard,
  NewDashboardCard,
  CacheEntry,
  NewCacheEntry,
  AuditLog,
  NewAuditLog,
  PluginRegistryEntry,
  NewPluginRegistryEntry,
} from './schema/index.js';

// ── Connection ──────────────────────────────────────────────────────

export {
  createDatabase,
  createDatabaseFromUrl,
  closeDatabase,
  getPool,
  healthCheck,
} from './connection.js';

export type { Database, DatabaseConfig } from './connection.js';

// ── Migrations ──────────────────────────────────────────────────────

export { runMigrations } from './migrate.js';
export type { MigrationOptions } from './migrate.js';

// ── Repositories ────────────────────────────────────────────────────

export {
  OrganizationRepository,
  UserRepository,
  RoleRepository,
  DataSourceRepository,
  QuestionRepository,
  DashboardRepository,
  AuditLogRepository,
  CacheEntryRepository,
  PluginRegistryRepository,
} from './repositories/index.js';

export type {
  // Organization
  OrganizationFilters,
  UpdateOrganizationData,
  // User
  UserFilters,
  UpdateUserData,
  UserWithRole,
  // Role
  RoleFilters,
  UpdateRoleData,
  // DataSource
  DataSourceFilters,
  UpdateDataSourceData,
  DataSourceWithCreator,
  // Question
  QuestionFilters,
  UpdateQuestionData,
  QuestionWithDetails,
  // Dashboard
  DashboardFilters,
  UpdateDashboardData,
  UpdateDashboardCardData,
  DashboardWithCards,
  DashboardWithCreator,
  // Audit Log
  AuditLogFilters,
  AuditLogWithUser,
  AuditLogCreateData,
  // Cache
  CacheSetOptions,
  // Plugin
  PluginRegistryFilters,
  UpdatePluginData,
  // Pagination
  PaginationParams,
  PaginatedResult,
  SortParams,
} from './repositories/index.js';

// ── Seed ────────────────────────────────────────────────────────────

export { seed } from './seed.js';
export type { SeedOptions, SeedResult } from './seed.js';
