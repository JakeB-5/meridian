import { relations } from 'drizzle-orm';
import { organizations } from './organizations.js';
import { users } from './users.js';
import { roles } from './roles.js';
import { datasources } from './datasources.js';
import { questions } from './questions.js';
import { dashboards } from './dashboards.js';
import { dashboardCards } from './dashboard-cards.js';
import { auditLogs } from './audit-logs.js';

// ── Organization Relations ──────────────────────────────────────────

export const organizationsRelations = relations(organizations, ({ many }) => ({
  /** All users belonging to this organization */
  users: many(users),

  /** All roles defined within this organization */
  roles: many(roles),

  /** All data sources owned by this organization */
  datasources: many(datasources),

  /** All questions owned by this organization */
  questions: many(questions),

  /** All dashboards owned by this organization */
  dashboards: many(dashboards),
}));

// ── User Relations ──────────────────────────────────────────────────

export const usersRelations = relations(users, ({ one, many }) => ({
  /** The organization this user belongs to */
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),

  /** The role assigned to this user */
  role: one(roles, {
    fields: [users.roleId],
    references: [roles.id],
  }),

  /** Data sources created by this user */
  createdDatasources: many(datasources),

  /** Questions created by this user */
  createdQuestions: many(questions),

  /** Dashboards created by this user */
  createdDashboards: many(dashboards),

  /** Audit log entries for this user's actions */
  auditLogs: many(auditLogs),
}));

// ── Role Relations ──────────────────────────────────────────────────

export const rolesRelations = relations(roles, ({ one, many }) => ({
  /** The organization this role belongs to */
  organization: one(organizations, {
    fields: [roles.organizationId],
    references: [organizations.id],
  }),

  /** Users assigned to this role */
  users: many(users),
}));

// ── Datasource Relations ────────────────────────────────────────────

export const datasourcesRelations = relations(datasources, ({ one, many }) => ({
  /** Owning organization */
  organization: one(organizations, {
    fields: [datasources.organizationId],
    references: [organizations.id],
  }),

  /** User who created this data source */
  creator: one(users, {
    fields: [datasources.createdBy],
    references: [users.id],
  }),

  /** Questions that query this data source */
  questions: many(questions),
}));

// ── Question Relations ──────────────────────────────────────────────

export const questionsRelations = relations(questions, ({ one, many }) => ({
  /** Target data source */
  dataSource: one(datasources, {
    fields: [questions.dataSourceId],
    references: [datasources.id],
  }),

  /** Owning organization */
  organization: one(organizations, {
    fields: [questions.organizationId],
    references: [organizations.id],
  }),

  /** User who created this question */
  creator: one(users, {
    fields: [questions.createdBy],
    references: [users.id],
  }),

  /** Dashboard cards that display this question */
  dashboardCards: many(dashboardCards),
}));

// ── Dashboard Relations ─────────────────────────────────────────────

export const dashboardsRelations = relations(dashboards, ({ one, many }) => ({
  /** Owning organization */
  organization: one(organizations, {
    fields: [dashboards.organizationId],
    references: [organizations.id],
  }),

  /** User who created this dashboard */
  creator: one(users, {
    fields: [dashboards.createdBy],
    references: [users.id],
  }),

  /** Cards placed on this dashboard */
  cards: many(dashboardCards),
}));

// ── Dashboard Card Relations ────────────────────────────────────────

export const dashboardCardsRelations = relations(dashboardCards, ({ one }) => ({
  /** Parent dashboard */
  dashboard: one(dashboards, {
    fields: [dashboardCards.dashboardId],
    references: [dashboards.id],
  }),

  /** Question rendered in this card */
  question: one(questions, {
    fields: [dashboardCards.questionId],
    references: [questions.id],
  }),
}));

// ── Audit Log Relations ─────────────────────────────────────────────

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  /** The user who performed the action (nullable for system actions) */
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}));
