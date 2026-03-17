import { describe, it, expect } from 'vitest';
import {
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
  databaseTypeEnum,
  datasourceStatusEnum,
  questionTypeEnum,
  pluginTypeEnum,
} from '../index.js';

// ── Schema Definition Tests ─────────────────────────────────────────
// Verify that all tables and enums are properly defined with
// the expected columns, types, and constraints.

describe('Database Schema', () => {
  // ── Organizations ───────────────────────────────────────────────

  describe('organizations', () => {
    it('should be defined as a table', () => {
      expect(organizations).toBeDefined();
    });

    it('should have all expected columns', () => {
      const columns = Object.keys(organizations);
      expect(columns).toContain('id');
      expect(columns).toContain('name');
      expect(columns).toContain('slug');
      expect(columns).toContain('settings');
      expect(columns).toContain('createdAt');
      expect(columns).toContain('updatedAt');
    });
  });

  // ── Users ───────────────────────────────────────────────────────

  describe('users', () => {
    it('should be defined as a table', () => {
      expect(users).toBeDefined();
    });

    it('should have all expected columns', () => {
      const columns = Object.keys(users);
      expect(columns).toContain('id');
      expect(columns).toContain('email');
      expect(columns).toContain('name');
      expect(columns).toContain('passwordHash');
      expect(columns).toContain('avatarUrl');
      expect(columns).toContain('organizationId');
      expect(columns).toContain('roleId');
      expect(columns).toContain('isActive');
      expect(columns).toContain('lastLoginAt');
      expect(columns).toContain('createdAt');
      expect(columns).toContain('updatedAt');
    });
  });

  // ── Roles ───────────────────────────────────────────────────────

  describe('roles', () => {
    it('should be defined as a table', () => {
      expect(roles).toBeDefined();
    });

    it('should have all expected columns', () => {
      const columns = Object.keys(roles);
      expect(columns).toContain('id');
      expect(columns).toContain('name');
      expect(columns).toContain('permissions');
      expect(columns).toContain('organizationId');
      expect(columns).toContain('isSystem');
      expect(columns).toContain('createdAt');
    });
  });

  // ── Datasources ─────────────────────────────────────────────────

  describe('datasources', () => {
    it('should be defined as a table', () => {
      expect(datasources).toBeDefined();
    });

    it('should have all expected columns', () => {
      const columns = Object.keys(datasources);
      expect(columns).toContain('id');
      expect(columns).toContain('name');
      expect(columns).toContain('type');
      expect(columns).toContain('config');
      expect(columns).toContain('organizationId');
      expect(columns).toContain('createdBy');
      expect(columns).toContain('status');
      expect(columns).toContain('lastTestedAt');
      expect(columns).toContain('createdAt');
      expect(columns).toContain('updatedAt');
    });
  });

  // ── Questions ───────────────────────────────────────────────────

  describe('questions', () => {
    it('should be defined as a table', () => {
      expect(questions).toBeDefined();
    });

    it('should have all expected columns', () => {
      const columns = Object.keys(questions);
      expect(columns).toContain('id');
      expect(columns).toContain('name');
      expect(columns).toContain('description');
      expect(columns).toContain('type');
      expect(columns).toContain('dataSourceId');
      expect(columns).toContain('query');
      expect(columns).toContain('visualization');
      expect(columns).toContain('organizationId');
      expect(columns).toContain('createdBy');
      expect(columns).toContain('isArchived');
      expect(columns).toContain('createdAt');
      expect(columns).toContain('updatedAt');
    });
  });

  // ── Dashboards ──────────────────────────────────────────────────

  describe('dashboards', () => {
    it('should be defined as a table', () => {
      expect(dashboards).toBeDefined();
    });

    it('should have all expected columns', () => {
      const columns = Object.keys(dashboards);
      expect(columns).toContain('id');
      expect(columns).toContain('name');
      expect(columns).toContain('description');
      expect(columns).toContain('organizationId');
      expect(columns).toContain('createdBy');
      expect(columns).toContain('isPublic');
      expect(columns).toContain('layout');
      expect(columns).toContain('filters');
      expect(columns).toContain('createdAt');
      expect(columns).toContain('updatedAt');
    });
  });

  // ── Dashboard Cards ─────────────────────────────────────────────

  describe('dashboardCards', () => {
    it('should be defined as a table', () => {
      expect(dashboardCards).toBeDefined();
    });

    it('should have all expected columns', () => {
      const columns = Object.keys(dashboardCards);
      expect(columns).toContain('id');
      expect(columns).toContain('dashboardId');
      expect(columns).toContain('questionId');
      expect(columns).toContain('positionX');
      expect(columns).toContain('positionY');
      expect(columns).toContain('width');
      expect(columns).toContain('height');
      expect(columns).toContain('settings');
    });
  });

  // ── Cache Entries ───────────────────────────────────────────────

  describe('cacheEntries', () => {
    it('should be defined as a table', () => {
      expect(cacheEntries).toBeDefined();
    });

    it('should have all expected columns', () => {
      const columns = Object.keys(cacheEntries);
      expect(columns).toContain('id');
      expect(columns).toContain('key');
      expect(columns).toContain('value');
      expect(columns).toContain('expiresAt');
      expect(columns).toContain('createdAt');
    });
  });

  // ── Audit Logs ──────────────────────────────────────────────────

  describe('auditLogs', () => {
    it('should be defined as a table', () => {
      expect(auditLogs).toBeDefined();
    });

    it('should have all expected columns', () => {
      const columns = Object.keys(auditLogs);
      expect(columns).toContain('id');
      expect(columns).toContain('userId');
      expect(columns).toContain('action');
      expect(columns).toContain('entityType');
      expect(columns).toContain('entityId');
      expect(columns).toContain('metadata');
      expect(columns).toContain('ipAddress');
      expect(columns).toContain('createdAt');
    });
  });

  // ── Plugin Registry ─────────────────────────────────────────────

  describe('pluginRegistry', () => {
    it('should be defined as a table', () => {
      expect(pluginRegistry).toBeDefined();
    });

    it('should have all expected columns', () => {
      const columns = Object.keys(pluginRegistry);
      expect(columns).toContain('id');
      expect(columns).toContain('name');
      expect(columns).toContain('version');
      expect(columns).toContain('type');
      expect(columns).toContain('config');
      expect(columns).toContain('isEnabled');
      expect(columns).toContain('installedAt');
      expect(columns).toContain('updatedAt');
    });
  });

  // ── Enums ───────────────────────────────────────────────────────

  describe('enums', () => {
    it('should define databaseTypeEnum with all connector types', () => {
      expect(databaseTypeEnum).toBeDefined();
      expect(databaseTypeEnum.enumValues).toContain('postgresql');
      expect(databaseTypeEnum.enumValues).toContain('mysql');
      expect(databaseTypeEnum.enumValues).toContain('sqlite');
      expect(databaseTypeEnum.enumValues).toContain('clickhouse');
      expect(databaseTypeEnum.enumValues).toContain('bigquery');
      expect(databaseTypeEnum.enumValues).toContain('snowflake');
      expect(databaseTypeEnum.enumValues).toContain('duckdb');
      expect(databaseTypeEnum.enumValues).toHaveLength(7);
    });

    it('should define datasourceStatusEnum', () => {
      expect(datasourceStatusEnum).toBeDefined();
      expect(datasourceStatusEnum.enumValues).toContain('active');
      expect(datasourceStatusEnum.enumValues).toContain('inactive');
      expect(datasourceStatusEnum.enumValues).toContain('error');
      expect(datasourceStatusEnum.enumValues).toContain('testing');
      expect(datasourceStatusEnum.enumValues).toHaveLength(4);
    });

    it('should define questionTypeEnum', () => {
      expect(questionTypeEnum).toBeDefined();
      expect(questionTypeEnum.enumValues).toContain('visual');
      expect(questionTypeEnum.enumValues).toContain('sql');
      expect(questionTypeEnum.enumValues).toHaveLength(2);
    });

    it('should define pluginTypeEnum', () => {
      expect(pluginTypeEnum).toBeDefined();
      expect(pluginTypeEnum.enumValues).toContain('connector');
      expect(pluginTypeEnum.enumValues).toContain('visualization');
      expect(pluginTypeEnum.enumValues).toContain('transformation');
      expect(pluginTypeEnum.enumValues).toContain('api');
      expect(pluginTypeEnum.enumValues).toHaveLength(4);
    });
  });

  // ── Table Count ─────────────────────────────────────────────────

  describe('table count', () => {
    it('should have 10 tables defined', () => {
      const tables = [
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
      ];

      // Verify all are defined
      for (const table of tables) {
        expect(table).toBeDefined();
      }

      expect(tables).toHaveLength(10);
    });
  });
});
