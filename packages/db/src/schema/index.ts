// ── Table Schemas ───────────────────────────────────────────────────

export { organizations } from './organizations.js';
export type { Organization, NewOrganization } from './organizations.js';

export { users } from './users.js';
export type { User, NewUser } from './users.js';

export { roles } from './roles.js';
export type { Role, NewRole } from './roles.js';

export { datasources, databaseTypeEnum, datasourceStatusEnum } from './datasources.js';
export type { DataSource, NewDataSource } from './datasources.js';

export { questions, questionTypeEnum } from './questions.js';
export type { Question, NewQuestion } from './questions.js';

export { dashboards } from './dashboards.js';
export type { Dashboard, NewDashboard } from './dashboards.js';

export { dashboardCards } from './dashboard-cards.js';
export type { DashboardCard, NewDashboardCard } from './dashboard-cards.js';

export { cacheEntries } from './cache-entries.js';
export type { CacheEntry, NewCacheEntry } from './cache-entries.js';

export { auditLogs } from './audit-logs.js';
export type { AuditLog, NewAuditLog } from './audit-logs.js';

export { pluginRegistry, pluginTypeEnum } from './plugin-registry.js';
export type { PluginRegistryEntry, NewPluginRegistryEntry } from './plugin-registry.js';

// ── Relations ───────────────────────────────────────────────────────

export {
  organizationsRelations,
  usersRelations,
  rolesRelations,
  datasourcesRelations,
  questionsRelations,
  dashboardsRelations,
  dashboardCardsRelations,
  auditLogsRelations,
} from './relations.js';
